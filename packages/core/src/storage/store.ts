import { z } from 'zod';
import { StoreIndex } from './index-cache.js';
import type { RebuildBudget } from './index-cache.js';
import type { UsageObservation } from '../domain/usage.js';
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs/promises';
import { AsyncLocalStorage } from 'node:async_hooks';
import { join, resolve } from 'node:path';
import { digestSchema, repositoryIdSchema } from '../domain/capabilities.js';
import type { ScanBatch, SourceDescriptor, Checkpoint } from '../domain/capabilities.js';
import { parsePublicRecord } from '../domain/ledger.js';
import type { ControlRecord, PublicRecord } from '../domain/ledger.js';
import type { RepositoryContext } from '../git/context.js';
import { recordHash } from '../ledger/canonical-json.js';
import { assertDirectory, atomicFile, hasCode, ioError, privateDirectory, readPrivateFile, StoreError, syncDirectory } from './atomic-file.js';
import { acquireLock } from './lock.js';
import type { ProcessNamespaceProbe } from './lock.js';
import { appendJournal, readJournal, validateEntry, validateAttributionAssociations } from './journal.js';
import type { AttributionMetadata } from '../collection/metadata.js';
import type { JournalEntry } from './journal.js';
import { readControls, writeControl } from './controls.js';
import { readAcknowledgements, appendAcknowledgements } from './acknowledgements.js';
import { latestCheckpoint, latestCheckpointCandidate, writeCheckpoint } from './checkpoints.js';
import type { CheckpointScope } from './checkpoints.js';

export { StoreError } from './atomic-file.js';
export type { JournalEntry } from './journal.js';
export type { CheckpointScope } from './checkpoints.js';
const transportStateSchema = z.object({ schemaVersion: z.literal(1), repositoryId: repositoryIdSchema,
  canonicalPushUrl: z.string().min(1).max(4096), dataRef: z.literal('refs/heads/agent-badge/data'),
  commit: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/).nullable() }).strict();
/** Private monotonic presence/accepted snapshot evidence; never a public artifact. */
export type TransportState = z.infer<typeof transportStateSchema>;
/** Read-only setup planning validates the same durable transport schema without opening a mutable store. */
export function parseTransportState(input: unknown): TransportState {
  const parsed = transportStateSchema.safeParse(input);
  if (!parsed.success) throw new StoreError('invalid-durable-data');
  return parsed.data;
}
const pendingConfigurationSchema = z.object({ schemaVersion: z.literal(1), metadataRevision: digestSchema }).strict();
/** Uncertain declaration repair evidence; compare actual declaration against current accepted metadata. */
export type PendingConfiguration = z.infer<typeof pendingConfigurationSchema>;
const reconciliationSchema = z.object({ schemaVersion: z.literal(1), pending: z.boolean(), automaticSourceOffset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).strict();
export interface LocalStore {
  /** Publish disposable queries after authority fsync, retaining any owning lease. */
  flushDerivedIndex(): Promise<void>;
  sourceJournal(source: SourceDescriptor): Promise<JournalEntry[]>;
  relatedJournal(observations: readonly UsageObservation[]): Promise<JournalEntry[]>;
  projectionSources(policyHash: string): Promise<SourceDescriptor[]>;
  controls(): Promise<ControlRecord[]>;
  commitControl(record: ControlRecord): Promise<void>;
  reconciliationPending(): Promise<boolean>;
  automaticSourceOffset(): Promise<number>;
  recordAutomaticSourceOffset(offset: number): Promise<void>;
  /** Only successful explicit full reconciliation may clear known skipped work. */
  recordReconciliationPending(pending: boolean): Promise<void>;
  pendingConfiguration(): Promise<PendingConfiguration | null>;
  recordPendingConfiguration(state: PendingConfiguration | null): Promise<void>;
  transportState(): Promise<TransportState | null>;
  /** null marks a seen ref before validation; it never clears an accepted commit or changes identity. */
  recordAcceptedLedger(state: TransportState): Promise<void>;
  /** Explicit setup's validated destination transition; caller owns the usage lease. */
  rebindAcceptedLedger(expected:TransportState,next:TransportState):Promise<void>;
  /** Optional attribution metadata is collector-owned private provenance, never provider or outbound data. */
  commitBatch(source: SourceDescriptor, batch: ScanBatch, records: readonly PublicRecord[], attribution?: AttributionMetadata): Promise<void>;
  pending(): Promise<PublicRecord[]>;
  pendingCount(): Promise<number>;
  pendingHashes():Promise<string[]>;
  pendingBatch(maxRecords:number,maxBytes:number):Promise<{records:PublicRecord[];deferredUnitCount:number}>;
  /** Caller attests these hashes were verified in the accepted remote snapshot. */
  acknowledge(hashes: readonly string[]): Promise<void>;
  withLock<T>(signal: AbortSignal, task: () => Promise<T>): Promise<T>;
  /** Untrusted latest durable candidate; adapter validates all reuse dimensions. No older fallback. */
  checkpointCandidate(source: SourceDescriptor): Promise<Checkpoint | null>;
  checkpoint(source: SourceDescriptor, scope: CheckpointScope): Promise<Checkpoint | null>;
  /** Private normalized metadata for reprojection; never send this result to Git. */
  journal(): Promise<JournalEntry[]>;
  invalidateCache(): Promise<void>;
}
export interface StoreOptions { readonly processNamespace?: ProcessNamespaceProbe; readonly supervisedLeaseToken?: string;readonly rebuildBudget?:RebuildBudget }
export interface StoreSnapshot {
  controls: ControlRecord[];
  entries: JournalEntry[];
  pending: PublicRecord[];
  transport: TransportState | null;
  pendingConfiguration: PendingConfiguration | null;
  reconciliationPending: boolean;
}
/** Validated, conservatively stale reporting view. No leases, chmod or repair. */
export async function readStoreSnapshot(ctx: RepositoryContext): Promise<StoreSnapshot> {
  if (resolve(ctx.privateDir) !== join(await fs.realpath(ctx.commonDir), 'agent-badge')) throw new StoreError('unsafe-store-path');
  const empty: StoreSnapshot = { controls: [], entries: [], pending: [], transport: null, pendingConfiguration: null, reconciliationPending: false };
  try { await assertDirectory(ctx.privateDir); } catch (error) { if (hasCode(error, 'ENOENT')) return empty; throw ioError(error); }
  async function data(name: string): Promise<unknown | null> {
    try { return JSON.parse(await readPrivateFile(join(ctx.privateDir, name), undefined, true)); }
    catch (error) { if (hasCode(error, 'ENOENT')) return null; throw ioError(error); }
  }
  const acknowledged = await readAcknowledgements(ctx.privateDir, true);
  let entries: JournalEntry[];
  try { entries = await readJournal(join(ctx.privateDir, 'journal'), true); } catch (error) { if (!hasCode(error, 'ENOENT')) throw error; entries = []; }
  const controls = await readControls(ctx.privateDir);
  const records = new Map<string, PublicRecord>(), hashes = new Set(acknowledged);
  for (const record of [...entries.flatMap(entry => entry.records), ...controls]) if (!hashes.has(recordHash(record))) records.set(recordHash(record), record);
  const transport = await data('transport.json'), configuration = await data('pending-configuration.json'), reconciliation = await data('reconciliation.json');
  for (const value of [transport, configuration, reconciliation]) if (value !== null && typeof value === 'object' && 'schemaVersion' in value && value.schemaVersion !== 1) throw new StoreError('unsupported-durable-schema');
  const pending = configuration === null ? null : pendingConfigurationSchema.safeParse(configuration);
  const reconciled = reconciliationSchema.safeParse(reconciliation ?? { schemaVersion: 1, pending: false, automaticSourceOffset: 0 });
  if ((pending && !pending.success) || !reconciled.success) throw new StoreError('invalid-durable-data');
  return { controls, entries, pending: [...records.values()], transport: transport === null ? null : parseTransportState(transport),
    pendingConfiguration: pending?.success ? pending.data : null, reconciliationPending: reconciled.data.pending };
}
export async function openStore(ctx: RepositoryContext, options: StoreOptions = {}): Promise<LocalStore> {
  try {
    const common = await fs.realpath(ctx.commonDir);
    if (resolve(ctx.privateDir) !== join(common, 'agent-badge')) throw new StoreError('unsafe-store-path');
    const root = ctx.privateDir;
    await privateDirectory(root);
    for (const name of ['journal', 'checkpoints', 'cache', 'locks']) await privateDirectory(join(root, name));
    // Make new directory entries durable before any observation/checkpoint is accepted.
    await syncDirectory(root); await syncDirectory(common);
    return new Store(root, options);
  } catch (error) { throw ioError(error); }
}
class Store implements LocalStore {
  private readonly held = new AsyncLocalStorage<{ active: boolean; tail: Promise<void> }>();
  private index: StoreIndex | undefined;
  private async indexed(): Promise<StoreIndex> { return this.index ??= await StoreIndex.open(this.root,this.options.rebuildBudget); }
  async flushDerivedIndex():Promise<void>{await this.operation(async()=>{const index=this.index;if(!index?.needsPublication)return;this.index=undefined;await index.close();});}
  constructor(private readonly root: string, private readonly options: StoreOptions) {}
  async withLock<T>(signal: AbortSignal, task: () => Promise<T>): Promise<T> {
    if (signal.aborted) throw new StoreError('store-busy');
    if (this.held.getStore()?.active) return task();
    try { await assertDirectory(this.root); } catch (error) { throw ioError(error); }
    const release = await acquireLock(join(this.root, 'locks'), signal, this.options.processNamespace, this.options.supervisedLeaseToken);
    const ownership = { active: true, tail: Promise.resolve() };
    try { return await this.held.run(ownership, task); }
    catch (error) { throw ioError(error); }
    finally {
      ownership.active = false;
      await ownership.tail; // Work already queued by this owner finishes before release.
      try { const index=this.index;this.index=undefined;await index?.close(); } finally { try { await release(); } catch (error) { throw ioError(error); } }
    }
  }
  private async operation<T>(task: () => Promise<T>): Promise<T> {
    return this.withLock(AbortSignal.timeout(2000), async () => {
      const ownership = this.held.getStore()!;
      const previous = ownership.tail;
      let next!: () => void;
      ownership.tail = new Promise<void>(resolve => { next = resolve; });
      await previous;
      try { await assertDirectory(this.root); return await task(); }
      finally { next(); }
    });
  }
  private async readReconciliation() {
    let value: unknown;
    try { value = JSON.parse(await readPrivateFile(join(this.root, 'reconciliation.json'), 4096)); }
    catch (error) { if (hasCode(error, 'ENOENT')) return { schemaVersion: 1 as const, pending: false, automaticSourceOffset: 0 }; throw new StoreError('invalid-durable-data'); }
    const parsed = reconciliationSchema.safeParse(value);
    if (!parsed.success) throw new StoreError('invalid-durable-data');
    return parsed.data;
  }
  async reconciliationPending(): Promise<boolean> { return this.operation(async () => (await this.readReconciliation()).pending); }
  async automaticSourceOffset(): Promise<number> { return this.operation(async () => (await this.readReconciliation()).automaticSourceOffset); }
  async recordReconciliationPending(pending: boolean): Promise<void> {
    if (typeof pending !== 'boolean') throw new StoreError('invalid-batch');
    await this.operation(async () => {const state=await this.readReconciliation();if(state.pending!==pending)await atomicFile(join(this.root,'reconciliation.json'),{...state,pending});});
  }
  async recordAutomaticSourceOffset(offset: number): Promise<void> {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new StoreError('invalid-batch');
    await this.operation(async () => {const state=await this.readReconciliation();if(state.automaticSourceOffset!==offset)await atomicFile(join(this.root,'reconciliation.json'),{...state,automaticSourceOffset:offset});});
  }
  async pendingConfiguration(): Promise<PendingConfiguration | null> {
    return this.operation(async () => {
      let value: unknown;
      try { value = JSON.parse(await readPrivateFile(join(this.root, 'pending-configuration.json'), 4096)); }
      catch (error) { if (hasCode(error, 'ENOENT')) return null; throw new StoreError('invalid-durable-data'); }
      if (value === null) return null;
      const parsed = pendingConfigurationSchema.safeParse(value);
      if (!parsed.success) throw new StoreError('invalid-durable-data');
      return parsed.data;
    });
  }
  async recordPendingConfiguration(value: PendingConfiguration | null): Promise<void> {
    const parsed = value === null ? null : pendingConfigurationSchema.safeParse(value);
    if (parsed && !parsed.success) throw new StoreError('invalid-batch');
    await this.operation(() => atomicFile(join(this.root, 'pending-configuration.json'), parsed?.success ? parsed.data : null));
  }
  private async readTransportState(): Promise<TransportState | null> {
    let data: unknown;
    try { data = JSON.parse(await readPrivateFile(join(this.root, 'transport.json'), 16384)); }
    catch (error) { if (hasCode(error, 'ENOENT')) return null; throw new StoreError('invalid-durable-data'); }
    return parseTransportState(data);
  }
  async transportState(): Promise<TransportState | null> {
    return this.operation(() => this.readTransportState());
  }
  async recordAcceptedLedger(input: TransportState): Promise<void> {
    const parsed = transportStateSchema.safeParse(input);
    if (!parsed.success) throw new StoreError('invalid-batch');
    // Read/check/merge/write share one queue slot, including reentrant lock owners.
    await this.operation(async () => {
      const prior = await this.readTransportState(), state = parsed.data;
      if (prior && (prior.repositoryId !== state.repositoryId || prior.canonicalPushUrl !== state.canonicalPushUrl || prior.dataRef !== state.dataRef))
        throw new StoreError('invalid-batch');
      await atomicFile(join(this.root, 'transport.json'), { ...state, commit: state.commit ?? prior?.commit ?? null });
    });
  }
  async rebindAcceptedLedger(expected:TransportState,next:TransportState):Promise<void>{
    expected=parseTransportState(expected);next=parseTransportState(next);
    if(!expected.commit||!next.commit||expected.repositoryId!==next.repositoryId||expected.dataRef!==next.dataRef||expected.canonicalPushUrl===next.canonicalPushUrl)throw new StoreError('invalid-batch');
    await this.operation(async()=>{if(!isDeepStrictEqual(await this.readTransportState(),expected))throw new StoreError('invalid-batch');await atomicFile(join(this.root,'transport.json'),next);});
  }
  async sourceJournal(source: SourceDescriptor): Promise<JournalEntry[]> { return this.operation(async () => (await this.indexed()).source(source)); }
  async relatedJournal(observations: readonly UsageObservation[]): Promise<JournalEntry[]> { return this.operation(async () => (await this.indexed()).related(observations)); }
  async projectionSources(policyHash: string): Promise<SourceDescriptor[]> { return this.operation(async () => (await this.indexed()).dirtySources(policyHash)); }
  async controls(): Promise<ControlRecord[]> { return this.operation(async () => (await this.indexed()).controls()); }
  async commitControl(record: ControlRecord): Promise<void> { return this.operation(async () => {const index=await this.indexed();await writeControl(this.root, record);index.addControl(record);}); }
  async journal(): Promise<JournalEntry[]> { return this.operation(async () => (await this.indexed()).journal()); }
  async checkpointCandidate(source: SourceDescriptor): Promise<Checkpoint | null> {
    return this.operation(async () => latestCheckpointCandidate((await this.indexed()).source(source), source));
  }
  async checkpoint(source: SourceDescriptor, scope: CheckpointScope): Promise<Checkpoint | null> {
    return this.operation(async () => latestCheckpoint((await this.indexed()).source(source), source, scope));
  }
  async commitBatch(source: SourceDescriptor, batch: ScanBatch, records: readonly PublicRecord[], attribution?: AttributionMetadata): Promise<void> {
    // Snapshot and validate the entire boundary before acquiring or writing a journal.
    let entry: JournalEntry;
    try {
      if (!isDeepStrictEqual(source, batch.source)) throw new StoreError('invalid-batch');
      entry = validateEntry({ schemaVersion: 1, sequence: 1, source, checkpoint: batch.nextCheckpoint,
        observations: batch.observations, records: records.map(parsePublicRecord), outcome: batch.outcome, diagnostics: batch.diagnostics,
        ...(attribution === undefined ? {} : { attribution }) });
    } catch { throw new StoreError('invalid-batch'); }
    await this.operation(async () => {
      const index = await this.indexed(), entries = index.source(source);
      try { validateAttributionAssociations(entry, entries); } catch { throw new StoreError('invalid-batch'); }
      // The index generation validates every durable acknowledgement before use.
      if (entry.outcome !== 'unavailable' && entry.outcome !== 'unsupported') {
        const sameSource = entries.filter(previous => previous.source.provider === entry.source.provider &&
          previous.source.instanceKey === entry.source.instanceKey && previous.source.sourceIdentity === entry.source.sourceIdentity &&
          previous.outcome !== 'unavailable' && previous.outcome !== 'unsupported');
        const latest = sameSource.at(-1);
        if (latest && latest.source.generation !== entry.source.generation &&
          sameSource.some(previous => previous.source.generation === entry.source.generation)) throw new StoreError('invalid-batch');
        const previous = latestCheckpoint(entries, entry.source, entry.checkpoint);
        if (previous && entry.checkpoint.cursor.offset < previous.cursor.offset) throw new StoreError('invalid-batch');
      }
      entry.sequence = index.count() + 1;
      await appendJournal(join(this.root, 'journal'), entry);
      index.addEntry(entry);
      // The checkpoint is a derived acceleration hint. Reads recover from the journal,
      // including when this atomic write fails or a process dies immediately before it.
      await writeCheckpoint(join(this.root, 'checkpoints'), entry);
    });
  }
  async pending(): Promise<PublicRecord[]> { return this.operation(async () => (await this.indexed()).pending()); }
  async pendingCount():Promise<number>{return this.operation(async()=>(await this.indexed()).pendingCount());}
  async pendingHashes():Promise<string[]>{return this.operation(async()=>(await this.indexed()).pendingHashes());}
  async pendingBatch(maxRecords:number,maxBytes:number){return this.operation(async()=>(await this.indexed()).pendingBatch(maxRecords,maxBytes));}
  async acknowledge(hashes: readonly string[]): Promise<void> {
    const validated = hashes.map(hash => { if (!digestSchema.safeParse(hash).success) throw new StoreError('invalid-batch'); return hash; });
    await this.operation(async () => {
      const index = await this.indexed(), confirmed = validated.filter(hash => index.known(hash) && !index.acknowledged(hash));
      await appendAcknowledgements(this.root, confirmed);
      if (confirmed.length) index.addAcknowledgements(confirmed);
    });
  }
  async invalidateCache(): Promise<void> {
    await this.operation(async () => {
      const index=this.index;this.index=undefined;await index?.close();
      const directory = join(this.root, 'cache'); await assertDirectory(directory);
      for (const name of await fs.readdir(directory)) await fs.rm(join(directory, name), { recursive: true, force: true });
    });
  }
}
