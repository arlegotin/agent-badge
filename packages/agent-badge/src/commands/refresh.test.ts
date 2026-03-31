import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  appendAgentBadgeLogMock,
  createGitHubGistClientMock,
  publishBadgeIfChangedMock,
  runIncrementalRefreshMock
} = vi.hoisted(() => ({
  appendAgentBadgeLogMock: vi.fn(),
  createGitHubGistClientMock: vi.fn(),
  publishBadgeIfChangedMock: vi.fn(),
  runIncrementalRefreshMock: vi.fn()
}));

vi.mock("@agent-badge/core", async () => {
  const actual = await vi.importActual<typeof import("@agent-badge/core")>(
    "@agent-badge/core"
  );

  return {
    ...actual,
    appendAgentBadgeLog: appendAgentBadgeLogMock,
    createGitHubGistClient: createGitHubGistClientMock,
    publishBadgeIfChanged: publishBadgeIfChangedMock,
    runIncrementalRefresh: runIncrementalRefreshMock
  };
});

import {
  defaultAgentBadgeConfig,
  defaultAgentBadgeState,
  parseAgentBadgeState,
  readRefreshCache,
  type AgentBadgeState
} from "@agent-badge/core";

import { runRefreshCommand } from "./refresh.js";

interface OutputCapture {
  readonly writer: {
    write(chunk: string): void;
  };
  read(): string;
}

interface Fixture {
  readonly repoRoot: string;
  readonly homeRoot: string;
  readonly statePath: string;
  cleanup(): Promise<void>;
}

const originalSystemTime = new Date("2026-03-30T19:00:00.000Z");

function createOutputCapture(): OutputCapture {
  let output = "";

  return {
    writer: {
      write(chunk: string) {
        output += chunk;
      }
    },
    read() {
      return output;
    }
  };
}

async function writeJsonFile(
  root: string,
  relativePath: string,
  value: unknown
): Promise<string> {
  const targetPath = join(root, relativePath);

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");

  return targetPath;
}

async function createFixture(options?: {
  readonly config?: typeof defaultAgentBadgeConfig;
  readonly state?: AgentBadgeState;
}): Promise<Fixture> {
  const [repoRoot, homeRoot] = await Promise.all([
    mkdtemp(join(tmpdir(), "agent-badge-refresh-repo-")),
    mkdtemp(join(tmpdir(), "agent-badge-refresh-home-"))
  ]);
  const statePath = await writeJsonFile(
    repoRoot,
    ".agent-badge/state.json",
    options?.state ?? defaultAgentBadgeState
  );

  await writeJsonFile(
    repoRoot,
    ".agent-badge/config.json",
    options?.config ?? defaultAgentBadgeConfig
  );
  await Promise.all([
    mkdir(join(homeRoot, ".codex"), { recursive: true }),
    mkdir(join(homeRoot, ".claude"), { recursive: true })
  ]);

  return {
    repoRoot,
    homeRoot,
    statePath,
    cleanup() {
      return Promise.allSettled([
        rm(repoRoot, { recursive: true, force: true }),
        rm(homeRoot, { recursive: true, force: true })
      ]).then(() => undefined);
    }
  };
}

async function readStateFile(statePath: string): Promise<AgentBadgeState> {
  return parseAgentBadgeState(JSON.parse(await readFile(statePath, "utf8")));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(originalSystemTime);
  appendAgentBadgeLogMock.mockReset();
  appendAgentBadgeLogMock.mockResolvedValue("log-path");
  createGitHubGistClientMock.mockReset();
  publishBadgeIfChangedMock.mockReset();
  runIncrementalRefreshMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("runRefreshCommand", () => {
  it("rebuilds refresh state with --force-full", async () => {
    const fixture = await createFixture();
    const output = createOutputCapture();
    const refreshResult = {
      scanMode: "full" as const,
      summary: {
        includedSessions: 3,
        includedTokens: 210,
        ambiguousSessions: 1,
        excludedSessions: 2
      },
      providerCursors: {
        codex: "codex-cursor-next",
        claude: "claude-cursor-next"
      },
      cache: {
        version: 1 as const,
        entries: {
          "codex:session-1": {
            provider: "codex" as const,
            providerSessionId: "session-1",
            updatedAt: "2026-03-30T18:45:00.000Z",
            status: "included" as const,
            includedSessions: 1,
            includedTokens: 210
          }
        }
      }
    };

    runIncrementalRefreshMock.mockResolvedValueOnce(refreshResult);

    try {
      const result = await runRefreshCommand({
        cwd: fixture.repoRoot,
        homeRoot: fixture.homeRoot,
        stdout: output.writer,
        forceFull: true
      });
      const persistedState = await readStateFile(fixture.statePath);
      const cache = await readRefreshCache({ cwd: fixture.repoRoot });

      expect(result.status).toBe("ok");
      expect(runIncrementalRefreshMock).toHaveBeenCalledWith({
        cwd: fixture.repoRoot,
        homeRoot: fixture.homeRoot,
        config: defaultAgentBadgeConfig,
        state: defaultAgentBadgeState,
        forceFull: true
      });
      expect(publishBadgeIfChangedMock).not.toHaveBeenCalled();
      expect(persistedState.refresh).toEqual({
        lastRefreshedAt: "2026-03-30T19:00:00.000Z",
        lastScanMode: "full",
        lastPublishDecision: "not-configured",
        summary: refreshResult.summary
      });
      expect(persistedState.checkpoints.codex.cursor).toBe("codex-cursor-next");
      expect(persistedState.checkpoints.claude.cursor).toBe("claude-cursor-next");
      expect(cache).toEqual(refreshResult.cache);
      expect(output.read()).toContain("agent-badge refresh");
      expect(output.read()).toContain("- Scan mode: full");
      expect(output.read()).toContain("- Totals: 3 sessions, 210 tokens");
      expect(output.read()).toContain("- Publish: not configured");
      expect(appendAgentBadgeLogMock).toHaveBeenCalledWith({
        cwd: fixture.repoRoot,
        entry: expect.objectContaining({
          operation: "refresh",
          status: "skipped",
          counts: {
            scannedSessions: 6,
            attributedSessions: 3,
            ambiguousSessions: 1,
            publishedRecords: 0
          }
        })
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("publishes when badge configuration exists", async () => {
    const configuredConfig = {
      ...defaultAgentBadgeConfig,
      publish: {
        ...defaultAgentBadgeConfig.publish,
        gistId: "gist_123",
        badgeUrl:
          "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_123%2Fraw%2Fagent-badge.json&cacheSeconds=300"
      }
    };
    const fixture = await createFixture({
      config: configuredConfig
    });
    const output = createOutputCapture();
    const gistClient = {
      getGist: vi.fn(),
      createPublicGist: vi.fn(),
      updateGistFile: vi.fn()
    };
    const refreshResult = {
      scanMode: "incremental" as const,
      summary: {
        includedSessions: 4,
        includedTokens: 480,
        ambiguousSessions: 0,
        excludedSessions: 1
      },
      providerCursors: {
        codex: "codex-next",
        claude: "claude-next"
      },
      cache: {
        version: 1 as const,
        entries: {}
      }
    };

    runIncrementalRefreshMock.mockResolvedValueOnce(refreshResult);
    publishBadgeIfChangedMock.mockResolvedValueOnce({
      decision: "skipped" as const,
      state: {
        ...defaultAgentBadgeState,
        checkpoints: {
          codex: {
            cursor: "codex-next",
            lastScannedAt: "2026-03-30T19:00:00.000Z"
          },
          claude: {
            cursor: "claude-next",
            lastScannedAt: "2026-03-30T19:00:00.000Z"
          }
        },
        publish: {
          status: "published" as const,
          gistId: "gist_123",
          lastPublishedHash: "hash_123",
          lastPublishedAt: "2026-03-29T19:00:00.000Z"
        },
        refresh: defaultAgentBadgeState.refresh,
        overrides: defaultAgentBadgeState.overrides,
        init: defaultAgentBadgeState.init,
        version: defaultAgentBadgeState.version
      }
    });

    try {
      const result = await runRefreshCommand({
        cwd: fixture.repoRoot,
        homeRoot: fixture.homeRoot,
        gistClient,
        stdout: output.writer
      });
      const persistedState = await readStateFile(fixture.statePath);

      expect(result.status).toBe("ok");
      expect(publishBadgeIfChangedMock).toHaveBeenCalledWith({
        config: configuredConfig,
        state: expect.objectContaining({
          refresh: {
            lastRefreshedAt: "2026-03-30T19:00:00.000Z",
            lastScanMode: "incremental",
            lastPublishDecision: null,
            summary: refreshResult.summary
          }
        }),
        includedTotals: {
          sessions: 4,
          tokens: 480
        },
        client: gistClient,
        now: "2026-03-30T19:00:00.000Z",
        skipIfUnchanged: true
      });
      expect(persistedState.refresh.lastPublishDecision).toBe("skipped");
      expect(output.read()).toContain("- Publish: skipped");
    } finally {
      await fixture.cleanup();
    }
  });

  it("uses process.env GitHub auth when no explicit env override is passed", async () => {
    const configuredConfig = {
      ...defaultAgentBadgeConfig,
      publish: {
        ...defaultAgentBadgeConfig.publish,
        gistId: "gist_123",
        badgeUrl:
          "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_123%2Fraw%2Fagent-badge.json&cacheSeconds=300"
      }
    };
    const fixture = await createFixture({
      config: configuredConfig
    });
    const output = createOutputCapture();
    const gistClient = {
      getGist: vi.fn(),
      createPublicGist: vi.fn(),
      updateGistFile: vi.fn()
    };
    const refreshResult = {
      scanMode: "incremental" as const,
      summary: {
        includedSessions: 1,
        includedTokens: 10,
        ambiguousSessions: 0,
        excludedSessions: 0
      },
      providerCursors: {
        codex: "codex-next",
        claude: "claude-next"
      },
      cache: {
        version: 1 as const,
        entries: {}
      }
    };

    vi.stubEnv("GH_TOKEN", "process-env-token");
    createGitHubGistClientMock.mockReturnValue(gistClient);
    runIncrementalRefreshMock.mockResolvedValueOnce(refreshResult);
    publishBadgeIfChangedMock.mockResolvedValueOnce({
      decision: "skipped" as const,
      state: {
        ...defaultAgentBadgeState,
        checkpoints: {
          codex: {
            cursor: "codex-next",
            lastScannedAt: "2026-03-30T19:00:00.000Z"
          },
          claude: {
            cursor: "claude-next",
            lastScannedAt: "2026-03-30T19:00:00.000Z"
          }
        },
        publish: {
          ...defaultAgentBadgeState.publish,
          status: "published",
          gistId: "gist_123"
        }
      }
    });

    try {
      await runRefreshCommand({
        cwd: fixture.repoRoot,
        homeRoot: fixture.homeRoot,
        stdout: output.writer
      });

      expect(createGitHubGistClientMock).toHaveBeenCalledWith({
        authToken: "process-env-token"
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("keeps pre-push output concise", async () => {
    const configuredConfig = {
      ...defaultAgentBadgeConfig,
      publish: {
        ...defaultAgentBadgeConfig.publish,
        gistId: "gist_789",
        badgeUrl:
          "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_789%2Fraw%2Fagent-badge.json&cacheSeconds=300"
      }
    };
    const fixture = await createFixture({
      config: configuredConfig
    });
    const output = createOutputCapture();
    const refreshResult = {
      scanMode: "incremental" as const,
      summary: {
        includedSessions: 2,
        includedTokens: 140,
        ambiguousSessions: 0,
        excludedSessions: 0
      },
      providerCursors: {
        codex: "codex-concise",
        claude: "claude-concise"
      },
      cache: {
        version: 1 as const,
        entries: {}
      }
    };

    runIncrementalRefreshMock.mockResolvedValueOnce(refreshResult);
    publishBadgeIfChangedMock.mockResolvedValueOnce({
      decision: "skipped" as const,
      state: {
        ...defaultAgentBadgeState,
        publish: {
          status: "published" as const,
          gistId: "gist_789",
          lastPublishedHash: "hash_789",
          lastPublishedAt: "2026-03-29T19:00:00.000Z"
        }
      }
    });

    try {
      await runRefreshCommand({
        cwd: fixture.repoRoot,
        homeRoot: fixture.homeRoot,
        stdout: output.writer,
        hook: "pre-push"
      });

      expect(output.read()).toContain("agent-badge refresh");
      expect(output.read()).toContain("- Scan mode: incremental");
      expect(output.read()).toContain("- Publish: skipped");
      expect(output.read()).not.toContain("last published");
      expect(output.read().trim().split("\n")).toHaveLength(5);
    } finally {
      await fixture.cleanup();
    }
  });

  it("swallows hook errors in fail-soft mode", async () => {
    const configuredConfig = {
      ...defaultAgentBadgeConfig,
      publish: {
        ...defaultAgentBadgeConfig.publish,
        gistId: "gist_456",
        badgeUrl:
          "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_456%2Fraw%2Fagent-badge.json&cacheSeconds=300"
      }
    };
    const fixture = await createFixture({
      config: configuredConfig
    });
    const output = createOutputCapture();
    const refreshResult = {
      scanMode: "incremental" as const,
      summary: {
        includedSessions: 1,
        includedTokens: 90,
        ambiguousSessions: 0,
        excludedSessions: 0
      },
      providerCursors: {
        codex: "codex-fresh",
        claude: "claude-fresh"
      },
      cache: {
        version: 1 as const,
        entries: {
          "codex:session-9": {
            provider: "codex" as const,
            providerSessionId: "session-9",
            updatedAt: "2026-03-30T18:58:00.000Z",
            status: "included" as const,
            includedSessions: 1,
            includedTokens: 90
          }
        }
      }
    };

    runIncrementalRefreshMock.mockResolvedValueOnce(refreshResult);
    publishBadgeIfChangedMock.mockRejectedValueOnce(
      new Error("GitHub authentication missing")
    );

    try {
      const result = await runRefreshCommand({
        cwd: fixture.repoRoot,
        homeRoot: fixture.homeRoot,
        stdout: output.writer,
        hook: "pre-push",
        failSoft: true
      });
      const persistedState = await readStateFile(fixture.statePath);
      const cache = await readRefreshCache({ cwd: fixture.repoRoot });

      expect(result).toMatchObject({
        status: "failed-soft",
        error: expect.objectContaining({
          message: "GitHub authentication missing"
        })
      });
      expect(cache).toEqual(refreshResult.cache);
      expect(persistedState.refresh).toEqual({
        lastRefreshedAt: "2026-03-30T19:00:00.000Z",
        lastScanMode: "incremental",
        lastPublishDecision: "failed",
        summary: refreshResult.summary
      });
      expect(persistedState.publish.status).toBe("error");
      expect(output.read()).toContain("agent-badge refresh");
      expect(output.read()).toContain("Refresh status: failed-soft");
      expect(output.read()).toContain("GitHub authentication missing");
      expect(appendAgentBadgeLogMock).toHaveBeenCalledWith({
        cwd: fixture.repoRoot,
        entry: expect.objectContaining({
          operation: "refresh",
          status: "failure",
          counts: {
            scannedSessions: 1,
            attributedSessions: 1,
            ambiguousSessions: 0,
            publishedRecords: 0
          }
        })
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("surfaces hook errors in strict mode", async () => {
    const configuredConfig = {
      ...defaultAgentBadgeConfig,
      publish: {
        ...defaultAgentBadgeConfig.publish,
        gistId: "gist_strict",
        badgeUrl:
          "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_strict%2Fraw%2Fagent-badge.json&cacheSeconds=300"
      }
    };
    const fixture = await createFixture({
      config: configuredConfig
    });
    const refreshResult = {
      scanMode: "incremental" as const,
      summary: {
        includedSessions: 1,
        includedTokens: 90,
        ambiguousSessions: 0,
        excludedSessions: 0
      },
      providerCursors: {
        codex: "codex-strict",
        claude: "claude-strict"
      },
      cache: {
        version: 1 as const,
        entries: {}
      }
    };

    runIncrementalRefreshMock.mockResolvedValueOnce(refreshResult);
    publishBadgeIfChangedMock.mockRejectedValueOnce(
      new Error("GitHub authentication missing")
    );

    try {
      await expect(
        runRefreshCommand({
          cwd: fixture.repoRoot,
          homeRoot: fixture.homeRoot,
          hook: "pre-push"
        })
      ).rejects.toThrow("GitHub authentication missing");

      const persistedState = await readStateFile(fixture.statePath);

      expect(persistedState.refresh.lastPublishDecision).toBe("failed");
      expect(persistedState.publish.status).toBe("error");
      expect(appendAgentBadgeLogMock).toHaveBeenCalledWith({
        cwd: fixture.repoRoot,
        entry: expect.objectContaining({
          operation: "refresh",
          status: "failure",
          counts: {
            scannedSessions: 1,
            attributedSessions: 1,
            ambiguousSessions: 0,
            publishedRecords: 0
          }
        })
      });
    } finally {
      await fixture.cleanup();
    }
  });
});
