import { afterEach, expect, test } from 'vitest';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBareRemoteFixture, protocolObservationFixture, snapshotUserCheckout } from '@agent-badge/testkit';
import type { GitFixture } from '@agent-badge/testkit';
import { resolveRepository } from '../git/context.js';
import { bindRemote } from '../git/remote-binding.js';
import { openStore } from '../storage/store.js';
import { catalogHash, defaultCatalog } from '../pricing/catalog.js';
import { sanitizeObservation } from '../ledger/sanitize.js';
import { syncUsage } from './sync.js';
import { getStatus } from './status.js';

const repositoryId = '12345678-1234-4234-8234-123456789abc';
const policy = { schemaVersion: 1 as const, repositoryId, normalizationVersion: 1 as const, discovery: 'auto' as const, disabledProviders: [], badge: { label: 'Usage', metric: 'tokens' as const } };
const meta = { schemaVersion: 2 as const, protocolVersion: 1 as const, repositoryId, normalizationVersion: 1 as const, catalogVersion: defaultCatalog.version, catalogHash: catalogHash(defaultCatalog), policy };
const fixtures: GitFixture[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(f => f.cleanup())); });
async function fixture() { const f = await createBareRemoteFixture(); fixtures.push(f); const repository = await resolveRepository(f.clones[0]); return { f, repository }; }

test('fresh status reports setup needs without creating private files or touching checkout', async () => {
  const { f, repository } = await fixture();
  const before = await snapshotUserCheckout(repository.worktreeRoot), gitBefore = await readdir(repository.commonDir);
  const status = await getStatus(repository);
  expect(status).toMatchObject({ schemaVersion: 1, state: 'unavailable', setup: 'not-inspected', exitCode: 1, lastConfirmedSync: null, queuedRecords: 0, configuration: 'not-inspected' });
  expect(await snapshotUserCheckout(repository.worktreeRoot)).toEqual(before);
  expect(await readdir(repository.commonDir)).toEqual(gitBefore);
  expect(await f.git(f.remote, ['for-each-ref', '--format=%(refname)', 'refs/heads/agent-badge/data'])).toBe('');
});

test('local status distinguishes recorded pending synced partial and conflict with accepted catalog valuation', async () => {
  const { f, repository } = await fixture(), store = await openStore(repository);
  const binding = await bindRemote(repository, { repositoryId, declaredUrl: f.remote });
  const observation = protocolObservationFixture();
  const source = { provider: observation.provider, instanceKey: observation.source.instanceKey, root: '/synthetic/source', sourceIdentity: observation.source.sourceIdentity, schema: observation.source.sourceSchema, generation: observation.source.generation, readerVersion: observation.source.readerVersion };
  const record = sanitizeObservation(observation, policy);
  const checkpoint = { schemaVersion: 1 as const, provider: source.provider, instanceKey: source.instanceKey, sourceIdentity: source.sourceIdentity, sourceGeneration: source.generation, sourceSchema: source.schema, readerVersion: source.readerVersion, repositoryId, normalizationVersion: 1 as const, attributionPolicyHash: 'a'.repeat(64), continuation: null, cursor: { offset: 0, size: 0, prefixHash: 'b'.repeat(64), incompleteTail: '' } };
  await store.commitBatch(source, { source, observations: [observation], nextCheckpoint: checkpoint, outcome: 'complete', diagnostics: [] }, [record]);
  const inspected = { inspection: { setup: 'approved' as const, policy, repositoryId, binding, checks: [] } };
  expect(await getStatus(repository, inspected)).toMatchObject({ state: 'pending', states: expect.arrayContaining(['recorded', 'pending']), queuedRecords: 1, totals: { recordedUnits: 1 } });
  const synced = await syncUsage({ repository, store, binding, collect: 'none', initialize: { meta, catalog: defaultCatalog }, signal: AbortSignal.timeout(15000), deadline: Date.now() + 15000 });
  expect(synced.status).toBe('synced');
  // Remove the remote entirely: local reporting must continue from the accepted anchor.
  await f.git(repository.worktreeRoot, ['remote', 'remove', 'origin']);
  const status = await getStatus(repository, inspected);
  expect(status).toMatchObject({ state: 'synced', queuedRecords: 0, lastConfirmedSync: synced.confirmedCommit, valuation: { kind: 'current-catalog-estimate', catalogVersion: defaultCatalog.version }, totals: { recordedUnits: 1, knownTokens: '140' } });
  await store.recordReconciliationPending(true);
  expect(await getStatus(repository, inspected)).toMatchObject({ state: 'partial', states: expect.arrayContaining(['synced', 'partial']), pendingReconciliation: true });
  await store.recordReconciliationPending(false);
  const conflicting = { ...record, meters: record.meters.map(m => ({ ...m, total: 141, output: 41 })) };
  await store.commitBatch(source, { source, observations: [], nextCheckpoint: checkpoint, outcome: 'complete', diagnostics: [] }, [conflicting]);
  expect(await getStatus(repository, inspected)).toMatchObject({ state: 'conflicted', exitCode: 2, totals: { conflictingUnits: 1 } });
});

test('pending configuration is uncertainty and actual declaration controls drift reporting', async () => {
  const { f, repository } = await fixture(), store = await openStore(repository);
  const binding = await bindRemote(repository, { repositoryId, declaredUrl: f.remote });
  await syncUsage({ repository, store, binding, collect: 'none', initialize: { meta, catalog: defaultCatalog }, signal: AbortSignal.timeout(15000), deadline: Date.now() + 15000 });
  await store.recordPendingConfiguration({ schemaVersion: 1, metadataRevision: 'c'.repeat(64) });
  expect(await getStatus(repository, { inspection: { setup: 'approved', policy, repositoryId, binding, checks: [] } })).toMatchObject({ configuration: 'uncertain' });
  expect(await getStatus(repository, { inspection: { setup: 'approved', policy: { ...policy, badge: { ...policy.badge, label: 'Stale' } }, repositoryId, binding, checks: [] } })).toMatchObject({ configuration: 'drift', exitCode: 4 });
  expect(await getStatus(repository, { inspection: { setup: 'approved', repositoryId, binding, checks: [] } })).toMatchObject({ configuration: 'absent' });
  expect(await getStatus(repository)).toMatchObject({ configuration: 'not-inspected' });
});

test('future private schema is static unsupported output and is never rewritten', async () => {
  const { repository } = await fixture();
  await mkdir(repository.privateDir); await writeFile(join(repository.privateDir, 'acknowledged.json'), '{"schemaVersion":99,"private":"secret"}');
  const before = await readFile(join(repository.privateDir, 'acknowledged.json'), 'utf8');
  const result = await getStatus(repository);
  expect(result).toMatchObject({ state: 'unsupported', exitCode: 3 });
  expect(JSON.stringify(result)).not.toMatch(/secret|synthetic|\/private\//);
  expect(await readFile(join(repository.privateDir, 'acknowledged.json'), 'utf8')).toBe(before);
});

test('local accepted reader rejects a tree masquerading as an anchored accepted commit',async()=>{
 const {f,repository}=await fixture(),store=await openStore(repository);
 const binding=await bindRemote(repository,{repositoryId,declaredUrl:f.remote});
 const synced=await syncUsage({repository,store,binding,collect:'none',initialize:{meta,catalog:defaultCatalog},signal:AbortSignal.timeout(15000),deadline:Date.now()+15000});
 const tree=(await f.git(repository.worktreeRoot,['rev-parse',synced.confirmedCommit+'^{tree}'])).trim();await f.git(repository.worktreeRoot,['update-ref',`refs/agent-badge/accepted/${tree}`,tree]);
 await store.recordAcceptedLedger({... (await store.transportState())!,commit:tree});
 expect(await getStatus(repository)).toMatchObject({state:'unsupported',exitCode:3,failure:'unsupported-data'});
});
