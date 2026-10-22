import { afterEach, expect, test } from 'vitest';
import { createBareRemoteFixture, protocolObservationFixture, snapshotUserCheckout } from '@agent-badge/testkit';
import type { GitFixture } from '@agent-badge/testkit';
import * as core from '../index.js';
import type { ControlRecord } from '../domain/ledger.js';
const repositoryId = '12345678-1234-4234-8234-123456789abc';
const policy = { schemaVersion: 1 as const, repositoryId, normalizationVersion: 1 as const, discovery: 'auto' as const, disabledProviders: [], badge: { label: 'Usage', metric: 'tokens' as const } };
const meta = { schemaVersion: 2 as const, protocolVersion: 1 as const, repositoryId, normalizationVersion: 1 as const, catalogVersion: 1, catalogHash: core.catalogHash(core.defaultCatalog), policy };
const record = core.sanitizeObservation(protocolObservationFixture(), policy);
const fixtures: GitFixture[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(f => f.cleanup())); });

test('exports only sanitized public records in deterministic hash order', () => {
  expect(typeof core.exportContribution).toBe('function');
  const envelope = core.exportContribution({ meta, records: [record, record] });
  expect(envelope.kind).toBe('agent-badge/contribution');
  expect(envelope.records).toHaveLength(1);
  expect(envelope.records[0].hash).toBe(core.recordHash(record));
  expect(Object.keys(envelope).sort()).toEqual(['kind','normalizationVersion','protocolVersion','records','repositoryId','schemaVersion']);
  expect(JSON.stringify(envelope)).not.toMatch(/nativeUnitId|sourceIdentity|synthetic|requestId/);
  expect(core.contributionBytes(envelope)).toEqual(core.contributionBytes(core.exportContribution({ meta, records: [record] })));
});

test('exports cumulative and correction causal closure including current accepted controls', () => {
  const prior = { ...record, representation: 'cumulative' as const, revision: 'unordered:' + 'a'.repeat(64) };
  const newer = { ...prior, revision: 'unordered:' + 'b'.repeat(64), supersedes: [core.recordHash(prior)] };
  const correction: ControlRecord = { kind: 'correct', schemaVersion: 2, normalizationVersion: 1, repositoryId, targetUnitKey: record.unitKey, supersedes: [], replacedObservationHashes: [core.recordHash(prior)], replacementObservationHashes: [core.recordHash(newer)] };
  const include: ControlRecord = { kind: 'include', schemaVersion: 2, normalizationVersion: 1, repositoryId, targetUnitKey: record.unitKey, supersedes: [core.recordHash(correction)] };
  const envelope = core.exportContribution({ meta, records: [prior, newer, correction, include], selectedHashes: [core.recordHash(newer)] });
  expect(envelope.records).toHaveLength(4);
  expect(core.parseContribution(envelope).records).toHaveLength(4);
});

test('rejects foreign, malformed, oversized, private normalized sources and tampered hashes', () => {
  const good = core.exportContribution({ meta, records: [record] });
  for (const bad of [ { ...good, source: '/private/path' }, { ...good, schemaVersion: 2 }, { ...good, records: [{ hash: 'a'.repeat(64), record }] }, { ...good, records: [{ hash: core.recordHash(record), record: { ...record, prompt: 'private' } }] }, { kind: 'agent-badge/normalized-source', schemaVersion: 1 }, { ...good, repositoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } ]) expect(() => core.parseContribution(bad)).toThrow();
  expect(() => core.parseContribution(' '.repeat(10 * 1024 * 1024 + 1))).toThrow('envelope-too-large');
  expect(() => core.exportContribution({ meta, records: [{ ...record, supersedes: ['b'.repeat(64)] }] })).toThrow();
});

test('imports via shared transaction and renderer, deduplicates and preserves checkout', async () => {
  const f = await createBareRemoteFixture(); fixtures.push(f);
  const repository = await core.resolveRepository(f.clones[0]);
  const store = await core.openStore(repository, { processNamespace: async () => 'synthetic' });
  const binding = await core.bindRemote(repository, { repositoryId, declaredUrl: f.remote });
  const options = { repository, store, binding, signal: AbortSignal.timeout(20000), deadline: Date.now() + 20000, collect: 'none' as const };
  expect((await core.syncUsage({ ...options, initialize: { meta, catalog: core.defaultCatalog } })).status).toBe('synced');
  const before = await snapshotUserCheckout(repository.worktreeRoot);
  const envelope = core.exportContribution({ meta, records: [record] });
  const imported = await core.importContribution(envelope, options);
  expect(imported.status).toBe('synced');
  expect(imported.accepted?.ledger.knownTokens).toBe('140');
  expect(imported.accepted?.artifacts.has('badge.svg')).toBe(true);
  expect((await core.importContribution(envelope, options)).status).toBe('unchanged');
  expect(await snapshotUserCheckout(repository.worktreeRoot)).toEqual(before);
  expect(await store.journal()).toEqual([]);
  await expect(core.importContribution({ ...envelope, repositoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, options)).rejects.toThrow();
});

test('current accepted controls govern imported observations without reseeding missing or foreign ledgers', async () => {
 const f = await createBareRemoteFixture(); fixtures.push(f);
 const repository = await core.resolveRepository(f.clones[0]);
 const store = await core.openStore(repository,{processNamespace:async()=> 'synthetic'});
 const binding = await core.bindRemote(repository,{repositoryId,declaredUrl:f.remote});
 const options = { repository,store,binding,signal:AbortSignal.timeout(20000),deadline:Date.now()+20000 };
 const envelope = core.exportContribution({meta,records:[record]});
 const queued = await core.importContribution(envelope,options);
 expect(queued.status).toBe('queued'); expect(queued.retryRequired).toBe(true); expect(queued.retrySource).toBe('contribution-envelope');
 expect(await f.git(f.remote,['for-each-ref','--format=%(refname)','refs/heads/agent-badge/data'])).toBe('');
 await core.syncUsage({...options,collect:'none',initialize:{meta,catalog:core.defaultCatalog}});
 const exclude: ControlRecord = {kind:'exclude',schemaVersion:2,normalizationVersion:1,repositoryId,targetUnitKey:record.unitKey,supersedes:[]};
 await core.importContribution(core.exportContribution({meta,records:[exclude]}),options);
 const imported = await core.importContribution(envelope,options);
 expect(imported.accepted?.ledger.excludedUnits).toBe(1);
 expect(imported.accepted?.ledger.knownTokens).toBe('0');
 const foreignId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const foreign = await core.resolveRepository(f.clones[1]);
 const foreignStore = await core.openStore(foreign,{processNamespace:async()=> 'synthetic'});
 const foreignBinding = await core.bindRemote(foreign,{repositoryId:foreignId,declaredUrl:f.remote});
 const tip = imported.confirmedCommit;
 const initialized = await core.syncUsage({repository:foreign,store:foreignStore,binding:foreignBinding,collect:'none',signal:AbortSignal.timeout(20000),deadline:Date.now()+20000,
 initialize:{meta:{...meta,repositoryId:foreignId,policy:{...policy,repositoryId:foreignId}},catalog:core.defaultCatalog}});
 expect(initialized.status).toBe('conflict');
 expect((await f.git(f.remote,['rev-parse','refs/heads/agent-badge/data'])).trim()).toBe(tip);
});
