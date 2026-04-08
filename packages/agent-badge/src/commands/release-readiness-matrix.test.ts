import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  createProviderFixture,
  createRepoFixture,
  type CreateProviderFixtureOptions,
  type CreateRepoFixtureOptions
} from "@agent-badge/testkit";
import { runConfigCommand } from "./config.js";
import { runInitCommand } from "./init.js";
import { runStatusCommand } from "./status.js";

const execFileAsync = promisify(execFile);
const readmeStartMarker = "<!-- agent-badge:start -->";
const hookStartMarker = "# agent-badge:start";
const sharedRuntimeGuard = "command -v agent-badge >/dev/null 2>&1";
const legacyHookRunners = [
  "npm run --silent agent-badge:refresh",
  "pnpm run --silent agent-badge:refresh",
  "yarn run agent-badge:refresh",
  "bun run agent-badge:refresh"
] as const;

interface Scenario {
  readonly name:
    | "fresh-repo"
    | "existing-repo-rerun"
    | "providers-codex-only"
    | "providers-claude-only"
    | "providers-both"
    | "no-readme"
    | "no-origin"
    | "no-auth"
    | "idempotent-reinit";
  readonly repo?: CreateRepoFixtureOptions;
  readonly providers?: CreateProviderFixtureOptions;
  readonly addOrigin: boolean;
  readonly env?: NodeJS.ProcessEnv;
  readonly gistId?: string;
  readonly runCount: number;
  readonly expectedPublishStatus: "published" | "deferred";
  readonly expectedReadmeStartMarkers: number;
  readonly expectReadmeToExist: boolean;
  readonly expectedProviderAvailability: {
    readonly codex: boolean;
    readonly claude: boolean;
  };
}

interface JsonStatePublish {
  readonly status: "published" | "deferred";
}

interface JsonStateFile {
  readonly publish: JsonStatePublish;
}

interface DeterministicGistClient {
  readonly getGistCalls: number;
  readonly createPublicGistCalls: number;
  readonly updateGistFileCalls: number;
  readonly deleteGistCalls: number;
  getGist(gistId: string): Promise<{
    id: string;
    ownerLogin: string;
    public: true;
    files: string[];
  }>;
  createPublicGist(input: {
    readonly description: string;
    readonly files: Record<string, { readonly content: string }>;
  }): Promise<{
    id: string;
    ownerLogin: string;
    public: true;
    files: string[];
  }>;
  updateGistFile(input: {
    readonly gistId: string;
    readonly files: Record<string, { readonly content: string }>;
  }): Promise<{
    id: string;
    ownerLogin: string;
    public: true;
    files: string[];
  }>;
  deleteGist(input: { readonly gistId: string }): Promise<void>;
}

function countOccurrences(content: string, value: string): number {
  return content.split(value).length - 1;
}

function createGistMetadata(id: string): {
  id: string;
  ownerLogin: string;
  public: true;
  files: string[];
} {
  return {
    id,
    ownerLogin: "octocat",
    public: true,
    files: ["agent-badge.json"]
  };
}

function createDeterministicGistClient(defaultGistId: string): DeterministicGistClient {
  let getGistCalls = 0;
  let createPublicGistCalls = 0;
  let updateGistFileCalls = 0;
  let deleteGistCalls = 0;

  return {
    get getGistCalls() {
      return getGistCalls;
    },
    get createPublicGistCalls() {
      return createPublicGistCalls;
    },
    get updateGistFileCalls() {
      return updateGistFileCalls;
    },
    get deleteGistCalls() {
      return deleteGistCalls;
    },
    async getGist(gistId) {
      getGistCalls += 1;
      return createGistMetadata(gistId);
    },
    async createPublicGist(_input) {
      createPublicGistCalls += 1;
      return createGistMetadata(defaultGistId);
    },
    async updateGistFile(input) {
      updateGistFileCalls += 1;
      return createGistMetadata(input.gistId);
    },
    async deleteGist(_input) {
      deleteGistCalls += 1;
    }
  };
}

async function readPublishStatus(repoRoot: string): Promise<"published" | "deferred"> {
  const statePath = join(repoRoot, ".agent-badge/state.json");
  const parsed = JSON.parse(await readFile(statePath, "utf8")) as JsonStateFile;
  return parsed.publish.status;
}

async function readPackageJsonIfPresent(repoRoot: string): Promise<{
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
} | null> {
  const packageJsonPath = join(repoRoot, "package.json");

  if (!existsSync(packageJsonPath)) {
    return null;
  }

  return JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

function expectNoManagedRuntimeManifestOwnership(
  packageJson: {
    scripts?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } | null
): void {
  expect(packageJson?.scripts?.["agent-badge:init"]).toBeUndefined();
  expect(packageJson?.scripts?.["agent-badge:refresh"]).toBeUndefined();
  expect(packageJson?.devDependencies?.["@legotin/agent-badge"]).toBeUndefined();
}

async function addOrigin(repoRoot: string): Promise<void> {
  await execFileAsync(
    "git",
    ["remote", "add", "origin", "https://github.com/openai/agent-badge.git"],
    { cwd: repoRoot }
  );
}

describe("release readiness scenario matrix", () => {
  const scenarios: Scenario[] = [
    {
      name: "fresh-repo",
      addOrigin: true,
      env: { GITHUB_TOKEN: "matrix-token" },
      gistId: "gist-fresh-repo",
      runCount: 1,
      expectedPublishStatus: "published",
      expectedReadmeStartMarkers: 1,
      expectReadmeToExist: true,
      expectedProviderAvailability: { codex: true, claude: true },
      repo: {
        files: { "package-lock.json": "{}" }
      }
    },
    {
      name: "existing-repo-rerun",
      addOrigin: true,
      env: { GITHUB_TOKEN: "matrix-token" },
      gistId: "gist-existing-repo-rerun",
      runCount: 2,
      expectedPublishStatus: "published",
      expectedReadmeStartMarkers: 1,
      expectReadmeToExist: true,
      expectedProviderAvailability: { codex: true, claude: true },
      repo: {
        files: { "package-lock.json": "{}" }
      }
    },
    {
      name: "providers-codex-only",
      addOrigin: true,
      env: { GITHUB_TOKEN: "matrix-token" },
      gistId: "gist-providers-codex-only",
      runCount: 1,
      expectedPublishStatus: "published",
      expectedReadmeStartMarkers: 1,
      expectReadmeToExist: true,
      expectedProviderAvailability: { codex: true, claude: false },
      providers: {
        codex: true,
        claude: false
      },
      repo: {
        files: { "package-lock.json": "{}" }
      }
    },
    {
      name: "providers-claude-only",
      addOrigin: true,
      env: { GITHUB_TOKEN: "matrix-token" },
      gistId: "gist-providers-claude-only",
      runCount: 1,
      expectedPublishStatus: "published",
      expectedReadmeStartMarkers: 1,
      expectReadmeToExist: true,
      expectedProviderAvailability: { codex: false, claude: true },
      providers: {
        codex: false,
        claude: true
      },
      repo: {
        files: { "package-lock.json": "{}" }
      }
    },
    {
      name: "providers-both",
      addOrigin: true,
      env: { GITHUB_TOKEN: "matrix-token" },
      gistId: "gist-providers-both",
      runCount: 1,
      expectedPublishStatus: "published",
      expectedReadmeStartMarkers: 1,
      expectReadmeToExist: true,
      expectedProviderAvailability: { codex: true, claude: true },
      providers: {
        codex: true,
        claude: true
      },
      repo: {
        files: { "package-lock.json": "{}" }
      }
    },
    {
      name: "no-readme",
      addOrigin: true,
      env: { GITHUB_TOKEN: "matrix-token" },
      gistId: "gist-no-readme",
      runCount: 1,
      expectedPublishStatus: "published",
      expectedReadmeStartMarkers: 0,
      expectReadmeToExist: false,
      expectedProviderAvailability: { codex: true, claude: true },
      repo: {
        readme: false,
        files: { "package-lock.json": "{}" }
      }
    },
    {
      name: "no-origin",
      addOrigin: false,
      env: { GITHUB_TOKEN: "matrix-token" },
      gistId: "gist-no-origin",
      runCount: 1,
      expectedPublishStatus: "published",
      expectedReadmeStartMarkers: 1,
      expectReadmeToExist: true,
      expectedProviderAvailability: { codex: true, claude: true },
      repo: {
        files: { "package-lock.json": "{}" }
      }
    },
    {
      name: "no-auth",
      addOrigin: true,
      env: {
        GH_TOKEN: "",
        GITHUB_TOKEN: "",
        GITHUB_PAT: ""
      },
      runCount: 1,
      expectedPublishStatus: "deferred",
      expectedReadmeStartMarkers: 0,
      expectReadmeToExist: true,
      expectedProviderAvailability: { codex: true, claude: true },
      repo: {
        files: { "package-lock.json": "{}" }
      }
    },
    {
      name: "idempotent-reinit",
      addOrigin: true,
      env: { GITHUB_TOKEN: "matrix-token" },
      gistId: "gist-idempotent-reinit",
      runCount: 3,
      expectedPublishStatus: "published",
      expectedReadmeStartMarkers: 1,
      expectReadmeToExist: true,
      expectedProviderAvailability: { codex: true, claude: true },
      repo: {
        files: { "package-lock.json": "{}" }
      }
    }
  ];

  for (const scenario of scenarios) {
    it(
      `${scenario.name}`,
      async () => {
        const repo = await createRepoFixture(scenario.repo);
        const providerFixture = await createProviderFixture(scenario.providers);
        const gistClient = createDeterministicGistClient(
          scenario.gistId ?? `gist-${scenario.name}`
        );

        try {
          if (scenario.addOrigin) {
            await addOrigin(repo.root);
          }

          let lastResult: Awaited<ReturnType<typeof runInitCommand>> | null = null;
          for (let runIndex = 0; runIndex < scenario.runCount; runIndex += 1) {
            lastResult = await runInitCommand({
              cwd: repo.root,
              homeRoot: providerFixture.homeRoot,
              env: scenario.env,
              gistId: runIndex === 0 ? scenario.gistId : undefined,
              gistClient
            });
          }

          if (lastResult === null) {
            throw new Error("Expected at least one init run.");
          }

          expect(lastResult.preflight.providers.codex.available).toBe(
            scenario.expectedProviderAvailability.codex
          );
          expect(lastResult.preflight.providers.claude.available).toBe(
            scenario.expectedProviderAvailability.claude
          );
          expect(lastResult.preflight.git.hasOrigin).toBe(scenario.addOrigin);

          expect(await readPublishStatus(repo.root)).toBe(
            scenario.expectedPublishStatus
          );

          const readmePath = join(repo.root, "README.md");
          const readmeExists = existsSync(readmePath);

          expect(readmeExists).toBe(scenario.expectReadmeToExist);

          if (readmeExists) {
            const readmeContent = await readFile(readmePath, "utf8");
            expect(countOccurrences(readmeContent, readmeStartMarker)).toBe(
              scenario.expectedReadmeStartMarkers
            );
          } else {
            expect(scenario.name).toBe("no-readme");
          }

          const hookContent = await readFile(
            join(repo.root, ".git/hooks/pre-push"),
            "utf8"
          );
          const gitignoreContent = await readFile(join(repo.root, ".gitignore"), "utf8");
          const packageJson = await readPackageJsonIfPresent(repo.root);

          expect(existsSync(join(repo.root, ".agent-badge/config.json"))).toBe(true);
          expect(existsSync(join(repo.root, ".agent-badge/state.json"))).toBe(true);
          expect(packageJson).toBeNull();
          expectNoManagedRuntimeManifestOwnership(packageJson);
          expect(gitignoreContent).toContain(".agent-badge/state.json");
          expect(gitignoreContent).toContain(".agent-badge/cache/");
          expect(gitignoreContent).toContain(".agent-badge/logs/");
          expect(countOccurrences(hookContent, hookStartMarker)).toBe(1);
          expect(hookContent).toContain(sharedRuntimeGuard);
          expect(hookContent).toContain(
            "agent-badge refresh --hook pre-push --hook-policy fail-soft || true"
          );
          for (const runner of legacyHookRunners) {
            expect(hookContent).not.toContain(runner);
          }

          if (scenario.name === "no-auth") {
            expect(gistClient.getGistCalls).toBe(0);
            expect(gistClient.createPublicGistCalls).toBe(0);
            expect(gistClient.updateGistFileCalls).toBe(0);
            expect(gistClient.deleteGistCalls).toBe(0);
          }
        } finally {
          await Promise.all([repo.cleanup(), providerFixture.cleanup()]);
        }
      },
      15_000
    );
  }

  it("rewires strict pre-push policy explicitly after init", async () => {
    const repo = await createRepoFixture({
      files: { "package-lock.json": "{}" }
    });
    const providerFixture = await createProviderFixture();
    const gistClient = createDeterministicGistClient("gist-strict");

    try {
      await addOrigin(repo.root);
      await runInitCommand({
        cwd: repo.root,
        homeRoot: providerFixture.homeRoot,
        env: { GITHUB_TOKEN: "matrix-token" },
        gistClient
      });

      await runConfigCommand({
        cwd: repo.root,
        action: "set",
        key: "refresh.prePush.mode",
        value: "strict"
      });

      const hookContent = await readFile(join(repo.root, ".git/hooks/pre-push"), "utf8");
      const packageJson = await readPackageJsonIfPresent(repo.root);

      expect(packageJson).toBeNull();
      expectNoManagedRuntimeManifestOwnership(packageJson);
      expect(hookContent).toContain(sharedRuntimeGuard);
      expect(hookContent).toContain(
        "agent-badge refresh --hook pre-push --hook-policy strict"
      );
      for (const runner of legacyHookRunners) {
        expect(hookContent).not.toContain(runner);
      }
      expect(hookContent).not.toContain("|| true");
    } finally {
      await Promise.all([repo.cleanup(), providerFixture.cleanup()]);
    }
  });

  it.each([
    {
      packageManager: "npm",
      lockfile: "package-lock.json"
    },
    {
      packageManager: "pnpm",
      lockfile: "pnpm-lock.yaml"
    },
    {
      packageManager: "yarn",
      lockfile: "yarn.lock"
    },
    {
      packageManager: "bun",
      lockfile: "bun.lock"
    }
  ])(
    "writes the shared managed hook contract for $packageManager repos",
    async ({ lockfile }) => {
      const repo = await createRepoFixture({
        files: { [lockfile]: "{}" }
      });
      const providerFixture = await createProviderFixture();
      const gistClient = createDeterministicGistClient(`gist-${lockfile}`);

      try {
        await addOrigin(repo.root);
        await runInitCommand({
          cwd: repo.root,
          homeRoot: providerFixture.homeRoot,
          env: { GITHUB_TOKEN: "matrix-token" },
          gistClient
        });

        const hookContent = await readFile(join(repo.root, ".git/hooks/pre-push"), "utf8");
        const packageJson = await readPackageJsonIfPresent(repo.root);

        expect(packageJson).toBeNull();
        expectNoManagedRuntimeManifestOwnership(packageJson);
        expect(hookContent).toContain(sharedRuntimeGuard);
        expect(hookContent).toContain(
          "agent-badge refresh --hook pre-push --hook-policy fail-soft || true"
        );
        for (const runner of legacyHookRunners) {
          expect(hookContent).not.toContain(runner);
        }
      } finally {
        await Promise.all([repo.cleanup(), providerFixture.cleanup()]);
      }
    }
  );

  it("stale failed publish recovery", async () => {
    const repo = await createRepoFixture({
      files: {
        ".agent-badge/config.json": `${JSON.stringify(
          {
            version: 1,
            providers: {
              codex: { enabled: true },
              claude: { enabled: true }
            },
            repo: {
              aliases: {
                remotes: [],
                slugs: []
              }
            },
            badge: {
              label: "AI budget",
              mode: "combined"
            },
            publish: {
              provider: "github-gist",
              gistId: "gist_recovery_matrix",
              badgeUrl:
                "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_recovery_matrix%2Fraw%2Fagent-badge.json&cacheSeconds=300"
            },
            refresh: {
              prePush: {
                enabled: true,
                mode: "strict"
              }
            },
            privacy: {
              aggregateOnly: true,
              output: "standard"
            }
          },
          null,
          2
        )}\n`,
        ".agent-badge/state.json": `${JSON.stringify(
          {
            version: 1,
            init: {
              initialized: true,
              scaffoldVersion: 1,
              lastInitializedAt: "2026-04-05T12:19:48.949Z"
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
              gistId: "gist_recovery_matrix",
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
              summary: {
                includedSessions: 2,
                includedTokens: 140,
                includedEstimatedCostUsdMicros: null,
                ambiguousSessions: 0,
                excludedSessions: 0
              }
            },
            overrides: {
              ambiguousSessions: {}
            }
          },
          null,
          2
        )}\n`,
        "package-lock.json": "{}"
      }
    });

    try {
      const result = await runStatusCommand({
        cwd: repo.root,
        gistClient: {
          getGist: async () => {
            throw new Error("skip shared health lookup in matrix recovery check");
          },
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
      });

      expect(result.report).toContain("Live badge trust: stale after failed publish");
      expect(result.report).toContain(
        "- Recovery: Restore GitHub auth, then run `agent-badge refresh`."
      );
    } finally {
      await repo.cleanup();
    }
  });
});
