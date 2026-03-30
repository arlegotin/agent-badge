import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { normalizeGitRemoteUrl } from "../../repo/repo-fingerprint.js";
import {
  parseNormalizedSessionSummary,
  type NormalizedSessionSummary
} from "../session-summary.js";
import {
  findLatestCodexStateDatabase,
  loadCodexSpawnEdges,
  loadCodexThreadRows
} from "./codex-sql.js";

export interface ScanCodexSessionsOptions {
  readonly homeRoot: string;
}

interface CodexHistoryRow {
  readonly session_id?: unknown;
  readonly ts?: unknown;
}

async function loadCodexHistoryFallback(
  codexRoot: string
): Promise<NormalizedSessionSummary[]> {
  let content: string;

  try {
    content = await readFile(join(codexRoot, "history.jsonl"), "utf8");
  } catch {
    return [];
  }

  const sessions = new Map<
    string,
    {
      startedAt: string | null;
      updatedAt: string | null;
    }
  >();

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    let parsed: CodexHistoryRow;

    try {
      parsed = JSON.parse(line) as CodexHistoryRow;
    } catch {
      continue;
    }

    const sessionId =
      typeof parsed.session_id === "string" && parsed.session_id.length > 0
        ? parsed.session_id
        : null;
    const timestamp =
      typeof parsed.ts === "string" && parsed.ts.length > 0 ? parsed.ts : null;

    if (sessionId === null) {
      continue;
    }

    const existing = sessions.get(sessionId);

    if (!existing) {
      sessions.set(sessionId, {
        startedAt: timestamp,
        updatedAt: timestamp
      });
      continue;
    }

    sessions.set(sessionId, {
      startedAt:
        existing.startedAt === null ||
        (timestamp !== null && timestamp < existing.startedAt)
          ? timestamp
          : existing.startedAt,
      updatedAt:
        existing.updatedAt === null ||
        (timestamp !== null && timestamp > existing.updatedAt)
          ? timestamp
          : existing.updatedAt
    });
  }

  return [...sessions.entries()].map(([sessionId, timestamps]) =>
    parseNormalizedSessionSummary({
      provider: "codex",
      providerSessionId: sessionId,
      startedAt: timestamps.startedAt,
      updatedAt: timestamps.updatedAt,
      cwd: null,
      gitBranch: null,
      observedRemoteUrl: null,
      observedRemoteUrlNormalized: null,
      attributionHints: {
        cwdRealPath: null,
        transcriptProjectKey: null
      },
      tokenUsage: {
        total: 0,
        input: null,
        output: null,
        cacheCreation: null,
        cacheRead: null,
        reasoningOutput: null
      },
      lineage: {
        parentSessionId: null,
        kind: "unknown"
      },
      metadata: {
        model: null,
        modelProvider: null,
        sourceKind: "history.jsonl",
        cliVersion: null
      }
    })
  );
}

export async function scanCodexSessions(
  options: ScanCodexSessionsOptions
): Promise<NormalizedSessionSummary[]> {
  const codexRoot = join(options.homeRoot, ".codex");
  const dbPath = await findLatestCodexStateDatabase(codexRoot);

  if (dbPath === null) {
    return loadCodexHistoryFallback(codexRoot);
  }

  try {
    const [threadRows, spawnEdges] = await Promise.all([
      loadCodexThreadRows(dbPath),
      loadCodexSpawnEdges(dbPath)
    ]);
    const parentByChildId = new Map(
      spawnEdges.map((edge) => [edge.childThreadId, edge.parentThreadId])
    );
    const uniqueRows = new Map(threadRows.map((row) => [row.id, row]));

    return [...uniqueRows.values()].map((row) => {
      const normalizedRemote = row.gitOriginUrl
        ? normalizeGitRemoteUrl(row.gitOriginUrl)
        : null;
      const parentSessionId = parentByChildId.get(row.id) ?? null;

      return parseNormalizedSessionSummary({
        provider: "codex",
        providerSessionId: row.id,
        startedAt: row.createdAt,
        updatedAt: row.updatedAt,
        cwd: row.cwd,
        gitBranch: row.gitBranch,
        observedRemoteUrl: row.gitOriginUrl,
        observedRemoteUrlNormalized: normalizedRemote?.normalizedUrl ?? null,
        attributionHints: {
          cwdRealPath: null,
          transcriptProjectKey: null
        },
        tokenUsage: {
          total: Math.max(row.tokensUsed ?? 0, 0),
          input: null,
          output: null,
          cacheCreation: null,
          cacheRead: null,
          reasoningOutput: null
        },
        lineage: {
          parentSessionId,
          kind: parentSessionId === null ? "root" : "child"
        },
        metadata: {
          model: row.model,
          modelProvider: row.modelProvider,
          sourceKind: row.source,
          cliVersion: row.cliVersion
        }
      });
    });
  } catch {
    return loadCodexHistoryFallback(codexRoot);
  }
}
