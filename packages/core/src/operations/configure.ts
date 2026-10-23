import type { LedgerMeta } from '../domain/ledger.js';
import { parseLedgerMeta } from '../domain/ledger.js';
import type { PriceCatalog } from '../pricing/catalog.js';
import { contentHash, parsePriceCatalog } from '../pricing/catalog.js';
import { reduceLedger } from '../ledger/reduce.js';
import { renderArtifacts } from '../render/summary.js';
import type { AcceptedLedger } from '../git/data-transport.js';
import { synchronizeTransaction } from './sync.js';
import type { SyncOptions, SyncResult, MetadataChange } from './sync.js';

export function metadataRevision(meta: LedgerMeta): string { return contentHash(parseLedgerMeta(meta)); }
export interface ConfigureRequest extends Omit<SyncOptions, 'initialize' | 'collect' | 'collection'> {
  expectedMetadataRevision: string;
  meta: LedgerMeta;
  catalog: PriceCatalog;
  /** Task11 owns the declaration format and atomic checkout write. Cancellation must be honored. */
  writeDeclaration(accepted: AcceptedLedger, signal: AbortSignal): Promise<void>;
}
export interface ConfigureResult {
  status: 'configured' | 'unchanged' | 'drift' | 'queued' | 'conflict' | 'unsupported';
  exitCode: 0 | 1 | 2 | 3 | 4;
  confirmedCommit: string | null;
  metadataRevision: string | null;
  accepted: AcceptedLedger | null;
}
/** Remote acceptance is final. A failed local write never rolls shared metadata back. */
export async function configureRepository(request: ConfigureRequest): Promise<ConfigureResult> {
  let result: ConfigureResult = { status: 'queued', exitCode: 1, confirmedCommit: null, metadataRevision: null, accepted: null };
  if (!Number.isFinite(request.deadline) || request.deadline <= Date.now()) return result;
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(Math.min(2 ** 32 - 1, Math.max(1, Math.ceil(request.deadline - Date.now()))))]);
  try {
    const meta = parseLedgerMeta(request.meta), catalog = parsePriceCatalog(request.catalog);
    if (!/^[a-f0-9]{64}$/.test(request.expectedMetadataRevision)) return { ...result, status: 'conflict', exitCode: 2 };
    renderArtifacts(reduceLedger([], meta), meta, catalog);
    return await request.store.withLock(signal, async () => {
      const previous = await request.store.pendingConfiguration();
      await request.store.recordPendingConfiguration({ schemaVersion: 1, metadataRevision: metadataRevision(meta) });
      const change: MetadataChange = { expectedMetadataRevision: request.expectedMetadataRevision, meta, catalog };
      const synced: SyncResult = await synchronizeTransaction({ ...request, signal, collect: 'none' }, change);
      result = { status: synced.status === 'synced' ? 'configured' : synced.status,
        exitCode: synced.status === 'conflict' ? 2 : synced.status === 'unsupported' ? 3 : 1,
        confirmedCommit: synced.confirmedCommit, metadataRevision: synced.accepted ? metadataRevision(synced.accepted.meta) : null, accepted: synced.accepted };
      if (synced.status !== 'synced' && synced.status !== 'unchanged') {
        // Definite rejection restores prior repair evidence; unknown outcomes retain uncertainty.
        if (!change.attempted && (synced.status === 'conflict' || synced.status === 'unsupported')) await request.store.recordPendingConfiguration(previous);
        return result;
      }
      try {
        signal.throwIfAborted();
        await new Promise<void>((resolve, reject) => {
          const abort = () => reject(new Error('declaration-pending'));
          signal.addEventListener('abort', abort, { once: true });
          if (signal.aborted) abort();
          Promise.resolve().then(() => request.writeDeclaration(synced.accepted!, signal)).then(resolve, reject)
            .finally(() => signal.removeEventListener('abort', abort));
        });
        signal.throwIfAborted();
        await request.store.recordPendingConfiguration(null);
        return { ...result, exitCode: 0 };
      } catch { return { ...result, status: 'drift', exitCode: 4 }; }
    });
  } catch { return result; }
}
