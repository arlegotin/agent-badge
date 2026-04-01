import Database from "better-sqlite3";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export interface CodexThreadRow {
  readonly id: string;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly rolloutPath: string | null;
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
  readonly created_at: string | number | null;
  readonly updated_at: string | number | null;
  readonly rollout_path: string | null;
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

export interface CodexThreadRolloutRow {
  readonly id: string;
  readonly rolloutPath: string | null;
}

interface RawCodexThreadRolloutRow {
  readonly id: string;
  readonly rollout_path: string | null;
}

function normalizeCodexTimestamp(
  value: string | number | null
): string | null {
  if (value === null) {
    return null;
  }

  const numericValue =
    typeof value === "number"
      ? value
      : /^\d+(?:\.\d+)?$/.test(value.trim())
        ? Number(value.trim())
        : null;

  if (numericValue !== null && Number.isFinite(numericValue)) {
    const milliseconds =
      numericValue >= 1_000_000_000_000 ? numericValue : numericValue * 1000;

    return new Date(milliseconds).toISOString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return null;
    }

    const parsedMilliseconds = Date.parse(trimmed);

    if (Number.isFinite(parsedMilliseconds)) {
      return new Date(parsedMilliseconds).toISOString();
    }

    return trimmed;
  }

  return null;
}

function codexTimestampToUnixSeconds(
  value: string | null
): number | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const numericValue = Number(trimmed);

    if (!Number.isFinite(numericValue)) {
      return null;
    }

    return Math.floor(
      numericValue >= 1_000_000_000_000 ? numericValue / 1000 : numericValue
    );
  }

  const parsedMilliseconds = Date.parse(trimmed);

  if (!Number.isFinite(parsedMilliseconds)) {
    return null;
  }

  return Math.floor(parsedMilliseconds / 1000);
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
    createdAt: normalizeCodexTimestamp(row.created_at),
    updatedAt: normalizeCodexTimestamp(row.updated_at),
    rolloutPath: row.rollout_path,
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
        rollout_path, git_sha, git_branch, git_origin_url, cli_version, agent_nickname,
        agent_role, model
      FROM threads
      ORDER BY created_at ASC
    `
  );

  return rows.map(mapCodexThreadRow);
}

export async function loadCodexThreadRowsSince(
  dbPath: string,
  watermark: string | null,
  sessionIdsAtWatermark: readonly string[]
): Promise<CodexThreadRow[]> {
  const threadWatermarkSql = `
    COALESCE(
      CASE
        WHEN updated_at IS NULL THEN NULL
        WHEN typeof(updated_at) IN ('integer', 'real') THEN
          CASE
            WHEN updated_at >= 1000000000000 THEN CAST(updated_at / 1000 AS INTEGER)
            ELSE CAST(updated_at AS INTEGER)
          END
        ELSE CAST(strftime('%s', updated_at) AS INTEGER)
      END,
      CASE
        WHEN created_at IS NULL THEN NULL
        WHEN typeof(created_at) IN ('integer', 'real') THEN
          CASE
            WHEN created_at >= 1000000000000 THEN CAST(created_at / 1000 AS INTEGER)
            ELSE CAST(created_at AS INTEGER)
          END
        ELSE CAST(strftime('%s', created_at) AS INTEGER)
      END,
      -1
    )
  `;
  const effectiveWatermark = codexTimestampToUnixSeconds(watermark) ?? -1;
  const params: unknown[] = [effectiveWatermark];
  let sql = `
      SELECT id, created_at, updated_at, source, model_provider, cwd, tokens_used,
        rollout_path, git_sha, git_branch, git_origin_url, cli_version, agent_nickname,
        agent_role, model
      FROM threads
      WHERE ${threadWatermarkSql} > ?
    `;

  if (sessionIdsAtWatermark.length > 0) {
    const placeholders = sessionIdsAtWatermark.map(() => "?").join(", ");

    sql += `
      OR (${threadWatermarkSql} = ? AND id NOT IN (${placeholders}))
    `;
    params.push(effectiveWatermark, ...sessionIdsAtWatermark);
  } else if (watermark === null) {
    sql += `
      OR ${threadWatermarkSql} = ?
    `;
    params.push(effectiveWatermark);
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

export async function loadCodexThreadRolloutRowsByIds(
  dbPath: string,
  threadIds: readonly string[]
): Promise<CodexThreadRolloutRow[]> {
  if (threadIds.length === 0) {
    return [];
  }

  const placeholders = threadIds.map(() => "?").join(", ");
  const rows = readRows<RawCodexThreadRolloutRow>(
    dbPath,
    `
      SELECT id, rollout_path
      FROM threads
      WHERE id IN (${placeholders})
    `,
    threadIds
  );

  return rows.map((row) => ({
    id: row.id,
    rolloutPath: row.rollout_path
  }));
}
