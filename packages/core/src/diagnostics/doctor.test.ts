import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  AGENT_BADGE_GIST_FILE,
  AGENT_BADGE_OVERRIDES_GIST_FILE,
  buildStableBadgeUrl,
  buildContributorGistFileName,
  buildSharedOverrideDigest,
  defaultAgentBadgeConfig,
  parseAgentBadgeState,
  type RunDoctorChecksResult
} from "@legotin/agent-badge-core";
import {
  AGENT_BADGE_README_END_MARKER,
  AGENT_BADGE_README_START_MARKER
} from "../publish/readme-badge.js";
import {
  agentBadgeHookEndMarker,
  agentBadgeHookStartMarker
} from "../init/runtime-wiring.js";
import { runDoctorChecks } from "./index.js";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

interface RepoFixture {
  readonly root: string;
  cleanup(): Promise<void>;
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
      updatedAt: options.updatedAt ?? "2099-01-01T00:00:00.000Z",
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

interface DoctorFixture {
  readonly repo: RepoFixture;
  readonly home: RepoFixture;
}

async function writeJsonFile(
  root: string,
  relativePath: string,
  value: unknown
): Promise<void> {
  const target = join(root, relativePath);

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createRepoFixture(options: {
  readonly withReadme?: boolean;
  readonly withManagedReadme?: boolean;
  readonly withManagedHook?: boolean;
  readonly withCodexProvider?: boolean;
  readonly withClaudeProvider?: boolean;
  readonly gistId?: string;
  readonly withShieldsMarker?: boolean;
} = {}): Promise<DoctorFixture> {
  const repoRoot = await mkdtemp(join(tmpdir(), "agent-badge-doctor-"));
  const homeRoot = await mkdtemp(join(tmpdir(), "agent-badge-doctor-home-"));

  await execFileAsync("git", ["init", "--quiet"], { cwd: repoRoot });
  await execFileAsync(
    "git",
    ["remote", "add", "origin", "https://github.com/octocat/agent-badge.git"],
    { cwd: repoRoot }
  );

  if (options.withReadme ?? true) {
    const readmeContent = options.withManagedReadme ?? true
      ? `Repository\n${AGENT_BADGE_README_START_MARKER}\n![AI Usage](https://example.com/badge.svg)\n${AGENT_BADGE_README_END_MARKER}\n`
      : "Repository";
    await writeFile(join(repoRoot, "README.md"), readmeContent, "utf8");
  }

  if (options.withManagedHook ?? true) {
    await mkdir(dirname(join(repoRoot, ".git/hooks/pre-push")), { recursive: true });
    const hookBlock = [
      agentBadgeHookStartMarker,
      "agent-badge refresh --hook pre-push --hook-policy fail-soft",
      agentBadgeHookEndMarker,
      ""
    ].join("\n");
    await writeFile(join(repoRoot, ".git/hooks/pre-push"), `${hookBlock}\n`, "utf8");
  }

  const gistId = options.gistId ?? "doctorgist";
  const badgeUrl = buildStableBadgeUrl({
    ownerLogin: "octocat",
    gistId
  });
  const config = {
    ...defaultAgentBadgeConfig,
    publish: {
      ...defaultAgentBadgeConfig.publish,
      gistId,
      badgeUrl: options.withShieldsMarker === false ? null : badgeUrl
    }
  };
  const state = parseAgentBadgeState({
    version: 1,
    init: {
      initialized: true,
      scaffoldVersion: 1,
      lastInitializedAt: "2026-03-31T00:00:00.000Z"
    },
    checkpoints: {
      codex: {
        cursor: null,
        lastScannedAt: null
      },
      claude: {
        cursor: null,
        lastScannedAt: null
      }
    },
    publish: {
      status: "published",
      gistId,
      lastPublishedHash: "hash_live",
      lastPublishedAt: "2026-03-31T00:00:00.000Z",
      lastAttemptedAt: "2026-03-31T00:00:00.000Z",
      lastAttemptOutcome: "published",
      lastSuccessfulSyncAt: "2026-03-31T00:00:00.000Z",
      lastAttemptCandidateHash: "hash_live",
      lastAttemptChangedBadge: "yes",
      lastFailureCode: null
    },
    refresh: {
      lastRefreshedAt: "2026-03-31T00:00:00.000Z",
      lastScanMode: "incremental",
      lastPublishDecision: "published",
      summary: null
    },
    overrides: {
      ambiguousSessions: {}
    }
  });

  await Promise.all([
    writeJsonFile(repoRoot, ".agent-badge/config.json", config),
    writeJsonFile(repoRoot, ".agent-badge/state.json", state)
  ]);

  if (options.withCodexProvider ?? true) {
    await mkdir(join(homeRoot, ".codex"), { recursive: true });
  }

  if (options.withClaudeProvider ?? true) {
    await mkdir(join(homeRoot, ".claude"), { recursive: true });
  }

  return {
    repo: {
      root: repoRoot,
      async cleanup() {
        await rm(repoRoot, { recursive: true, force: true });
      }
    },
    home: {
      root: homeRoot,
      async cleanup() {
        await rm(homeRoot, { recursive: true, force: true });
      }
    }
  };
}

function asRunResult(input: RunDoctorChecksResult): RunDoctorChecksResult {
  return input;
}

describe("runDoctorChecks", () => {
  it("reports required check IDs and pass state for a healthy repository", async () => {
    const fixture = await createRepoFixture();
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = async (input: RequestInfo | URL) => {
        return new Response("ok", { status: 200 });
      };

      const result = asRunResult(
        await runDoctorChecks({
          cwd: fixture.repo.root,
          homeRoot: fixture.home.root,
          env: {
            GH_TOKEN: "token"
          },
          gistClient: {
            getGist: async () => ({
              id: "doctorgist",
              ownerLogin: "octocat",
              public: true,
              files: {
                [AGENT_BADGE_GIST_FILE]: {
                  filename: AGENT_BADGE_GIST_FILE,
                  content: `{"schemaVersion":1,"label":"AI Usage","message":"42 tokens","color":"#E8A515"}`,
                  truncated: false
                },
                [buildContributorGistFileName("publisher-a")]: {
                  filename: buildContributorGistFileName("publisher-a"),
                  content: createObservationContributorRecord({
                    publisherId: "publisher-a",
                    observations: {
                      [buildSharedOverrideDigest("codex:session-a")]: {
                        sessionUpdatedAt: "2026-03-31T00:00:00.000Z",
                        attributionStatus: "included",
                        overrideDecision: null,
                        tokens: 42,
                        estimatedCostUsdMicros: null
                      }
                    }
                  }),
                  truncated: false
                },
                [AGENT_BADGE_OVERRIDES_GIST_FILE]: {
                  filename: AGENT_BADGE_OVERRIDES_GIST_FILE,
                  content: createOverridesRecord(),
                  truncated: false
                }
              }
            }),
            createPublicGist: async () => {
              throw new Error("createPublicGist should not run");
            },
            updateGistFile: async () => {
              throw new Error("updateGistFile should not run");
            }
          }
        })
      );

      const ids = result.checks.map((check) => check.id);

      expect(ids).toEqual([
        "git",
        "providers",
        "scan-access",
        "publish-auth",
        "publish-write",
        "publish-shields",
        "publish-trust",
        "shared-mode",
        "shared-health",
        "readme-badge",
        "pre-push-hook"
      ]);
      expect(result.overallStatus).toBe("pass");
      expect(result.total).toBe(11);
      expect(result.passCount).toBe(11);
      expect(
        result.checks.some((check) =>
          check.message.includes(AGENT_BADGE_README_START_MARKER)
        )
      ).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      await fixture.repo.cleanup();
      await fixture.home.cleanup();
    }
  });

  it("warns when GitHub auth is not detected", async () => {
    const fixture = await createRepoFixture();
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = async () => new Response("ok", { status: 200 });

      const result = asRunResult(
        await runDoctorChecks({
          cwd: fixture.repo.root,
          homeRoot: fixture.home.root,
          env: {},
          gistClient: {
            getGist: async () => ({
              id: "doctorgist",
              ownerLogin: "octocat",
              public: true,
              files: {
                [AGENT_BADGE_GIST_FILE]: {
                  filename: AGENT_BADGE_GIST_FILE,
                  content: `{"schemaVersion":1,"label":"AI Usage","message":"42 tokens","color":"#E8A515"}`,
                  truncated: false
                }
              }
            }),
            createPublicGist: async () => {
              throw new Error("createPublicGist should not run");
            },
            updateGistFile: async () => {
              throw new Error("updateGistFile should not run");
            }
          }
        })
      );

      const publishAuth = result.checks.find((check) => check.id === "publish-auth");

      expect(publishAuth?.status).toBe("warn");
      expect(publishAuth?.fix[0]).toContain("GH_TOKEN");
    } finally {
      globalThis.fetch = originalFetch;
      await fixture.repo.cleanup();
      await fixture.home.cleanup();
    }
  });

  it("reuses canonical publish readiness fixes for gist-unreachable", async () => {
    const fixture = await createRepoFixture();
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = async () => new Response("ok", { status: 200 });

      const result = asRunResult(
        await runDoctorChecks({
          cwd: fixture.repo.root,
          homeRoot: fixture.home.root,
          env: {
            GH_TOKEN: "token"
          },
          gistClient: {
            getGist: async () => {
              throw new Error("404");
            },
            createPublicGist: async () => {
              throw new Error("createPublicGist should not run");
            },
            updateGistFile: async () => {
              throw new Error("updateGistFile should not run");
            }
          }
        })
      );

      const publishWrite = result.checks.find((check) => check.id === "publish-write");

      expect(publishWrite?.status).toBe("fail");
      expect(publishWrite?.fix).toContain(
        "Run `agent-badge init --gist-id <id>` to reconnect a valid public gist target."
      );
    } finally {
      globalThis.fetch = originalFetch;
      await fixture.repo.cleanup();
      await fixture.home.cleanup();
    }
  });

  it("adds shared-mode and shared-health checks with actionable migration guidance", async () => {
    const fixture = await createRepoFixture();
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = async () => new Response("ok", { status: 200 });
      await writeJsonFile(fixture.repo.root, ".agent-badge/state.json", {
        version: 1,
        init: {
          initialized: true,
          scaffoldVersion: 1,
          lastInitializedAt: "2026-03-31T00:00:00.000Z"
        },
        checkpoints: {
          codex: {
            cursor: null,
            lastScannedAt: null
          },
          claude: {
            cursor: null,
            lastScannedAt: null
          }
        },
        publish: {
          status: "deferred",
          gistId: "doctorgist",
          lastPublishedHash: null,
          lastPublishedAt: null,
          publisherId: "publisher-local",
          mode: "shared"
        },
        refresh: {
          lastRefreshedAt: null,
          lastScanMode: null,
          lastPublishDecision: null,
          summary: null
        },
        overrides: {
          ambiguousSessions: {}
        }
      });

      const result = asRunResult(
        await runDoctorChecks({
          cwd: fixture.repo.root,
          homeRoot: fixture.home.root,
          env: {
            GH_TOKEN: "token"
          },
          gistClient: {
            getGist: async () => ({
              id: "doctorgist",
              ownerLogin: "octocat",
              public: true,
              files: {
                [AGENT_BADGE_GIST_FILE]: {
                  filename: AGENT_BADGE_GIST_FILE,
                  content: `{"schemaVersion":1,"label":"AI Usage","message":"42 tokens","color":"#E8A515"}`,
                  truncated: false
                },
                [buildContributorGistFileName("publisher-remote")]: {
                  filename: buildContributorGistFileName("publisher-remote"),
                  content: createObservationContributorRecord({
                    publisherId: "publisher-remote",
                    observations: {
                      [buildSharedOverrideDigest("codex:session-remote")]: {
                        sessionUpdatedAt: "2026-03-31T00:00:00.000Z",
                        attributionStatus: "included",
                        overrideDecision: null,
                        tokens: 10,
                        estimatedCostUsdMicros: null
                      }
                    }
                  }),
                  truncated: false
                },
                [AGENT_BADGE_OVERRIDES_GIST_FILE]: {
                  filename: AGENT_BADGE_OVERRIDES_GIST_FILE,
                  content: createOverridesRecord(),
                  truncated: false
                }
              }
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
          }
        })
      );

      const sharedMode = result.checks.find((check) => check.id === "shared-mode");
      const sharedHealth = result.checks.find((check) => check.id === "shared-health");

      expect(sharedMode?.status).toBe("pass");
      expect(sharedHealth?.status).toBe("fail");
      expect(sharedHealth?.fix).toContain(
        "Run `agent-badge refresh` to recreate the local contributor record."
      );
      expect(sharedHealth?.fix).toContain(
        "If this repo is migrating from legacy publish state, migrate from the original publisher machine by rerunning `agent-badge init`."
      );
    } finally {
      globalThis.fetch = originalFetch;
      await fixture.repo.cleanup();
      await fixture.home.cleanup();
    }
  });

  it("adds a publish-trust check for failed-but-unchanged badge state without overloading shared-health", async () => {
    const fixture = await createRepoFixture();
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = async () => new Response("ok", { status: 200 });
      await writeJsonFile(fixture.repo.root, ".agent-badge/state.json", {
        version: 1,
        init: {
          initialized: true,
          scaffoldVersion: 1,
          lastInitializedAt: "2026-03-31T00:00:00.000Z"
        },
        checkpoints: {
          codex: {
            cursor: null,
            lastScannedAt: "2026-03-31T00:00:00.000Z"
          },
          claude: {
            cursor: null,
            lastScannedAt: "2026-03-31T00:00:00.000Z"
          }
        },
        publish: {
          status: "error",
          gistId: "doctorgist",
          lastPublishedHash: "hash_live",
          lastPublishedAt: "2026-03-30T23:00:00.000Z",
          lastAttemptedAt: "2026-03-31T00:00:00.000Z",
          lastAttemptOutcome: "failed",
          lastSuccessfulSyncAt: "2026-03-30T23:00:00.000Z",
          lastAttemptCandidateHash: "hash_live",
          lastAttemptChangedBadge: "no",
          lastFailureCode: "remote-write-failed",
          publisherId: "publisher-local",
          mode: "shared"
        },
        refresh: {
          lastRefreshedAt: "2026-03-31T00:00:00.000Z",
          lastScanMode: "incremental",
          lastPublishDecision: "failed",
          summary: null
        },
        overrides: {
          ambiguousSessions: {}
        }
      });

      const result = asRunResult(
        await runDoctorChecks({
          cwd: fixture.repo.root,
          homeRoot: fixture.home.root,
          env: {
            GH_TOKEN: "token"
          },
          gistClient: {
            getGist: async () => ({
              id: "doctorgist",
              ownerLogin: "octocat",
              public: true,
              files: {
                [AGENT_BADGE_GIST_FILE]: {
                  filename: AGENT_BADGE_GIST_FILE,
                  content: `{"schemaVersion":1,"label":"AI Usage","message":"42 tokens","color":"#E8A515"}`,
                  truncated: false
                },
                [buildContributorGistFileName("publisher-local")]: {
                  filename: buildContributorGistFileName("publisher-local"),
                  content: createObservationContributorRecord({
                    publisherId: "publisher-local",
                    observations: {
                      [buildSharedOverrideDigest("codex:session-a")]: {
                        sessionUpdatedAt: "2026-03-31T00:00:00.000Z",
                        attributionStatus: "included",
                        overrideDecision: null,
                        tokens: 42,
                        estimatedCostUsdMicros: null
                      }
                    }
                  }),
                  truncated: false
                },
                [AGENT_BADGE_OVERRIDES_GIST_FILE]: {
                  filename: AGENT_BADGE_OVERRIDES_GIST_FILE,
                  content: createOverridesRecord(),
                  truncated: false
                }
              }
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
          }
        })
      );

      const publishTrust = result.checks.find((check) => check.id === "publish-trust");
      const sharedHealth = result.checks.find((check) => check.id === "shared-health");

      expect(publishTrust).toMatchObject({
        id: "publish-trust",
        status: "warn"
      });
      expect(publishTrust?.message).toContain(
        "Live badge trust: publish failed but live badge is unchanged"
      );
      expect(publishTrust?.fix).toContain(
        "Retry publish from the machine with the latest local state by rerunning `agent-badge refresh`."
      );
      expect(sharedHealth?.status).toBe("pass");
    } finally {
      globalThis.fetch = originalFetch;
      await fixture.repo.cleanup();
      await fixture.home.cleanup();
    }
  });

  it("auth-missing stale shared publish uses refresh as the supported recovery path", async () => {
    const fixture = await createRepoFixture();
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = async () => new Response("ok", { status: 200 });
      await writeJsonFile(fixture.repo.root, ".agent-badge/state.json", {
        version: 1,
        init: {
          initialized: true,
          scaffoldVersion: 1,
          lastInitializedAt: "2026-03-31T00:00:00.000Z"
        },
        checkpoints: {
          codex: {
            cursor: null,
            lastScannedAt: "2026-04-05T12:19:48.949Z"
          },
          claude: {
            cursor: null,
            lastScannedAt: "2026-04-05T12:19:48.949Z"
          }
        },
        publish: {
          status: "error",
          gistId: "doctorgist",
          lastPublishedHash: "hash_live",
          lastPublishedAt: "2026-04-02T11:44:53.548Z",
          lastAttemptedAt: "2026-04-05T12:19:48.949Z",
          lastAttemptOutcome: "failed",
          lastSuccessfulSyncAt: "2026-04-02T11:44:53.548Z",
          lastAttemptCandidateHash: "hash_next",
          lastAttemptChangedBadge: "yes",
          lastFailureCode: "auth-missing",
          publisherId: "publisher-local",
          mode: "shared"
        },
        refresh: {
          lastRefreshedAt: "2026-04-05T12:19:48.949Z",
          lastScanMode: "incremental",
          lastPublishDecision: "failed",
          summary: null
        },
        overrides: {
          ambiguousSessions: {}
        }
      });

      const result = asRunResult(
        await runDoctorChecks({
          cwd: fixture.repo.root,
          homeRoot: fixture.home.root,
          env: {},
          gistClient: {
            getGist: async () => ({
              id: "doctorgist",
              ownerLogin: "octocat",
              public: true,
              files: {
                [AGENT_BADGE_GIST_FILE]: {
                  filename: AGENT_BADGE_GIST_FILE,
                  content: `{"schemaVersion":1,"label":"AI Usage","message":"42 tokens","color":"#E8A515"}`,
                  truncated: false
                },
                [buildContributorGistFileName("publisher-local")]: {
                  filename: buildContributorGistFileName("publisher-local"),
                  content: createObservationContributorRecord({
                    publisherId: "publisher-local",
                    observations: {
                      [buildSharedOverrideDigest("codex:session-a")]: {
                        sessionUpdatedAt: "2026-04-05T12:19:48.949Z",
                        attributionStatus: "included",
                        overrideDecision: null,
                        tokens: 42,
                        estimatedCostUsdMicros: null
                      }
                    }
                  }),
                  truncated: false
                },
                [AGENT_BADGE_OVERRIDES_GIST_FILE]: {
                  filename: AGENT_BADGE_OVERRIDES_GIST_FILE,
                  content: createOverridesRecord(),
                  truncated: false
                }
              }
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
          }
        })
      );

      const publishTrust = result.checks.find((check) => check.id === "publish-trust");

      expect(publishTrust?.status).toBe("fail");
      expect(publishTrust?.detail).toContain("Recovery path:");
      expect(publishTrust?.detail).toContain("agent-badge refresh");
      expect(publishTrust?.fix).toContain(
        "Restore GitHub auth, then run `agent-badge refresh`."
      );
    } finally {
      globalThis.fetch = originalFetch;
      await fixture.repo.cleanup();
      await fixture.home.cleanup();
    }
  });

  it("reports pre-push policy wording and degraded-mode semantics in hook diagnostics", async () => {
    const fixture = await createRepoFixture();
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = async () => new Response("ok", { status: 200 });

      await writeJsonFile(fixture.repo.root, ".agent-badge/config.json", {
        ...defaultAgentBadgeConfig,
        refresh: {
          prePush: {
            enabled: true,
            mode: "strict"
          }
        },
        publish: {
          ...defaultAgentBadgeConfig.publish,
          gistId: "doctorgist",
          badgeUrl: buildStableBadgeUrl({
            ownerLogin: "octocat",
            gistId: "doctorgist"
          })
        }
      });
      await writeJsonFile(fixture.repo.root, ".agent-badge/state.json", {
        version: 1,
        init: {
          initialized: true,
          scaffoldVersion: 1,
          lastInitializedAt: "2026-03-31T00:00:00.000Z"
        },
        checkpoints: {
          codex: {
            cursor: null,
            lastScannedAt: "2026-03-31T00:00:00.000Z"
          },
          claude: {
            cursor: null,
            lastScannedAt: "2026-03-31T00:00:00.000Z"
          }
        },
        publish: {
          status: "deferred",
          gistId: "doctorgist",
          lastPublishedHash: null,
          lastPublishedAt: null,
          lastAttemptedAt: null,
          lastAttemptOutcome: "not-attempted",
          lastSuccessfulSyncAt: null,
          lastAttemptCandidateHash: null,
          lastAttemptChangedBadge: "unknown",
          lastFailureCode: "deferred",
          publisherId: null,
          mode: "legacy"
        },
        refresh: {
          lastRefreshedAt: "2026-03-31T00:00:00.000Z",
          lastScanMode: "incremental",
          lastPublishDecision: "deferred",
          summary: null
        },
        overrides: {
          ambiguousSessions: {}
        }
      });
      await writeFile(
        join(fixture.repo.root, ".git/hooks/pre-push"),
        [
          "#!/bin/sh",
          "",
          agentBadgeHookStartMarker,
          "npm run --silent agent-badge:refresh",
          agentBadgeHookEndMarker,
          ""
        ].join("\n"),
        "utf8"
      );

      const strictResult = asRunResult(
        await runDoctorChecks({
          cwd: fixture.repo.root,
          homeRoot: fixture.home.root,
          env: {
            GH_TOKEN: "token"
          },
          gistClient: {
            getGist: async () => ({
              id: "doctorgist",
              ownerLogin: "octocat",
              public: true,
              files: {
                [AGENT_BADGE_GIST_FILE]: {
                  filename: AGENT_BADGE_GIST_FILE,
                  content: `{"schemaVersion":1,"label":"AI Usage","message":"42 tokens","color":"#E8A515"}`,
                  truncated: false
                }
              }
            }),
            createPublicGist: async () => {
              throw new Error("createPublicGist should not run");
            },
            updateGistFile: async () => {
              throw new Error("updateGistFile should not run");
            }
          }
        })
      );
      const strictHook = strictResult.checks.find((check) => check.id === "pre-push-hook");

      expect(strictHook?.detail).toContain("Pre-push policy: strict");
      expect(strictHook?.detail).toContain(
        "push stopped because pre-push policy is strict."
      );

      await writeJsonFile(fixture.repo.root, ".agent-badge/config.json", {
        ...defaultAgentBadgeConfig,
        publish: {
          ...defaultAgentBadgeConfig.publish,
          gistId: "doctorgist",
          badgeUrl: buildStableBadgeUrl({
            ownerLogin: "octocat",
            gistId: "doctorgist"
          })
        }
      });
      await writeFile(
        join(fixture.repo.root, ".git/hooks/pre-push"),
        [
          "#!/bin/sh",
          "",
          agentBadgeHookStartMarker,
          "npm run --silent agent-badge:refresh || true",
          agentBadgeHookEndMarker,
          ""
        ].join("\n"),
        "utf8"
      );

      const failSoftResult = asRunResult(
        await runDoctorChecks({
          cwd: fixture.repo.root,
          homeRoot: fixture.home.root,
          env: {
            GH_TOKEN: "token"
          },
          gistClient: {
            getGist: async () => ({
              id: "doctorgist",
              ownerLogin: "octocat",
              public: true,
              files: {
                [AGENT_BADGE_GIST_FILE]: {
                  filename: AGENT_BADGE_GIST_FILE,
                  content: `{"schemaVersion":1,"label":"AI Usage","message":"42 tokens","color":"#E8A515"}`,
                  truncated: false
                }
              }
            }),
            createPublicGist: async () => {
              throw new Error("createPublicGist should not run");
            },
            updateGistFile: async () => {
              throw new Error("updateGistFile should not run");
            }
          }
        })
      );
      const failSoftHook = failSoftResult.checks.find(
        (check) => check.id === "pre-push-hook"
      );

      expect(failSoftHook?.detail).toContain("Pre-push policy: fail-soft");
      expect(failSoftHook?.detail).toContain(
        "live badge may be stale; push continues because pre-push policy is fail-soft."
      );
    } finally {
      globalThis.fetch = originalFetch;
      await fixture.repo.cleanup();
      await fixture.home.cleanup();
    }
  });

  it("performs publish write probe when requested", async () => {
    const fixture = await createRepoFixture({
      withCodexProvider: false,
      withManagedReadme: false,
      withManagedHook: false
    });
    const updateCalls: string[] = [];
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = async (input: RequestInfo | URL) => {
        if (String(input).includes("agent-badge.json")) {
          return new Response(
            '{"schemaVersion":1,"label":"AI Usage","message":"42 tokens | $12.34","color":"#E8A515"}',
            { status: 200 }
          );
        }

        return new Response("ok", { status: 200 });
      };

      const result = asRunResult(
        await runDoctorChecks({
          cwd: fixture.repo.root,
          homeRoot: fixture.home.root,
          env: {
            GH_TOKEN: "token"
          },
          runProbeWrite: true,
          gistClient: {
            getGist: async () => ({
              id: "doctorgist",
              ownerLogin: "octocat",
              public: true,
              files: [AGENT_BADGE_GIST_FILE]
            }),
            createPublicGist: async () => {
              throw new Error("createPublicGist should not run");
            },
            updateGistFile: async () => {
              updateCalls.push("updated");

              return {
                id: "doctorgist",
                ownerLogin: "octocat",
                public: true,
                files: [AGENT_BADGE_GIST_FILE]
              };
            }
          }
        })
      );

      expect(updateCalls).toHaveLength(1);
      expect(result.checks.find((check) => check.id === "publish-write")?.status).toBe(
        "pass"
      );
    } finally {
      globalThis.fetch = originalFetch;
      await fixture.repo.cleanup();
      await fixture.home.cleanup();
    }
  });
});
