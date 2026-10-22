import { afterEach, expect, test } from 'vitest';
import { createBareRemoteFixture } from '@agent-badge/testkit';
import type { GitFixture } from '@agent-badge/testkit';
import { resolveRepository } from '../git/context.js';
import { bindRemote } from '../git/remote-binding.js';
import { openStore } from '../storage/store.js';
import { diagnose } from './doctor.js';
import type { IntegrationPort } from './integration-port.js';
const fixtures: GitFixture[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(f => f.cleanup())); });
async function fixture() { const f = await createBareRemoteFixture(); fixtures.push(f); const repository = await resolveRepository(f.clones[0]); return { f, repository }; }

test('doctor without owning integration inspection cannot claim healthy setup', async () => {
  const { repository } = await fixture();
  expect(await diagnose(repository, {})).toMatchObject({ schemaVersion: 1, status: 'attention-required', exitCode: 1, remote: 'not-requested' });
});

test('doctor checks required integration completeness and explicitly bounded read-only remote access', async () => {
  const { f, repository } = await fixture(); await openStore(repository);
  const binding = await bindRemote(repository, { repositoryId: '12345678-1234-4234-8234-123456789abc', declaredUrl: f.remote });
  const port: IntegrationPort = { inspect: async () => ({ setup: 'approved', binding, checks: ['activation','runtime','git-hooks','provider-hooks'].map(code => ({ code, required: true, status: 'pass' })) }), deactivate: async () => ({ deactivated: true, unresolved: [] }) };
  const local = await diagnose(repository, { integrations: port });
  expect(local.remote).toBe('not-requested');
  expect(local.checks.some(c => c.code === 'remote-readable')).toBe(false);
  const remote = await diagnose(repository, { integrations: port, remote: true, timeoutMs: 3000 });
  expect(remote).toMatchObject({ remote: 'readable', status: 'healthy', exitCode: 0 });
  expect(await f.git(f.remote, ['for-each-ref', '--format=%(refname)', 'refs/heads/agent-badge/data'])).toBe('');
  await f.git(repository.worktreeRoot, ['remote','set-url','origin','https://github.com/example/wrong']);
  expect(await diagnose(repository, { integrations: port, remote: true, timeoutMs: 1000 })).toMatchObject({ remote: 'wrong-target', exitCode: 2 });
  const incomplete = { ...port, inspect: async () => ({ setup: 'approved' as const, checks: [] }) };
  expect(await diagnose(repository, { integrations: incomplete })).toMatchObject({ status: 'attention-required', exitCode: 1 });
});

test('unreadable/future local data fails required schema checks even with healthy integration evidence',async()=>{
 const {repository}=await fixture();await openStore(repository);
 const {writeFile}=await import('node:fs/promises'),{join}=await import('node:path');await writeFile(join(repository.privateDir,'acknowledged.json'),'invalid private data');
 const integrations:IntegrationPort={inspect:async()=>({setup:'approved',checks:['activation','runtime','git-hooks','provider-hooks'].map(code=>({code,status:'pass',required:true}))}),deactivate:async()=>({deactivated:true,unresolved:[]})};
 expect(await diagnose(repository,{integrations})).toMatchObject({status:'attention-required',exitCode:1,checks:expect.arrayContaining([{code:'local-schema',status:'fail',required:true}])});
});

test('remote doctor owns a total deadline even when integration inspection is stalled',async()=>{
 const {repository}=await fixture();const started=performance.now();
 const integrations:IntegrationPort={inspect:async()=>new Promise(()=>{}),deactivate:async()=>({deactivated:true,unresolved:[]})};
 const result=await diagnose(repository,{integrations,remote:true,timeoutMs:80});
 expect(performance.now()-started).toBeLessThan(500);expect(result).toMatchObject({remote:'unavailable',exitCode:1});
});
