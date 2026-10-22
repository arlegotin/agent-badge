import { createHash } from 'node:crypto';
import { z } from 'zod';
import { digestSchema, repositoryIdSchema, parseProtocol, ProtocolError } from '../domain/capabilities.js';
import { parseLedgerMeta, parsePublicRecord, publicRecordSchema, validateEnvelope, ENVELOPE_MAX_BYTES } from '../domain/ledger.js';
import type { LedgerMeta, PublicRecord } from '../domain/ledger.js';
import { canonicalJson, recordHash } from '../ledger/canonical-json.js';
import { resolveControls } from '../ledger/controls.js';
import { reduceLedger } from '../ledger/reduce.js';
import { synchronizeTransaction } from './sync.js';
import type { SyncOptions, SyncResult } from './sync.js';

const schema = z.object({ kind: z.literal('agent-badge/contribution'), schemaVersion: z.literal(1),
  protocolVersion: z.literal(1), normalizationVersion: z.literal(1), repositoryId: repositoryIdSchema,
  records: z.array(z.object({ hash: digestSchema, record: publicRecordSchema }).strict()).max(10000) }).strict();
export type ContributionEnvelope = z.infer<typeof schema>;
export interface ContributionOptions { meta: LedgerMeta; records: readonly PublicRecord[]; selectedHashes?: readonly string[] }
export type ImportOptions = Omit<SyncOptions, 'collect' | 'collection' | 'initialize'>;
export interface ImportResult extends SyncResult {
  /** Imported records are retried from the caller-owned envelope, never fake private source metadata. */
  retrySource: 'contribution-envelope';
  retryRequired: boolean;
}

/** Strict public-only boundary. Private normalized-source imports never enter this protocol. */
export function parseContribution(input: unknown): ContributionEnvelope {
  try {
    if (typeof input === 'string' || input instanceof Uint8Array) {
      const bytes = typeof input === 'string' ? Buffer.from(input) : input;
      validateEnvelope(bytes.byteLength, 0);
      input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    }
    const serialized = JSON.stringify(input);
    if (typeof serialized !== 'string') throw new ProtocolError('invalid-record');
    validateEnvelope(Buffer.byteLength(serialized), 0);
    const envelope = parseProtocol(schema, input);
    validateEnvelope(Buffer.byteLength(serialized), envelope.records.length);
    const records = new Map<string, PublicRecord>();
    for (const entry of envelope.records) {
      const record = parsePublicRecord(entry.record);
      if (record.repositoryId !== envelope.repositoryId || record.normalizationVersion !== envelope.normalizationVersion) throw new ProtocolError('repository-mismatch');
      if (recordHash(record) !== entry.hash || records.has(entry.hash)) throw new ProtocolError('invalid-record');
      records.set(entry.hash, record);
    }
    resolveControls(records); // Self-contained closure, even before the current accepted ledger is fetched.
    return { ...envelope, records: [...records].sort(([a], [b]) => a.localeCompare(b)).map(([hash, record]) => ({ hash, record })) };
  } catch (error) { if (error instanceof ProtocolError) throw error; throw new ProtocolError('invalid-record'); }
}
/** Export selected units with all current controls and their transitive causal/correction evidence. */
export function exportContribution(options: ContributionOptions): ContributionEnvelope {
  const meta = parseLedgerMeta(options.meta);
  const ledger = reduceLedger(options.records, meta);
  const all = new Map(ledger.records.map(record => [recordHash(record), record]));
  const selected = new Set(options.selectedHashes ?? all.keys());
  const units = new Set<string>();
  for (const hash of selected) {
    const record = all.get(hash); if (!record) throw new ProtocolError('invalid-record');
    units.add('kind' in record ? record.targetUnitKey : record.unitKey);
  }
  for (const [hash, record] of all) if ('kind' in record && units.has(record.targetUnitKey)) selected.add(hash);
  const queue = [...selected];
  while (queue.length) {
    const record = all.get(queue.pop()!)!;
    const dependencies = [...record.supersedes, ...('kind' in record && record.kind === 'correct' ? [...record.replacedObservationHashes, ...record.replacementObservationHashes] : [])];
    for (const hash of dependencies) { if (!all.has(hash)) throw new ProtocolError('invalid-record'); if (!selected.has(hash)) { selected.add(hash); queue.push(hash); } }
  }
  return parseContribution({ kind: 'agent-badge/contribution', schemaVersion: 1, protocolVersion: 1,
    normalizationVersion: meta.normalizationVersion, repositoryId: meta.repositoryId,
    records: [...selected].sort().map(hash => ({ hash, record: all.get(hash)! })) });
}
/** Canonical envelope framing; record bytes use the same canonical form as the ledger. */
export function contributionBytes(input: ContributionEnvelope): string {
  const e = parseContribution(input);
  const bytes = `{"kind":"agent-badge/contribution","normalizationVersion":1,"protocolVersion":1,"records":[${e.records.map(({hash,record}) => `{"hash":${JSON.stringify(hash)},"record":${canonicalJson(record)}}`).join(',')}],"repositoryId":${JSON.stringify(e.repositoryId)},"schemaVersion":1}`;
  if (Buffer.byteLength(bytes) > ENVELOPE_MAX_BYTES) throw new ProtocolError('envelope-too-large');
  return bytes;
}
export function contributionPath(envelope: ContributionEnvelope): string {
  return `.agent-badge/contributions/${createHash('sha256').update(contributionBytes(envelope)).digest('hex')}.json`;
}
/** Validated snapshot is passed into the shared atomic union/reduction/render/FF transport transaction. */
export async function importContribution(input: unknown, options: ImportOptions): Promise<ImportResult> {
  const envelope = parseContribution(input);
  if (options.binding.status !== 'bound' || envelope.repositoryId !== options.binding.repositoryId) throw new ProtocolError('repository-mismatch');
  const result = await synchronizeTransaction({ ...options, collect: 'none' }, undefined, envelope.records.map(entry => entry.record));
  return { ...result, retrySource: 'contribution-envelope', retryRequired: result.status !== 'synced' && result.status !== 'unchanged' };
}
