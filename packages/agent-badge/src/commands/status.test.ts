import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AGENT_BADGE_GIST_FILE,
  AGENT_BADGE_OVERRIDES_GIST_FILE,
  buildContributorGistFileName,
  buildSharedOverrideDigest,
  defaultAgentBadgeConfig,
  defaultAgentBadgeState,
  type AgentBadgeState,
  type GitHubGistClient
} from "@legotin/agent-badge-core";

import { runStatusCommand } from "./status.js";

interface OutputCapture {
  readonly writer: {
    write(chunk: string): void;
  };
  read(): string;
}

interface Fixture {
  readonly repoRoot: string;
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
): Promise<void> {
  const targetPath = join(root, relativePath);

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createFixture(options?: {
  readonly config?: unknown;
  readonly state?: AgentBadgeState;
}): Promise<Fixture> {
  const repoRoot = await mkdtemp(join(tmpdir(), "agent-badge-status-repo-"));

  await writeJsonFile(
    repoRoot,
    ".agent-badge/config.json",
    options?.config ?? defaultAgentBadgeConfig
  );
  await writeJsonFile(
    repoRoot,
    ".agent-badge/state.json",
    options?.state ?? defaultAgentBadgeState
  );

  return {
    repoRoot,
    cleanup() {
      return rm(repoRoot, { recursive: true, force: true });
    }
  };
}

function createObservationContributorRecord(options: {
  readonly publisherId: string;
  readonly updatedAt?: string;
  readonly observations: Record<string, unknown>;
}): string {
  return JSON.stringify(
    {
      schemaVersion: 2,
      publisherId: options.publisherId,
      updatedAt: options.updatedAt ?? "2026-03-30T19:00:00.000Z",
      observations: options.observations
    },
    null,
    2
  );
}

function createOverridesRecord(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      overrides
    },
    null,
    2
  );
}

function buildGistClient(files: Record<string, string>): GitHubGistClient {
  return {
    getGist: async () => ({
      id: "gist_789",
      ownerLogin: "octocat",
      public: true,
      files: Object.fromEntries(
        Object.entries(files).map(([filename, content]) => [
          filename,
          {
            filename,
            content,
            truncated: false
          }
        ])
      )
    }),
    createPublicGist: async () => {
      throw new Error("createPublicGist should not run");
    },
    updateGistFile: async () => {
      throw new Error("updateGistFile should not run");
    },
    deleteGist: async () => {
      throw new Error("deleteGist should not run");
    }
  };
}

function configuredState(): AgentBadgeState {
  return {
    ...defaultAgentBadgeState,
    checkpoints: {
      codex: {
        cursor: "opaque-codex-cursor",
        lastScannedAt: "2026-03-30T19:00:00.000Z"
      },
      claude: {
        cursor: "opaque-claude-cursor",
        lastScannedAt: "2026-03-30T19:05:00.000Z"
      }
    },
    publish: {
      status: "published",
      gistId: "gist_789",
      lastPublishedHash: "hash_789",
      lastPublishedAt: "2026-03-30T19:10:00.000Z"
    },
    refresh: {
      lastRefreshedAt: "2026-03-30T19:12:00.000Z",
      lastScanMode: "incremental",
      lastPublishDecision: "published",
      summary: {
        includedSessions: 5,
        includedTokens: 610,
        ambiguousSessions: 1,
        excludedSessions: 2
      }
    }
  };
}

describe("runStatusCommand", () => {
  it("prints configured publish status and refresh totals", async () => {
    const fixture = await createFixture({
      config: {
        ...defaultAgentBadgeConfig,
        publish: {
          ...defaultAgentBadgeConfig.publish,
          gistId: "gist_789",
          badgeUrl:
            "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_789%2Fraw%2Fagent-badge.json&cacheSeconds=300"
        }
      },
      state: configuredState()
    });
    const output = createOutputCapture();

    try {
      const result = await runStatusCommand({
        cwd: fixture.repoRoot,
        stdout: output.writer,
        gistClient: buildGistClient({
          [AGENT_BADGE_GIST_FILE]: JSON.stringify(
            {
              schemaVersion: 1,
              label: "AI Usage",
              message: "610 tokens",
              color: "blue"
            },
            null,
            2
          )
        })
      });
      const lines = result.report.split("\n");

      expect(lines).toEqual([
        "agent-badge status",
        "- Totals: 5 sessions, 610 tokens",
        "- Providers: codex=enabled, claude=enabled",
        "- Publish: published | gist configured=yes | last published=2026-03-30T19:10:00.000Z | gistId=gist_789 | lastPublishedHash=hash_789",
        "- Shared mode: legacy | health=healthy | contributors=0",
        "- Shared issues: legacy-no-contributors=1",
        "- Last refresh: 2026-03-30T19:12:00.000Z (incremental)",
        "- Checkpoints: codex=2026-03-30T19:00:00.000Z, claude=2026-03-30T19:05:00.000Z"
      ]);
      expect(output.read()).not.toContain("opaque-codex-cursor");
      expect(output.read()).not.toContain("opaque-claude-cursor");
    } finally {
      await fixture.cleanup();
    }
  });

  it("prints deferred publish status when badge setup is not configured", async () => {
    const fixture = await createFixture({
      state: {
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          status: "deferred"
        }
      }
    });
    const output = createOutputCapture();

    try {
      await runStatusCommand({
        cwd: fixture.repoRoot,
        stdout: output.writer
      });

      expect(output.read()).toContain(
        "- Publish: deferred | gist configured=no"
      );
      expect(output.read()).toContain("- Live badge trust: not attempted");
    } finally {
      await fixture.cleanup();
    }
  });

  it("prints stale failed publish trust separately from shared mode health", async () => {
    const fixture = await createFixture({
      config: {
        ...defaultAgentBadgeConfig,
        publish: {
          ...defaultAgentBadgeConfig.publish,
          gistId: "gist_789",
          badgeUrl:
            "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_789%2Fraw%2Fagent-badge.json&cacheSeconds=300"
        }
      },
      state: {
        ...configuredState(),
        publish: {
          ...configuredState().publish,
          status: "error",
          gistId: "gist_789",
          lastPublishedHash: "hash_789",
          lastPublishedAt: "2026-03-30T19:10:00.000Z"
        },
        refresh: {
          ...configuredState().refresh,
          lastRefreshedAt: "2026-03-30T19:12:00.000Z",
          lastPublishDecision: "failed"
        }
      }
    });
    const output = createOutputCapture();

    try {
      await runStatusCommand({
        cwd: fixture.repoRoot,
        stdout: output.writer,
        gistClient: buildGistClient({
          [AGENT_BADGE_GIST_FILE]: JSON.stringify(
            {
              schemaVersion: 1,
              label: "AI Usage",
              message: "610 tokens",
              color: "blue"
            },
            null,
            2
          )
        })
      });

      expect(output.read()).toContain(
        "- Live badge trust: stale after failed publish"
      );
      expect(output.read()).toContain(
        "- Last successful badge update: 2026-03-30T19:10:00.000Z"
      );
      expect(output.read()).toContain(
        "- Shared mode: legacy | health=healthy | contributors=0"
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("prints unavailable totals before the first refresh", async () => {
    const fixture = await createFixture();
    const output = createOutputCapture();

    try {
      await runStatusCommand({
        cwd: fixture.repoRoot,
        stdout: output.writer
      });

      expect(output.read()).toContain(
        "- Totals: unavailable (run `agent-badge refresh`)"
      );
      expect(output.read()).toContain("- Last refresh: unavailable");
      expect(output.read()).toContain(
        "- Checkpoints: codex=not yet scanned, claude=not yet scanned"
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("omits optional publish detail in minimal privacy mode", async () => {
    const fixture = await createFixture({
      config: {
        ...defaultAgentBadgeConfig,
        publish: {
          ...defaultAgentBadgeConfig.publish,
          gistId: "gist_minimal",
          badgeUrl:
            "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_minimal%2Fraw%2Fagent-badge.json&cacheSeconds=300"
        },
        privacy: {
          ...defaultAgentBadgeConfig.privacy,
          output: "minimal"
        }
      },
      state: configuredState()
    });
    const output = createOutputCapture();

    try {
      await runStatusCommand({
        cwd: fixture.repoRoot,
        stdout: output.writer,
        gistClient: buildGistClient({
          [AGENT_BADGE_GIST_FILE]: JSON.stringify(
            {
              schemaVersion: 1,
              label: "AI Usage",
              message: "610 tokens",
              color: "blue"
            },
            null,
            2
          )
        })
      });

      expect(output.read()).toContain(
        "- Publish: published | gist configured=yes | last published=2026-03-30T19:10:00.000Z"
      );
      expect(output.read()).toContain(
        "- Shared mode: legacy | health=healthy | contributors=0"
      );
      expect(output.read()).not.toContain("gistId=");
      expect(output.read()).not.toContain("lastPublishedHash=");
    } finally {
      await fixture.cleanup();
    }
  });

  it("prints healthy shared mode details when contributor records are present", async () => {
    const fixture = await createFixture({
      config: {
        ...defaultAgentBadgeConfig,
        publish: {
          ...defaultAgentBadgeConfig.publish,
          gistId: "gist_789",
          badgeUrl:
            "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_789%2Fraw%2Fagent-badge.json&cacheSeconds=300"
        }
      },
      state: {
        ...configuredState(),
        publish: {
          ...configuredState().publish,
          publisherId: "publisher-a",
          mode: "shared"
        }
      }
    });
    const output = createOutputCapture();
    const sharedDigest = buildSharedOverrideDigest("codex:session-a");

    try {
      await runStatusCommand({
        cwd: fixture.repoRoot,
        stdout: output.writer,
        gistClient: buildGistClient({
          [buildContributorGistFileName("publisher-a")]: createObservationContributorRecord({
            publisherId: "publisher-a",
            observations: {
              [sharedDigest]: {
                sessionUpdatedAt: "2026-03-30T19:00:00.000Z",
                attributionStatus: "included",
                overrideDecision: null,
                tokens: 100,
                estimatedCostUsdMicros: null
              }
            }
          }),
          [buildContributorGistFileName("publisher-b")]: createObservationContributorRecord({
            publisherId: "publisher-b",
            observations: {
              [buildSharedOverrideDigest("codex:session-b")]: {
                sessionUpdatedAt: "2026-03-30T19:01:00.000Z",
                attributionStatus: "included",
                overrideDecision: null,
                tokens: 200,
                estimatedCostUsdMicros: null
              }
            }
          }),
          [AGENT_BADGE_OVERRIDES_GIST_FILE]: createOverridesRecord()
        })
      });

      expect(output.read()).toContain(
        "- Shared mode: shared | health=healthy | contributors=2"
      );
      expect(output.read()).not.toContain("- Shared issues:");
    } finally {
      await fixture.cleanup();
    }
  });

  it("prints orphaned shared issues when the local publisher is missing remotely", async () => {
    const fixture = await createFixture({
      config: {
        ...defaultAgentBadgeConfig,
        publish: {
          ...defaultAgentBadgeConfig.publish,
          gistId: "gist_789",
          badgeUrl:
            "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_789%2Fraw%2Fagent-badge.json&cacheSeconds=300"
        }
      },
      state: {
        ...configuredState(),
        publish: {
          ...configuredState().publish,
          publisherId: "publisher-local",
          mode: "shared"
        }
      }
    });
    const output = createOutputCapture();

    try {
      await runStatusCommand({
        cwd: fixture.repoRoot,
        stdout: output.writer,
        gistClient: buildGistClient({
          [buildContributorGistFileName("publisher-remote")]: createObservationContributorRecord({
            publisherId: "publisher-remote",
            observations: {
              [buildSharedOverrideDigest("codex:session-remote")]: {
                sessionUpdatedAt: "2026-03-30T19:02:00.000Z",
                attributionStatus: "included",
                overrideDecision: null,
                tokens: 300,
                estimatedCostUsdMicros: null
              }
            }
          }),
          [AGENT_BADGE_OVERRIDES_GIST_FILE]: createOverridesRecord()
        })
      });

      expect(output.read()).toContain(
        "- Shared mode: shared | health=orphaned | contributors=1"
      );
      expect(output.read()).toContain(
        "- Shared issues: missing-local-contributor=1"
      );
    } finally {
      await fixture.cleanup();
    }
  });
});
