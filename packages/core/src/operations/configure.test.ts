import { afterEach, expect, test } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBareRemoteFixture } from '@agent-badge/testkit';
import type { GitFixture } from '@agent-badge/testkit';
import { resolveRepository } from '../git/context.js';
import { bindRemote } from '../git/remote-binding.js';
import { openStore } from '../storage/store.js';
import { catalogHash, defaultCatalog } from '../pricing/catalog.js';
import { syncUsage } from './sync.js';
import { configureRepository, metadataRevision } from './configure.js';

const repositoryId = '12345678-1234-4234-8234-123456789abc';
const meta = { schemaVersion: 2 as const, protocolVersion: 1 as const, repositoryId, normalizationVersion: 1 as const,
  catalogVersion: 1, catalogHash: catalogHash(defaultCatalog), policy: { schemaVersion: 1 as const, repositoryId,
    normalizationVersion: 1 as const, discovery: 'auto' as const, disabledProviders: [], badge: { label: 'Original', metric: 'tokens' as const } } };
const fixtures: GitFixture[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(f => f.cleanup())); });
async function fixture() {
  const f = await createBareRemoteFixture(); fixtures.push(f);
  async function client(cwd: string) {
    const repository = await resolveRepository(cwd);
    const store = await openStore(repository, { processNamespace: async () => 'synthetic' });
    const binding = await bindRemote(repository, { repositoryId, declaredUrl: f.remote, target: 'origin' });
    return { repository, store, binding, collect: 'none' as const, signal: AbortSignal.timeout(20000), deadline: Date.now() + 20000 };
  }
  const a = await client(f.clones[0]), b = await client(f.clones[1]);
  const first = await syncUsage({ ...a, initialize: { meta, catalog: defaultCatalog } });
  expect(first.status).toBe('synced');
  return { f, a, b };
}
function change(label: string) { return { ...meta, policy: { ...meta.policy, badge: { ...meta.policy.badge, label } } }; }

test('explicit configure changes accepted metadata and catalog, while stale branch bootstrap cannot roll it back', async () => {
  const { f, a, b } = await fixture();
  const catalog = { ...defaultCatalog, version: 2, cards: defaultCatalog.cards.map(c => ({ ...c, input: 123 })) };
  const requested = { ...change('Changed'), catalogVersion: 2, catalogHash: catalogHash(catalog) };
  const declaration = join(f.root, 'declaration.json');
  const configured = await configureRepository({ ...a, expectedMetadataRevision: metadataRevision(meta), meta: requested, catalog,
    writeDeclaration: async accepted => { await writeFile(declaration, JSON.stringify(accepted.meta)); } });
  expect(configured.status).toBe('configured');
  expect(JSON.parse(await readFile(declaration, 'utf8')).policy.badge.label).toBe('Changed');
  const stale = await syncUsage({ ...b, initialize: { meta, catalog: defaultCatalog } });
  expect(stale.accepted?.meta.policy.badge.label).toBe('Changed');
  expect(stale.accepted?.catalog.version).toBe(2);
  expect(stale.accepted?.commit).toBe(configured.confirmedCommit);
  expect(a.binding).toMatchObject({ canonicalPushUrl: b.binding.status === 'bound' ? b.binding.canonicalPushUrl : '' });
});

test('simultaneous metadata edits use revision CAS and never retry the loser as an override', async () => {
  const { a, b } = await fixture();
  const results = await Promise.all([a, b].map((client, index) => configureRepository({ ...client,
    expectedMetadataRevision: metadataRevision(meta), meta: change(index ? 'Second' : 'First'), catalog: defaultCatalog,
    writeDeclaration: async () => {} })));
  expect(results.map(r => r.status).sort()).toEqual(['configured', 'conflict']);
  const accepted = await syncUsage(a);
  const winner = results.findIndex(r => r.status === 'configured');
  expect(accepted.accepted?.meta.policy.badge.label).toBe(winner ? 'Second' : 'First');
});

test('accepted remote configuration with a failed local write remains repairable drift without rollback', async () => {
  const { a } = await fixture();
  const desired = change('Accepted');
  const result = await configureRepository({ ...a, expectedMetadataRevision: metadataRevision(meta), meta: desired, catalog: defaultCatalog,
    writeDeclaration: async () => { throw new Error('private path must not escape'); } });
  expect(result.status).toBe('drift');
  expect(result.exitCode).not.toBe(0);
  expect(await a.store.pendingConfiguration()).toMatchObject({ metadataRevision: metadataRevision(desired) });
  expect((await syncUsage(a)).accepted?.meta.policy.badge.label).toBe('Accepted');
  let repaired = false;
  const retry = await configureRepository({ ...a, expectedMetadataRevision: metadataRevision(desired), meta: desired, catalog: defaultCatalog,
    writeDeclaration: async () => { repaired = true; } });
  expect(retry.status).toBe('unchanged'); expect(repaired).toBe(true);
  expect(await a.store.pendingConfiguration()).toBeNull();
  expect(retry.confirmedCommit).toBe(result.confirmedCommit);
});

test('stale edits conflict even when desired metadata happens to equal the winning edit', async () => {
  const { a, b } = await fixture();
  const request = { expectedMetadataRevision: metadataRevision(meta), meta: change('Same'), catalog: defaultCatalog, writeDeclaration: async () => {} };
  expect((await configureRepository({ ...a, ...request })).status).toBe('configured');
  expect((await configureRepository({ ...b, ...request })).status).toBe('conflict');
});

test('a definitely rejected second edit preserves earlier unresolved declaration repair evidence', async () => {
  const { a, b } = await fixture();
  const desired = change('Accepted');
  expect((await configureRepository({ ...a, expectedMetadataRevision: metadataRevision(meta), meta: desired, catalog: defaultCatalog,
    writeDeclaration: async () => { throw Error('synthetic'); } })).status).toBe('drift');
  const previous = await a.store.pendingConfiguration();
  const rejected = await configureRepository({ ...a, expectedMetadataRevision: metadataRevision(meta), meta: change('Stale'), catalog: defaultCatalog,
    writeDeclaration: async () => { throw Error('must not run'); } });
  expect(rejected.status).toBe('conflict');
  expect(await a.store.pendingConfiguration()).toEqual(previous);
  expect((await syncUsage(b)).accepted?.meta.policy.badge.label).toBe('Accepted');
});

test('remote acceptance followed by real parent death retains repair evidence across restart', async () => {
  const { f, a } = await fixture();
  const { runStorageFixtureProcess } = await import('@agent-badge/testkit');
  const { pathToFileURL } = await import('node:url');
  const input = join(f.root, 'configure-input.json');
  const desired = change('Crash accepted');
  await writeFile(input, JSON.stringify({ repository: a.repository, binding: a.binding, meta: desired, catalog: defaultCatalog, expectedMetadataRevision: metadataRevision(meta) }));
  const url = (path: string) => pathToFileURL(join(process.cwd(), 'packages/core/src', path)).href;
  const child = await runStorageFixtureProcess(process.cwd(), `const fs=await import('node:fs/promises');
    const input=JSON.parse(await fs.readFile(${JSON.stringify(input)},'utf8'));
    const {openStore}=await import(${JSON.stringify(url('storage/store.ts'))});
    const {configureRepository}=await import(${JSON.stringify(url('operations/configure.ts'))});
    await configureRepository({...input,store:await openStore(input.repository,{processNamespace:async()=> 'synthetic'}),signal:AbortSignal.timeout(10000),deadline:Date.now()+10000,
      writeDeclaration:async()=>{process.kill(process.pid,'SIGKILL')}});`);
  expect(child.signal).toBe('SIGKILL');
  const store = await openStore(a.repository, { processNamespace: async () => 'synthetic' });
  expect(await store.pendingConfiguration()).toEqual({ schemaVersion: 1, metadataRevision: metadataRevision(desired) });
  expect((await syncUsage({ ...a, store })).accepted?.meta.policy.badge.label).toBe('Crash accepted');
  const repaired = await configureRepository({ ...a, store, expectedMetadataRevision: metadataRevision(desired), meta: desired, catalog: defaultCatalog, writeDeclaration: async () => {} });
  expect(repaired.status).toBe('unchanged'); expect(await store.pendingConfiguration()).toBeNull();
});

test('cancellation during a stalled declaration write returns drift and retains accepted policy', async () => {
  const { a } = await fixture(); const controller = new AbortController();
  const result = await configureRepository({ ...a, signal: controller.signal, expectedMetadataRevision: metadataRevision(meta), meta: change('Accepted'), catalog: defaultCatalog,
    writeDeclaration: async () => { setTimeout(() => controller.abort(), 10); await new Promise(() => {}); } });
  expect(result.status).toBe('drift'); expect(result.exitCode).toBe(4);
  expect((await syncUsage(a)).accepted?.meta.policy.badge.label).toBe('Accepted');
  expect(await a.store.pendingConfiguration()).not.toBeNull();
});

test('an unsupported snapshot after an attempted send retains pending uncertainty rather than erasing repair evidence', async () => {
  const { f, a } = await fixture();
  const { DataTransport } = await import('../git/data-transport.js');
  const { commitFixtureTree } = await import('@agent-badge/testkit');
  const { vi } = await import('vitest');
  const original = DataTransport.prototype.push;
  const spy = vi.spyOn(DataTransport.prototype, 'push').mockImplementation(async function(commit, parent) {
    await original.call(this, commit, parent);
    const broken = await commitFixtureTree(f, f.remote, [{ path: 'meta.json', content: JSON.stringify({ ...meta, schemaVersion: 999 }) }], commit);
    await f.git(f.remote, ['update-ref', 'refs/heads/agent-badge/data', broken]);
  });
  try {
    const desired = change('Possibly accepted');
    const result = await configureRepository({ ...a, expectedMetadataRevision: metadataRevision(meta), meta: desired, catalog: defaultCatalog, writeDeclaration: async () => {} });
    expect(result.status).toBe('unsupported');
    expect(await a.store.pendingConfiguration()).toEqual({ schemaVersion: 1, metadataRevision: metadataRevision(desired) });
  } finally { spy.mockRestore(); }
});

test('usage-only remote advancement retries the metadata CAS without dropping records or rescanning providers', async () => {
  const { f, a } = await fixture();
  const { vi } = await import('vitest');
  const { DataTransport } = await import('../git/data-transport.js');
  const { protocolObservationFixture, commitFixtureTree } = await import('@agent-badge/testkit');
  const { sanitizeObservation } = await import('../ledger/sanitize.js');
  const { renderArtifacts } = await import('../render/summary.js');
  const { reduceLedger } = await import('../ledger/reduce.js');
  const { recordHash } = await import('../ledger/canonical-json.js');
  const record = sanitizeObservation(protocolObservationFixture(), meta.policy);
  const original = DataTransport.prototype.push; let sends = 0;
  const spy = vi.spyOn(DataTransport.prototype, 'push').mockImplementation(async function(commit, parent) {
    if (sends++ === 0) {
      const artifacts = renderArtifacts(reduceLedger([record], meta), meta, defaultCatalog);
      const appended = await commitFixtureTree(f, f.remote, [...artifacts].map(([path, content]) => ({ path, content: Buffer.from(content).toString('utf8') })), parent!);
      await f.git(f.remote, ['update-ref', 'refs/heads/agent-badge/data', appended]);
    }
    await original.call(this, commit, parent);
  });
  try {
    const catalog = { ...defaultCatalog, version: 2, cards: defaultCatalog.cards.map(card => ({ ...card, input: 10_000_000 })) };
    const desired = { ...change('Repriced'), catalogVersion: 2, catalogHash: catalogHash(catalog) };
    const result = await configureRepository({ ...a, expectedMetadataRevision: metadataRevision(meta), meta: desired, catalog, writeDeclaration: async () => {} });
    expect(result.status).toBe('configured'); expect(sends).toBe(2);
    expect(result.accepted?.ledger.recordHashes).toEqual([recordHash(record)]);
    expect(result.accepted?.meta.policy.badge.label).toBe('Repriced');
    const before = renderArtifacts(reduceLedger([record], meta), meta, defaultCatalog);
    expect(Buffer.from(result.accepted!.artifacts.get('summary.json')!).toString()).not.toBe(Buffer.from(before.get('summary.json')!).toString());
    const path = [...before.keys()].find(path => path.startsWith('observations/'))!;
    expect(result.accepted!.artifacts.get(path)).toEqual(before.get(path));
    expect(await a.store.journal()).toEqual([]);
  } finally { spy.mockRestore(); }
});
