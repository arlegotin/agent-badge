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
import { runInitCommand } from "./init.js";

const execFileAsync = promisify(execFile);
const readmeStartMarker = "<!-- agent-badge:start -->";
const hookStartMarker = "# agent-badge:start";

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
    it(`${scenario.name}`, async () => {
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

        expect(countOccurrences(hookContent, hookStartMarker)).toBe(1);

        if (scenario.name === "no-auth") {
          expect(gistClient.getGistCalls).toBe(0);
          expect(gistClient.createPublicGistCalls).toBe(0);
          expect(gistClient.updateGistFileCalls).toBe(0);
          expect(gistClient.deleteGistCalls).toBe(0);
        }
      } finally {
        await Promise.all([repo.cleanup(), providerFixture.cleanup()]);
      }
    });
  }
});
