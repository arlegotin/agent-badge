import { lstat, readFile, rm, mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { constants } from 'node:fs';
import type { IntegrationPort, IntegrationInspection, RepositoryContext } from '@legotin/agent-badge-core';
import { verifyBinding } from '@legotin/agent-badge-core';
import { inspectActivation, loadActivation, deactivateRuntime } from './runtime.js';
import { parseDeclaration, digest } from './manifest.js';
import { removeSetupIntent } from './setup.js';
import { inspectHooks, removeHooks } from './hooks.js';
import { planAgentHooks, removeAgentHooks } from './agent-hooks.js';

async function read(path: string): Promise<string | null> {
  try { const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink() || info.size > 8 * 1024 * 1024) throw new Error('Unsafe integration file.'); return await readFile(path,'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
async function safeParents(path: string) {
  const { dirname } = await import('node:path'); let cursor = dirname(path);
  while (true) { try { const info = await lstat(cursor); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe integration directory.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (dirname(cursor) === cursor) break; cursor = dirname(cursor);
  }
}
/** Retained unsupported v1 private data must stay unstaged after tracked setup removal. */
async function preservePrivateIgnores(ctx: RepositoryContext) {
  const path = join(ctx.commonDir,'info/exclude'); await safeParents(path); await mkdir(join(ctx.commonDir,'info'),{recursive:true});
  const before = await read(path) ?? '';
  const patterns = ['/.agent-badge/state.json','/.agent-badge/scan-state.json','/.agent-badge/cache/','/.agent-badge/logs/'];
  const declaration=await read(join(ctx.worktreeRoot,'.agent-badge/config.json'));
  if(declaration!==null)try{parseDeclaration(JSON.parse(declaration));}catch{patterns.push('/.agent-badge/config.json');}
  const missing = patterns.filter(pattern => !before.split(/\r?\n/).includes(pattern));
  if (!missing.length) return;
  const handle = await open(path,constants.O_WRONLY|constants.O_APPEND|constants.O_CREAT|constants.O_NOFOLLOW,0o600);
  try { await handle.writeFile((before && !before.endsWith('\n')?'\n':'')+missing.join('\n')+'\n'); await handle.sync(); } finally { await handle.close(); }
}
async function removeTrackedSetup(ctx: RepositoryContext): Promise<string[]> {
  const path = join(ctx.worktreeRoot,'.agent-badge/ownership.json'), bytes = await read(path);
  if (!bytes) return [];
  const ownership = JSON.parse(bytes), allowed = new Set(['.agent-badge/config.json','.agent-badge/run.cjs','.agent-badge/runtime/package.json','.agent-badge/runtime/package-lock.json','.agent-badge/README.md','.github/workflows/agent-badge-import.yml']);
  if (ownership.schemaVersion !== 1 || ownership.readmeBlock !== 'agent-badge' || !ownership.files || typeof ownership.files !== 'object' || Array.isArray(ownership.files) || Object.entries(ownership.files).some(([p,h]) => !allowed.has(p) || typeof h !== 'string' || !/^[a-f0-9]{64}$/.test(h))) return ['tracked-ownership-action-required'];
  const unresolved: string[] = [];
  for (const [relative, hash] of Object.entries(ownership.files)) {
    const file = join(ctx.worktreeRoot,relative); await safeParents(file); const current = await read(file);
    if (current === null) continue;
    if (digest(current) !== hash) { unresolved.push('tracked-file-edited'); continue; }
    await rm(file);
  }
  if (!unresolved.length) await rm(path);
  // README ownership does not include exact bytes. Retain it for deliberate user editing.
  return [...new Set(unresolved)];
}
export const repositoryIntegrations: IntegrationPort = {
  async inspect(ctx, signal): Promise<IntegrationInspection> {
    signal.throwIfAborted();
    const checked = await inspectActivation({cwd:ctx.worktreeRoot,signal});
    const activation = checked.status === 'approved' ? checked.activation : await loadActivation(ctx.privateDir);
    const inspection: IntegrationInspection = { setup: checked.status === 'inactive' ? 'needs-setup' : checked.status, checks: [
      {code:'activation',required:true,status:activation?'pass':'fail'},
      {code:'runtime',required:true,status:checked.status==='approved'?'pass':'fail'},
    ] };
    if (activation) { inspection.repositoryId = activation.repositoryId; inspection.binding = activation.binding; inspection.roots = activation.roots; const route = await verifyBinding(ctx, activation.binding, { signal }); inspection.checks.push({ code: 'remote-route', required: activation.binding.status === 'bound', status: route.status === 'valid' ? 'pass' : activation.binding.status === 'bound' ? 'fail' : 'warning' }); }
    const declaration = await read(join(ctx.worktreeRoot,'.agent-badge/config.json'));
    if (declaration) { const parsed = parseDeclaration(JSON.parse(declaration)); inspection.policy = parsed.policy; if (!inspection.repositoryId) inspection.repositoryId = parsed.repositoryId; }
    try { const hooks = await inspectHooks(ctx,{privateDir:ctx.privateDir,nodePath:process.execPath});
      inspection.checks.push({code:'git-hooks',required:true,status:hooks.status === 'action-required' ? 'fail':'pass'});
    } catch { inspection.checks.push({code:'git-hooks',required:true,status:'fail'}); }
    try { const hooks = await planAgentHooks(ctx.worktreeRoot,ctx);
      inspection.checks.push({code:'provider-hooks',required:true,status:hooks.actionItems.length || hooks.pending || hooks.changes.length ? 'fail':'pass'});
      inspection.checks.push({code:'native-project-trust-unproven',required:false,status:'not-inspected'});
    } catch { inspection.checks.push({code:'provider-hooks',required:true,status:'fail'}); }
    return inspection;
  },
  async deactivate(ctx, signal) {
    const unresolved: string[] = []; let deactivated = false;
    try { const result = await deactivateRuntime(ctx); deactivated = result.deactivated; unresolved.push(...result.unresolved); }
    catch { unresolved.push('activation-action-required'); }
    // Each owner preserves edited/pending evidence. Provider removal acquires its own separate lease.
    try { await removeSetupIntent(ctx.privateDir); } catch { unresolved.push('setup-intent-action-required'); }
    try { signal.throwIfAborted(); await removeHooks(ctx); } catch { unresolved.push('git-hook-action-required'); }
    let providersRemoved = false;
    try { signal.throwIfAborted(); const result = await removeAgentHooks(ctx.worktreeRoot); providersRemoved = result.status !== 'action-required'; if (!providersRemoved) unresolved.push('provider-hooks-action-required'); }
    catch { unresolved.push('provider-hooks-action-required'); }
    try { await preservePrivateIgnores(ctx); } catch { unresolved.push('private-ignore-action-required'); }
    // Keep all tracked evidence when provider cleanup is unresolved.
    if (providersRemoved) try { unresolved.push(...await removeTrackedSetup(ctx)); } catch { unresolved.push('tracked-setup-action-required'); }
    return {deactivated,unresolved:[...new Set(unresolved)]};
  },
};
