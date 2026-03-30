import { describe, expect, it } from "vitest";

import {
  parseNormalizedSessionSummary,
  type NormalizedSessionSummary
} from "../providers/session-summary.js";
import type { RepoFingerprint } from "../repo/repo-fingerprint.js";
import {
  defaultAgentBadgeState,
  type AgentBadgeState
} from "../state/state-schema.js";

import { attributeBackfillSessions } from "./attribution-engine.js";
import {
  applyAmbiguousSessionDecision,
  buildAmbiguousSessionKey,
  readAmbiguousSessionOverride
} from "./override-store.js";

function createRepoFingerprint(
  overrides: Partial<RepoFingerprint> = {}
): RepoFingerprint {
  return {
    gitRoot: "/Volumes/git/legotin/agent-badge",
    gitRootRealPath: "/Volumes/git/legotin/agent-badge",
    gitRootBasename: "agent-badge",
    originUrlRaw: "https://github.com/openai/agent-badge.git",
    originUrlNormalized: "https://github.com/openai/agent-badge",
    host: "github.com",
    owner: "openai",
    repo: "agent-badge",
    canonicalSlug: "openai/agent-badge",
    aliasRemoteUrlsNormalized: ["https://github.com/legotin/agent-badge"],
    aliasSlugs: ["openai/agent-badge"],
    ...overrides
  };
}

function createSession(
  overrides: Partial<NormalizedSessionSummary> &
    Pick<NormalizedSessionSummary, "provider" | "providerSessionId">
): NormalizedSessionSummary {
  const {
    provider,
    providerSessionId,
    attributionHints,
    tokenUsage,
    lineage,
    metadata,
    ...topLevelOverrides
  } = overrides;

  return parseNormalizedSessionSummary({
    provider,
    providerSessionId,
    startedAt: "2026-03-29T10:00:00.000Z",
    updatedAt: "2026-03-29T10:10:00.000Z",
    cwd: null,
    gitBranch: "main",
    observedRemoteUrl: null,
    observedRemoteUrlNormalized: null,
    ...topLevelOverrides,
    attributionHints: {
      cwdRealPath: null,
      transcriptProjectKey: null,
      ...attributionHints
    },
    tokenUsage: {
      total: 0,
      input: null,
      output: null,
      cacheCreation: null,
      cacheRead: null,
      reasoningOutput: null,
      ...tokenUsage
    },
    lineage: {
      parentSessionId: null,
      kind: "root",
      ...lineage
    },
    metadata: {
      model: "test-model",
      modelProvider: "test-provider",
      sourceKind: "test",
      cliVersion: null,
      ...metadata
    }
  });
}

function includedTokenTotal(
  sessions: ReturnType<typeof attributeBackfillSessions>["sessions"]
): number {
  return sessions
    .filter((session) => session.status === "included")
    .reduce((sum, session) => sum + session.session.tokenUsage.total, 0);
}

describe("attributeBackfillSessions", () => {
  const repo = createRepoFingerprint();
  const repoProjectKey = repo.gitRootRealPath.replace(/[:\\/]+/g, "-");

  it("prefers repo-root over remote-only evidence", () => {
    const session = createSession({
      provider: "codex",
      providerSessionId: "repo-root-preferred",
      observedRemoteUrlNormalized: repo.originUrlNormalized,
      attributionHints: {
        cwdRealPath: repo.gitRootRealPath,
        transcriptProjectKey: null
      }
    });

    const result = attributeBackfillSessions({
      repo,
      sessions: [session],
      overrides: {}
    });

    expect(result.sessions[0]).toMatchObject({
      status: "included",
      reason: "Included because cwdRealPath exactly matches repo.gitRootRealPath",
      overrideApplied: null
    });
    expect(result.sessions[0]?.evidence.map((evidence) => evidence.kind)).toEqual([
      "repo-root",
      "git-remote"
    ]);
  });

  it("prefers normalized remote over cwd-only evidence", () => {
    const session = createSession({
      provider: "codex",
      providerSessionId: "remote-preferred",
      observedRemoteUrlNormalized: repo.aliasRemoteUrlsNormalized[0],
      attributionHints: {
        cwdRealPath: `${repo.gitRootRealPath}/packages/core`,
        transcriptProjectKey: null
      }
    });

    const result = attributeBackfillSessions({
      repo,
      sessions: [session],
      overrides: {}
    });

    expect(result.sessions[0]).toMatchObject({
      status: "included",
      reason:
        "Included because observedRemoteUrlNormalized matches repo.originUrlNormalized or an alias remote",
      overrideApplied: null
    });
    expect(result.sessions[0]?.evidence.map((evidence) => evidence.kind)).toEqual([
      "git-remote",
      "normalized-cwd"
    ]);
  });

  it("marks ambiguous sessions excluded from included totals", () => {
    const includedSession = createSession({
      provider: "codex",
      providerSessionId: "included-session",
      observedRemoteUrlNormalized: repo.originUrlNormalized,
      tokenUsage: {
        total: 42,
        input: null,
        output: null,
        cacheCreation: null,
        cacheRead: null,
        reasoningOutput: null
      }
    });
    const ambiguousSession = createSession({
      provider: "claude",
      providerSessionId: "ambiguous-session",
      attributionHints: {
        cwdRealPath: `${repo.gitRootRealPath}/docs`,
        transcriptProjectKey: null
      },
      tokenUsage: {
        total: 900,
        input: null,
        output: null,
        cacheCreation: null,
        cacheRead: null,
        reasoningOutput: null
      }
    });

    const result = attributeBackfillSessions({
      repo,
      sessions: [includedSession, ambiguousSession],
      overrides: {}
    });

    expect(result.counts).toEqual({
      included: 1,
      ambiguous: 1,
      excluded: 0
    });
    expect(result.sessions[1]).toMatchObject({
      status: "ambiguous",
      reason: "Ambiguous because only weak evidence matched the current repo"
    });
    expect(includedTokenTotal(result.sessions)).toBe(42);
  });

  it("reuses stored include and exclude overrides", () => {
    const includeSession = createSession({
      provider: "codex",
      providerSessionId: "override-include",
      attributionHints: {
        cwdRealPath: `${repo.gitRootRealPath}/packages/core`,
        transcriptProjectKey: null
      }
    });
    const excludeSession = createSession({
      provider: "claude",
      providerSessionId: "override-exclude",
      attributionHints: {
        cwdRealPath: null,
        transcriptProjectKey: repoProjectKey
      }
    });

    let state: AgentBadgeState = defaultAgentBadgeState;
    state = applyAmbiguousSessionDecision(
      state,
      buildAmbiguousSessionKey(includeSession),
      "include"
    );
    state = applyAmbiguousSessionDecision(
      state,
      buildAmbiguousSessionKey(excludeSession),
      "exclude"
    );

    expect(readAmbiguousSessionOverride(state, includeSession)).toBe("include");
    expect(readAmbiguousSessionOverride(state, excludeSession)).toBe("exclude");

    const firstRun = attributeBackfillSessions({
      repo,
      sessions: [includeSession, excludeSession],
      overrides: state.overrides.ambiguousSessions
    });
    const secondRun = attributeBackfillSessions({
      repo,
      sessions: [includeSession, excludeSession],
      overrides: state.overrides.ambiguousSessions
    });

    expect(firstRun.sessions.map((session) => session.status)).toEqual([
      "included",
      "excluded"
    ]);
    expect(secondRun.sessions.map((session) => session.status)).toEqual([
      "included",
      "excluded"
    ]);
    expect(firstRun.sessions[0]).toMatchObject({
      reason: "Ambiguous because only weak evidence matched the current repo",
      overrideApplied: "include"
    });
    expect(firstRun.sessions[1]).toMatchObject({
      reason: "Ambiguous because only weak evidence matched the current repo",
      overrideApplied: "exclude"
    });
  });

  it("does not persist raw cwd or transcript values in override keys", () => {
    const session = createSession({
      provider: "claude",
      providerSessionId: "privacy-safe-key",
      attributionHints: {
        cwdRealPath: "/Users/example/private/repo",
        transcriptProjectKey: "-Users-example-private-repo"
      }
    });

    const nextState = applyAmbiguousSessionDecision(
      defaultAgentBadgeState,
      buildAmbiguousSessionKey(session),
      "include"
    );
    const [storedKey] = Object.keys(nextState.overrides.ambiguousSessions);

    expect(storedKey).toBe("claude:privacy-safe-key");
    expect(storedKey).not.toContain("/Users/example/private/repo");
    expect(storedKey).not.toContain("-Users-example-private-repo");
  });
});
