import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  appendAgentBadgeLogMock,
  attributeBackfillSessionsMock,
  createGitHubGistClientMock,
  publishBadgeToGistMock,
  runFullBackfillScanMock
} = vi.hoisted(() => ({
  appendAgentBadgeLogMock: vi.fn(),
  attributeBackfillSessionsMock: vi.fn(),
  createGitHubGistClientMock: vi.fn(),
  publishBadgeToGistMock: vi.fn(),
  runFullBackfillScanMock: vi.fn()
}));

vi.mock("@legotin/agent-badge-core", async () => {
  const actual = await vi.importActual<typeof import("@legotin/agent-badge-core")>(
    "@legotin/agent-badge-core"
  );

  return {
    ...actual,
    appendAgentBadgeLog: appendAgentBadgeLogMock,
    attributeBackfillSessions: attributeBackfillSessionsMock,
    createGitHubGistClient: createGitHubGistClientMock,
    publishBadgeToGist: publishBadgeToGistMock,
    runFullBackfillScan: runFullBackfillScanMock
  };
});

import {
  defaultAgentBadgeConfig,
  defaultAgentBadgeState,
  parseAgentBadgeState,
  parseNormalizedSessionSummary,
  type AgentBadgeState,
  type AttributeBackfillSessionsResult,
  type NormalizedSessionSummary,
  type RepoFingerprint,
  type RunFullBackfillScanResult
} from "@legotin/agent-badge-core";

import { runPublishCommand } from "./publish.js";

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
    mkdtemp(join(tmpdir(), "agent-badge-publish-repo-")),
    mkdtemp(join(tmpdir(), "agent-badge-publish-home-"))
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

function createRepoFingerprint(repoRoot: string): RepoFingerprint {
  return {
    gitRoot: repoRoot,
    gitRootRealPath: repoRoot,
    gitRootBasename: "agent-badge",
    originUrlRaw: "https://github.com/openai/agent-badge.git",
    originUrlNormalized: "https://github.com/openai/agent-badge",
    host: "github.com",
    owner: "openai",
    repo: "agent-badge",
    canonicalSlug: "openai/agent-badge",
    aliasRemoteUrlsNormalized: [],
    aliasSlugs: []
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
    startedAt: "2026-03-30T10:00:00.000Z",
    updatedAt: "2026-03-30T10:05:00.000Z",
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
      model: "gpt-5",
      modelProvider: "openai",
      sourceKind: "sqlite",
      cliVersion: "1.0.0",
      ...metadata
    }
  });
}

function createScanResult(repoRoot: string): RunFullBackfillScanResult {
  const repo = createRepoFingerprint(repoRoot);

  return {
    repo,
    scannedProviders: ["codex"],
    sessions: [
      createSession({
        provider: "codex",
        providerSessionId: "codex-session-1",
        cwd: repoRoot,
        observedRemoteUrl: "https://github.com/openai/agent-badge.git",
        observedRemoteUrlNormalized: repo.originUrlNormalized,
        attributionHints: {
          cwdRealPath: repoRoot,
          transcriptProjectKey: null
        },
        tokenUsage: {
          total: 120,
          input: 60,
          output: 60,
          cacheCreation: null,
          cacheRead: null,
          reasoningOutput: null
        }
      })
    ],
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
  };
}

function createAttributionResult(
  scan: RunFullBackfillScanResult
): AttributeBackfillSessionsResult {
  return {
    sessions: scan.sessions.map((session) => ({
      session,
      status: "included" as const,
      evidence: [
        {
          kind: "repo-root" as const,
          matched: true,
          detail: "cwd realpath exactly matches repo.gitRootRealPath"
        }
      ],
      reason: "Included because cwdRealPath exactly matches repo.gitRootRealPath",
      overrideApplied: null
    })),
    counts: {
      included: scan.sessions.length,
      ambiguous: 0,
      excluded: 0
    }
  };
}

beforeEach(() => {
  appendAgentBadgeLogMock.mockReset();
  appendAgentBadgeLogMock.mockResolvedValue("log-path");
  attributeBackfillSessionsMock.mockReset();
  createGitHubGistClientMock.mockReset();
  publishBadgeToGistMock.mockReset();
  runFullBackfillScanMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runPublishCommand", () => {
  it("reuses the scan and attribution pipeline, persists lastPublishedHash, and prints a publish summary", async () => {
    const configuredConfig = {
      ...defaultAgentBadgeConfig,
      publish: {
        ...defaultAgentBadgeConfig.publish,
        gistId: "gist_publish",
        badgeUrl:
          "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_publish%2Fraw%2Fagent-badge.json&cacheSeconds=300"
      }
    };
    const fixture = await createFixture({
      config: configuredConfig
    });
    const output = createOutputCapture();
    const scan = createScanResult(fixture.repoRoot);
    const attribution = createAttributionResult(scan);
    const gistClient = {
      getGist: vi.fn(),
      createPublicGist: vi.fn(),
      updateGistFile: vi.fn()
    };

    runFullBackfillScanMock.mockResolvedValueOnce(scan);
    attributeBackfillSessionsMock.mockReturnValueOnce(attribution);
    publishBadgeToGistMock.mockResolvedValueOnce({
      ...defaultAgentBadgeState,
      publish: {
        ...defaultAgentBadgeState.publish,
        status: "published",
        gistId: "gist_publish",
        lastPublishedHash: "hash_123"
      }
    });

    try {
      const result = await runPublishCommand({
        cwd: fixture.repoRoot,
        homeRoot: fixture.homeRoot,
        gistClient,
        stdout: output.writer
      });
      const persistedState = await readStateFile(fixture.statePath);

      expect(runFullBackfillScanMock).toHaveBeenCalledWith({
        cwd: fixture.repoRoot,
        homeRoot: fixture.homeRoot,
        config: configuredConfig
      });
      expect(attributeBackfillSessionsMock).toHaveBeenCalledWith({
        repo: scan.repo,
        sessions: scan.sessions,
        overrides: defaultAgentBadgeState.overrides.ambiguousSessions
      });
      expect(publishBadgeToGistMock).toHaveBeenCalledWith({
        config: configuredConfig,
        state: defaultAgentBadgeState,
        includedTotals: {
          sessions: 1,
          tokens: 120,
          estimatedCostUsdMicros: null
        },
        client: gistClient
      });
      expect(persistedState.publish.lastPublishedHash).toBe("hash_123");
      expect(output.read().startsWith("agent-badge publish\n")).toBe(true);
      expect(output.read()).toContain("lastPublishedHash: hash_123");
      expect(result.state.publish.lastPublishedHash).toBe("hash_123");
      expect(appendAgentBadgeLogMock).toHaveBeenCalledWith({
        cwd: fixture.repoRoot,
        entry: expect.objectContaining({
          operation: "publish",
          status: "success",
          counts: {
            scannedSessions: 1,
            attributedSessions: 1,
            ambiguousSessions: 0,
            publishedRecords: 1
          }
        })
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("fails explicitly when publish is not configured", async () => {
    const fixture = await createFixture();

    try {
      await expect(
        runPublishCommand({
          cwd: fixture.repoRoot,
          homeRoot: fixture.homeRoot,
          stdout: createOutputCapture().writer
        })
      ).rejects.toThrow(
        "Publish is not configured. Run `agent-badge init` or re-run init with `--gist-id <id>` first."
      );

      expect(runFullBackfillScanMock).not.toHaveBeenCalled();
      expect(attributeBackfillSessionsMock).not.toHaveBeenCalled();
      expect(publishBadgeToGistMock).not.toHaveBeenCalled();
      expect(appendAgentBadgeLogMock).toHaveBeenCalledWith({
        cwd: fixture.repoRoot,
        entry: expect.objectContaining({
          operation: "publish",
          status: "failure",
          counts: {
            scannedSessions: 0,
            attributedSessions: 0,
            ambiguousSessions: 0,
            publishedRecords: 0
          }
        })
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("uses process.env GitHub auth when no explicit env override is passed", async () => {
    const configuredConfig = {
      ...defaultAgentBadgeConfig,
      publish: {
        ...defaultAgentBadgeConfig.publish,
        gistId: "gist_publish",
        badgeUrl:
          "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_publish%2Fraw%2Fagent-badge.json&cacheSeconds=300"
      }
    };
    const fixture = await createFixture({
      config: configuredConfig
    });
    const output = createOutputCapture();
    const scan = createScanResult(fixture.repoRoot);
    const attribution = createAttributionResult(scan);
    const gistClient = {
      getGist: vi.fn(),
      createPublicGist: vi.fn(),
      updateGistFile: vi.fn()
    };

    vi.stubEnv("GH_TOKEN", "process-env-token");
    createGitHubGistClientMock.mockReturnValue(gistClient);
    runFullBackfillScanMock.mockResolvedValueOnce(scan);
    attributeBackfillSessionsMock.mockReturnValueOnce(attribution);
    publishBadgeToGistMock.mockResolvedValueOnce({
      ...defaultAgentBadgeState,
      publish: {
        ...defaultAgentBadgeState.publish,
        status: "published",
        gistId: "gist_publish",
        lastPublishedHash: "hash_process_env"
      }
    });

    try {
      await runPublishCommand({
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
});
