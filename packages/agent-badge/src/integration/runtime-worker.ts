import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runOperation as runRepositoryWorker } from '@legotin/agent-badge-core/operations/worker';
import type { RepositoryOperationRequest } from '@legotin/agent-badge-core/operations/runner';
import { checkActivation } from './runtime.js';

/** Activation, provider imports, capture and transport share Task10's one owned
 * worker group and lease. This child must never start a second supervisor. */
export async function runOperation(input: { cwd: string; privateDir: string; mode: 'automatic' | 'manual'; target?: NonNullable<RepositoryOperationRequest['collection']>['target'] }, context: Parameters<typeof runRepositoryWorker>[1]) {
  const queued = { status: 'queued' as const, acknowledgedCount: 0, queuedCount: null, pendingReconciliation: true };
  const checked = await checkActivation({ cwd: input.cwd, privateDir: input.privateDir, signal: context.signal, timeoutMs: Math.max(1, context.deadline - Date.now()) });
  if (checked.status !== 'approved') return queued;
  const a = checked.activation;
  if (resolve(fileURLToPath(new URL('../../', import.meta.url))) !== join(checked.privateDir, 'runtime', a.lockHash, 'node_modules/@legotin/agent-badge')) return queued;
  return runRepositoryWorker({ cwd: input.cwd, privateDir: checked.privateDir, repositoryId: a.repositoryId,
    mode: input.mode, binding: a.binding, collect: 'incremental', capturePolicy: a.capturePolicy,
    collection: { roots: a.roots, privatePolicy: a.privatePolicy, target: input.target } }, context);
}
