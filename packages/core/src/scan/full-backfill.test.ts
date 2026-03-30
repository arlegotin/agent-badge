import { execFile } from "node:child_process";
import { cp, realpath } from "node:fs/promises";
import { promisify } from "node:util";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  parseNormalizedSessionSummary,
  type NormalizedSessionSummary
} from "../providers/session-summary.js";

const execFileAsync = promisify(execFile);
const testkitModuleName = "@agent-badge/testkit";

const { scanCodexSessionsMock, scanClaudeSessionsMock } = vi.hoisted(() => ({
  scanCodexSessionsMock: vi.fn(),
  scanClaudeSessionsMock: vi.fn()
}));

vi.mock("../providers/codex/codex-adapter.js", async () => {
  const actual = await vi.importActual<
    typeof import("../providers/codex/codex-adapter.js")
  >("../providers/codex/codex-adapter.js");

  return {
    ...actual,
    scanCodexSessions: scanCodexSessionsMock
  };
});

vi.mock("../providers/claude/claude-adapter.js", async () => {
  const actual = await vi.importActual<
    typeof import("../providers/claude/claude-adapter.js")
  >("../providers/claude/claude-adapter.js");

  return {
    ...actual,
    scanClaudeSessions: scanClaudeSessionsMock
  };
});

import { runFullBackfillScan } from "./full-backfill.js";

interface ProviderFixture {
  readonly homeRoot: string;
  readonly codexRoot: string | null;
  readonly claudeRoot: string | null;
  cleanup(): Promise<void>;
}

interface RepoFixture {
  readonly root: string;
  cleanup(): Promise<void>;
}

interface TestkitModule {
  createCodexFixtureHome(): Promise<ProviderFixture>;
  createClaudeFixtureHome(): Promise<ProviderFixture>;
  createProviderFixture(): Promise<ProviderFixture>;
  createRepoFixture(): Promise<RepoFixture>;
}

interface BackfillFixture {
  readonly repo: RepoFixture;
  readonly providerHome: ProviderFixture;
  cleanup(): Promise<void>;
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
    startedAt: null,
    updatedAt: null,
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

async function loadTestkit(): Promise<TestkitModule> {
  return (await import(testkitModuleName)) as TestkitModule;
}

async function createBackfillFixture(): Promise<BackfillFixture> {
  const testkit = await loadTestkit();
  const [repo, providerHome, codexFixture, claudeFixture] = await Promise.all([
    testkit.createRepoFixture(),
    testkit.createProviderFixture(),
    testkit.createCodexFixtureHome(),
    testkit.createClaudeFixtureHome()
  ]);

  try {
    await execFileAsync(
      "git",
      ["remote", "add", "origin", "https://github.com/openai/agent-badge.git"],
      { cwd: repo.root }
    );

    if (
      providerHome.codexRoot === null ||
      providerHome.claudeRoot === null ||
      codexFixture.codexRoot === null ||
      claudeFixture.claudeRoot === null
    ) {
      throw new Error("Combined provider fixture roots were not created.");
    }

    await Promise.all([
      cp(codexFixture.codexRoot, providerHome.codexRoot, {
        recursive: true,
        force: true
      }),
      cp(claudeFixture.claudeRoot, providerHome.claudeRoot, {
        recursive: true,
        force: true
      })
    ]);

    return {
      repo,
      providerHome,
      async cleanup() {
        await Promise.allSettled([
          repo.cleanup(),
          providerHome.cleanup(),
          codexFixture.cleanup(),
          claudeFixture.cleanup()
        ]);
      }
    };
  } catch (error) {
    await Promise.allSettled([
      repo.cleanup(),
      providerHome.cleanup(),
      codexFixture.cleanup(),
      claudeFixture.cleanup()
    ]);
    throw error;
  }
}

async function withBackfillFixture<T>(
  callback: (fixture: BackfillFixture) => Promise<T>
): Promise<T> {
  const fixture = await createBackfillFixture();

  try {
    return await callback(fixture);
  } finally {
    await fixture.cleanup();
  }
}

beforeEach(async () => {
  scanCodexSessionsMock.mockReset();
  scanClaudeSessionsMock.mockReset();

  const [actualCodex, actualClaude] = await Promise.all([
    vi.importActual<typeof import("../providers/codex/codex-adapter.js")>(
      "../providers/codex/codex-adapter.js"
    ),
    vi.importActual<typeof import("../providers/claude/claude-adapter.js")>(
      "../providers/claude/claude-adapter.js"
    )
  ]);

  scanCodexSessionsMock.mockImplementation(actualCodex.scanCodexSessions);
  scanClaudeSessionsMock.mockImplementation(actualClaude.scanClaudeSessions);
});

describe("runFullBackfillScan", () => {
  it("dedupes by provider plus providerSessionId", async () => {
    await withBackfillFixture(async ({ providerHome, repo }) => {
      scanCodexSessionsMock.mockResolvedValueOnce([
        createSession({
          provider: "codex",
          providerSessionId: "shared-session",
          cwd: repo.root,
          lineage: {
            parentSessionId: null,
            kind: "root"
          }
        }),
        createSession({
          provider: "codex",
          providerSessionId: "shared-session",
          cwd: repo.root,
          lineage: {
            parentSessionId: null,
            kind: "root"
          }
        }),
        createSession({
          provider: "codex",
          providerSessionId: "thread-child",
          lineage: {
            parentSessionId: "shared-session",
            kind: "child"
          }
        })
      ]);
      scanClaudeSessionsMock.mockResolvedValueOnce([
        createSession({
          provider: "claude",
          providerSessionId: "shared-session",
          attributionHints: {
            cwdRealPath: null,
            transcriptProjectKey: "project-with-index"
          }
        })
      ]);

      const result = await runFullBackfillScan({
        cwd: repo.root,
        homeRoot: providerHome.homeRoot,
        config: {
          providers: {
            codex: {
              enabled: true
            },
            claude: {
              enabled: true
            }
          },
          repo: {
            aliases: {
              remotes: [],
              slugs: []
            }
          }
        }
      });
      const repoRealPath = await realpath(repo.root);
      const codexSessionIds = result.sessions
        .filter((session) => session.provider === "codex")
        .map((session) => session.providerSessionId);
      const dedupedCodexShared = result.sessions.find(
        (session) =>
          session.provider === "codex" &&
          session.providerSessionId === "shared-session"
      );
      const childSession = result.sessions.find(
        (session) =>
          session.provider === "codex" &&
          session.providerSessionId === "thread-child"
      );

      expect(result.sessions).toHaveLength(3);
      expect(codexSessionIds).toEqual(["shared-session", "thread-child"]);
      expect(
        result.sessions.filter(
          (session) => session.providerSessionId === "shared-session"
        )
      ).toHaveLength(2);
      expect(dedupedCodexShared?.attributionHints.cwdRealPath).toBe(repoRealPath);
      expect(childSession?.lineage).toEqual({
        parentSessionId: "shared-session",
        kind: "child"
      });
      expect(result.counts).toMatchObject({
        scannedSessions: 4,
        dedupedSessions: 3,
        byProvider: {
          codex: {
            scannedSessions: 3,
            dedupedSessions: 2
          },
          claude: {
            scannedSessions: 1,
            dedupedSessions: 1
          }
        }
      });
    });
  });

  it("scans only enabled providers", async () => {
    await withBackfillFixture(async ({ providerHome, repo }) => {
      const result = await runFullBackfillScan({
        cwd: repo.root,
        homeRoot: providerHome.homeRoot,
        config: {
          providers: {
            codex: {
              enabled: false
            },
            claude: {
              enabled: true
            }
          },
          repo: {
            aliases: {
              remotes: [],
              slugs: []
            }
          }
        }
      });

      expect(scanCodexSessionsMock).not.toHaveBeenCalled();
      expect(scanClaudeSessionsMock).toHaveBeenCalledTimes(1);
      expect(result.scannedProviders).toEqual(["claude"]);
      expect(result.sessions.every((session) => session.provider === "claude")).toBe(
        true
      );
      expect(result.counts.byProvider.codex).toEqual({
        scannedSessions: 0,
        dedupedSessions: 0
      });
      expect(result.counts.byProvider.claude.scannedSessions).toBeGreaterThan(0);
    });
  });

  it("preserves provider-separated counts for first-run backfill", async () => {
    await withBackfillFixture(async ({ providerHome, repo }) => {
      const result = await runFullBackfillScan({
        cwd: repo.root,
        homeRoot: providerHome.homeRoot,
        config: {
          providers: {
            codex: {
              enabled: true
            },
            claude: {
              enabled: true
            }
          },
          repo: {
            aliases: {
              remotes: [],
              slugs: []
            }
          }
        }
      });
      const serialized = JSON.stringify(result);

      expect(result.repo.originUrlNormalized).toBe(
        "https://github.com/openai/agent-badge"
      );
      expect(result.scannedProviders).toEqual(["codex", "claude"]);
      expect(result.counts).toMatchObject({
        scannedSessions: 7,
        dedupedSessions: 7,
        byProvider: {
          codex: {
            scannedSessions: 4,
            dedupedSessions: 4
          },
          claude: {
            scannedSessions: 3,
            dedupedSessions: 3
          }
        }
      });
      expect(
        result.sessions.some((session) => session.lineage.kind === "child")
      ).toBe(true);
      expect(serialized).not.toContain("Summarize the repo state");
      expect(serialized).not.toContain("ignored raw text");
    });
  });
});
