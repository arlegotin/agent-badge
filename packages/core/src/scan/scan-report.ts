import type { AttributedSession } from "../attribution/attribution-types.js";
import type { RepoFingerprint } from "../repo/repo-fingerprint.js";

import type { RunFullBackfillScanResult } from "./full-backfill.js";

export interface AppliedScanOverrideAction {
  readonly sessionKey: string;
  readonly decision: "include" | "exclude";
}

export interface ScanReportResult {
  readonly repo: Pick<RepoFingerprint, "canonicalSlug" | "gitRootBasename">;
  readonly counts: Pick<RunFullBackfillScanResult["counts"], "scannedSessions" | "dedupedSessions" | "byProvider"> & {
    readonly included: number;
    readonly ambiguous: number;
    readonly excluded: number;
  };
  readonly attributedSessions: readonly AttributedSession[];
  readonly overrideActions: readonly AppliedScanOverrideAction[];
}

interface IncludedProviderTotals {
  readonly sessions: number;
  readonly tokens: number;
}

function formatSessionKey(session: AttributedSession["session"]): string {
  return `${session.provider}:${session.providerSessionId}`;
}

function collectIncludedTotals(
  sessions: readonly AttributedSession[]
): {
  readonly combined: IncludedProviderTotals;
  readonly byProvider: Record<AttributedSession["session"]["provider"], IncludedProviderTotals>;
} {
  const byProvider: Record<
    AttributedSession["session"]["provider"],
    IncludedProviderTotals
  > = {
    codex: { sessions: 0, tokens: 0 },
    claude: { sessions: 0, tokens: 0 }
  };

  for (const session of sessions) {
    if (session.status !== "included") {
      continue;
    }

    byProvider[session.session.provider] = {
      sessions: byProvider[session.session.provider].sessions + 1,
      tokens: byProvider[session.session.provider].tokens + session.session.tokenUsage.total
    };
  }

  return {
    combined: {
      sessions: byProvider.codex.sessions + byProvider.claude.sessions,
      tokens: byProvider.codex.tokens + byProvider.claude.tokens
    },
    byProvider
  };
}

function formatOverrideActions(
  overrideActions: readonly AppliedScanOverrideAction[]
): string[] {
  if (overrideActions.length === 0) {
    return ["Override Actions Applied: none"];
  }

  return [
    "Override Actions Applied:",
    ...overrideActions.map(
      (action) => `- ${action.sessionKey} => ${action.decision}`
    )
  ];
}

function formatSessionRows(
  sessions: readonly AttributedSession[],
  emptyLabel: string
): string[] {
  if (sessions.length === 0) {
    return [`- ${emptyLabel}`];
  }

  return sessions.map((session) => {
    const evidenceKinds =
      session.evidence.length === 0
        ? "none"
        : session.evidence.map((evidence) => evidence.kind).join(", ");

    return `- ${formatSessionKey(session.session)} | provider=${session.session.provider} | evidence=${evidenceKinds} | reason=${session.reason}`;
  });
}

export function formatScanReport(result: ScanReportResult): string {
  const includedTotals = collectIncludedTotals(result.attributedSessions);
  const ambiguousSessions = result.attributedSessions.filter(
    (session) => session.status === "ambiguous"
  );
  const excludedSessions = result.attributedSessions.filter(
    (session) => session.status === "excluded"
  );

  return [
    `Repo: ${result.repo.canonicalSlug} (${result.repo.gitRootBasename})`,
    `Scanned Sessions: ${result.counts.scannedSessions}`,
    `Deduped Sessions: ${result.counts.dedupedSessions}`,
    ...formatOverrideActions(result.overrideActions),
    "",
    "Included Totals",
    `- Combined: ${includedTotals.combined.sessions} sessions, ${includedTotals.combined.tokens} tokens`,
    `- codex: ${includedTotals.byProvider.codex.sessions} sessions, ${includedTotals.byProvider.codex.tokens} tokens`,
    `- claude: ${includedTotals.byProvider.claude.sessions} sessions, ${includedTotals.byProvider.claude.tokens} tokens`,
    `- Counts: included=${result.counts.included}, ambiguous=${result.counts.ambiguous}, excluded=${result.counts.excluded}`,
    "",
    "Ambiguous Sessions",
    ...formatSessionRows(
      ambiguousSessions,
      "No ambiguous sessions for the current repo."
    ),
    "",
    "Excluded Sessions",
    ...formatSessionRows(
      excludedSessions,
      "No excluded sessions for the current repo."
    )
  ].join("\n");
}
