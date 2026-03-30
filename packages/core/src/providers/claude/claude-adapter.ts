import { join } from "node:path";

import { z } from "zod";

import { normalizeGitRemoteUrl } from "../../repo/repo-fingerprint.js";
import {
  parseNormalizedSessionSummary,
  type NormalizedSessionSummary
} from "../session-summary.js";
import {
  listClaudeProjectJsonlFiles,
  readClaudeProjectJsonlSessionsFromFiles,
  readClaudeProjectJsonlSessions,
  type ClaudeProjectJsonlFile,
  type ClaudeProjectJsonlRow
} from "./claude-jsonl.js";

export interface ScanClaudeSessionsOptions {
  readonly homeRoot: string;
}

export interface ScanClaudeSessionsIncrementalOptions {
  readonly homeRoot: string;
  readonly cursor: string | null;
}

export interface ScanClaudeSessionsIncrementalResult {
  readonly sessions: NormalizedSessionSummary[];
  readonly cursor: string;
  readonly mode: "incremental" | "full";
}

const claudeIncrementalCursorSchema = z
  .object({
    kind: z.literal("claude-project-jsonl-watermark-v1"),
    watermarkMs: z.number().nonnegative().nullable(),
    filesAtWatermark: z.record(z.string(), z.number().int().nonnegative())
  })
  .strict();

interface ClaudeIncrementalCursor {
  readonly watermarkMs: number | null;
  readonly filesAtWatermark: Readonly<Record<string, number>>;
}

function compareTimestamps(
  left: string | null,
  right: string | null
): number {
  if (left === right) {
    return 0;
  }

  if (left === null) {
    return -1;
  }

  if (right === null) {
    return 1;
  }

  return left.localeCompare(right);
}

function usageTotal(row: ClaudeProjectJsonlRow): number {
  return (
    (row.usage?.inputTokens ?? 0) +
    (row.usage?.outputTokens ?? 0) +
    (row.usage?.cacheCreationInputTokens ?? 0) +
    (row.usage?.cacheReadInputTokens ?? 0)
  );
}

function latestAssistantUsageRows(
  rows: ClaudeProjectJsonlRow[]
): ClaudeProjectJsonlRow[] {
  const latestByMessageId = new Map<string, ClaudeProjectJsonlRow>();

  rows
    .filter(
      (row) =>
        row.type === "assistant" &&
        row.messageRole === "assistant" &&
        row.usage !== null
    )
    .forEach((row, index) => {
      const messageId = row.messageId ?? `message.id:${index}`;
      const existing = latestByMessageId.get(messageId);

      if (
        existing === undefined ||
        compareTimestamps(row.timestamp, existing.timestamp) >= 0
      ) {
        latestByMessageId.set(messageId, row);
      }
    });

  return [...latestByMessageId.values()];
}

function latestRowValue(
  rows: ClaudeProjectJsonlRow[],
  selector: (row: ClaudeProjectJsonlRow) => string | null
): string | null {
  const row = [...rows]
    .sort((left, right) => compareTimestamps(left.timestamp, right.timestamp))
    .reverse()
    .find((entry) => selector(entry) !== null);

  return row ? selector(row) : null;
}

function buildClaudeIncrementalCursorFromFiles(
  files: readonly ClaudeProjectJsonlFile[]
): string {
  const watermarkMs = files.reduce<number | null>((current, file) => {
    if (current === null || file.modifiedAtMs > current) {
      return file.modifiedAtMs;
    }

    return current;
  }, null);
  const filesAtWatermark =
    watermarkMs === null
      ? {}
      : Object.fromEntries(
          files
            .filter((file) => file.modifiedAtMs === watermarkMs)
            .map((file) => [file.relativePath, file.size] as const)
            .sort(([left], [right]) => left.localeCompare(right))
        );

  return JSON.stringify({
    kind: "claude-project-jsonl-watermark-v1",
    watermarkMs,
    filesAtWatermark
  });
}

export async function buildClaudeIncrementalCursorFromSource(
  homeRoot: string
): Promise<string> {
  const files = await listClaudeProjectJsonlFiles(join(homeRoot, ".claude"));

  return buildClaudeIncrementalCursorFromFiles(files);
}

function parseClaudeIncrementalCursor(
  cursor: string | null
): ClaudeIncrementalCursor | null {
  if (typeof cursor !== "string" || cursor.length === 0) {
    return null;
  }

  try {
    const parsed = claudeIncrementalCursorSchema.parse(JSON.parse(cursor));

    return {
      watermarkMs: parsed.watermarkMs,
      filesAtWatermark: parsed.filesAtWatermark
    };
  } catch {
    return null;
  }
}

function normalizeClaudeProjectSession(
  session: Awaited<ReturnType<typeof readClaudeProjectJsonlSessions>>[number]
): NormalizedSessionSummary {
  const assistantRows = latestAssistantUsageRows(session.rows);
  const startedAt = session.rows.reduce<string | null>(
    (current, row) =>
      current === null || compareTimestamps(row.timestamp, current) < 0
        ? row.timestamp
        : current,
    null
  );
  const updatedAt = session.rows.reduce<string | null>(
    (current, row) =>
      current === null || compareTimestamps(row.timestamp, current) > 0
        ? row.timestamp
        : current,
    null
  );
  const observedRemoteUrl = latestRowValue(session.rows, (row) => row.gitOriginUrl);
  const observedRemoteUrlNormalized = observedRemoteUrl
    ? normalizeGitRemoteUrl(observedRemoteUrl)?.normalizedUrl ?? null
    : null;

  return parseNormalizedSessionSummary({
    provider: "claude",
    providerSessionId: session.sessionId,
    startedAt,
    updatedAt,
    cwd: latestRowValue(session.rows, (row) => row.cwd),
    gitBranch: latestRowValue(session.rows, (row) => row.gitBranch),
    observedRemoteUrl,
    observedRemoteUrlNormalized,
    attributionHints: {
      cwdRealPath: null,
      transcriptProjectKey: session.projectKey
    },
    tokenUsage: {
      total: assistantRows.reduce((sum, row) => sum + usageTotal(row), 0),
      input: assistantRows.reduce(
        (sum, row) => sum + (row.usage?.inputTokens ?? 0),
        0
      ),
      output: assistantRows.reduce(
        (sum, row) => sum + (row.usage?.outputTokens ?? 0),
        0
      ),
      cacheCreation: assistantRows.reduce(
        (sum, row) => sum + (row.usage?.cacheCreationInputTokens ?? 0),
        0
      ),
      cacheRead: assistantRows.reduce(
        (sum, row) => sum + (row.usage?.cacheReadInputTokens ?? 0),
        0
      ),
      reasoningOutput: null
    },
    lineage: {
      parentSessionId: null,
      kind: "root"
    },
    metadata: {
      model: latestRowValue(assistantRows, (row) => row.model),
      modelProvider: "anthropic",
      sourceKind: "project-jsonl",
      cliVersion: null
    }
  });
}

function isClaudeFileChanged(
  file: ClaudeProjectJsonlFile,
  cursor: ClaudeIncrementalCursor
): boolean {
  if (cursor.watermarkMs === null) {
    return true;
  }

  if (file.modifiedAtMs > cursor.watermarkMs) {
    return true;
  }

  if (file.modifiedAtMs < cursor.watermarkMs) {
    return false;
  }

  return cursor.filesAtWatermark[file.relativePath] !== file.size;
}

export async function scanClaudeSessions(
  options: ScanClaudeSessionsOptions
): Promise<NormalizedSessionSummary[]> {
  const claudeRoot = join(options.homeRoot, ".claude");
  const sessions = await readClaudeProjectJsonlSessions(claudeRoot);

  return sessions.map(normalizeClaudeProjectSession);
}

export async function scanClaudeSessionsIncremental({
  homeRoot,
  cursor
}: ScanClaudeSessionsIncrementalOptions): Promise<ScanClaudeSessionsIncrementalResult> {
  const claudeRoot = join(homeRoot, ".claude");
  const files = await listClaudeProjectJsonlFiles(claudeRoot);
  const nextCursor = buildClaudeIncrementalCursorFromFiles(files);
  const previousCursor = parseClaudeIncrementalCursor(cursor);

  if (previousCursor === null || previousCursor.watermarkMs === null) {
    const sessions = await readClaudeProjectJsonlSessionsFromFiles(files);

    return {
      sessions: sessions.map(normalizeClaudeProjectSession),
      cursor: nextCursor,
      mode: "full"
    };
  }

  const changedFiles = files.filter((file) =>
    isClaudeFileChanged(file, previousCursor)
  );

  if (changedFiles.length === 0) {
    return {
      sessions: [],
      cursor: nextCursor,
      mode: "incremental"
    };
  }

  const sessions = await readClaudeProjectJsonlSessionsFromFiles(changedFiles);

  return {
    sessions: sessions.map(normalizeClaudeProjectSession),
    cursor: nextCursor,
    mode: "incremental"
  };
}
