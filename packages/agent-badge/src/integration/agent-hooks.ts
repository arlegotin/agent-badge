import { lstat, mkdir, readFile, rename, rm, open, link } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parse as parseToml } from '@iarna/toml';
import { acquireLock } from '@legotin/agent-badge-core/storage/lock';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { json } from './manifest.js';
import type { OwnedChange } from './setup.js';
import type { RepositoryContext } from '@legotin/agent-badge-core';
type Provider = 'codex' | 'claude';
type Group = { hooks: { type: string; command?: string; [key: string]: unknown }[]; [key: string]: unknown };
type Configuration = { hooks?: Record<string, Group[]>; [key: string]: unknown };
interface Entry { provider: Provider; path: string; event: string; group: Group }
interface Ownership { schemaVersion: 1; entries: Entry[] }
interface TransactionChange { path: string; before: string | null; after: string | null }
interface ProviderIntent { schemaVersion: 1; kind: 'install' | 'remove'; worktreeRoot: string; changes: TransactionChange[]; actionItems: string[]; notices: string[] }
export interface AgentHookPlan { cwd: string; privateDir: string; pending: ProviderIntent | null; changes: OwnedChange[]; actionItems: string[]; notices: string[] }
export interface AgentHookResult { status: 'configured-needs-trust' | 'action-required' | 'removed' | 'unchanged'; actionItems: string[] }
const ownershipPath = '.agent-badge/agent-hooks.json';
const pendingName = 'agent-hooks.pending.json';
const files: Record<Provider, string> = { codex: '.codex/hooks.json', claude: '.claude/settings.json' };
const quote = (s: string) => "'" + s.replaceAll("'", "'\"'\"'") + "'";
/** Fixed built-in-only locator. No tracked executable is loaded. Git lookup is a
 * killable owned group; its elapsed time is deducted from the same hook budget. */
const locator = String.raw`'use strict';
const started=performance.now(),cp=require('node:child_process'),path=require('node:path');
if(process.platform==='win32'){console.error('agent-badge: Windows automatic hooks unsupported; use manual sync.');process.exit(0);}
if(!/^(24|26)\./.test(process.versions.node)){console.error('agent-badge: Node 24 or 26 required on provider PATH.');process.exit(0);}
const env={...process.env};for(const k of ['GIT_DIR','GIT_COMMON_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_PREFIX','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES','GIT_NAMESPACE','GIT_SHALLOW_FILE','GIT_IMPLICIT_WORK_TREE','GIT_GRAFT_FILE','GIT_REPLACE_REF_BASE'])delete env[k];
env.GIT_OPTIONAL_LOCKS='0';env.GIT_TERMINAL_PROMPT='0';
const child=cp.spawn('git',['rev-parse','--git-common-dir'],{env,detached:true,stdio:['ignore','pipe','ignore']});
let chunks=[],size=0,finished=false;
const kill=()=>{if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch{}};
const timer=setTimeout(()=>{finished=true;kill();console.error('agent-badge: repository lookup unavailable; run manual sync.');},Math.max(1,2000-(performance.now()-started)));
child.stdout.on('data',c=>{size+=c.length;if(size>65536){finished=true;kill();}else chunks.push(c);});
child.once('error',()=>{clearTimeout(timer);console.error('agent-badge: Git unavailable; run setup or manual sync.');});
child.once('exit',code=>{clearTimeout(timer);kill();if(finished||code!==0)return;
const remaining=Math.floor(2000-(performance.now()-started));if(remaining<1)return;
const common=Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/,'');if(!common||/[\x00-\x1f]/.test(common))return;
const bootstrap=path.join(path.resolve(process.cwd(),common),'agent-badge/bootstrap.cjs');
const provider=process.argv[1];process.argv=[process.execPath,bootstrap,'--hook',provider,'--remaining-ms',String(remaining)];
try{require(bootstrap);}catch{console.error('agent-badge: local activation required; run setup.');}
});`;
function command(provider: Provider) {
  return `if command -v node >/dev/null 2>&1; then node -e ${quote(locator)} ${provider}; else printf '%s\\n' 'agent-badge: Node 24 or 26 required on provider PATH; run setup.' >&2; fi; true`;
}
async function safeParents(path: string) {
  let cursor = dirname(path);
  while (true) { try { const s = await lstat(cursor); if (!s.isDirectory() || s.isSymbolicLink()) throw new Error('Unsafe provider hook directory.'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    if (dirname(cursor) === cursor) return; cursor = dirname(cursor);
  }
}
async function contents(path: string): Promise<string | null> {
  await safeParents(path);
  try { const s = await lstat(path); if (!s.isFile() || s.isSymbolicLink() || s.size > 1024 * 1024) throw new Error('Unsupported provider hook file.'); return await readFile(path, 'utf8'); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
}
function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
function parse(bytes: string | null): Configuration {
  const value: unknown = bytes === null ? {} : JSON.parse(bytes);
  if (!object(value) || (value.hooks !== undefined && (!object(value.hooks) || Object.values(value.hooks).some(groups => !Array.isArray(groups) || groups.some(g => !object(g) || !Array.isArray(g.hooks) || g.hooks.some(h => !object(h) || typeof h.type !== 'string')))))) throw new Error('Unsupported hook schema.');
  return value as Configuration;
}
async function ownership(cwd: string): Promise<Ownership> {
  const bytes = await contents(join(cwd, ownershipPath)); if (bytes === null) return { schemaVersion: 1, entries: [] };
  const v = JSON.parse(bytes) as Ownership;
  if (v.schemaVersion !== 1 || !Array.isArray(v.entries) || v.entries.some(e => !['codex', 'claude'].includes(e.provider) || e.path !== files[e.provider] || !['Stop', 'SubagentStop'].includes(e.event) || !object(e.group) || !Array.isArray(e.group.hooks))) throw new Error('Invalid owned agent hooks.');
  return v;
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function inlineHooks(bytes: string | null): boolean { return bytes !== null && Object.hasOwn(parseToml(bytes), 'hooks'); }
async function atomic(path: string, bytes: string, mode: number, exclusive = false) {
  await safeParents(path); await mkdir(dirname(path), { recursive: true }); const stage = path + '.stage-' + randomUUID();
  try { const h = await open(stage, 'wx', mode); try { await h.writeFile(bytes); await h.sync(); } finally { await h.close(); }
    if (exclusive) await link(stage, path); else await rename(stage, path);
    const parent = await open(dirname(path), 'r'); try { await parent.sync(); } finally { await parent.close(); }
  } finally { await rm(stage, { force: true }); }
}
async function loadPending(privateDir: string): Promise<ProviderIntent | null> {
  const path = join(privateDir, pendingName); await safeParents(path);
  let bytes: string;
  try { const s = await lstat(path); if (!s.isFile() || s.isSymbolicLink() || s.size > 8 * 1024 * 1024) throw new Error('Unsafe provider recovery intent.'); bytes = await readFile(path, 'utf8'); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
  const value = JSON.parse(bytes) as ProviderIntent;
  if (value.schemaVersion !== 1 || !['install', 'remove'].includes(value.kind) || typeof value.worktreeRoot !== 'string' || !isAbsolute(value.worktreeRoot) || !Array.isArray(value.changes) || value.changes.length > 3 ||
      value.changes.some(c => ![ownershipPath, ...Object.values(files)].includes(c.path) || (c.before !== null && typeof c.before !== 'string') || (c.after !== null && typeof c.after !== 'string') || (value.kind === 'install' && c.after === null)) ||
      new Set(value.changes.map(c => c.path)).size !== value.changes.length || !Array.isArray(value.actionItems) || value.actionItems.some(s => typeof s !== 'string') || !Array.isArray(value.notices) || value.notices.some(s => typeof s !== 'string')) throw new Error('Invalid provider recovery intent.');
  return value;
}
async function recoverable(cwd: string, intent: ProviderIntent) {
  if (resolve(cwd) !== intent.worktreeRoot) return false;
  for (const c of intent.changes) { const actual = await contents(join(cwd, c.path)); if (actual !== c.before && actual !== c.after) return false; }
  return true;
}
/** Reuse the existing private lease in a separate namespace so usage-store lock
 * owners can invoke provider removal without reentering their own lock. */
async function withProviderLease(privateDir: string, task: () => Promise<AgentHookResult>): Promise<AgentHookResult> {
  const directory = join(privateDir, 'integration-locks');
  await safeParents(join(directory, 'operation.lock')); await mkdir(directory, { recursive: true, mode: 0o700 });
  let release: () => Promise<void>;
  try { release = await acquireLock(directory, AbortSignal.timeout(2000)); }
  catch (error) {
    if ((error as { code?: string }).code === 'store-busy') return { status: 'action-required', actionItems: ['Provider integration is busy or its previous owner cannot be verified. Stop concurrent setup/uninstall and retry; stale lease recovery requires proving owner death.'] };
    throw error;
  }
  try { return await task(); } finally { await release(); }
}
/** Called only while holding the common-directory integration lease, including
 * cleanup. A second recovery cannot unlink a later caller's new intent. */
async function finishTransaction(cwd: string, privateDir: string, intent: ProviderIntent) {
  if (!await recoverable(cwd, intent)) throw new Error('Interrupted provider files changed; reconcile before recovery.');
  for (const c of intent.changes) {
    const path = join(cwd, c.path), actual = await contents(path); if (actual === c.after) continue;
    if (actual !== c.before) throw new Error('Interrupted provider file changed before write.');
    if (c.after === null) { await rm(path, { force: true }); const parent = await open(dirname(path), 'r'); try { await parent.sync(); } finally { await parent.close(); } }
    else await atomic(path, c.after, 0o644);
  }
  await rm(join(privateDir, pendingName), { force: true });
}

/** JSON v1 shape adapters only. Inline Codex TOML is retained for manual review. */
export async function planAgentHooks(cwd: string, context?: RepositoryContext): Promise<AgentHookPlan> {
  const changes: OwnedChange[] = [], actionItems: string[] = [], notices: string[] = [], entries: Entry[] = [];
  const repository = context ?? await (await import('@legotin/agent-badge-core')).resolveRepository(cwd);
  cwd = repository.worktreeRoot;
  const pending = await loadPending(repository.privateDir);
  if (pending) {
    if (pending.worktreeRoot !== cwd) return { cwd, privateDir: repository.privateDir, pending, changes: [], actionItems: ['Pending provider integration belongs to another worktree; reconcile it there first.'], notices: [] };
    if (pending.kind === 'remove' || !await recoverable(cwd, pending)) return { cwd: resolve(cwd), privateDir: repository.privateDir, pending, changes: [], actionItems: ['Interrupted provider integration requires explicit removal/reconciliation; existing files were preserved.'], notices: [] };
    for (const c of pending.changes) { const before = await contents(join(cwd, c.path)); if (before !== c.after) changes.push({ path: c.path, before, after: c.after! }); }
    return { cwd: resolve(cwd), privateDir: repository.privateDir, pending, changes, actionItems: pending.actionItems, notices: [...pending.notices, 'Recovered exact interrupted provider configuration; native review remains required.'] };
  }
  const prior = await ownership(cwd);
  const primary = repository.worktrees[0];
  if (!primary || primary.bare || resolve(primary.path) !== resolve(repository.worktreeRoot)) {
    let configured = false;
    if (primary && !primary.bare && !primary.prunable) {
      try {
        const root = parse(await contents(join(primary.path, files.codex)));
        const toml = await contents(join(primary.path, '.codex/config.toml'));
        configured = !inlineHooks(toml) && ['Stop', 'SubagentStop'].every(event => root.hooks?.[event]?.some(group => group.hooks.some(h => h.type === 'command' && h.command === command('codex'))));
      } catch { /* Unknown/unsafe primary configuration never proves activation. */ }
    }
    if (!configured) actionItems.push('Codex linked worktrees load primary-checkout hooks on the inspected source generation; primary-checkout setup and native trust/review are required. The primary checkout was not edited.');
    notices.push('Codex worktree-local hooks.json does not independently enable hooks: the inspected source resolves hooks through the primary-checkout .codex directory. Review native trust there; common Git-hook capture remains the fallback.');
  }
  for (const provider of ['codex', 'claude'] as const) {
    const file = files[provider]; let before: string | null = null, config: Configuration;
    try {
      if (provider === 'codex') { const toml = await contents(join(cwd, '.codex/config.toml'));
        if (inlineHooks(toml)) { actionItems.push('Codex inline TOML hooks require manual integration/review; existing TOML was preserved.'); entries.push(...prior.entries.filter(e => e.provider === provider)); continue; }
      }
      before = await contents(join(cwd, file)); config = parse(before);
    } catch { actionItems.push(`${provider === 'codex' ? 'Codex' : 'Claude'} hook schema/path unsupported; manually review local configuration.`); entries.push(...prior.entries.filter(e => e.provider === provider)); continue; }
    config.hooks ??= {};
    let changed = before === null;
    for (const event of ['Stop', 'SubagentStop']) {
      const groups = config.hooks[event] ??= [], owned = prior.entries.find(e => e.provider === provider && e.event === event);
      // Native timer leaves startup/cleanup headroom; our own complete operation
      // still has the two-second budget measured by the fixed locator.
      const group: Group = { hooks: [{ type: 'command', command: command(provider), timeout: 10 }] };
      if (owned) {
        const matches = groups.map((g, i) => equal(g, owned.group) ? i : -1).filter(i => i >= 0);
        if (matches.length !== 1) { actionItems.push(`${provider} owned ${event} hook changed; reconcile it before setup.`); entries.push(owned); continue; }
        if (!equal(owned.group, group)) { groups[matches[0]] = group; changed = true; }
      } else { groups.push(group); changed = true; }
      entries.push({ provider, path: file, event, group });
    }
    if (changed) changes.push({ path: file, before, after: json(config) });
  }
  const before = await contents(join(cwd, ownershipPath)), after = json({ schemaVersion: 1, entries });
  if (before !== after) changes.push({ path: ownershipPath, before, after });
  return { cwd: resolve(cwd), privateDir: repository.privateDir, pending: null, changes, actionItems, notices };
}
export async function applyAgentHookPlan(plan: AgentHookPlan): Promise<AgentHookResult> {
  return withProviderLease(plan.privateDir, () => applyAgentHookPlanLocked(plan));
}
async function applyAgentHookPlanLocked(plan: AgentHookPlan): Promise<AgentHookResult> {
  for (const c of plan.changes) if (await contents(join(plan.cwd, c.path)) !== c.before) throw new Error('Agent hook files changed after planning.');
  if (!equal(await loadPending(plan.privateDir), plan.pending)) throw new Error('Provider recovery intent changed after planning.');
  if (plan.pending) {
    if (plan.pending.kind === 'remove' || !await recoverable(plan.cwd, plan.pending)) return { status: 'action-required', actionItems: plan.actionItems };
    await finishTransaction(plan.cwd, plan.privateDir, plan.pending);
  } else if (plan.changes.length) {
    const intent: ProviderIntent = { schemaVersion: 1, kind: 'install', worktreeRoot: plan.cwd, changes: plan.changes, actionItems: plan.actionItems, notices: plan.notices };
    const bytes = json(intent); if (Buffer.byteLength(bytes) > 8 * 1024 * 1024) throw new Error('Provider recovery intent exceeds bound.');
    // Link publishes only if absent; concurrent setup must never replace intent.
    await atomic(join(plan.privateDir, pendingName), bytes, 0o600, true);
    await finishTransaction(plan.cwd, plan.privateDir, intent);
  }
  return { status: plan.actionItems.length ? 'action-required' : 'configured-needs-trust', actionItems: [...plan.actionItems, ...plan.notices,
    'Provider hooks require Node 24 or 26 on provider PATH and explicit native project trust/hook review; restart the provider after review.'] };
}
export async function removeAgentHooks(cwd: string): Promise<AgentHookResult> {
  const repository = await (await import('@legotin/agent-badge-core')).resolveRepository(cwd);
  return withProviderLease(repository.privateDir, () => removeAgentHooksLocked(repository.worktreeRoot, repository.privateDir));
}
async function removeAgentHooksLocked(cwd: string, privateDir: string): Promise<AgentHookResult> {
  const pending = await loadPending(privateDir);
  if (pending) {
    if (!await recoverable(cwd, pending)) return { status: 'action-required', actionItems: ['Interrupted provider files changed; reconcile before removal.'] };
    await finishTransaction(cwd, privateDir, pending);
    if (pending.kind === 'remove') return { status: 'removed', actionItems: [] };
  }
  const prior = await ownership(cwd); if (!prior.entries.length) return { status: 'unchanged', actionItems: [] };
  const changes: OwnedChange[] = [], actionItems: string[] = [];
  for (const path of [...new Set(prior.entries.map(e => e.path))]) {
    const before = await contents(join(cwd, path)), config = parse(before); let changed = false;
    for (const e of prior.entries.filter(e => e.path === path)) {
      const groups = config.hooks?.[e.event]; if (!groups) continue;
      const matches = groups.filter(g => equal(g, e.group));
      if (matches.length !== 1) { actionItems.push('Owned provider hook changed; reconcile it before removal.'); continue; }
      config.hooks![e.event] = groups.filter(g => !equal(g, e.group)); if (!config.hooks![e.event].length) delete config.hooks![e.event]; changed = true;
    }
    if (changed) changes.push({ path, before, after: json(config) });
  }
  // Preserve manifest if any edited entry needs user reconciliation.
  if (actionItems.length) return { status: 'action-required', actionItems };
  const intent: ProviderIntent = { schemaVersion: 1, kind: 'remove', worktreeRoot: cwd, changes: [...changes, { path: ownershipPath, before: await contents(join(cwd, ownershipPath)), after: null }], actionItems: [], notices: [] };
  await atomic(join(privateDir, pendingName), json(intent), 0o600, true);
  await finishTransaction(cwd, privateDir, intent);
  return { status: 'removed', actionItems: [] };
}
