import type { RepositoryContext } from '../git/context.js';
import { readLedgerCommit } from '../git/data-transport.js';
import type { AcceptedLedger } from '../git/data-transport.js';
import { runGit } from '../git/process.js';
import { readStoreSnapshot, StoreError } from '../storage/store.js';
import type { StoreSnapshot } from '../storage/store.js';
import { observationEvidenceHash } from '../collection/metadata.js';
import type { CapabilityReport } from '../providers/capability-report.js';
import type { IntegrationInspection } from './integration-port.js';
import { reduceLedger } from '../ledger/reduce.js';
import type { ReducedLedger } from '../ledger/reduce.js';
import { catalogHash, contentHash, defaultCatalog } from '../pricing/catalog.js';
import { renderArtifacts } from '../render/summary.js';
import { ProtocolError } from '../domain/capabilities.js';

export type StatusState = 'recorded' | 'pending' | 'synced' | 'partial' | 'conflicted' | 'unavailable' | 'unsupported';
export interface StatusReport {
  schemaVersion: 1;
  failure: 'unsupported-data' | 'repository-mismatch' | 'local-data-unavailable' | null;
  state: StatusState;
  states: StatusState[];
  exitCode: 0 | 1 | 2 | 3 | 4;
  setup: IntegrationInspection['setup'];
  configuration: 'current' | 'drift' | 'uncertain' | 'absent' | 'not-inspected';
  queuedRecords: number;
  lastConfirmedSync: string | null;
  metadataRevision: string | null;
  pendingReconciliation: boolean;
  totals: Pick<ReducedLedger, 'recordedUnits' | 'includedUnits' | 'excludedUnits' | 'conflictingUnits' | 'partialUnits' | 'knownTokens' | 'unknownTokenUnits' | 'repositoryCompleteness'> | null;
  valuation: { kind: 'current-catalog-estimate'; catalogAuthority: 'accepted' | 'bootstrap'; catalogVersion: number; catalogSnapshotDate: string; price: unknown } | null;
  localUnits: { localId: string; provider: string }[];
  capabilities?: CapabilityReport;
  providers: { provider: string; outcome: string; diagnostics: string[] }[];
}
export async function loadLocalAccepted(ctx: RepositoryContext, snapshot: StoreSnapshot, signal: AbortSignal, deadline: number): Promise<AcceptedLedger | null> {
  const commit = snapshot.transport?.commit;
  if (!commit) return null;
  const anchor = await runGit(['--no-replace-objects', 'rev-parse', '--verify', `refs/agent-badge/accepted/${commit}`], { cwd: ctx.worktreeRoot, signal, timeoutMs: Math.max(1, deadline - Date.now()) });
  if (anchor.status !== 'ok' || anchor.stdout.trim() !== commit) throw new StoreError('invalid-durable-data');
  const accepted = await readLedgerCommit(ctx, commit, { signal, deadline });
  if (accepted.meta.repositoryId !== snapshot.transport!.repositoryId) throw new ProtocolError('repository-mismatch');
  return accepted;
}
/** Local accounting only: no discovery, network, installation, lease or repair. */
export async function getStatus(ctx: RepositoryContext, options: { inspection?: IntegrationInspection; capabilities?: CapabilityReport; signal?: AbortSignal; deadline?: number } = {}): Promise<StatusReport> {
  const inspection = options.inspection, routeConflict = inspection?.checks.some(check => check.code === 'remote-route' && check.status === 'fail');
  let report: StatusReport = { schemaVersion: 1, failure: null, state: routeConflict ? 'conflicted' : 'unavailable', states: [], exitCode: routeConflict ? 2 : 1, setup: inspection?.setup ?? 'not-inspected',
    configuration: inspection ? inspection.policy ? 'current' : 'absent' : 'not-inspected', queuedRecords: 0, lastConfirmedSync: null, metadataRevision: null,
    pendingReconciliation: false, totals: null, valuation: null, providers: [], localUnits: [], ...(options.capabilities ? { capabilities: options.capabilities } : {}) };
  try {
    const snapshot = await readStoreSnapshot(ctx), deadline = options.deadline ?? Date.now() + 10000;
    const accepted = await loadLocalAccepted(ctx, snapshot, options.signal ?? AbortSignal.timeout(10000), deadline);
    report.localUnits = [...new Map(snapshot.entries.flatMap(entry => entry.observations).map(observation => [observationEvidenceHash(observation), { localId: observationEvidenceHash(observation), provider: observation.provider }])).values()];
    report.queuedRecords = snapshot.pending.length;
    report.lastConfirmedSync = accepted?.commit ?? null;
    report.metadataRevision = accepted ? contentHash(accepted.meta) : null;
    report.pendingReconciliation = snapshot.reconciliationPending;
    if (accepted && inspection?.repositoryId && accepted.meta.repositoryId !== inspection.repositoryId) throw new ProtocolError('repository-mismatch');
    if (accepted && inspection?.policy && contentHash(accepted.meta.policy) !== contentHash(inspection.policy)) report.configuration = 'drift';
    else if (snapshot.pendingConfiguration) report.configuration = 'uncertain';
    const latest = new Map<string, (typeof snapshot.entries)[number]>();
    for (const entry of snapshot.entries) latest.set(JSON.stringify([entry.source.provider, entry.source.instanceKey, entry.source.sourceIdentity]), entry);
    report.providers = [...latest.values()].map(entry => ({ provider: entry.source.provider, outcome: entry.outcome, diagnostics: entry.diagnostics.map(d => d.code) }));
    const repositoryId = accepted?.meta.repositoryId ?? inspection?.repositoryId ?? snapshot.entries[0]?.checkpoint.repositoryId;
    const localPolicy = inspection?.policy ?? (repositoryId ? { schemaVersion: 1 as const, repositoryId, normalizationVersion: 1 as const, discovery: 'auto' as const, disabledProviders: [], badge: { label: 'AI usage', metric: 'tokens' as const } } : null);
    const fallback = repositoryId && localPolicy ? { schemaVersion: 2 as const, protocolVersion: 1 as const, repositoryId, normalizationVersion: 1 as const,
      catalogVersion: defaultCatalog.version, catalogHash: catalogHash(defaultCatalog), policy: localPolicy } : null;
    const meta = accepted?.meta ?? fallback;
    if (!meta) return report;
    const ledger = reduceLedger([...(accepted?.records ?? []), ...snapshot.entries.flatMap(entry => entry.records), ...snapshot.controls], meta);
    const { recordedUnits, includedUnits, excludedUnits, conflictingUnits, partialUnits, knownTokens, unknownTokenUnits, repositoryCompleteness } = ledger;
    report.totals = { recordedUnits, includedUnits, excludedUnits, conflictingUnits, partialUnits, knownTokens, unknownTokenUnits, repositoryCompleteness };
    const catalog = accepted?.catalog ?? defaultCatalog;
    const summary = JSON.parse(Buffer.from(renderArtifacts(ledger, meta, catalog).get('summary.json')!).toString('utf8'));
    report.valuation = { kind: 'current-catalog-estimate', catalogAuthority: accepted ? 'accepted' : 'bootstrap', catalogVersion: catalog.version, catalogSnapshotDate: catalog.snapshotDate, price: summary.price };
    if (recordedUnits) report.states.push('recorded');
    if (snapshot.pending.length) report.states.push('pending');
    else if (accepted) report.states.push('synced');
    if (snapshot.reconciliationPending || partialUnits || report.providers.some(p => p.outcome !== 'complete')) report.states.push('partial');
    if (conflictingUnits) report.states.push('conflicted');
    report.state = conflictingUnits || routeConflict ? 'conflicted' : report.states.includes('partial') ? 'partial' : snapshot.pending.length ? 'pending' : accepted ? 'synced' : 'recorded';
    report.exitCode = conflictingUnits || routeConflict ? 2 : report.configuration === 'drift' ? 4 : inspection?.setup !== 'approved' ? 1 : 0;
    return report;
  } catch (error) {
    const unsupported = error instanceof ProtocolError && error.message !== 'repository-mismatch' || error instanceof StoreError && error.code === 'unsupported-durable-schema';
    return { ...report, failure: unsupported ? 'unsupported-data' : error instanceof ProtocolError && error.message === 'repository-mismatch' ? 'repository-mismatch' : 'local-data-unavailable', state: unsupported ? 'unsupported' : error instanceof ProtocolError && error.message === 'repository-mismatch' ? 'conflicted' : 'unavailable', exitCode: unsupported ? 3 : error instanceof ProtocolError ? 2 : 1 };
  }
}
