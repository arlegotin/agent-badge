/** Bounded private IPC. No accepted ledger, provider records, paths or free-form errors in replies. */
export interface WorkerSummary {
  reason?: 'automatic-local-transport';
  status: 'synced' | 'unchanged' | 'queued' | 'conflict' | 'unsupported';
  acknowledgedCount: number;
  queuedCount: number | null;
  pendingReconciliation: boolean;
  oversizedPendingUnits?:number;
}
export interface WorkerContext { deadline: number; leaseToken: string; signal: AbortSignal }
export function parseWorkerSummary(input: unknown): WorkerSummary | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const count = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  if (!['synced', 'unchanged', 'queued', 'conflict', 'unsupported'].includes(String(value.status)) ||
      (value.reason !== undefined && (value.reason !== 'automatic-local-transport' || value.status !== 'unsupported')) || !count(value.acknowledgedCount) || !(value.queuedCount === null || count(value.queuedCount)) || typeof value.pendingReconciliation !== 'boolean' || (value.oversizedPendingUnits!==undefined&&!count(value.oversizedPendingUnits))) return null;
  return { status: value.status as WorkerSummary['status'], acknowledgedCount: value.acknowledgedCount as number,
    ...(value.reason === 'automatic-local-transport' ? { reason: value.reason } : {}),
    queuedCount: value.queuedCount as number | null, pendingReconciliation: value.pendingReconciliation,
    ...(value.oversizedPendingUnits!==undefined?{oversizedPendingUnits:value.oversizedPendingUnits as number}:{}) };
}
