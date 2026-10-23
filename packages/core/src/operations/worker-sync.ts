import { resolveRepository } from '../git/context.js';
import type { RepositoryContext } from '../git/context.js';
import { openStore } from '../storage/store.js';
import { collectUsage } from '../collection/collect.js';
import type { CollectionResult } from '../collection/collect.js';
import { createCodexAdapter } from '../providers/codex/adapter.js';
import { createGeminiAdapter } from '../providers/gemini/adapter.js';
import { createClaudeAdapter } from '../providers/claude/adapter.js';
import { loadCapturePolicy } from './capture-policy.js';
import { syncUsage } from './sync.js';
import type { RepositoryOperationRequest } from './runner.js';
import type { WorkerContext, WorkerSummary } from './worker-protocol.js';

/** Bounded parsing and fair source slices; complete streaming prefix verification
 * remains required for appends. The supervisor owns the total wall-clock budget. */
const automaticLimits = { maxSources: 16 };
const automaticScanBytes = 512 * 1024;
const verifiedRepositories=new WeakSet<RepositoryContext>();
/** In-process verification only; serialized IPC cannot supply this authority. */
export async function resolveWorkerRepository(cwd:string,context:Pick<WorkerContext,'deadline'|'signal'>):Promise<RepositoryContext>{
  const repository=await resolveRepository(cwd,context);verifiedRepositories.add(repository);return repository;
}
/** Runtime-owned worker. Task11 supplies trusted activation/pin/binding state. */
export async function runOperation(input: RepositoryOperationRequest & { mode: 'automatic' | 'manual' }, context: WorkerContext,verified?:RepositoryContext): Promise<WorkerSummary> {
  const queued: WorkerSummary = { status: 'queued', acknowledgedCount: 0, queuedCount: null, pendingReconciliation: false };
  const automatic = input.mode === 'automatic';
  if(verified&&!verifiedRepositories.has(verified))return {...queued,status:'conflict'};
  const repository = verified ?? await resolveWorkerRepository(input.cwd,context);
  if (repository.privateDir !== input.privateDir) return { ...queued, status: 'conflict' };
  const store = await openStore(repository, { supervisedLeaseToken: context.leaseToken, ...(automatic?{rebuildBudget:context}:{}) });
  return store.withLock(context.signal, async () => {
    if (automatic && (input.initialize || input.collect === 'full')) {
      await store.recordReconciliationPending(true);
      return { ...queued, pendingReconciliation: true };
    }
    const collection = { ...input.collection, ...(automatic ? { automaticLimits, adapters: {
      codex: createCodexAdapter({ maxBytes: automaticScanBytes }), claude: createClaudeAdapter({ maxBytes: automaticScanBytes }), gemini: createGeminiAdapter({ maxBytes: automaticScanBytes }),
    } } : {}) };
    let captured: CollectionResult | null = null;
    if (input.capturePolicy && input.collect !== 'none') {
      const repositoryId = input.binding.status === 'bound' ? input.binding.repositoryId : input.repositoryId;
      if (!repositoryId || (input.repositoryId && input.repositoryId !== repositoryId)) return { ...queued, status: 'conflict' };
      const policy = await loadCapturePolicy(repository, store, input.capturePolicy, repositoryId, context);
      captured = await collectUsage({ ...collection, repository, store, policy, signal: context.signal });
    }
    if (input.synchronize === false) {
      const partial = !captured || captured.cancelled || captured.pendingReconciliation || captured.diagnostics.length > 0;
      if (input.collect === 'full' && captured && !partial && captured.sourceOutcomes.every(source => ['complete','empty','disabled'].includes(source.outcome))) await store.recordReconciliationPending(false);
      return { ...queued, status: partial ? 'queued' : 'unchanged', queuedCount: await store.pendingCount(), pendingReconciliation: await store.reconciliationPending() };
    }
    if (input.binding.status !== 'bound') return { ...queued, queuedCount: await store.pendingCount(), pendingReconciliation: await store.reconciliationPending() };
    // A later transport deadline must not invalidate completed local collection.
    // Keep the same owning lease; reopening only reads the published generation.
    if(captured)await store.flushDerivedIndex();
    const result = await syncUsage({ repository, store, binding: input.binding, signal: context.signal, deadline: context.deadline,
      operationMode: input.mode, snapshotMode: automatic ? 'summary' : 'full',
      collect: captured || input.collect === 'none' ? 'none' : 'incremental', collection,
      initialize: automatic ? undefined : input.initialize });
    const collected = captured ?? result.collection;
    if (!automatic && input.collect === 'full' && !input.collection?.target && (result.status === 'synced' || result.status === 'unchanged') &&
        collected && !collected.cancelled && !collected.pendingReconciliation && !collected.diagnostics.length &&
        collected.sourceOutcomes.every(source => source.outcome === 'complete' || source.outcome === 'disabled' || source.outcome === 'empty'))
      await store.recordReconciliationPending(false);
    return { status: result.status, ...(result.reason ? { reason: result.reason } : {}), acknowledgedCount: result.acknowledgedHashes.length, queuedCount: await store.pendingCount(),
      ...(result.deferredUnitCount?{oversizedPendingUnits:result.deferredUnitCount}:{}),
      pendingReconciliation: await store.reconciliationPending() };
  });
}
