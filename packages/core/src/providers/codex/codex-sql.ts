import Database from "better-sqlite3";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export interface CodexThreadRow {
  readonly id: string;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly source: string | null;
  readonly modelProvider: string | null;
  readonly cwd: string | null;
  readonly tokensUsed: number | null;
  readonly gitSha: string | null;
  readonly gitBranch: string | null;
  readonly gitOriginUrl: string | null;
  readonly cliVersion: string | null;
  readonly agentNickname: string | null;
  readonly agentRole: string | null;
  readonly model: string | null;
}

export interface CodexSpawnEdgeRow {
  readonly parentThreadId: string;
  readonly childThreadId: string;
}

interface RawCodexThreadRow {
  readonly id: string;
  readonly created_at: string | null;
  readonly updated_at: string | null;
  readonly source: string | null;
  readonly model_provider: string | null;
  readonly cwd: string | null;
  readonly tokens_used: number | null;
  readonly git_sha: string | null;
  readonly git_branch: string | null;
  readonly git_origin_url: string | null;
  readonly cli_version: string | null;
  readonly agent_nickname: string | null;
  readonly agent_role: string | null;
  readonly model: string | null;
}

interface RawCodexSpawnEdgeRow {
  readonly parent_thread_id: string;
  readonly child_thread_id: string;
}

function readRows<T>(dbPath: string, sql: string, params: readonly unknown[] = []): T[] {
  const database = new Database(dbPath, { readonly: true });

  try {
    return database.prepare(sql).all(...params) as T[];
  } finally {
    database.close();
  }
}

function mapCodexThreadRow(row: RawCodexThreadRow): CodexThreadRow {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: row.source,
    modelProvider: row.model_provider,
    cwd: row.cwd,
    tokensUsed: row.tokens_used,
    gitSha: row.git_sha,
    gitBranch: row.git_branch,
    gitOriginUrl: row.git_origin_url,
    cliVersion: row.cli_version,
    agentNickname: row.agent_nickname,
    agentRole: row.agent_role,
    model: row.model
  };
}

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

export async function loadCodexThreadRows(
  dbPath: string
): Promise<CodexThreadRow[]> {
  const rows = readRows<RawCodexThreadRow>(
    dbPath,
    `
      SELECT id, created_at, updated_at, source, model_provider, cwd, tokens_used,
        git_sha, git_branch, git_origin_url, cli_version, agent_nickname,
        agent_role, model
      FROM threads
      ORDER BY created_at ASC
    `
  );

  return rows.map(mapCodexThreadRow);
}

export async function loadCodexThreadRowsSince(
  dbPath: string,
  watermark: string,
  sessionIdsAtWatermark: readonly string[]
): Promise<CodexThreadRow[]> {
  const threadWatermarkSql = "COALESCE(updated_at, created_at, '')";
  const params: unknown[] = [watermark];
  let sql = `
      SELECT id, created_at, updated_at, source, model_provider, cwd, tokens_used,
        git_sha, git_branch, git_origin_url, cli_version, agent_nickname,
        agent_role, model
      FROM threads
      WHERE ${threadWatermarkSql} > ?
    `;

  if (sessionIdsAtWatermark.length > 0) {
    const placeholders = sessionIdsAtWatermark.map(() => "?").join(", ");

    sql += `
      OR (${threadWatermarkSql} = ? AND id NOT IN (${placeholders}))
    `;
    params.push(watermark, ...sessionIdsAtWatermark);
  }

  sql += `
      ORDER BY created_at ASC
    `;

  const rows = readRows<RawCodexThreadRow>(dbPath, sql, params);

  return rows.map(mapCodexThreadRow);
}

export async function loadCodexSpawnEdges(
  dbPath: string
): Promise<CodexSpawnEdgeRow[]> {
  const rows = readRows<RawCodexSpawnEdgeRow>(
    dbPath,
    `
      SELECT parent_thread_id, child_thread_id
      FROM thread_spawn_edges
    `
  );

  return rows.map((row) => ({
    parentThreadId: row.parent_thread_id,
    childThreadId: row.child_thread_id
  }));
}
