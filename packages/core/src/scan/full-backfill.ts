import { realpath } from "node:fs/promises";

import type { AgentBadgeConfig } from "../config/config-schema.js";
import { scanClaudeSessions } from "../providers/claude/claude-adapter.js";
import { scanCodexSessions } from "../providers/codex/codex-adapter.js";
import {
  parseNormalizedSessionSummary,
  type NormalizedSessionSummary
} from "../providers/session-summary.js";
import {
  resolveRepoFingerprint,
  type RepoFingerprint
} from "../repo/repo-fingerprint.js";

type ProviderName = NormalizedSessionSummary["provider"];

export interface RunFullBackfillScanOptions {
  readonly cwd: string;
  readonly homeRoot: string;
  readonly config: Pick<AgentBadgeConfig, "providers" | "repo">;
}

export interface BackfillProviderCounts {
  scannedSessions: number;
  dedupedSessions: number;
}

export interface RunFullBackfillScanResult {
  readonly repo: RepoFingerprint;
  readonly sessions: NormalizedSessionSummary[];
  readonly scannedProviders: ProviderName[];
  readonly counts: {
    readonly scannedSessions: number;
    readonly dedupedSessions: number;
    readonly byProvider: Record<ProviderName, BackfillProviderCounts>;
  };
}

function createProviderCounts(): Record<ProviderName, BackfillProviderCounts> {
  return {
    codex: {
      scannedSessions: 0,
      dedupedSessions: 0
    },
    claude: {
      scannedSessions: 0,
      dedupedSessions: 0
    }
  };
}

async function resolveCwdRealPath(
  session: NormalizedSessionSummary
): Promise<NormalizedSessionSummary> {
  if (session.cwd === null) {
    return session;
  }

  try {
    const cwdRealPath = await realpath(session.cwd);

    return parseNormalizedSessionSummary({
      ...session,
      attributionHints: {
        ...session.attributionHints,
        cwdRealPath
      }
    });
  } catch {
    return session;
  }
}

export async function runFullBackfillScan(
  options: RunFullBackfillScanOptions
): Promise<RunFullBackfillScanResult> {
  const repo = await resolveRepoFingerprint({
    cwd: options.cwd,
    config: options.config
  });
  const providerCounts = createProviderCounts();
  const providerScans = await Promise.all([
    options.config.providers.codex.enabled
      ? scanCodexSessions({ homeRoot: options.homeRoot }).then((sessions) => ({
          provider: "codex" as const,
          sessions
        }))
      : Promise.resolve(null),
    options.config.providers.claude.enabled
      ? scanClaudeSessions({ homeRoot: options.homeRoot }).then((sessions) => ({
          provider: "claude" as const,
          sessions
        }))
      : Promise.resolve(null)
  ]);

  const scannedProviders: ProviderName[] = [];
  const scannedSessions: NormalizedSessionSummary[] = [];

  for (const scanResult of providerScans) {
    if (scanResult === null) {
      continue;
    }

    scannedProviders.push(scanResult.provider);
    providerCounts[scanResult.provider].scannedSessions = scanResult.sessions.length;

    scannedSessions.push(
      ...(await Promise.all(scanResult.sessions.map(resolveCwdRealPath)))
    );
  }

  const seenSessionKeys = new Set<string>();
  const dedupedSessions: NormalizedSessionSummary[] = [];

  for (const session of scannedSessions) {
    const sessionKey = `${session.provider}:${session.providerSessionId}`;

    if (seenSessionKeys.has(sessionKey)) {
      continue;
    }

    seenSessionKeys.add(sessionKey);
    providerCounts[session.provider].dedupedSessions += 1;
    dedupedSessions.push(session);
  }

  return {
    repo,
    sessions: dedupedSessions,
    scannedProviders,
    counts: {
      scannedSessions: scannedSessions.length,
      dedupedSessions: dedupedSessions.length,
      byProvider: providerCounts
    }
  };
}
