import type { NormalizedSessionSummary } from "../providers/session-summary.js";
import type { RepoFingerprint } from "../repo/repo-fingerprint.js";

import type {
  AttributedSession,
  AttributionCounts,
  AttributionEvidence,
  AttributeBackfillSessionsResult
} from "./attribution-types.js";
import { buildAmbiguousSessionKey } from "./override-store.js";

export interface AttributeBackfillSessionsOptions {
  readonly repo: RepoFingerprint;
  readonly sessions: readonly NormalizedSessionSummary[];
  readonly overrides: Record<string, "include" | "exclude">;
}

function buildClaudeProjectKey(realPath: string): string {
  return realPath.replace(/[:\\/]+/g, "-");
}

function matchesRepoRoot(
  session: NormalizedSessionSummary,
  repo: RepoFingerprint
): boolean {
  return session.attributionHints.cwdRealPath === repo.gitRootRealPath;
}

function matchesGitRemote(
  session: NormalizedSessionSummary,
  repo: RepoFingerprint
): boolean {
  if (session.observedRemoteUrlNormalized === null) {
    return false;
  }

  return (
    session.observedRemoteUrlNormalized === repo.originUrlNormalized ||
    repo.aliasRemoteUrlsNormalized.includes(session.observedRemoteUrlNormalized)
  );
}

function matchesNormalizedCwd(
  session: NormalizedSessionSummary,
  repo: RepoFingerprint
): boolean {
  const cwdRealPath = session.attributionHints.cwdRealPath;

  if (cwdRealPath === null || cwdRealPath === repo.gitRootRealPath) {
    return false;
  }

  return (
    cwdRealPath.startsWith(`${repo.gitRootRealPath}/`) ||
    cwdRealPath.startsWith(`${repo.gitRootRealPath}\\`)
  );
}

function matchesTranscriptCorrelation(
  session: NormalizedSessionSummary,
  repo: RepoFingerprint
): boolean {
  const transcriptProjectKey = session.attributionHints.transcriptProjectKey;

  if (transcriptProjectKey === null) {
    return false;
  }

  return transcriptProjectKey === buildClaudeProjectKey(repo.gitRootRealPath);
}

function buildEvidence(
  session: NormalizedSessionSummary,
  repo: RepoFingerprint
): {
  evidence: AttributionEvidence[];
  repoRootMatched: boolean;
  gitRemoteMatched: boolean;
  normalizedCwdMatched: boolean;
  transcriptMatched: boolean;
  hasConflictingWeakEvidence: boolean;
} {
  const evidence: AttributionEvidence[] = [];
  const repoRootMatched = matchesRepoRoot(session, repo);
  const gitRemoteMatched = matchesGitRemote(session, repo);
  const normalizedCwdMatched = matchesNormalizedCwd(session, repo);
  const transcriptMatched = matchesTranscriptCorrelation(session, repo);

  if (session.attributionHints.cwdRealPath !== null) {
    evidence.push({
      kind: repoRootMatched ? "repo-root" : "normalized-cwd",
      matched: repoRootMatched || normalizedCwdMatched,
      detail: repoRootMatched
        ? "cwd realpath exactly matches repo.gitRootRealPath"
        : normalizedCwdMatched
          ? "cwd realpath is nested beneath repo.gitRootRealPath"
          : "cwd realpath does not resolve inside the current repo"
    });
  }

  if (session.observedRemoteUrlNormalized !== null) {
    evidence.push({
      kind: "git-remote",
      matched: gitRemoteMatched,
      detail: gitRemoteMatched
        ? "observedRemoteUrlNormalized matches repo.originUrlNormalized or an alias remote"
        : "observedRemoteUrlNormalized does not match repo.originUrlNormalized or any alias remote"
    });
  }

  if (session.attributionHints.transcriptProjectKey !== null) {
    evidence.push({
      kind: "transcript-correlation",
      matched: transcriptMatched,
      detail: transcriptMatched
        ? "transcriptProjectKey matches the current repo realpath rewritten into Claude's project-key form"
        : "transcriptProjectKey does not match the current repo realpath rewritten into Claude's project-key form"
    });
  }

  return {
    evidence,
    repoRootMatched,
    gitRemoteMatched,
    normalizedCwdMatched,
    transcriptMatched,
    hasConflictingWeakEvidence:
      (normalizedCwdMatched &&
        session.attributionHints.transcriptProjectKey !== null &&
        !transcriptMatched) ||
      (transcriptMatched &&
        session.attributionHints.cwdRealPath !== null &&
        !repoRootMatched &&
        !normalizedCwdMatched)
  };
}

function determineRawDecision(
  session: NormalizedSessionSummary,
  repo: RepoFingerprint
): Omit<AttributedSession, "session" | "overrideApplied"> {
  const {
    evidence,
    repoRootMatched,
    gitRemoteMatched,
    normalizedCwdMatched,
    transcriptMatched,
    hasConflictingWeakEvidence
  } = buildEvidence(session, repo);

  if (repoRootMatched) {
    return {
      status: "included",
      evidence,
      reason: "Included because cwdRealPath exactly matches repo.gitRootRealPath"
    };
  }

  if (gitRemoteMatched) {
    return {
      status: "included",
      evidence,
      reason:
        "Included because observedRemoteUrlNormalized matches repo.originUrlNormalized or an alias remote"
    };
  }

  if (normalizedCwdMatched || transcriptMatched) {
    return {
      status: "ambiguous",
      evidence,
      reason: hasConflictingWeakEvidence
        ? "Ambiguous because only weak evidence matched and other weak evidence points away from the current repo"
        : "Ambiguous because only weak evidence matched the current repo"
    };
  }

  return {
    status: "excluded",
    evidence,
    reason: "Excluded because no attribution evidence matched the current repo"
  };
}

function applyOverride(
  session: NormalizedSessionSummary,
  rawDecision: Omit<AttributedSession, "session" | "overrideApplied">,
  overrides: Record<string, "include" | "exclude">
): AttributedSession {
  const sessionKey = buildAmbiguousSessionKey(session);
  const persistedDecision = overrides[sessionKey] ?? null;

  if (persistedDecision === null) {
    return {
      session,
      status: rawDecision.status,
      evidence: rawDecision.evidence,
      reason: rawDecision.reason,
      overrideApplied: null
    };
  }

  return {
    session,
    status: persistedDecision === "include" ? "included" : "excluded",
    evidence: [
      ...rawDecision.evidence,
      {
        kind: "user-override",
        matched: true,
        detail: `Persisted ${persistedDecision} override reused for ${sessionKey}`
      }
    ],
    reason: rawDecision.reason,
    overrideApplied: persistedDecision
  };
}

function createCounts(): AttributionCounts {
  return {
    included: 0,
    ambiguous: 0,
    excluded: 0
  };
}

export function attributeBackfillSessions(
  options: AttributeBackfillSessionsOptions
): AttributeBackfillSessionsResult {
  let counts = createCounts();
  const sessions = options.sessions.map((session) => {
    const attributedSession = applyOverride(
      session,
      determineRawDecision(session, options.repo),
      options.overrides
    );

    counts = {
      ...counts,
      [attributedSession.status]: counts[attributedSession.status] + 1
    };
    return attributedSession;
  });

  return {
    sessions,
    counts
  };
}
