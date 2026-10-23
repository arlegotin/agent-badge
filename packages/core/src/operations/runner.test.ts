import { afterEach, expect, test } from 'vitest';
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBareRemoteFixture, startFixtureGitDaemon, codexRollout, codexContext, codexRequest } from '@agent-badge/testkit';
import type { GitFixture } from '@agent-badge/testkit';
import { resolveRepository } from '../git/context.js';
import { bindRemote } from '../git/remote-binding.js';
import { openStore } from '../storage/store.js';
import { catalogHash, defaultCatalog } from '../pricing/catalog.js';
import { collectUsage } from '../collection/collect.js';
import { createCodexAdapter } from '../providers/codex/adapter.js';
import { syncUsage } from './sync.js';
import { createOperationBudget } from './budget.js';
import { runRepositoryOperation } from './runner.js';

const repositoryId = '12345678-1234-4234-8234-123456789abc';
const policy = { schemaVersion: 1 as const, repositoryId, normalizationVersion: 1 as const, discovery: 'auto' as const, disabledProviders: [], badge: { label: 'Usage', metric: 'tokens' as const } };
const meta = { schemaVersion: 2 as const, protocolVersion: 1 as const, repositoryId, normalizationVersion: 1 as const, catalogVersion: 1, catalogHash: catalogHash(defaultCatalog), policy };
const fixtures: GitFixture[] = [];
const receivers: Awaited<ReturnType<typeof startFixtureGitDaemon>>[] = [];
afterEach(async () => {
  await Promise.all(receivers.splice(0).map(receiver => receiver.stop()));
  await Promise.all(fixtures.splice(0).map(f => f.cleanup()));
});
async function fixture(hosted = false) {
  const f = await createBareRemoteFixture(); fixtures.push(f);
  let declaredUrl = f.remote;
  if (hosted) {
    const receiver = await startFixtureGitDaemon(f); receivers.push(receiver);
    declaredUrl = receiver.url;
    await f.git(f.clones[0], ['remote', 'set-url', 'origin', declaredUrl]);
  }
  const repository = await resolveRepository(f.clones[0]); const store = await openStore(repository);
  const binding = await bindRemote(repository, { repositoryId, declaredUrl });
  const options = { repository, store, binding, signal: AbortSignal.timeout(15000), deadline: Date.now() + 15000, collect: 'none' as const };
  expect((await syncUsage({ ...options, initialize: { meta, catalog: defaultCatalog } })).status).toBe('synced');
  return { f, repository, store, binding, options };
}

test('real repository worker returns bounded counts without serializing accepted history', async () => {
  const { repository, binding } = await fixture();
  const budget = createOperationBudget('automatic');
  const result = await runRepositoryOperation({ budget, request: { cwd: repository.worktreeRoot, privateDir: repository.privateDir, binding, collect: 'none' } });
  expect(result.status).toBe('unchanged'); expect(result.queuedCount).toBe(0);
  expect(JSON.stringify(result).length).toBeLessThan(512); expect(result).not.toHaveProperty('accepted'); budget.dispose();
});

test('full automatic reconciliation is deferred without provider reads or changing history', async () => {
  const { repository, binding, store, options } = await fixture();
  const before = await store.transportState();
  const budget = createOperationBudget('automatic');
  const result = await runRepositoryOperation({ budget, request: { cwd: repository.worktreeRoot, privateDir: repository.privateDir, binding, collect: 'full' } });
  expect(result.status).toBe('queued'); expect(result.pendingReconciliation).toBe(true);
  expect(await store.transportState()).toEqual(before); expect(await store.journal()).toEqual([]); budget.dispose();
  expect((await syncUsage(options)).status).toBe('unchanged');
});

test('trusted accepted policy captures targeted appended usage durably before an offline network attempt', async () => {
  const { f, repository, binding, store, options } = await fixture();
  const root = join(f.root, 'codex'); await mkdir(join(root, 'sessions'), { recursive: true });
  const path = join(root, 'sessions', 'a.jsonl');
  await writeFile(path, codexRollout({ single: true }).replaceAll('/synthetic/repo', repository.worktreeRoot));
  await collectUsage({ repository, store, policy, signal: options.signal, adapters: { codex: createCodexAdapter({ environment: {}, defaultHome: root }) } });
  expect((await syncUsage(options)).status).toBe('synced');
  await appendFile(path, [{ ...codexContext('turn-2'), ordinal: 3 }, codexRequest('original', 'turn-2', 'response-2', 200, 4)].map(row => JSON.stringify(row).replaceAll('/synthetic/repo', repository.worktreeRoot)).join('\n') + '\n');
  await rename(f.remote, f.remote + '.offline');
  const budget = createOperationBudget('automatic');
  const result = await runRepositoryOperation({ budget, request: { cwd: repository.worktreeRoot, privateDir: repository.privateDir, binding,
    collect: 'incremental', capturePolicy: policy, collection: { roots: { codex: [root] }, target: { provider: 'codex', sourceIdentity: path } } } });
  budget.dispose(); expect(result.status).toBe('queued'); expect(await store.pending()).toHaveLength(1);
  expect((await store.journal()).flatMap(entry => entry.observations).length).toBeGreaterThan(1);
  expect(await readFile(path, 'utf8')).toContain('response-2');
});

test('a stalled store lock stays within the automatic wall budget and emits one diagnostic', async () => {
  const { repository, binding, store } = await fixture();
  const { acquireLock } = await import('../storage/lock.js');
  const release = await acquireLock(join(repository.privateDir, 'locks'), AbortSignal.timeout(500), async () => null);
  const diagnostics: string[] = [], budget = createOperationBudget('automatic');
  const start = performance.now();
  try {
    const result = await runRepositoryOperation({ budget, onDiagnostic: line => diagnostics.push(line), request: { cwd: repository.worktreeRoot, privateDir: repository.privateDir, binding, collect: 'none' } });
    expect(performance.now() - start).toBeLessThan(2150); expect(result.status).toBe('queued'); expect(result.exitCode).toBe(0);
    expect(diagnostics).toHaveLength(1);
  } finally { await release(); budget.dispose(); }
  expect(await store.pending()).toEqual([]);
});

test.each([true, false])('new small session after setup is automatically counted with targeted=%s', async targeted => {
  const { f, repository, binding, store } = await fixture(true);
  const root = join(f.root, 'new-codex'), path = join(root, 'sessions', 'new.jsonl');
  await mkdir(join(root, 'sessions'), { recursive: true });
  await writeFile(path, codexRollout({ single: true }).replaceAll('/synthetic/repo', repository.worktreeRoot));
  const budget = createOperationBudget('automatic');
  const result = await runRepositoryOperation({ budget, request: { cwd: repository.worktreeRoot, privateDir: repository.privateDir,
    binding, capturePolicy: policy, collect: 'incremental', collection: { roots: { codex: [root], claude: [join(f.root, 'absent-claude')], gemini: [], opencode: [] },
      ...(targeted ? { target: { provider: 'codex' as const, sourceIdentity: path } } : {}) } } });
  budget.dispose(); expect(result.status).toBe('synced'); expect(result.acknowledgedCount).toBe(1);
  expect(await store.pending()).toEqual([]); expect((await store.journal()).flatMap(entry => entry.observations)).toHaveLength(1);
});


test('automatic scan chunk handles near-maximum lines without stalling at the first unread line', async () => {
  const { f, repository, binding, store } = await fixture(true);
  const root = join(f.root, 'codex-lines'), path = join(root, 'sessions', 'near-limit.jsonl');
  await mkdir(join(root, 'sessions'), { recursive: true });
  const lines = codexRollout({ single: true }).replaceAll('/synthetic/repo', repository.worktreeRoot).trim().split('\n');
  const padding = JSON.stringify({ type: 'synthetic-padding', value: 'x'.repeat(254 * 1024) });
  lines.splice(2, 0, padding, padding); await writeFile(path, lines.join('\n') + '\n');
  const budget = createOperationBudget('automatic');
  const result = await runRepositoryOperation({ budget, request: { cwd: repository.worktreeRoot, privateDir: repository.privateDir, binding, collect: 'incremental', capturePolicy: policy,
    collection: { roots: { codex: [root], claude: [], gemini: [], opencode: [] }, target: { provider: 'codex', sourceIdentity: path } } } });
  budget.dispose(); expect(result.status).toBe('synced'); expect(result.acknowledgedCount).toBe(1);
  const journal = await store.journal(); expect(journal.at(-1)?.checkpoint.cursor.offset).toBe((await readFile(path)).length);
});

test('only a successful complete manual reconciliation clears durable pending state', async () => {
  const { f, repository, binding, store } = await fixture(true);
  await store.recordReconciliationPending(true);
  const root = join(f.root, 'manual-codex'), path = join(root, 'sessions', 'new.jsonl');
  await mkdir(join(root, 'sessions'), { recursive: true });
  await writeFile(path, codexRollout({ single: true }).replaceAll('/synthetic/repo', repository.worktreeRoot));
  const request = { cwd: repository.worktreeRoot, privateDir: repository.privateDir, binding, capturePolicy: policy,
    collection: { roots: { codex: [root], claude: [join(f.root, 'empty-claude')], gemini: [], opencode: [] } } };
  await mkdir(join(f.root, 'empty-claude', 'projects'), { recursive: true });
  const automatic = createOperationBudget('automatic');
  const targeted = await runRepositoryOperation({ budget: automatic, request: { ...request, collect: 'incremental', collection: { ...request.collection, target: { provider: 'codex', sourceIdentity: path } } } });
  automatic.dispose(); expect(targeted.pendingReconciliation).toBe(true); expect(await store.reconciliationPending()).toBe(true);
  const manual = createOperationBudget('manual', 10000);
  const result = await runRepositoryOperation({ budget: manual, request: { ...request, collect: 'full' } });
  manual.dispose(); expect(result.status).toBe('unchanged'); expect(result.pendingReconciliation).toBe(false);
  expect(await store.reconciliationPending()).toBe(false);
});

test.each(['provider-only', 'exact-source'] as const)('manual full mode with a %s target never clears broad reconciliation evidence', async targetKind => {
  const { f, repository, binding, store } = await fixture();
  await store.recordReconciliationPending(true);
  const root = join(f.root, 'empty-target-codex');
  await mkdir(join(root, 'sessions'), { recursive: true });
  const target = targetKind === 'provider-only' ? { provider: 'codex' as const } : { provider: 'codex' as const, sourceIdentity: join(root, 'sessions', 'missing.jsonl') };
  const budget = createOperationBudget('manual', 10000);
  const result = await runRepositoryOperation({ budget, request: { cwd: repository.worktreeRoot, privateDir: repository.privateDir,
    binding, collect: 'full', capturePolicy: policy, collection: { roots: { codex: [root] }, target } } });
  budget.dispose(); expect(result.status).toBe('unchanged');
  expect(result.pendingReconciliation).toBe(true); expect(await store.reconciliationPending()).toBe(true);
});

test('offline capture loads the latest anchored accepted policy rather than stale activation policy', async () => {
  const { f, repository, binding, store, options } = await fixture();
  const { configureRepository, metadataRevision } = await import('./configure.js');
  const changed = { ...meta, policy: { ...policy, disabledProviders: ['codex' as const] } };
  expect((await configureRepository({ ...options, expectedMetadataRevision: metadataRevision(meta), meta: changed, catalog: defaultCatalog, writeDeclaration: async () => {} })).status).toBe('configured');
  const root = join(f.root, 'disabled-codex'), path = join(root, 'sessions', 'new.jsonl');
  await mkdir(join(root, 'sessions'), { recursive: true });
  await writeFile(path, codexRollout({ single: true }).replaceAll('/synthetic/repo', repository.worktreeRoot));
  await rename(f.remote, f.remote + '.offline');
  const budget = createOperationBudget('automatic');
  const result = await runRepositoryOperation({ budget, request: { cwd: repository.worktreeRoot, privateDir: repository.privateDir,
    binding, capturePolicy: policy, collect: 'incremental', collection: { roots: { codex: [root] }, target: { provider: 'codex', sourceIdentity: path } } } });
  budget.dispose(); expect(result.status).toBe('queued'); expect(await store.pending()).toEqual([]); expect(await store.journal()).toEqual([]);
});

test('unbound activation captures local usage without any remote operation', async () => {
  const f = await createBareRemoteFixture(); fixtures.push(f);
  const repository = await resolveRepository(f.clones[0]), store = await openStore(repository);
  const root = join(f.root, 'unbound-codex'), path = join(root, 'sessions', 'new.jsonl');
  await mkdir(join(root, 'sessions'), { recursive: true });
  await writeFile(path, codexRollout({ single: true }).replaceAll('/synthetic/repo', repository.worktreeRoot));
  const budget = createOperationBudget('automatic');
  const result = await runRepositoryOperation({ budget, request: { cwd: repository.worktreeRoot, privateDir: repository.privateDir,
    repositoryId, binding: { status: 'unbound', reason: 'destination-mismatch' }, capturePolicy: policy, collect: 'incremental',
    collection: { roots: { codex: [root] }, target: { provider: 'codex', sourceIdentity: path } } } });
  budget.dispose(); expect(result.status).toBe('queued'); expect(await store.pending()).toHaveLength(1);
  expect(await store.transportState()).toBeNull();
});
