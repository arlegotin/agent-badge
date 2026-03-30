import { join } from "node:path";

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
