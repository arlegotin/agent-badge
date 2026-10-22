import { readdir, stat } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import type { Diagnostic, ScanOutcome } from "../../domain/capabilities.js";
import { join } from "node:path";

export async function findLatestCodexStateDatabase(
  codexRoot: string
): Promise<string | null> {
  let entries: string[];

  try {
    entries = await readdir(codexRoot);
  } catch {
    return null;
  }

  const candidates = await Promise.all(
    entries
      .filter((entry) => /^state_\d+\.sqlite$/.test(entry))
      .map(async (entry) => {
        const filePath = join(codexRoot, entry);
        const fileStat = await stat(filePath);

        return {
          filePath,
          modifiedAt: fileStat.mtimeMs
        };
      })
  );

  const latest = candidates.sort((left, right) => right.modifiedAt - left.modifiedAt)[0];

  return latest?.filePath ?? null;
}

export interface CodexInventory {
  outcome: ScanOutcome;
  rolloutPaths: string[];
  diagnostics: Diagnostic[];
}
/** Inventory only. Aggregate token columns and latest model/cwd are never selected. */
export async function readCodexInventory(path: string): Promise<CodexInventory> {
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(path, { readOnly: true });
    database.exec('PRAGMA busy_timeout = 50');
    const columns = database.prepare('PRAGMA table_info(threads)').all();
    if (!['id', 'rollout_path'].every(name => columns.some(column => column.name === name)))
      return { outcome: 'unsupported', rolloutPaths: [], diagnostics: [{code:'unsupported-source',severity:'warning'}] };
    const rows = database.prepare('SELECT rollout_path FROM threads LIMIT 10001').all();
    const overflow = rows.length > 10000;
    return { outcome: overflow ? 'partial' : 'complete',
      rolloutPaths: [...new Set(rows.slice(0,10000).map(row => row.rollout_path).filter((path): path is string => typeof path === 'string' && path.length > 0 && path.length <= 4096))],
      diagnostics: overflow ? [{code:'incomplete-source',severity:'warning'}] : [] };
  } catch {
    return { outcome:'unavailable', rolloutPaths:[], diagnostics:[{code:'unavailable-source',severity:'warning'}] };
  } finally { database?.close(); }
}
