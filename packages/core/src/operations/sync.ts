import { ProtocolError } from "../domain/capabilities.js";
import type { LedgerMeta } from "../domain/ledger.js";
import { parseLedgerMeta } from "../domain/ledger.js";
import { collectUsage } from "../collection/collect.js";
import type {
  CollectOptions,
  CollectionResult,
} from "../collection/collect.js";
import { DataTransport, TransportError } from "../git/data-transport.js";
import type { AcceptedLedger } from "../git/data-transport.js";
import type { RepositoryContext } from "../git/context.js";
import type { RemoteBinding } from "../git/remote-binding.js";
import { recordHash } from "../ledger/canonical-json.js";
import { reduceLedger } from "../ledger/reduce.js";
import { renderArtifacts } from "../render/summary.js";
import type { PriceCatalog } from "../pricing/catalog.js";
import type { LocalStore, TransportState } from "../storage/store.js";

export interface SyncOptions {
  repository: RepositoryContext;
  binding: RemoteBinding;
  store: LocalStore;
  collect: "none" | "incremental";
  collection?: Omit<
    CollectOptions,
    "repository" | "store" | "policy" | "signal"
  >;
  /** Explicit first initialization only; never overrides an existing accepted remote policy/catalog. */
  initialize?: { meta: LedgerMeta; catalog: PriceCatalog };
  signal: AbortSignal;
  /** Absolute wall-clock milliseconds. Parent supervisor owns hard CPU enforcement. */
  deadline: number;
  maxRetries?: number;
}
export interface SyncResult {
  status: "synced" | "unchanged" | "queued" | "conflict" | "unsupported";
  confirmedCommit: string | null;
  acknowledgedHashes: string[];
  /** Only validated fetched state; later explicit controls/configure must use its causal heads. */
  accepted: AcceptedLedger | null;
  collection: CollectionResult | null;
}
/** Immutable union; accepted data-branch metadata is authoritative on every retry. */
export async function syncUsage(options: SyncOptions): Promise<SyncResult> {
  const result: SyncResult = {
    status: "queued",
    confirmedCommit: null,
    acknowledgedHashes: [],
    accepted: null,
    collection: null,
  };
  const retries = options.maxRetries ?? 3;
  if (
    !Number.isFinite(options.deadline) ||
    options.deadline <= Date.now() ||
    options.signal.aborted ||
    !Number.isInteger(retries) ||
    retries < 0 ||
    retries > 3
  )
    return result;
  if (options.binding.status !== "bound")
    return { ...result, status: "conflict" };
  const binding = options.binding;
  const timer = AbortSignal.timeout(
    Math.min(2 ** 32 - 1, Math.max(1, Math.ceil(options.deadline - Date.now())))
  );
  const signal = AbortSignal.any([options.signal, timer]);
  const fail = (error: unknown): SyncResult => {
    if (signal.aborted || Date.now() >= options.deadline)
      return { ...result, status: "queued" };
    if (error instanceof ProtocolError)
      result.status =
        error.message === "repository-mismatch" ? "conflict" : "unsupported";
    else if (error instanceof TransportError && error.reason !== "unavailable")
      result.status = "conflict";
    return result;
  };
  let transport: DataTransport | undefined;
  try {
    return await options.store.withLock(signal, async () => {
      try {
        const identity = {
          schemaVersion: 1 as const,
          repositoryId: binding.repositoryId,
          canonicalPushUrl: binding.canonicalPushUrl,
          dataRef: binding.dataRef,
        };
        let prior = await options.store.transportState();
        if (
          prior &&
          (prior.repositoryId !== identity.repositoryId ||
            prior.canonicalPushUrl !== identity.canonicalPushUrl ||
            prior.dataRef !== identity.dataRef)
        )
          return { ...result, status: "conflict" };
        transport = await DataTransport.open({
          repository: options.repository,
          binding,
          signal,
          deadline: options.deadline,
        });
        async function accept(): Promise<AcceptedLedger | null> {
          const tip = await transport!.remoteTip();
          if (!tip) {
            if (prior || binding.ledgerEvidence)
              throw new TransportError("history-rewritten");
            return null;
          }
          // Even malformed/foreign existing refs cannot later be mistaken for first initialization.
          await options.store.recordAcceptedLedger({
            ...identity,
            commit: null,
          });
          const accepted = await transport!.fetch();
          if (accepted.meta.repositoryId !== binding.repositoryId)
            throw new ProtocolError("repository-mismatch");
          if (prior?.commit)
            await transport!.assertDescendant(
              accepted.commit,
              prior.commit,
              accepted.artifacts
            );
          await transport!.anchor(accepted.commit);
          const state: TransportState = {
            ...identity,
            commit: accepted.commit,
          };
          await options.store.recordAcceptedLedger(state);
          prior = state;
          result.accepted = accepted;
          result.confirmedCommit = accepted.commit;
          return accepted;
        }
        let accepted = await accept();
        let meta: LedgerMeta, catalog: PriceCatalog;
        if (accepted) {
          meta = accepted.meta;
          catalog = accepted.catalog;
        } else {
          if (!options.initialize) return result;
          meta = parseLedgerMeta(options.initialize.meta);
          catalog = options.initialize.catalog;
          if (meta.repositoryId !== binding.repositoryId)
            throw new ProtocolError("repository-mismatch");
          // Validate all bootstrap metadata/catalog coherence before discovery or outbound records.
          renderArtifacts(reduceLedger([], meta), meta, catalog);
        }
        if (options.collect !== "none")
          result.collection = await collectUsage({
            ...options.collection,
            repository: options.repository,
            store: options.store,
            policy: meta.policy,
            signal,
          });
        signal.throwIfAborted();
        const pending = await options.store.pending();
        const hashes = pending.map(recordHash).sort();
        const confirmed = async (
          snapshot: AcceptedLedger,
          wrote: boolean
        ): Promise<SyncResult | null> => {
          const included = new Set(snapshot.ledger.recordHashes);
          if (!hashes.every((hash) => included.has(hash))) return null;
          signal.throwIfAborted();
          await options.store.acknowledge(hashes);
          return {
            ...result,
            status: wrote ? "synced" : "unchanged",
            confirmedCommit: snapshot.commit,
            accepted: snapshot,
            acknowledgedHashes: hashes,
          };
        };
        if (accepted) {
          const done = await confirmed(accepted, false);
          if (done) return done;
        }
        for (let attempt = 0; attempt <= retries; attempt++) {
          signal.throwIfAborted();
          // No stale tracked/local configuration can replace accepted remote metadata on a race.
          if (accepted) {
            meta = accepted.meta;
            catalog = accepted.catalog;
          }
          const ledger = reduceLedger(
            [...(accepted?.records ?? []), ...pending],
            meta
          );
          const artifacts = renderArtifacts(ledger, meta, catalog);
          const commit = await transport!.commit(
            artifacts,
            accepted?.commit ?? null
          );
          // Persist attempted first creation before send: an indeterminate outcome cannot permit reseeding.
          if (!prior) {
            prior = { ...identity, commit: null };
            await options.store.recordAcceptedLedger(prior);
          }
          await transport!.push(commit, accepted?.commit ?? null);
          accepted = await accept();
          if (!accepted) throw new TransportError("unavailable");
          const done = await confirmed(accepted, true);
          if (done) return done;
        }
        return result;
      } catch (error) {
        return fail(error);
      }
    });
  } catch (error) {
    return fail(error);
  } finally {
    await transport?.close().catch(() => {});
  }
}
