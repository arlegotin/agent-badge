import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs/promises';
import { AsyncLocalStorage } from 'node:async_hooks';
import { join, resolve } from 'node:path';
import { digestSchema } from '../domain/capabilities.js';
import type { ScanBatch, SourceDescriptor, Checkpoint } from '../domain/capabilities.js';
import { parsePublicRecord } from '../domain/ledger.js';
import type { PublicRecord } from '../domain/ledger.js';
import type { RepositoryContext } from '../git/context.js';
import { recordHash } from '../ledger/canonical-json.js';
import { assertDirectory, atomicFile, hasCode, ioError, privateDirectory, readPrivateFile, StoreError, syncDirectory } from './atomic-file.js';
import { acquireLock } from './lock.js';
import type { ProcessNamespaceProbe } from './lock.js';
import { appendJournal, readJournal, validateEntry } from './journal.js';
import type { JournalEntry } from './journal.js';
import { latestCheckpoint, latestCheckpointCandidate, writeCheckpoint } from './checkpoints.js';
import type { CheckpointScope } from './checkpoints.js';

export { StoreError } from './atomic-file.js';
export type { JournalEntry } from './journal.js';
export type { CheckpointScope } from './checkpoints.js';
export interface LocalStore {
  commitBatch(source: SourceDescriptor, batch: ScanBatch, records: readonly PublicRecord[]): Promise<void>;
  pending(): Promise<PublicRecord[]>;
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
export interface StoreOptions { readonly processNamespace?: ProcessNamespaceProbe }
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
  constructor(private readonly root: string, private readonly options: StoreOptions) {}
  async withLock<T>(signal: AbortSignal, task: () => Promise<T>): Promise<T> {
    if (signal.aborted) throw new StoreError('store-busy');
    if (this.held.getStore()?.active) return task();
    try { await assertDirectory(this.root); } catch (error) { throw ioError(error); }
    const release = await acquireLock(join(this.root, 'locks'), signal, this.options.processNamespace);
    const ownership = { active: true, tail: Promise.resolve() };
    try { return await this.held.run(ownership, task); }
    catch (error) { throw ioError(error); }
    finally {
      ownership.active = false;
      await ownership.tail; // Work already queued by this owner finishes before release.
      try { await release(); } catch (error) { throw ioError(error); }
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
  async journal(): Promise<JournalEntry[]> { return this.operation(() => readJournal(join(this.root, 'journal'))); }
  async checkpointCandidate(source: SourceDescriptor): Promise<Checkpoint | null> {
    return this.operation(async () => latestCheckpointCandidate(await readJournal(join(this.root, 'journal')), source));
  }
  async checkpoint(source: SourceDescriptor, scope: CheckpointScope): Promise<Checkpoint | null> {
    return this.operation(async () => latestCheckpoint(await readJournal(join(this.root, 'journal')), source, scope));
  }
  async commitBatch(source: SourceDescriptor, batch: ScanBatch, records: readonly PublicRecord[]): Promise<void> {
    // Snapshot and validate the entire boundary before acquiring or writing a journal.
    let entry: JournalEntry;
    try {
      if (!isDeepStrictEqual(source, batch.source)) throw new StoreError('invalid-batch');
      entry = validateEntry({ schemaVersion: 1, sequence: 1, source, checkpoint: batch.nextCheckpoint,
        observations: batch.observations, records: records.map(parsePublicRecord), outcome: batch.outcome, diagnostics: batch.diagnostics });
    } catch { throw new StoreError('invalid-batch'); }
    await this.operation(async () => {
      const entries = await readJournal(join(this.root, 'journal'));
      await this.acknowledgements(); // Refuse to mix this writer with a future durable schema.
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
      entry.sequence = entries.length + 1;
      await appendJournal(join(this.root, 'journal'), entry);
      // The checkpoint is a derived acceleration hint. Reads recover from the journal,
      // including when this atomic write fails or a process dies immediately before it.
      await writeCheckpoint(join(this.root, 'checkpoints'), entry);
    });
  }
  private async acknowledgements(): Promise<string[]> {
    let data;
    try { data = JSON.parse(await readPrivateFile(join(this.root, 'acknowledged.json'))); }
    catch (error) { if (hasCode(error, 'ENOENT')) return []; if (error instanceof SyntaxError) throw new StoreError('invalid-durable-data'); throw error; }
    if (data?.schemaVersion !== 1) throw new StoreError('unsupported-durable-schema');
    if (!data || Object.keys(data).sort().join(',') !== 'hashes,schemaVersion' || !Array.isArray(data.hashes) || data.hashes.some((hash: unknown) => !digestSchema.safeParse(hash).success))
      throw new StoreError('invalid-durable-data');
    return data.hashes;
  }
  async pending(): Promise<PublicRecord[]> {
    return this.operation(async () => {
      const acknowledged = new Set(await this.acknowledgements());
      const records = new Map<string, PublicRecord>();
      for (const entry of await readJournal(join(this.root, 'journal'))) for (const record of entry.records) {
        const hash = recordHash(record); if (!acknowledged.has(hash)) records.set(hash, record);
      }
      return [...records].sort(([a], [b]) => a.localeCompare(b)).map(([, record]) => record);
    });
  }
  async acknowledge(hashes: readonly string[]): Promise<void> {
    const validated = hashes.map(hash => { if (!digestSchema.safeParse(hash).success) throw new StoreError('invalid-batch'); return hash; });
    await this.operation(async () => {
      const known = new Set((await readJournal(join(this.root, 'journal'))).flatMap(entry => entry.records.map(recordHash)));
      const acknowledged = new Set(await this.acknowledgements());
      for (const hash of validated) if (known.has(hash)) acknowledged.add(hash);
      await atomicFile(join(this.root, 'acknowledged.json'), { schemaVersion: 1, hashes: [...acknowledged].sort() });
    });
  }
  async invalidateCache(): Promise<void> {
    await this.operation(async () => {
      const directory = join(this.root, 'cache'); await assertDirectory(directory);
      for (const name of await fs.readdir(directory)) await fs.rm(join(directory, name), { recursive: true, force: true });
    });
  }
}
