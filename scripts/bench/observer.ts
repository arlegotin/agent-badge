/** Read-only benchmark telemetry. Never opens an owning store or repairs a cache. */
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { hasCode, readPrivateFile } from '../../packages/core/src/storage/atomic-file.js';
import { parseTransportState } from '../../packages/core/src/storage/store.js';

export async function observeStage(root: string): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  const stores: [string, [string, string][]][] = [
    ['index', [['localEntries', 'SELECT count(*) AS n FROM rebuild_progress']]],
    ['accepted', [['treeEntries', 'SELECT count(*) AS n FROM inventory'],
      ['verifiedBlobs', 'SELECT count(*) AS n FROM inventory WHERE verified=1'],
      ['remainingComponents', 'SELECT count(*) AS n FROM todo']]],
  ];
  for (const [name, queries] of stores) {
    try {
      const manifest = JSON.parse(await readFile(join(root, `cache/${name}-stage.json`), 'utf8'));
      if (manifest.progress) {
        result.phase = manifest.progress.phase;
        result.lastPath = manifest.progress.lastPath;
        result.retentionCursor = manifest.progress.retentionCursor;
      }
      const db = new DatabaseSync(join(root, `cache/${name}-stage.sqlite`), { readOnly: true });
      try {
        for (const [key, sql] of queries) result[key] = db.prepare(sql).get()!.n;
      } finally { db.close(); }
    } catch { /* Missing/corrupt stage telemetry is unknown, never repaired. */ }
  }
  return result;
}

export async function observeProgress(root: string, readSummary: (commit: string) => Promise<string>) {
  let confirmedUnits = 0;
  try {
    const state = parseTransportState(JSON.parse(await readPrivateFile(join(root, 'transport.json'), 16384, true)));
    if (state.commit) {
      const summary = JSON.parse(await readSummary(state.commit));
      if (!Number.isSafeInteger(summary.recordedUnits) || summary.recordedUnits < 0) throw Error('invalid benchmark summary');
      confirmedUnits = summary.recordedUnits;
    }
  } catch (error) { if (!hasCode(error, 'ENOENT')) throw error; }
  const journalFiles = (await readdir(join(root, 'journal'))).filter(name => /^[0-9]{16}\.json$/.test(name)).length;
  // A file count is scheduling telemetry, not an inferred usage/pending count.
  return { confirmedUnits, pending: null, journalFiles, stage: await observeStage(root) };
}
