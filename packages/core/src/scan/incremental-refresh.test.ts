import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultAgentBadgeConfig } from "../config/config-schema.js";
import {
  parseNormalizedSessionSummary,
  type NormalizedSessionSummary
} from "../providers/session-summary.js";
import { defaultAgentBadgeState } from "../state/state-schema.js";
import {
  buildRefreshCacheEntry,
  buildRefreshCacheKey,
  defaultRefreshCache,
  writeRefreshCache
} from "./refresh-cache.js";

const {
  attributeBackfillSessionsMock,
  resolveRepoFingerprintMock,
  runFullBackfillScanMock,
  scanClaudeSessionsIncrementalMock,
  scanCodexSessionsIncrementalMock
} = vi.hoisted(() => ({
  attributeBackfillSessionsMock: vi.fn(),
  resolveRepoFingerprintMock: vi.fn(),
  runFullBackfillScanMock: vi.fn(),
  scanClaudeSessionsIncrementalMock: vi.fn(),
  scanCodexSessionsIncrementalMock: vi.fn()
}));

vi.mock("../attribution/attribution-engine.js", async () => {
  const actual = await vi.importActual<
    typeof import("../attribution/attribution-engine.js")
  >("../attribution/attribution-engine.js");

  return {
    ...actual,
    attributeBackfillSessions: attributeBackfillSessionsMock
  };
});

vi.mock("../providers/codex/codex-adapter.js", async () => {
  const actual = await vi.importActual<
    typeof import("../providers/codex/codex-adapter.js")
  >("../providers/codex/codex-adapter.js");

  return {
    ...actual,
    scanCodexSessionsIncremental: scanCodexSessionsIncrementalMock
  };
});

vi.mock("../providers/claude/claude-adapter.js", async () => {
  const actual = await vi.importActual<
    typeof import("../providers/claude/claude-adapter.js")
  >("../providers/claude/claude-adapter.js");

  return {
    ...actual,
    scanClaudeSessionsIncremental: scanClaudeSessionsIncrementalMock
  };
});

vi.mock("../repo/repo-fingerprint.js", async () => {
  const actual = await vi.importActual<
    typeof import("../repo/repo-fingerprint.js")
  >("../repo/repo-fingerprint.js");

  return {
    ...actual,
    resolveRepoFingerprint: resolveRepoFingerprintMock
  };
});

vi.mock("./full-backfill.js", async () => {
  const actual = await vi.importActual<typeof import("./full-backfill.js")>(
    "./full-backfill.js"
  );

  return {
    ...actual,
    runFullBackfillScan: runFullBackfillScanMock
  };
});

import { runIncrementalRefresh } from "./incremental-refresh.js";

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
    startedAt: "2026-03-30T10:00:00Z",
    updatedAt: "2026-03-30T10:05:00Z",
    cwd: null,
    gitBranch: null,
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
      kind: "unknown",
      ...lineage
    },
    metadata: {
      model: null,
      modelProvider: null,
      sourceKind: "test",
      cliVersion: null,
      ...metadata
    }
  });
}

function createRepoFingerprint() {
  return {
    gitRoot: "/tmp/agent-badge-repo",
    gitRootRealPath: "/tmp/agent-badge-repo",
    gitRootBasename: "agent-badge-repo",
    originUrlRaw: "git@github.com:example/agent-badge.git",
    originUrlNormalized: "https://github.com/example/agent-badge",
    host: "github.com",
    owner: "example",
    repo: "agent-badge",
    canonicalSlug: "example/agent-badge",
    aliasRemoteUrlsNormalized: [],
    aliasSlugs: []
  };
}

function createAttributedSession(
  session: NormalizedSessionSummary,
  status: "included" | "ambiguous" | "excluded",
  overrideApplied: "include" | "exclude" | null = null
) {
  return {
    session,
    status,
    evidence: [],
    reason: `${status} for test`,
    overrideApplied
  };
}

async function withTempDir<T>(callback: (cwd: string) => Promise<T>): Promise<T> {
  const cwd = await mkdtemp(join(tmpdir(), "agent-badge-refresh-"));

  try {
    return await callback(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

beforeEach(() => {
  attributeBackfillSessionsMock.mockReset();
  resolveRepoFingerprintMock.mockReset();
  runFullBackfillScanMock.mockReset();
  scanClaudeSessionsIncrementalMock.mockReset();
  scanCodexSessionsIncrementalMock.mockReset();
});

describe("runIncrementalRefresh", () => {
  it("falls back to a full scan when the derived cache is missing", async () => {
    const fullSession = createSession({
      provider: "codex",
      providerSessionId: "codex-full",
      tokenUsage: {
        total: 42,
        input: 42,
        output: 0,
        cacheCreation: null,
        cacheRead: null,
        reasoningOutput: null
      }
    });

    runFullBackfillScanMock.mockResolvedValue({
      repo: createRepoFingerprint(),
      sessions: [fullSession],
      scannedProviders: ["codex"],
      counts: {
        scannedSessions: 1,
        dedupedSessions: 1,
        byProvider: {
          codex: {
            scannedSessions: 1,
            dedupedSessions: 1
          },
          claude: {
            scannedSessions: 0,
            dedupedSessions: 0
          }
        }
      }
    });
    attributeBackfillSessionsMock.mockReturnValue({
      sessions: [createAttributedSession(fullSession, "included")],
      counts: {
        included: 1,
        ambiguous: 0,
        excluded: 0
      }
    });

    await withTempDir(async (cwd) => {
      const result = await runIncrementalRefresh({
        cwd,
        homeRoot: "/tmp/home",
        config: {
          providers: defaultAgentBadgeConfig.providers,
          repo: defaultAgentBadgeConfig.repo
        },
        state: {
          ...defaultAgentBadgeState,
          checkpoints: {
            codex: {
              cursor: "opaque-codex",
              lastScannedAt: "2026-03-30T11:00:00Z"
            },
            claude: {
              cursor: "opaque-claude",
              lastScannedAt: "2026-03-30T11:00:00Z"
            }
          }
        },
        forceFull: false
      });

      expect(runFullBackfillScanMock).toHaveBeenCalledOnce();
      expect(result.scanMode).toBe("full");
      expect(result.summary).toEqual({
        includedSessions: 1,
        includedTokens: 42,
        includedEstimatedCostUsdMicros: null,
        ambiguousSessions: 0,
        excludedSessions: 0
      });
      expect(result.cache.entries["codex:codex-full"]).toEqual(
        expect.objectContaining({
          sessionUpdatedAt: "2026-03-30T10:05:00Z",
          status: "included",
          overrideDecision: null,
          tokens: 42,
          estimatedCostUsdMicros: null
        })
      );
      expect(result.providerCursors.codex).toContain("codex-thread-watermark-v1");
      expect(result.providerCursors.claude).toContain(
        "claude-project-jsonl-watermark-v1"
      );
    });
  });

  it("merges ambiguous sessions into the cache without zeroing their tokens", async () => {
    const changedCodexSession = createSession({
      provider: "codex",
      providerSessionId: "codex-1",
      tokenUsage: {
        total: 84,
        input: 84,
        output: 0,
        cacheCreation: null,
        cacheRead: null,
        reasoningOutput: null
      }
    });
    const ambiguousClaudeSession = createSession({
      provider: "claude",
      providerSessionId: "claude-1",
      tokenUsage: {
        total: 15,
        input: 15,
        output: 0,
        cacheCreation: null,
        cacheRead: null,
        reasoningOutput: null
      }
    });

    resolveRepoFingerprintMock.mockResolvedValue(createRepoFingerprint());
    scanCodexSessionsIncrementalMock.mockResolvedValue({
      sessions: [changedCodexSession],
      cursor: "codex-next",
      mode: "incremental"
    });
    scanClaudeSessionsIncrementalMock.mockResolvedValue({
      sessions: [ambiguousClaudeSession],
      cursor: "claude-next",
      mode: "incremental"
    });
    attributeBackfillSessionsMock.mockReturnValue({
      sessions: [
        createAttributedSession(changedCodexSession, "included"),
        createAttributedSession(ambiguousClaudeSession, "ambiguous", "include")
      ],
      counts: {
        included: 1,
        ambiguous: 1,
        excluded: 0
      }
    });

    await withTempDir(async (cwd) => {
      await writeRefreshCache({
        cwd,
        cache: {
          ...defaultRefreshCache,
          entries: {
            [buildRefreshCacheKey(changedCodexSession)]: buildRefreshCacheEntry({
              session: {
                ...changedCodexSession,
                tokenUsage: {
                  ...changedCodexSession.tokenUsage,
                  total: 21
                }
              },
              status: "included",
              overrideDecision: null,
              estimatedCostUsdMicros: null
            }),
            [buildRefreshCacheKey(ambiguousClaudeSession)]: buildRefreshCacheEntry({
              session: ambiguousClaudeSession,
              status: "ambiguous",
              overrideDecision: null,
              estimatedCostUsdMicros: null
            })
          }
        }
      });

      const result = await runIncrementalRefresh({
        cwd,
        homeRoot: "/tmp/home",
        config: {
          providers: defaultAgentBadgeConfig.providers,
          repo: defaultAgentBadgeConfig.repo
        },
        state: {
          ...defaultAgentBadgeState,
          overrides: {
            ambiguousSessions: {
              "claude:claude-1": "include"
            }
          },
          checkpoints: {
            codex: {
              cursor: "opaque-codex",
              lastScannedAt: "2026-03-30T11:00:00Z"
            },
            claude: {
              cursor: "opaque-claude",
              lastScannedAt: "2026-03-30T11:00:00Z"
            }
          }
        },
        forceFull: false
      });

      expect(runFullBackfillScanMock).not.toHaveBeenCalled();
      expect(result.scanMode).toBe("incremental");
      expect(result.providerCursors).toEqual({
        codex: "codex-next",
        claude: "claude-next"
      });
      expect(result.summary).toEqual({
        includedSessions: 1,
        includedTokens: 84,
        includedEstimatedCostUsdMicros: null,
        ambiguousSessions: 1,
        excludedSessions: 0
      });
      expect(result.cache.entries["codex:codex-1"]).toEqual(
        expect.objectContaining({
          sessionUpdatedAt: "2026-03-30T10:05:00Z",
          status: "included",
          overrideDecision: null,
          tokens: 84,
          estimatedCostUsdMicros: null
        })
      );
      expect(result.cache.entries["claude:claude-1"]).toEqual(
        expect.objectContaining({
          sessionUpdatedAt: "2026-03-30T10:05:00Z",
          status: "ambiguous",
          overrideDecision: "include",
          tokens: 15,
          estimatedCostUsdMicros: null
        })
      );
    });
  });

  it("persists explicit include or exclude overrides into cache entries", async () => {
    const ambiguousCodexSession = createSession({
      provider: "codex",
      providerSessionId: "codex-override",
      tokenUsage: {
        total: 9,
        input: 9,
        output: 0,
        cacheCreation: null,
        cacheRead: null,
        reasoningOutput: null
      }
    });
    const ambiguousClaudeSession = createSession({
      provider: "claude",
      providerSessionId: "claude-override",
      tokenUsage: {
        total: 13,
        input: 13,
        output: 0,
        cacheCreation: null,
        cacheRead: null,
        reasoningOutput: null
      }
    });

    resolveRepoFingerprintMock.mockResolvedValue(createRepoFingerprint());
    scanCodexSessionsIncrementalMock.mockResolvedValue({
      sessions: [ambiguousCodexSession],
      cursor: "codex-next",
      mode: "incremental"
    });
    scanClaudeSessionsIncrementalMock.mockResolvedValue({
      sessions: [ambiguousClaudeSession],
      cursor: "claude-next",
      mode: "incremental"
    });
    attributeBackfillSessionsMock.mockReturnValue({
      sessions: [
        createAttributedSession(ambiguousCodexSession, "ambiguous"),
        createAttributedSession(ambiguousClaudeSession, "ambiguous")
      ],
      counts: {
        included: 0,
        ambiguous: 2,
        excluded: 0
      }
    });

    await withTempDir(async (cwd) => {
      await writeRefreshCache({
        cwd,
        cache: defaultRefreshCache
      });

      const result = await runIncrementalRefresh({
        cwd,
        homeRoot: "/tmp/home",
        config: {
          providers: defaultAgentBadgeConfig.providers,
          repo: defaultAgentBadgeConfig.repo
        },
        state: {
          ...defaultAgentBadgeState,
          overrides: {
            ambiguousSessions: {
              "codex:codex-override": "include",
              "claude:claude-override": "exclude"
            }
          },
          checkpoints: {
            codex: {
              cursor: "opaque-codex",
              lastScannedAt: "2026-03-30T11:00:00Z"
            },
            claude: {
              cursor: "opaque-claude",
              lastScannedAt: "2026-03-30T11:00:00Z"
            }
          }
        },
        forceFull: false
      });

      expect(result.cache.entries["codex:codex-override"]).toEqual(
        expect.objectContaining({
          overrideDecision: "include",
          tokens: 9
        })
      );
      expect(result.cache.entries["claude:claude-override"]).toEqual(
        expect.objectContaining({
          overrideDecision: "exclude",
          tokens: 13
        })
      );
    });
  });

  it("falls back to a full scan when a provider cursor is unusable", async () => {
    const incrementalSession = createSession({
      provider: "codex",
      providerSessionId: "codex-invalid-cursor",
      tokenUsage: {
        total: 5,
        input: 5,
        output: 0,
        cacheCreation: null,
        cacheRead: null,
        reasoningOutput: null
      }
    });
    const fullSession = createSession({
      provider: "codex",
      providerSessionId: "codex-full-after-fallback",
      tokenUsage: {
        total: 12,
        input: 12,
        output: 0,
        cacheCreation: null,
        cacheRead: null,
        reasoningOutput: null
      }
    });

    scanCodexSessionsIncrementalMock.mockResolvedValue({
      sessions: [incrementalSession],
      cursor: "codex-rebuilt",
      mode: "full"
    });
    runFullBackfillScanMock.mockResolvedValue({
      repo: createRepoFingerprint(),
      sessions: [fullSession],
      scannedProviders: ["codex"],
      counts: {
        scannedSessions: 1,
        dedupedSessions: 1,
        byProvider: {
          codex: {
            scannedSessions: 1,
            dedupedSessions: 1
          },
          claude: {
            scannedSessions: 0,
            dedupedSessions: 0
          }
        }
      }
    });
    attributeBackfillSessionsMock.mockReturnValue({
      sessions: [createAttributedSession(fullSession, "excluded")],
      counts: {
        included: 0,
        ambiguous: 0,
        excluded: 1
      }
    });

    await withTempDir(async (cwd) => {
      await writeRefreshCache({
        cwd,
        cache: {
          ...defaultRefreshCache,
          entries: {
            [buildRefreshCacheKey(incrementalSession)]: buildRefreshCacheEntry({
              session: incrementalSession,
              status: "included",
              overrideDecision: null,
              estimatedCostUsdMicros: null
            })
          }
        }
      });

      const result = await runIncrementalRefresh({
        cwd,
        homeRoot: "/tmp/home",
        config: {
          providers: {
            codex: { enabled: true },
            claude: { enabled: false }
          },
          repo: defaultAgentBadgeConfig.repo
        },
        state: {
          ...defaultAgentBadgeState,
          checkpoints: {
            codex: {
              cursor: "opaque-codex",
              lastScannedAt: "2026-03-30T11:00:00Z"
            },
            claude: {
              cursor: null,
              lastScannedAt: null
            }
          }
        },
        forceFull: false
      });

      expect(scanCodexSessionsIncrementalMock).toHaveBeenCalledOnce();
      expect(runFullBackfillScanMock).toHaveBeenCalledOnce();
      expect(result.scanMode).toBe("full");
      expect(result.summary).toEqual({
        includedSessions: 0,
        includedTokens: 0,
        includedEstimatedCostUsdMicros: null,
        ambiguousSessions: 0,
        excludedSessions: 1
      });
      expect(result.cache.entries["codex:codex-full-after-fallback"]).toEqual(
        expect.objectContaining({
          sessionUpdatedAt: "2026-03-30T10:05:00Z",
          status: "excluded",
          overrideDecision: null,
          tokens: 12,
          estimatedCostUsdMicros: null
        })
      );
    });
  });
});
