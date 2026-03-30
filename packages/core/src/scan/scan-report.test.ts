import { describe, expect, it } from "vitest";

import { parseNormalizedSessionSummary } from "../providers/session-summary.js";

import { formatScanReport } from "./scan-report.js";

describe("formatScanReport", () => {
  const ambiguousSession = parseNormalizedSessionSummary({
    provider: "codex",
    providerSessionId: "ambiguous-session",
    startedAt: "2026-03-29T10:00:00.000Z",
    updatedAt: "2026-03-29T10:10:00.000Z",
    cwd: "/repo/main",
    gitBranch: "main",
    observedRemoteUrl: "https://github.com/openai/agent-badge.git",
    observedRemoteUrlNormalized: "https://github.com/openai/agent-badge",
    attributionHints: {
      cwdRealPath: "/repo/main",
      transcriptProjectKey: "/tmp/agent-badge-home-private/project-key"
    },
    tokenUsage: {
      total: 40,
      input: 10,
      output: 20,
      cacheCreation: null,
      cacheRead: null,
      reasoningOutput: 10
    },
    lineage: {
      parentSessionId: null,
      kind: "root"
    },
    metadata: {
      model: "test-model",
      modelProvider: "openai",
      sourceKind: "test",
      cliVersion: null
    }
  });

  const excludedSession = parseNormalizedSessionSummary({
    provider: "claude",
    providerSessionId: "excluded-session",
    startedAt: "2026-03-29T11:00:00.000Z",
    updatedAt: "2026-03-29T11:10:00.000Z",
    cwd: "/tmp/agent-badge-home-private/repo",
    gitBranch: "main",
    observedRemoteUrl: null,
    observedRemoteUrlNormalized: null,
    attributionHints: {
      cwdRealPath: "/tmp/agent-badge-home-private/repo",
      transcriptProjectKey: "/tmp/agent-badge-home-private/project-key"
    },
    tokenUsage: {
      total: 30,
      input: 15,
      output: 15,
      cacheCreation: null,
      cacheRead: null,
      reasoningOutput: null
    },
    lineage: {
      parentSessionId: null,
      kind: "root"
    },
    metadata: {
      model: "test-model",
      modelProvider: "anthropic",
      sourceKind: "test",
      cliVersion: null
    }
  });

  const report = formatScanReport({
    repo: {
      canonicalSlug: "openai/agent-badge",
      gitRootBasename: "agent-badge"
    },
    counts: {
      scannedSessions: 3,
      dedupedSessions: 3,
      included: 1,
      ambiguous: 1,
      excluded: 1,
      byProvider: {
        codex: {
          scannedSessions: 1,
          dedupedSessions: 1
        },
        claude: {
          scannedSessions: 2,
          dedupedSessions: 2
        }
      }
    },
    attributedSessions: [
      {
        session: parseNormalizedSessionSummary({
          provider: "codex",
          providerSessionId: "included-session",
          startedAt: "2026-03-29T09:00:00.000Z",
          updatedAt: "2026-03-29T09:10:00.000Z",
          cwd: "/repo/main",
          gitBranch: "main",
          observedRemoteUrl: "https://github.com/openai/agent-badge.git",
          observedRemoteUrlNormalized: "https://github.com/openai/agent-badge",
          attributionHints: {
            cwdRealPath: "/repo/main",
            transcriptProjectKey: null
          },
          tokenUsage: {
            total: 120,
            input: 60,
            output: 60,
            cacheCreation: null,
            cacheRead: null,
            reasoningOutput: null
          },
          lineage: {
            parentSessionId: null,
            kind: "root"
          },
          metadata: {
            model: "test-model",
            modelProvider: "openai",
            sourceKind: "test",
            cliVersion: null
          }
        }),
        status: "included",
        evidence: [
          {
            kind: "repo-root",
            matched: true,
            detail: "/repo/main should stay private"
          }
        ],
        reason: "Included because cwdRealPath exactly matches repo.gitRootRealPath",
        overrideApplied: null
      },
      {
        session: ambiguousSession,
        status: "ambiguous",
        evidence: [
          {
            kind: "normalized-cwd",
            matched: true,
            detail: "/repo/main should stay private"
          },
          {
            kind: "transcript-correlation",
            matched: false,
            detail: "/tmp/agent-badge-home-private/project-key should stay private"
          }
        ],
        reason: "Ambiguous because only weak evidence matched the current repo",
        overrideApplied: null
      },
      {
        session: excludedSession,
        status: "excluded",
        evidence: [
          {
            kind: "transcript-correlation",
            matched: false,
            detail: "/tmp/agent-badge-home-private/project-key should stay private"
          }
        ],
        reason: "Excluded because no attribution evidence matched the current repo",
        overrideApplied: null
      }
    ],
    overrideActions: [
      {
        sessionKey: "codex:ambiguous-session",
        decision: "include"
      }
    ]
  });

  it("prints Included Totals, Ambiguous Sessions, and Excluded Sessions", () => {
    expect(report).toContain("Included Totals");
    expect(report).toContain("Ambiguous Sessions");
    expect(report).toContain("Excluded Sessions");
    expect(report.indexOf("Included Totals")).toBeLessThan(
      report.indexOf("Ambiguous Sessions")
    );
    expect(report.indexOf("Ambiguous Sessions")).toBeLessThan(
      report.indexOf("Excluded Sessions")
    );
  });

  it("prints stable provider:session keys for review rows", () => {
    expect(report).toContain("codex:ambiguous-session");
    expect(report).toContain("claude:excluded-session");
    expect(report).toContain("provider=codex");
    expect(report).toContain("provider=claude");
  });

  it("does not print /repo/main", () => {
    expect(report).not.toContain("/repo/main");
  });

  it("does not print /tmp/agent-badge-home-", () => {
    expect(report).not.toContain("/tmp/agent-badge-home-");
  });
});
