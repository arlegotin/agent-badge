import { afterEach, expect, test, vi } from 'vitest';
import { createBareRemoteFixture } from '@agent-badge/testkit';
import type { GitFixture } from '@agent-badge/testkit';
import { resolveRepository } from '../git/context.js';
import { bindRemote } from '../git/remote-binding.js';
import * as capabilityReporting from '../providers/capability-report.js';
import { catalogHash, defaultCatalog } from '../pricing/catalog.js';
import { syncUsage } from './sync.js';
import { configureRepository, metadataRevision } from './configure.js';
import { readStoreSnapshot } from '../storage/store.js';
import { getStatus } from './status.js';
import { openStore } from '../storage/store.js';
import { diagnose } from './doctor.js';
import type { IntegrationPort } from './integration-port.js';
const fixtures: GitFixture[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(fixtures.splice(0).map(f => f.cleanup())); });
async function fixture() { const f = await createBareRemoteFixture(); fixtures.push(f); const repository = await resolveRepository(f.clones[0]); return { f, repository }; }

test('doctor without owning integration inspection cannot claim healthy setup', async () => {
  const { repository } = await fixture();
  expect(await diagnose(repository, {})).toMatchObject({ schemaVersion: 1, status: 'attention-required', exitCode: 1, remote: 'not-requested' });
});

test('doctor checks required integration completeness and explicitly bounded read-only remote access', async () => {
  const { f, repository } = await fixture(); await (await openStore(repository)).pendingCount();
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

const repositoryId = '12345678-1234-4234-8234-123456789abc';
const policy = { schemaVersion: 1 as const, repositoryId, normalizationVersion: 1 as const, discovery: 'auto' as const, disabledProviders: [], badge: { label: 'Usage', metric: 'tokens' as const } };
const meta = { schemaVersion: 2 as const, protocolVersion: 1 as const, repositoryId, normalizationVersion: 1 as const, catalogVersion: defaultCatalog.version, catalogHash: catalogHash(defaultCatalog), policy };
const roots = { codex: [], claude: [], gemini: [], opencode: [], cursor: [], copilot: [], import: [] };
function inspected(binding: Awaited<ReturnType<typeof bindRemote>>, currentPolicy: typeof policy = policy): IntegrationPort {
 return { inspect: async () => ({ setup: 'approved', repositoryId, binding, policy: currentPolicy, roots, checks: ['activation','runtime','git-hooks','provider-hooks'].map(code => ({code, required:true, status:'pass'})) }), deactivate: async () => ({deactivated:true,unresolved:[]}) };
}

test.each(['accepted','presence-only','binding-evidence'] as const)('remote doctor distinguishes never initialized history from deleted %s evidence without reseeding',async kind=>{
 const {f,repository}=await fixture(),store=await openStore(repository),binding=await bindRemote(repository,{repositoryId,declaredUrl:f.remote});
 await store.pendingCount();
 expect(await diagnose(repository,{remote:true,integrations:inspected(binding)})).toMatchObject({remote:'readable',exitCode:0});
 const initialized=await syncUsage({repository,store,binding,collect:'none',initialize:{meta,catalog:defaultCatalog},signal:AbortSignal.timeout(15000),deadline:Date.now()+15000});
 expect(initialized.status).toBe('synced');
 await f.git(f.remote,['update-ref','-d','refs/heads/agent-badge/data']);
 let checkedRepository=repository,checkedBinding=binding;
 if(kind!=='accepted'){
  checkedRepository=await resolveRepository(f.clones[1]);await openStore(checkedRepository);checkedBinding=await bindRemote(checkedRepository,{repositoryId,declaredUrl:f.remote,...(kind==='binding-evidence'&&binding.status==='bound'?{ledgerEvidence:{repositoryId,canonicalPushUrl:binding.canonicalPushUrl,dataRef:binding.dataRef}}:{})});
  if(kind==='presence-only'&&checkedBinding.status==='bound')await (await openStore(checkedRepository)).recordAcceptedLedger({schemaVersion:1,repositoryId,canonicalPushUrl:checkedBinding.canonicalPushUrl,dataRef:checkedBinding.dataRef,commit:null});
 }
 const before=await readStoreSnapshot(checkedRepository);
 expect(await diagnose(checkedRepository,{remote:true,integrations:inspected(checkedBinding)})).toMatchObject({status:'attention-required',exitCode:2,remote:'history-conflict',checks:expect.arrayContaining([{code:'remote-history',status:'fail',required:true}])});
 expect(await readStoreSnapshot(checkedRepository)).toEqual(before);
 expect(await f.git(f.remote,['for-each-ref','--format=%(refname)','refs/heads/agent-badge/data'])).toBe('');
},15000);

test('remote doctor compares freshly fetched policy while pending requests remain uncertain and no declaration stays absent',async()=>{
 const {f,repository}=await fixture(),store=await openStore(repository),binding=await bindRemote(repository,{repositoryId,declaredUrl:f.remote});
 const first=await syncUsage({repository,store,binding,collect:'none',initialize:{meta,catalog:defaultCatalog},signal:AbortSignal.timeout(15000),deadline:Date.now()+15000});expect(first.status).toBe('synced');
 await store.recordPendingConfiguration({schemaVersion:1,metadataRevision:'c'.repeat(64)});
 expect(await diagnose(repository,{remote:true,integrations:inspected(binding)})).toMatchObject({exitCode:0,checks:expect.arrayContaining([{code:'shared-policy',status:'warning',required:true}])});
 const other=await resolveRepository(f.clones[1]),otherStore=await openStore(other),otherBinding=await bindRemote(other,{repositoryId,declaredUrl:f.remote});
 const nextPolicy={...policy,badge:{...policy.badge,label:'Accepted elsewhere'}};
 const changed=await configureRepository({repository:other,store:otherStore,binding:otherBinding,expectedMetadataRevision:metadataRevision(meta),meta:{...meta,policy:nextPolicy},catalog:defaultCatalog,writeDeclaration:async()=>{},signal:AbortSignal.timeout(15000),deadline:Date.now()+15000});expect(changed.status).toBe('configured');
 const before=await readStoreSnapshot(repository);
 expect(await getStatus(repository,{inspection:await inspected(binding).inspect(repository,AbortSignal.timeout(5000))})).toMatchObject({configuration:'uncertain',lastConfirmedSync:first.confirmedCommit});
 expect(await diagnose(repository,{remote:true,integrations:inspected(binding)})).toMatchObject({remote:'readable',configuration:'drift',exitCode:4,checks:expect.arrayContaining([{code:'shared-policy',status:'fail',required:true}])});
 expect(await diagnose(repository,{remote:true,integrations:inspected(binding,nextPolicy)})).toMatchObject({configuration:'uncertain',exitCode:0});
 const absent=inspected(binding);const original=absent.inspect;absent.inspect=async(ctx,signal)=>{const {policy:_,...inspection}=await original(ctx,signal);return inspection;};
 expect(await diagnose(repository,{remote:true,integrations:absent})).toMatchObject({configuration:'absent',checks:expect.arrayContaining([{code:'shared-policy',status:'warning',required:true}])});
 expect(await readStoreSnapshot(repository)).toEqual(before);
 expect((await f.git(f.remote,['rev-parse','refs/heads/agent-badge/data'])).trim()).toBe(changed.confirmedCommit);
},20000);

test('a bounded metadata schema establishes unsupported-data without journal replay',async()=>{
 const {repository}=await fixture();const store=await openStore(repository);await store.pendingCount();
 const {writeFile}=await import('node:fs/promises');const {join}=await import('node:path');
 await writeFile(join(repository.privateDir,'reconciliation.json'),'{"schemaVersion":99}');
 expect(await getStatus(repository)).toMatchObject({state:'unsupported',failure:'unsupported-data',exitCode:3,queuedRecords:null});
});
