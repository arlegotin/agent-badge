import { createHash } from "node:crypto";
import { join } from "node:path";

import { z } from "zod";

import { normalizeGitRemoteUrl } from "../../repo/repo-fingerprint.js";
import {
  parseNormalizedSessionSummary,
  type NormalizedSessionSummary
} from "../session-summary.js";
import {
  readClaudeProjectJsonlSessions,
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
    kind: z.literal("claude-session-digest-v1"),
    sessions: z.record(z.string(), z.string().min(1))
  })
  .strict();

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

function buildClaudeSessionDigest(session: NormalizedSessionSummary): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        providerSessionId: session.providerSessionId,
        startedAt: session.startedAt,
        updatedAt: session.updatedAt,
        cwd: session.cwd,
        gitBranch: session.gitBranch,
        observedRemoteUrlNormalized: session.observedRemoteUrlNormalized,
        transcriptProjectKey: session.attributionHints.transcriptProjectKey,
        tokenTotal: session.tokenUsage.total,
        input: session.tokenUsage.input,
        output: session.tokenUsage.output,
        cacheCreation: session.tokenUsage.cacheCreation,
        cacheRead: session.tokenUsage.cacheRead,
        model: session.metadata.model
      })
    )
    .digest("hex");
}

export function buildClaudeIncrementalCursor(
  sessions: readonly NormalizedSessionSummary[]
): string {
  const entries = sessions
    .filter((session) => session.provider === "claude")
    .map((session) => [
      session.providerSessionId,
      buildClaudeSessionDigest(session)
    ] as const)
    .sort(([left], [right]) => left.localeCompare(right));

  return JSON.stringify({
    kind: "claude-session-digest-v1",
    sessions: Object.fromEntries(entries)
  });
}

function parseClaudeIncrementalCursor(
  cursor: string | null
): Record<string, string> | null {
  if (typeof cursor !== "string" || cursor.length === 0) {
    return null;
  }

  try {
    return claudeIncrementalCursorSchema.parse(JSON.parse(cursor)).sessions;
  } catch {
    return null;
  }
}

export async function scanClaudeSessions(
  options: ScanClaudeSessionsOptions
): Promise<NormalizedSessionSummary[]> {
  const claudeRoot = join(options.homeRoot, ".claude");
  const sessions = await readClaudeProjectJsonlSessions(claudeRoot);

  return sessions.map((session) => {
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
    const observedRemoteUrl = latestRowValue(
      session.rows,
      (row) => row.gitOriginUrl
    );
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
        // Maps Claude `input_tokens`, `output_tokens`,
        // `cache_creation_input_tokens`, and `cache_read_input_tokens`.
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
  });
}

export async function scanClaudeSessionsIncremental({
  homeRoot,
  cursor
}: ScanClaudeSessionsIncrementalOptions): Promise<ScanClaudeSessionsIncrementalResult> {
  const sessions = await scanClaudeSessions({ homeRoot });
  const previousDigests = parseClaudeIncrementalCursor(cursor);
  const nextCursor = buildClaudeIncrementalCursor(sessions);

  if (previousDigests === null) {
    return {
      sessions,
      cursor: nextCursor,
      mode: "full"
    };
  }

  return {
    sessions: sessions.filter(
      (session) =>
        previousDigests[session.providerSessionId] !==
        buildClaudeSessionDigest(session)
    ),
    cursor: nextCursor,
    mode: "incremental"
  };
}
