import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RemoteBinding } from '../git/remote-binding.js';
import type { LedgerMeta } from '../domain/ledger.js';
import type { SharedPolicy } from '../domain/policy.js';
import type { PriceCatalog } from '../pricing/catalog.js';
import type { CollectOptions } from '../collection/collect.js';
import type { OperationBudget } from './budget.js';
import { superviseOperation } from './supervisor.js';
import type { SupervisedResult } from './supervisor.js';

export interface RepositoryOperationRequest {
  cwd: string;
  /** Approved private identity, required for capture with an unbound route. */
  repositoryId?: string;
  /** Trusted activation path. The worker checks it against actual Git discovery. */
  privateDir: string;
  binding: RemoteBinding;
  collect: 'none' | 'incremental' | 'full';
  collection?: Pick<CollectOptions, 'roots' | 'target' | 'privatePolicy'>;
  /** Last accepted anchored policy or explicitly trusted activation policy; private
   * capture uses this before network access, without promoting it to remote metadata. */
  capturePolicy?: SharedPolicy;
  /** Explicit manual initialization only. Accepted-history evidence still prevents reseeding. */
  initialize?: { meta: LedgerMeta; catalog: PriceCatalog };
}
export interface RepositoryOperationOptions {
  request: RepositoryOperationRequest;
  budget: OperationBudget;
  onDiagnostic?(line: string): void;
}
/** Keep imports lightweight. Repository discovery and provider work run under supervision. */
export function runRepositoryOperation(options: RepositoryOperationOptions): Promise<SupervisedResult> {
  let worker = new URL('./worker-sync.js', import.meta.url);
  if (!existsSync(worker)) worker = new URL('./worker-sync.ts', import.meta.url);
  return superviseOperation({ worker, input: { ...options.request, mode: options.budget.mode },
    budget: options.budget, leaseDirectory: join(options.request.privateDir, 'locks'), onDiagnostic: options.onDiagnostic });
}
