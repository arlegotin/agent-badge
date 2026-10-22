import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Checkpoint, SourceDescriptor } from '../domain/capabilities.js';
import type { JournalEntry } from './journal.js';
import { atomicFile } from './atomic-file.js';

export type CheckpointScope = Pick<Checkpoint, 'repositoryId' | 'normalizationVersion' | 'attributionPolicyHash'>;
function identity(source: SourceDescriptor): string {
  return JSON.stringify([source.provider, source.instanceKey, source.sourceIdentity]);
}
function compatible(checkpoint: Checkpoint, source: SourceDescriptor, scope: CheckpointScope): boolean {
  return checkpoint.provider === source.provider && checkpoint.instanceKey === source.instanceKey && checkpoint.sourceIdentity === source.sourceIdentity &&
    checkpoint.sourceGeneration === source.generation && checkpoint.sourceSchema === source.schema && checkpoint.readerVersion === source.readerVersion &&
    checkpoint.repositoryId === scope.repositoryId && checkpoint.normalizationVersion === scope.normalizationVersion && checkpoint.attributionPolicyHash === scope.attributionPolicyHash;
}
export function latestCheckpoint(entries: readonly JournalEntry[], source: SourceDescriptor, scope: CheckpointScope): Checkpoint | null {
  // First select latest source generation. Never fall back to a replaced generation.
  const latest = entries.findLast(entry => identity(entry.source) === identity(source) && entry.outcome !== 'unavailable' && entry.outcome !== 'unsupported');
  return latest && compatible(latest.checkpoint, source, scope) ? latest.checkpoint : null;
}
export async function writeCheckpoint(directory: string, entry: JournalEntry): Promise<void> {
  if (entry.outcome === 'unavailable' || entry.outcome === 'unsupported') return;
  const key = createHash('sha256').update(identity(entry.source)).digest('hex');
  await atomicFile(join(directory, `${key}.json`), { schemaVersion: 1, journalSequence: entry.sequence, checkpoint: entry.checkpoint });
}
