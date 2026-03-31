import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { appendAgentBadgeLogMock, runFullBackfillScanMock } = vi.hoisted(() => ({
  appendAgentBadgeLogMock: vi.fn(),
  runFullBackfillScanMock: vi.fn()
}));

vi.mock("@legotin/agent-badge-core", async () => {
  const actual = await vi.importActual<typeof import("@legotin/agent-badge-core")>(
    "@legotin/agent-badge-core"
  );

  return {
    ...actual,
    appendAgentBadgeLog: appendAgentBadgeLogMock,
    runFullBackfillScan: runFullBackfillScanMock
  };
});

import {
  defaultAgentBadgeConfig,
  defaultAgentBadgeState,
  parseAgentBadgeState,
  parseNormalizedSessionSummary,
  type AgentBadgeState,
  type NormalizedSessionSummary,
  type RepoFingerprint,
  type RunFullBackfillScanResult
} from "@legotin/agent-badge-core";

import { buildProgram } from "../cli/main.js";

import { runScanCommand } from "./scan.js";

interface OutputCapture {
  readonly writer: {
    write(chunk: string): void;
  };
  read(): string;
}

interface ScanFixture {
  readonly repo: RepoFixture;
  readonly providerHome: ProviderFixture;
  readonly statePath: string;
  cleanup(): Promise<void>;
}

interface RepoFixture {
  readonly root: string;
  cleanup(): Promise<void>;
  writeFile(relativePath: string, content: string): Promise<string>;
}

interface ProviderFixture {
  readonly homeRoot: string;
  cleanup(): Promise<void>;
}

const originalCwd = process.cwd();

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

async function createRepoFixture(): Promise<RepoFixture> {
  const root = await mkdtemp(join(tmpdir(), "agent-badge-scan-repo-"));

  return {
    root,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
    async writeFile(relativePath, content) {
      const targetPath = join(root, relativePath);

      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, content, "utf8");

      return targetPath;
    }
  };
}

async function createProviderFixture(): Promise<ProviderFixture> {
  const homeRoot = await mkdtemp(join(tmpdir(), "agent-badge-scan-home-"));

  await Promise.all([
    mkdir(join(homeRoot, ".codex"), { recursive: true }),
    mkdir(join(homeRoot, ".claude"), { recursive: true })
  ]);

  return {
    homeRoot,
    async cleanup() {
      await rm(homeRoot, { recursive: true, force: true });
    }
  };
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
    aliasRemoteUrlsNormalized: ["https://github.com/legotin/agent-badge"],
    aliasSlugs: ["openai/agent-badge"]
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

function createScanResult(repoRoot: string): RunFullBackfillScanResult {
  const repo = createRepoFingerprint(repoRoot);
  const repoProjectKey = repoRoot.replace(/[:\\/]+/g, "-");

  return {
    repo,
    scannedProviders: ["codex", "claude"],
    sessions: [
      createSession({
        provider: "codex",
        providerSessionId: "included-session",
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
      }),
      createSession({
        provider: "codex",
        providerSessionId: "ambiguous-include",
        cwd: `${repoRoot}/packages/core`,
        attributionHints: {
          cwdRealPath: `${repoRoot}/packages/core`,
          transcriptProjectKey: null
        },
        tokenUsage: {
          total: 50,
          input: 20,
          output: 30,
          cacheCreation: null,
          cacheRead: null,
          reasoningOutput: null
        }
      }),
      createSession({
        provider: "claude",
        providerSessionId: "ambiguous-exclude",
        attributionHints: {
          cwdRealPath: null,
          transcriptProjectKey: repoProjectKey
        },
        tokenUsage: {
          total: 75,
          input: 25,
          output: 50,
          cacheCreation: null,
          cacheRead: null,
          reasoningOutput: null
        }
      }),
      createSession({
        provider: "claude",
        providerSessionId: "excluded-session",
        cwd: "/outside/repo",
        attributionHints: {
          cwdRealPath: "/outside/repo",
          transcriptProjectKey: null
        },
        tokenUsage: {
          total: 10,
          input: 5,
          output: 5,
          cacheCreation: null,
          cacheRead: null,
          reasoningOutput: null
        }
      })
    ],
    counts: {
      scannedSessions: 4,
      dedupedSessions: 4,
      byProvider: {
        codex: {
          scannedSessions: 2,
          dedupedSessions: 2
        },
        claude: {
          scannedSessions: 2,
          dedupedSessions: 2
        }
      }
    }
  };
}

async function createScanFixture(
  state: AgentBadgeState = defaultAgentBadgeState
): Promise<ScanFixture> {
  const [repo, providerHome] = await Promise.all([
    createRepoFixture(),
    createProviderFixture()
  ]);
  const configPath = join(repo.root, ".agent-badge/config.json");
  const statePath = join(repo.root, ".agent-badge/state.json");

  await mkdir(join(repo.root, ".agent-badge"), { recursive: true });
  await repo.writeFile(
    ".agent-badge/config.json",
    `${JSON.stringify(defaultAgentBadgeConfig, null, 2)}\n`
  );
  await repo.writeFile(
    ".agent-badge/state.json",
    `${JSON.stringify(state, null, 2)}\n`
  );

  return {
    repo,
    providerHome,
    statePath,
    async cleanup() {
      await Promise.allSettled([repo.cleanup(), providerHome.cleanup()]);
    }
  };
}

async function readStateFile(statePath: string): Promise<AgentBadgeState> {
  return parseAgentBadgeState(JSON.parse(await readFile(statePath, "utf8")));
}

beforeEach(() => {
  appendAgentBadgeLogMock.mockReset();
  appendAgentBadgeLogMock.mockResolvedValue("log-path");
  runFullBackfillScanMock.mockReset();
});

afterEach(() => {
  process.chdir(originalCwd);
});

describe.sequential("runScanCommand", () => {
  it("prints Included Totals", async () => {
    const fixture = await createScanFixture();
    const output = createOutputCapture();

    try {
      runFullBackfillScanMock.mockResolvedValueOnce(
        createScanResult(fixture.repo.root)
      );

      await runScanCommand({
        cwd: fixture.repo.root,
        homeRoot: fixture.providerHome.homeRoot,
        stdout: output.writer
      });

      expect(output.read()).toContain("Included Totals");
      expect(appendAgentBadgeLogMock).toHaveBeenCalledWith({
        cwd: fixture.repo.root,
        entry: expect.objectContaining({
          operation: "scan",
          status: "success",
          counts: {
            scannedSessions: 4,
            attributedSessions: 1,
            ambiguousSessions: 2,
            publishedRecords: 0
          }
        })
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("prints Ambiguous Sessions", async () => {
    const fixture = await createScanFixture();
    const output = createOutputCapture();

    try {
      runFullBackfillScanMock.mockResolvedValueOnce(
        createScanResult(fixture.repo.root)
      );

      await runScanCommand({
        cwd: fixture.repo.root,
        homeRoot: fixture.providerHome.homeRoot,
        stdout: output.writer
      });

      expect(output.read()).toContain("Ambiguous Sessions");
      expect(output.read()).toContain("codex:ambiguous-include");
    } finally {
      await fixture.cleanup();
    }
  });

  it("prints Excluded Sessions", async () => {
    const fixture = await createScanFixture();
    const output = createOutputCapture();

    try {
      runFullBackfillScanMock.mockResolvedValueOnce(
        createScanResult(fixture.repo.root)
      );

      await runScanCommand({
        cwd: fixture.repo.root,
        homeRoot: fixture.providerHome.homeRoot,
        stdout: output.writer
      });

      expect(output.read()).toContain("Excluded Sessions");
      expect(output.read()).toContain("claude:excluded-session");
    } finally {
      await fixture.cleanup();
    }
  });

  it("reuses stored ambiguous overrides on a second scan", async () => {
    const fixture = await createScanFixture();
    const firstOutput = createOutputCapture();
    const secondOutput = createOutputCapture();

    try {
      runFullBackfillScanMock.mockResolvedValue(
        createScanResult(fixture.repo.root)
      );

      const firstRun = await runScanCommand({
        cwd: fixture.repo.root,
        homeRoot: fixture.providerHome.homeRoot,
        stdout: firstOutput.writer,
        includeSession: ["codex:ambiguous-include"],
        excludeSession: ["claude:ambiguous-exclude"]
      });
      const secondRun = await runScanCommand({
        cwd: fixture.repo.root,
        homeRoot: fixture.providerHome.homeRoot,
        stdout: secondOutput.writer
      });
      const persistedState = await readStateFile(fixture.statePath);

      expect(firstRun.overrideActions).toEqual([
        {
          sessionKey: "codex:ambiguous-include",
          decision: "include"
        },
        {
          sessionKey: "claude:ambiguous-exclude",
          decision: "exclude"
        }
      ]);
      expect(
        secondRun.attribution.sessions.find(
          (session) => session.session.providerSessionId === "ambiguous-include"
        )?.status
      ).toBe("included");
      expect(
        secondRun.attribution.sessions.find(
          (session) => session.session.providerSessionId === "ambiguous-exclude"
        )?.status
      ).toBe("excluded");
      expect(persistedState.overrides.ambiguousSessions).toMatchObject({
        "codex:ambiguous-include": "include",
        "claude:ambiguous-exclude": "exclude"
      });
      expect(secondOutput.read()).toContain("Excluded Sessions");
    } finally {
      await fixture.cleanup();
    }
  });

  it("does not rewrite checkpoints after a failed scan", async () => {
    const initialState = parseAgentBadgeState({
      ...defaultAgentBadgeState,
      checkpoints: {
        codex: {
          cursor: "codex-cursor",
          lastScannedAt: "2026-03-28T10:00:00.000Z"
        },
        claude: {
          cursor: "claude-cursor",
          lastScannedAt: "2026-03-28T10:05:00.000Z"
        }
      }
    });
    const fixture = await createScanFixture(initialState);
    const output = createOutputCapture();
    const before = await readFile(fixture.statePath, "utf8");

    try {
      runFullBackfillScanMock.mockRejectedValueOnce(new Error("scan failed"));

      await expect(
        runScanCommand({
          cwd: fixture.repo.root,
          homeRoot: fixture.providerHome.homeRoot,
          stdout: output.writer
        })
      ).rejects.toThrow("scan failed");

      expect(await readFile(fixture.statePath, "utf8")).toBe(before);
      expect(appendAgentBadgeLogMock).toHaveBeenCalledWith({
        cwd: fixture.repo.root,
        entry: expect.objectContaining({
          operation: "scan",
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

  it("registers the scan CLI command and forwards include or exclude session flags", async () => {
    const fixture = await createScanFixture();

    try {
      runFullBackfillScanMock.mockResolvedValueOnce(
        createScanResult(fixture.repo.root)
      );

      process.chdir(fixture.repo.root);

      const program = buildProgram();
      const scanCommand = program.commands.find(
        (command) => command.name() === "scan"
      );

      expect(scanCommand?.description()).toBe(
        "Scan local agent history and report attributed usage."
      );
      expect(scanCommand?.options.map((option) => option.flags)).toEqual(
        expect.arrayContaining([
          "--include-session <provider:sessionId>",
          "--exclude-session <provider:sessionId>"
        ])
      );

      await program.parseAsync([
        "node",
        "agent-badge",
        "scan",
        "--include-session",
        "codex:ambiguous-include",
        "--exclude-session",
        "claude:ambiguous-exclude"
      ]);

      expect((await readStateFile(fixture.statePath)).overrides.ambiguousSessions)
        .toMatchObject({
          "codex:ambiguous-include": "include",
          "claude:ambiguous-exclude": "exclude"
        });
    } finally {
      await fixture.cleanup();
    }
  });
});
