import { lstat, readFile, readlink, realpath, mkdir, rename, rm, open, chmod, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { RepositoryContext } from '@legotin/agent-badge-core';
import { digest, gitEnvironment, json } from './manifest.js';
const execute = promisify(execFile);
export interface RuntimeLocation { privateDir: string; nodePath: string; platform?: NodeJS.Platform }
interface Snapshot { kind: 'file' | 'symlink'; bytes: string; mode: number; hash?: string }
interface HookOwnership { schemaVersion: 1; phase?: 'installing' | 'installed'; previousWrapperHash?: string; previousDriverHash?: string; hook: string; wrapperHash: string; backup: string | null; original: Snapshot | null; driverHash: string; delegate: boolean }
export interface HookPlan { repository: RepositoryContext; runtime: RuntimeLocation; hook: string; before: Snapshot | null; wrapper: string; ownership: HookOwnership | null; actionItems: string[]; notices: string[]; delegate: boolean }
export interface HookInstallResult { status: 'installed' | 'unchanged' | 'removed' | 'action-required'; actionItems: string[] }
const quote = (s: string) => "'" + s.replaceAll("'", "'\"'\"'") + "'";
async function snapshot(path: string): Promise<Snapshot | null> {
  try { const s = await lstat(path); if (s.isSymbolicLink()) return { kind: 'symlink', bytes: await readlink(path), mode: s.mode & 0o777 };
    if (!s.isFile() || s.size > 1024 * 1024) throw new Error('Unsafe hook file.');
    const raw = await readFile(path);
    return { kind: 'file', bytes: raw.toString('utf8'), mode: s.mode & 0o777, hash: createHash('sha256').update(raw).digest('hex') };
  } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
}
function same(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b); }
function matchesOwned(file: Snapshot | null, hash: string, previous?: string) { return file?.kind === 'file' && (file.hash === hash || file.hash === previous); }
async function owned(privateDir: string): Promise<HookOwnership | null> {
  const s = await snapshot(join(privateDir, 'hooks.json')); if (!s) return null;
  if (s.kind !== 'file') throw new Error('Unsafe hook ownership.');
  const v = JSON.parse(s.bytes) as HookOwnership;
  if (v.schemaVersion !== 1 || !isAbsolute(v.hook) || typeof v.wrapperHash !== 'string' || typeof v.driverHash !== 'string' || (v.backup !== null && v.backup !== join(dirname(v.hook), '.agent-badge-user-pre-push'))) throw new Error('Invalid hook ownership.');
  return v;
}
function within(root: string, path: string) { const r = relative(root, path); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); }
async function safeDirectory(path: string) {
  // Inspect every existing ancestor; mkdir must never traverse an external symlink.
  let cursor = resolve(path);
  while (true) { try { const s = await lstat(cursor); if (!s.isDirectory() || s.isSymbolicLink()) throw new Error('Unsafe hook directory.'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    if (dirname(cursor) === cursor) break; cursor = dirname(cursor);
  }
}
async function atomic(path: string, bytes: string, mode: number) {
  await safeDirectory(dirname(path)); await mkdir(dirname(path), { recursive: true });
  const stage = path + '.agent-badge-stage-' + randomUUID();
  try { const h = await open(stage, 'wx', mode); try { await h.writeFile(bytes); await h.sync(); } finally { await h.close(); }
    await rename(stage, path); await chmod(path, mode); const parent = await open(dirname(path), 'r'); try { await parent.sync(); } finally { await parent.close(); } }
  finally { await rm(stage, { force: true }); }
}

/** Same-directory backup retains interpreter-relative resources and symlink resolution.
 * Agent Badge fails softly; the user's executable controls the final exit status. */
const gitDriverSource = String.raw`'use strict';
const started=performance.now();
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const backup=process.argv[2],args=process.argv.slice(3),deadline=Number(process.hrtime.bigint()/1000000n)+Math.max(0,Math.floor(2000-(performance.now()-started)));
let chunks=[],size=0,eligible=true,ended=false,userDone=!backup,badgeDone=false,code=0,signal=null,user;
function finish(){if(!userDone||!badgeDone)return;process.stdin.destroy();if(signal){try{process.kill(process.pid,signal);}catch{process.exitCode=1;}}else process.exitCode=code;}
function skip(){clearTimeout(timer);eligible=false;chunks=[];badgeDone=true;if(!backup)process.stdin.destroy();finish();}
const timer=setTimeout(()=>{skip();},Math.max(1,deadline-Number(process.hrtime.bigint()/1000000n)));
function stopInput(){process.stdin.destroy();if(!ended){clearTimeout(timer);skip();}}
if(backup){
  user=cp.spawn(backup,args,{stdio:['pipe','inherit','inherit'],env:process.env});
  user.stdin.on('error',()=>{process.stdin.unpipe(user.stdin);stopInput();});
  user.once('error',()=>{userDone=true;code=1;stopInput();finish();});
  user.once('exit',(status,sig)=>{userDone=true;code=status===null?1:status;signal=sig;stopInput();finish();});
  process.stdin.pipe(user.stdin);
}
process.stdin.on('data',chunk=>{if(!eligible)return;size+=chunk.length;if(size>1024*1024){skip();return;}chunks.push(chunk);});
process.stdin.once('error',()=>{if(user)user.stdin.end();clearTimeout(timer);skip();});
process.stdin.once('end',()=>{
  ended=true;clearTimeout(timer);if(!eligible){finish();return;}
  const remaining=deadline-Number(process.hrtime.bigint()/1000000n);
  if(remaining<1||process.platform==='win32'){skip();return;}
  try{
    const bootstrap=path.join(__dirname,'bootstrap.cjs'),info=fs.lstatSync(bootstrap);
    if(!info.isFile()||info.isSymbolicLink()||info.size>65536)throw new Error();
    const input=Buffer.concat(chunks);chunks=[];eligible=false;
    const badge=cp.spawn(process.execPath,[bootstrap,'--git-hook','--remaining-ms',String(remaining),'--deadline-ms',String(deadline)],{stdio:['pipe','ignore','inherit'],env:process.env});
    badge.stdin.on('error',()=>{});badge.stdin.end(input);
    badge.once('error',()=>{console.error('agent-badge: local activation required; run setup.');badgeDone=true;finish();});
    badge.once('exit',()=>{badgeDone=true;finish();});
  }catch{console.error('agent-badge: local activation required; run setup.');skip();}
});
`;

/** Read-only concrete plan; shared/global hooks are never replaced. */
export async function planHooks(repository: RepositoryContext, runtime: RuntimeLocation): Promise<HookPlan> {
  const hook = join(repository.hooksPath, 'pre-push'), actionItems: string[] = [];
  const ownership = await owned(runtime.privateDir), before = await snapshot(hook);
  if (resolve(runtime.privateDir) !== repository.privateDir || !isAbsolute(runtime.nodePath)) throw new Error('Runtime location must be approved and repository private.');
  if ((runtime.platform ?? process.platform) === 'win32') actionItems.push('Windows automatic hooks are unsupported; use manual sync.');
  const config = await execute('git', ['config', '--show-scope', '--get', 'core.hooksPath'], { cwd: repository.worktreeRoot, env: gitEnvironment(), timeout: 2000 }).catch(e => { if (e.code === 1) return { stdout: '' }; throw e; });
  if (config.stdout && !/^(local|worktree)\s/.test(config.stdout)) actionItems.push('Shared/global core.hooksPath requires a repository-local integration; configure one explicitly.');
  if (!within(repository.commonDir, repository.hooksPath) && !within(repository.worktreeRoot, repository.hooksPath)) actionItems.push('Shared hooks directory cannot be replaced; choose a repository-local core.hooksPath.');
  await safeDirectory(repository.hooksPath); await safeDirectory(runtime.privateDir);
  if (ownership && ownership.hook !== hook) actionItems.push('Installed hook path changed; remove the previous owned integration before setup.');
  const backupState = await snapshot(join(dirname(hook), '.agent-badge-user-pre-push'));
  if (!ownership && backupState) actionItems.push('Hook backup already exists; reconcile it before setup.');
  const originalInPlace = ownership?.phase === 'installing' && same(before, ownership.original) && backupState === null;
  if (ownership && before && !originalInPlace && !matchesOwned(before, ownership.wrapperHash, ownership.phase === 'installing' ? ownership.previousWrapperHash : undefined)) actionItems.push('Owned hook was modified; reconcile it before setup.');
  if (ownership?.phase === 'installing' && !originalInPlace && ownership.backup && !same(backupState, ownership.original)) actionItems.push('Interrupted hook backup changed; reconcile it before setup.');
  if (!ownership && before) {
    const bytes = before.kind === 'symlink' ? await readFile(hook, 'utf8') : before.bytes;
    if (/# agent-badge:(start|end)/.test(bytes)) actionItems.push('Legacy Agent Badge/Gist hook detected; explicitly remove its owned marker block, preserving user code, then rerun setup.');
    if (/husky|lefthook|pre-commit|simple-git-hooks|basename[^\n]*\$0/i.test(bytes)) actionItems.push('Self-dispatching hook manager requires an explicit supported repository-local integration; automatic replacement was refused.');
    if (before.kind === 'symlink' && !within(repository.worktreeRoot, await realpath(hook)) && !within(repository.commonDir, await realpath(hook))) actionItems.push('Shared hook symlink requires explicit repository-local integration.');
  }
  const backup = ownership ? ownership.backup : (before ? join(dirname(hook), '.agent-badge-user-pre-push') : null);
  const delegate = ownership ? ownership.delegate : !!before && await access(hook, constants.X_OK).then(() => true, () => false);
  const executable = delegate ? backup : null;
  const fallback = executable ? `${quote(executable)} "$@"\nexit $?` : 'exit 0';
  const wrapper = `#!/bin/sh\n# agent-badge repository-owned hook v2\nif [ -x ${quote(runtime.nodePath)} ] && [ -f ${quote(join(runtime.privateDir, 'git-hook.cjs'))} ]; then\n  exec ${quote(runtime.nodePath)} ${quote(join(runtime.privateDir, 'git-hook.cjs'))} ${quote(executable ?? '')} "$@"\nfi\nprintf '%s\\n' 'agent-badge: approved Node/runtime unavailable; run setup.' >&2\n${fallback}\n`;
  const notices = within(repository.commonDir, repository.hooksPath) ? [] : ['Worktree-local hooksPath only runs where that wrapper exists. Other branches/worktrees may require explicit local integration; do not assume common-directory activation installs a missing hook file.'];
  return { repository, runtime, hook, before, wrapper, ownership, actionItems, notices, delegate };
}
export async function applyHookPlan(plan: HookPlan): Promise<HookInstallResult> {
  if (plan.actionItems.length) return { status: 'action-required', actionItems: plan.actionItems };
  const { resolveRepository } = await import('@legotin/agent-badge-core');
  const current = await resolveRepository(plan.repository.worktreeRoot);
  if (current.commonDir !== plan.repository.commonDir || current.hooksPath !== plan.repository.hooksPath) throw new Error('Git hook routing changed after planning.');
  if (!same(await snapshot(plan.hook), plan.before) || !same(await owned(plan.runtime.privateDir), plan.ownership)) throw new Error('Hook files changed after planning.');
  await safeDirectory(dirname(plan.hook)); await safeDirectory(plan.runtime.privateDir);
  const originalInPlace = plan.ownership?.phase === 'installing' && same(plan.before, plan.ownership.original) && (!plan.ownership.backup || await snapshot(plan.ownership.backup) === null);
  if (plan.ownership?.backup && !originalInPlace && !same(await snapshot(plan.ownership.backup), plan.ownership.original)) throw new Error('User hook backup modified.');
  const driverPath = join(plan.runtime.privateDir, 'git-hook.cjs');
  const driver = await snapshot(driverPath);
  if (driver && (!plan.ownership || !matchesOwned(driver, plan.ownership.driverHash, plan.ownership.phase === 'installing' ? plan.ownership.previousDriverHash : undefined))) throw new Error('Owned hook driver modified.');
  if (plan.ownership?.phase !== 'installing' && plan.ownership && plan.before?.bytes === plan.wrapper && driver?.bytes === gitDriverSource) return { status: 'unchanged', actionItems: plan.notices };
  const backup = plan.ownership ? plan.ownership.backup : (plan.before ? join(dirname(plan.hook), '.agent-badge-user-pre-push') : null);
  const ownership: HookOwnership = { schemaVersion: 1, phase: 'installed', hook: plan.hook, backup, original: plan.ownership ? plan.ownership.original : plan.before, wrapperHash: digest(plan.wrapper), driverHash: digest(gitDriverSource), delegate: plan.delegate };
  // fsync the exact recovery intent BEFORE moving the user's only hook path.
  await atomic(join(plan.runtime.privateDir, 'hooks.json'), json({ ...ownership, phase: 'installing',
    previousWrapperHash: plan.ownership?.previousWrapperHash ?? plan.ownership?.wrapperHash,
    previousDriverHash: plan.ownership?.previousDriverHash ?? plan.ownership?.driverHash }), 0o600);
  if ((!plan.ownership || originalInPlace) && backup && plan.before) await rename(plan.hook, backup);
  await atomic(driverPath, gitDriverSource, 0o600); await atomic(plan.hook, plan.wrapper, 0o755);
  await atomic(join(plan.runtime.privateDir, 'hooks.json'), json(ownership), 0o600);
  return { status: 'installed', actionItems: plan.notices };
}
export async function removeHooks(repository: RepositoryContext): Promise<HookInstallResult> {
  const ownership = await owned(repository.privateDir); if (!ownership) return { status: 'unchanged', actionItems: [] };
  if (!within(repository.commonDir, ownership.hook) && !within(repository.worktreeRoot, ownership.hook)) throw new Error('Unsafe hook ownership path.');
  const wrapper = await snapshot(ownership.hook), driver = await snapshot(join(repository.privateDir, 'git-hook.cjs'));
  if (ownership.phase === 'installing' && same(wrapper, ownership.original) && (!ownership.backup || await snapshot(ownership.backup) === null)) {
    if (driver && !matchesOwned(driver, ownership.driverHash, ownership.previousDriverHash)) throw new Error('Owned hook driver modified.');
    await rm(join(repository.privateDir, 'git-hook.cjs'), { force: true }); await rm(join(repository.privateDir, 'hooks.json'));
    return { status: 'removed', actionItems: [] };
  }
  if (ownership.phase === 'installing' && wrapper === null && ownership.backup && same(await snapshot(ownership.backup), ownership.original)) {
    if (driver && !matchesOwned(driver, ownership.driverHash, ownership.previousDriverHash)) throw new Error('Owned hook driver modified.');
    await rename(ownership.backup, ownership.hook); await rm(join(repository.privateDir, 'git-hook.cjs'), { force: true }); await rm(join(repository.privateDir, 'hooks.json'));
    return { status: 'removed', actionItems: [] };
  }
  if (!matchesOwned(wrapper, ownership.wrapperHash, ownership.phase === 'installing' ? ownership.previousWrapperHash : undefined) || (driver && !matchesOwned(driver, ownership.driverHash, ownership.phase === 'installing' ? ownership.previousDriverHash : undefined))) throw new Error('Owned hook modified; reconcile before removal.');
  if (ownership.backup && !same(await snapshot(ownership.backup), ownership.original)) throw new Error('User hook backup modified.');
  if (ownership.backup) await rename(ownership.backup, ownership.hook); else await rm(ownership.hook);
  await rm(join(repository.privateDir, 'git-hook.cjs'), { force: true }); await rm(join(repository.privateDir, 'hooks.json'));
  return { status: 'removed', actionItems: [] };
}
