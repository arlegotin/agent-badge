import { afterEach, expect, test } from 'vitest';
import { mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createBareRemoteFixture } from '@agent-badge/testkit';
import type { GitFixture } from '@agent-badge/testkit';
import { resolveRepository, uninstall } from '@legotin/agent-badge-core';
import { planSetup, applySetup } from './setup.js';
import { loadActivation } from './runtime.js';
import { repositoryIntegrations } from './operations.js';
import { setupOptions, activatedFixture } from '../../test/operational-fixture.js';
const fixtures: GitFixture[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(f => f.cleanup())); });

test('uninstall restores user delegates/settings and retains unsynced private state and ignore protections', async () => {
  const f = await createBareRemoteFixture(); fixtures.push(f); const cwd = f.clones[0], repository = await resolveRepository(cwd);
  const original = '#!/bin/sh\nprintf user-hook\\n\n'; await writeFile(join(repository.hooksPath,'pre-push'),original,{mode:0o755});
  await mkdir(join(cwd,'.claude')); await writeFile(join(cwd,'.claude/settings.json'),'{"permissions":{"keep":true}}\n');
  const plan = await planSetup({...setupOptions,cwd,declaredUrl:'https://github.com/example/repo'}); await applySetup(plan);
  await mkdir(join(repository.privateDir,'journal'),{recursive:true}); await writeFile(join(repository.privateDir,'journal','unrecognized'),'unsynced private evidence');
  await writeFile(join(repository.privateDir,'unknown'),'retain');
  await mkdir(join(repository.privateDir,'locks'),{recursive:true}); await writeFile(join(repository.privateDir,'locks','operation.lock'),'unknown lease');
  await mkdir(join(cwd,'.agent-badge/cache'),{recursive:true}); await writeFile(join(cwd,'.agent-badge/cache/private'),'legacy private'); await writeFile(join(cwd,'.agent-badge/state.json'),'legacy private');
  const result = await uninstall({repository,integrations:repositoryIntegrations});
  expect(result).toMatchObject({status:'removed',deactivated:true,exitCode:0});
  expect(await loadActivation(repository.privateDir)).toBeNull();
  expect(await readFile(join(repository.hooksPath,'pre-push'),'utf8')).toBe(original);
  expect(JSON.parse(await readFile(join(cwd,'.claude/settings.json'),'utf8'))).toMatchObject({permissions:{keep:true}});
  expect(await readFile(join(repository.privateDir,'journal','unrecognized'),'utf8')).toBe('unsynced private evidence');
  expect(await readFile(join(repository.privateDir,'unknown'),'utf8')).toBe('retain');
  expect(await readFile(join(repository.privateDir,'locks','operation.lock'),'utf8')).toBe('unknown lease');
  const dry = await f.git(cwd,['add','--dry-run','.']);
  expect(dry).not.toMatch(/state\.json|cache\/private|unsynced|local\.json|journal/);
  expect(await f.git(f.remote,['for-each-ref','--format=%(refname)','refs/heads/agent-badge/data'])).toBe('');
});

test('edited integrations refuse cleanup but explicit uninstall still deactivates and retains evidence', async () => {
  const { f, cwd, plan } = await activatedFixture(); fixtures.push(f);
  const hook = join(plan.repository.hooksPath,'pre-push'); await writeFile(hook,(await readFile(hook,'utf8'))+'# edited\n');
  const result = await uninstall({repository:plan.repository,integrations:repositoryIntegrations});
  expect(result).toMatchObject({status:'action-required',deactivated:true,exitCode:1,unresolved:expect.arrayContaining(['git-hook-action-required'])});
  expect(await loadActivation(plan.repository.privateDir)).toBeNull();
  expect(await readFile(hook,'utf8')).toContain('# edited');
  expect(await readdir(plan.repository.privateDir)).toContain('hooks.json');
});

test('interrupted first setup intent is removed only when owned, with unknown intent retained', async () => {
  const f = await createBareRemoteFixture(); fixtures.push(f); const repository = await resolveRepository(f.clones[0]); await mkdir(repository.privateDir);
  const path = join(repository.privateDir,'setup-intent.json');
  await writeFile(path,JSON.stringify({schemaVersion:1,repositoryId:'12345678-1234-4234-8234-123456789abc',initializeAllowed:true}));
  expect(await uninstall({repository,integrations:repositoryIntegrations})).toMatchObject({deactivated:true,status:'removed'});
  expect(await readdir(repository.privateDir)).not.toContain('setup-intent.json');
  await writeFile(path,'{"schemaVersion":99}');
  expect(await uninstall({repository,integrations:repositoryIntegrations})).toMatchObject({status:'action-required',unresolved:expect.arrayContaining(['setup-intent-action-required'])});
  expect(await readFile(path,'utf8')).toBe('{"schemaVersion":99}');
});

test.each([false,true])('uninstall handles interrupted provider install and preserves third-state evidence (edited=%s)',async edited=>{
 const f=await createBareRemoteFixture();fixtures.push(f);const cwd=f.clones[0],repository=await resolveRepository(cwd);
 const {planAgentHooks}=await import('./agent-hooks.js'),plan=await planAgentHooks(cwd,repository);
 await mkdir(repository.privateDir,{recursive:true});await mkdir(join(cwd,'.codex'),{recursive:true});
 const pending={schemaVersion:1,kind:'install',worktreeRoot:cwd,changes:plan.changes,actionItems:[],notices:[]};
 await writeFile(join(repository.privateDir,'agent-hooks.pending.json'),JSON.stringify(pending));
 const change=plan.changes.find(c=>c.path==='.codex/hooks.json')!;await writeFile(join(cwd,change.path),edited?'{"unrelated":"third state"}':change.after);
 const result=await uninstall({repository,integrations:repositoryIntegrations});
 expect(result.deactivated).toBe(true);
 if(edited){expect(result).toMatchObject({status:'action-required',unresolved:expect.arrayContaining(['provider-hooks-action-required'])});expect(await readFile(join(repository.privateDir,'agent-hooks.pending.json'),'utf8')).toBe(JSON.stringify(pending));expect(await readFile(join(cwd,change.path),'utf8')).toBe('{"unrelated":"third state"}');}
 else{expect(result.status).toBe('removed');expect(await readdir(repository.privateDir)).not.toContain('agent-hooks.pending.json');expect(JSON.parse(await readFile(join(cwd,'.codex/hooks.json'),'utf8')).hooks??{}).toEqual({});}
});

test('doctor checks effective executable hook/driver and bootstrap rather than only ownership presence',async()=>{
 const {f,plan}=await activatedFixture();fixtures.push(f);const {chmod}=await import('node:fs/promises');
 const hook=join(plan.repository.hooksPath,'pre-push');await chmod(hook,0o644);
 const inspection=await repositoryIntegrations.inspect(plan.repository,AbortSignal.timeout(5000));
 expect(inspection.checks).toContainEqual({code:'git-hooks',required:true,status:'fail'});
 await chmod(hook,0o755);await writeFile(join(plan.repository.privateDir,'bootstrap.cjs'),'edited-bootstrap');
 expect((await repositoryIntegrations.inspect(plan.repository,AbortSignal.timeout(5000))).checks).toContainEqual({code:'runtime',required:true,status:'fail'});
});

test('retained unsupported legacy private configuration is ignored without deleting its bytes',async()=>{
 const f=await createBareRemoteFixture();fixtures.push(f);const cwd=f.clones[0],repository=await resolveRepository(cwd);await mkdir(join(cwd,'.agent-badge'));
 const bytes='{"version":1,"private":"/synthetic/private/path"}';await writeFile(join(cwd,'.agent-badge/config.json'),bytes);
 await uninstall({repository,integrations:repositoryIntegrations});expect(await readFile(join(cwd,'.agent-badge/config.json'),'utf8')).toBe(bytes);
 expect(await f.git(cwd,['add','--dry-run','.'])).not.toContain('.agent-badge/config.json');
});

test('unknown integration lease preserves provider evidence after explicit activation revocation',async()=>{
 const {f,plan}=await activatedFixture();fixtures.push(f);const lease=join(plan.repository.privateDir,'integration-locks/operation.lock');await writeFile(lease,'unknown owner');
 const result=await uninstall({repository:plan.repository,integrations:repositoryIntegrations});expect(result).toMatchObject({deactivated:true,status:'action-required',unresolved:expect.arrayContaining(['provider-hooks-action-required'])});
 expect(await readFile(lease,'utf8')).toBe('unknown owner');expect(await loadActivation(plan.repository.privateDir)).toBeNull();expect(await readFile(join(plan.repository.worktreeRoot,'.agent-badge/agent-hooks.json'),'utf8')).toContain('schemaVersion');
});
