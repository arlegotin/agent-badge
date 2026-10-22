import { resolveRepository } from '../git/context.js';
import { openStore } from '../storage/store.js';
import { collectUsage } from '../collection/collect.js';
import type { CollectionResult } from '../collection/collect.js';
import { createCodexAdapter } from '../providers/codex/adapter.js';
import { createClaudeAdapter } from '../providers/claude/adapter.js';
import { loadCapturePolicy } from './capture-policy.js';
import { syncUsage } from './sync.js';
import type { RepositoryOperationRequest } from './runner.js';
import type { WorkerContext, WorkerSummary } from './worker-protocol.js';

/** Provisional Task10 bounds; Task17 replaces the large warm-prefix barrier with
 * verified indexes. Scan chunks exceed the readers' 256KiB maximum line size. */
const automaticLimits = { maxSources: 16, maxSourceBytes: 2 * 1024 * 1024 };
const automaticScanBytes = 512 * 1024;
/** Runtime-owned worker. Task11 supplies trusted activation/pin/binding state. */
export async function runOperation(input: RepositoryOperationRequest & { mode: 'automatic' | 'manual' }, context: WorkerContext): Promise<WorkerSummary> {
  const queued: WorkerSummary = { status: 'queued', acknowledgedCount: 0, queuedCount: null, pendingReconciliation: false };
  const automatic = input.mode === 'automatic';
  const repository = await resolveRepository(input.cwd);
  if (repository.privateDir !== input.privateDir) return { ...queued, status: 'conflict' };
  const store = await openStore(repository, { supervisedLeaseToken: context.leaseToken });
  return store.withLock(context.signal, async () => {
    if (automatic && (input.initialize || input.collect === 'full')) {
      await store.recordReconciliationPending(true);
      return { ...queued, pendingReconciliation: true };
    }
    const collection = { ...input.collection, ...(automatic ? { automaticLimits, adapters: {
      codex: createCodexAdapter({ maxBytes: automaticScanBytes }), claude: createClaudeAdapter({ maxBytes: automaticScanBytes }),
    } } : {}) };
    let captured: CollectionResult | null = null;
    if (input.capturePolicy && input.collect !== 'none') {
      const repositoryId = input.binding.status === 'bound' ? input.binding.repositoryId : input.repositoryId;
      if (!repositoryId || (input.repositoryId && input.repositoryId !== repositoryId)) return { ...queued, status: 'conflict' };
      const policy = await loadCapturePolicy(repository, store, input.capturePolicy, repositoryId, context);
      captured = await collectUsage({ ...collection, repository, store, policy, signal: context.signal });
    }
    if (input.binding.status !== 'bound') return { ...queued, queuedCount: (await store.pending()).length, pendingReconciliation: await store.reconciliationPending() };
    const result = await syncUsage({ repository, store, binding: input.binding, signal: context.signal, deadline: context.deadline,
      collect: captured || input.collect === 'none' ? 'none' : 'incremental', collection,
      initialize: automatic ? undefined : input.initialize });
    const collected = captured ?? result.collection;
    if (!automatic && input.collect === 'full' && !input.collection?.target && (result.status === 'synced' || result.status === 'unchanged') &&
        collected && !collected.cancelled && !collected.pendingReconciliation && !collected.diagnostics.length &&
        collected.sourceOutcomes.every(source => source.outcome === 'complete' || source.outcome === 'disabled' || source.outcome === 'empty'))
      await store.recordReconciliationPending(false);
    return { status: result.status, acknowledgedCount: result.acknowledgedHashes.length, queuedCount: (await store.pending()).length,
      pendingReconciliation: await store.reconciliationPending() };
  });
}
