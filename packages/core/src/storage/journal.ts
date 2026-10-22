import fs from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { checkpointSchema, diagnosticSchema, scanOutcomeSchema, sourceDescriptorSchema } from '../domain/capabilities.js';
import { parsePublicRecord, publicRecordSchema } from '../domain/ledger.js';
import { hasOnlyUnknownAmounts, usageObservationSchema } from '../domain/usage.js';
import { CLAUDE_SOURCE_SCHEMA } from '../providers/claude/reader.js';
import { attributionMetadataSchema, observationEvidenceHash } from '../collection/metadata.js';
import { atomicFile, assertDirectory, readPrivateFile, StoreError } from './atomic-file.js';

const entrySchema = z.object({ schemaVersion: z.literal(1), sequence: z.number().safe().positive(),
  source: sourceDescriptorSchema, checkpoint: checkpointSchema,
  observations: z.array(usageObservationSchema).max(10_000), records: z.array(publicRecordSchema).max(10_000),
  outcome: scanOutcomeSchema, diagnostics: z.array(diagnosticSchema).max(1024), attribution: attributionMetadataSchema.optional() }).strict();
export type JournalEntry = z.infer<typeof entrySchema>;
export function validateEntry(value: unknown): JournalEntry {
  if (value && typeof value === 'object' && 'schemaVersion' in value && value.schemaVersion !== 1)
    throw new StoreError('unsupported-durable-schema');
  const parsed = entrySchema.safeParse(value);
  if (!parsed.success) throw new StoreError('invalid-durable-data');
  const entry = parsed.data; const { source, checkpoint } = entry;
  // Validate the native source contract independently of optional private evidence
  // and independently supplied public records, on both commit and durable replay.
  if (source.provider === 'claude' && source.schema === CLAUDE_SOURCE_SCHEMA &&
    (entry.observations.some(observation => !observation.meters.every(hasOnlyUnknownAmounts)) ||
      entry.records.some(record => 'meters' in record && !record.meters.every(hasOnlyUnknownAmounts))))
    throw new StoreError('invalid-durable-data');
  try { entry.records.forEach(parsePublicRecord); } catch { throw new StoreError('invalid-durable-data'); }
  if (entry.attribution && entry.attribution.policyHash !== checkpoint.attributionPolicyHash) throw new StoreError('invalid-durable-data');
  if (checkpoint.provider !== source.provider || checkpoint.instanceKey !== source.instanceKey ||
    checkpoint.sourceIdentity !== source.sourceIdentity || checkpoint.sourceGeneration !== source.generation ||
    checkpoint.sourceSchema !== source.schema || checkpoint.readerVersion !== source.readerVersion ||
    entry.records.some(record => record.repositoryId !== checkpoint.repositoryId || record.normalizationVersion !== checkpoint.normalizationVersion ||
      ('provider' in record && record.provider !== source.provider)) ||
    entry.observations.some(observation => observation.provider !== source.provider ||
      observation.source.instanceKey !== source.instanceKey || observation.source.sourceIdentity !== source.sourceIdentity ||
      observation.source.generation !== source.generation || observation.source.sourceSchema !== source.schema ||
      observation.source.readerVersion !== source.readerVersion)) throw new StoreError('invalid-durable-data');
  return entry;
}
export function validateAttributionAssociations(entry: JournalEntry, previous: readonly JournalEntry[]): void {
  if (!entry.attribution) return;
  const sameSource = (other: JournalEntry) => other.source.provider === entry.source.provider &&
    other.source.instanceKey === entry.source.instanceKey && other.source.sourceIdentity === entry.source.sourceIdentity;
  const known = new Set([...previous.filter(sameSource), entry]
    .flatMap(value => value.observations.map(observationEvidenceHash)));
  if (entry.attribution.decisions.some(decision => !known.has(decision.observationHash)))
    throw new StoreError('invalid-durable-data');
}
export async function readJournal(directory: string): Promise<JournalEntry[]> {
  await assertDirectory(directory);
  const names = (await fs.readdir(directory)).sort();
  const entries: JournalEntry[] = [];
  for (const name of names) {
    if (/^\.tmp-[a-f0-9-]{36}$/.test(name)) continue; // incomplete unpublished writes
    if (!/^[0-9]{16}\.json$/.test(name)) throw new StoreError('invalid-durable-data');
    let value: unknown;
    try { value = JSON.parse(await readPrivateFile(join(directory, name))); }
    catch (error) { if (error instanceof SyntaxError) throw new StoreError('invalid-durable-data'); throw error; }
    const entry = validateEntry(value);
    if (entry.sequence !== entries.length + 1 || name !== journalName(entry.sequence)) throw new StoreError('invalid-durable-data');
    validateAttributionAssociations(entry, entries);
    entries.push(entry);
  }
  return entries;
}
function journalName(sequence: number): string { return `${String(sequence).padStart(16, '0')}.json`; }
export async function appendJournal(directory: string, entry: JournalEntry): Promise<void> {
  const validated = validateEntry(entry);
  if (Buffer.byteLength(JSON.stringify(validated)) > 32 * 1024 * 1024) throw new StoreError('invalid-batch');
  await atomicFile(join(directory, journalName(validated.sequence)), validated);
}
