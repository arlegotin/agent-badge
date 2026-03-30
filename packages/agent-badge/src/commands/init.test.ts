import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { defaultAgentBadgeConfig, defaultAgentBadgeState } from "@agent-badge/core";
import { runInitCommand } from "./init.js";

const execFileAsync = promisify(execFile);
const publishableSemverPattern =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

interface Fixture {
  readonly root: string;
  cleanup(): Promise<void>;
}

interface OutputCapture {
  readonly writer: {
    write(chunk: string): void;
  };
  read(): string;
}

async function createRepoFixture(options: {
  readonly git?: boolean;
  readonly readme?: boolean;
  readonly files?: Record<string, string>;
} = {}): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "agent-badge-command-"));

  if (options.git ?? true) {
    await execFileAsync("git", ["init", "--quiet"], { cwd: root });
  }

  if (options.readme ?? true) {
    await writeFile(join(root, "README.md"), "# Fixture Repo\n", "utf8");
  }

  for (const [relativePath, content] of Object.entries(options.files ?? {})) {
    const targetPath = join(root, relativePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content, "utf8");
  }

  return {
    root,
    cleanup() {
      return rm(root, { recursive: true, force: true });
    }
  };
}

async function createProviderHome(options: {
  readonly codex?: boolean;
  readonly claude?: boolean;
} = {}): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "agent-badge-command-home-"));

  if (options.codex ?? true) {
    await mkdir(join(root, ".codex"), { recursive: true });
  }

  if (options.claude ?? true) {
    await mkdir(join(root, ".claude"), { recursive: true });
  }

  return {
    root,
    cleanup() {
      return rm(root, { recursive: true, force: true });
    }
  };
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

async function readJsonObject(
  targetPath: string | URL
): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(targetPath, "utf8")) as Record<string, unknown>;
}

async function readPublishFiles(repoRoot: string): Promise<{
  config: Record<string, unknown>;
  state: Record<string, unknown>;
}> {
  return {
    config: await readJsonObject(join(repoRoot, ".agent-badge/config.json")),
    state: await readJsonObject(join(repoRoot, ".agent-badge/state.json"))
  };
}

async function getExpectedRuntimeDependencySpecifier(): Promise<string> {
  const runtimePackageJson = await readJsonObject(
    new URL("../../package.json", import.meta.url)
  );
  const version = runtimePackageJson.version;

  if (
    typeof version !== "string" ||
    version === "0.0.0" ||
    !publishableSemverPattern.test(version)
  ) {
    return "latest";
  }

  return `^${version}`;
}

describe("runInitCommand", () => {
  it("runs the shared init flow end to end for a repository", async () => {
    const repo = await createRepoFixture({
      files: {
        "package-lock.json": "{}"
      }
    });
    const providers = await createProviderHome({
      claude: false
    });
    const output = createOutputCapture();
    const secondOutput = createOutputCapture();
      const packageJsonPath = join(repo.root, "package.json");
      const prePushHookPath = join(repo.root, ".git/hooks/pre-push");

    try {
      const expectedRuntimeDependencySpecifier =
        await getExpectedRuntimeDependencySpecifier();
      const initializerPackageJson = await readJsonObject(
        new URL("../../../create-agent-badge/package.json", import.meta.url)
      );
      const result = await runInitCommand({
        cwd: repo.root,
        homeRoot: providers.root,
        env: {
          GITHUB_TOKEN: "test-token"
        },
        stdout: output.writer
      });

      expect(result.preflight.git.isRepo).toBe(true);
      expect(result.scaffold.created).toEqual(
        expect.arrayContaining([
          ".agent-badge/config.json",
          ".agent-badge/state.json"
        ])
      );
      expect(result.runtimeWiring.created).toEqual(
        expect.arrayContaining([
          "package.json#devDependencies.agent-badge",
          "package.json#scripts.agent-badge:init",
          "package.json#scripts.agent-badge:refresh",
          ".git/hooks/pre-push"
        ])
      );
      expect(existsSync(join(repo.root, ".agent-badge/config.json"))).toBe(true);
      expect(existsSync(packageJsonPath)).toBe(true);
      expect(existsSync(prePushHookPath)).toBe(true);

      const packageJson = await readJsonObject(packageJsonPath);
      const publishFiles = await readPublishFiles(repo.root);
      const packageScripts = packageJson.scripts as Record<string, string>;
      const devDependencies = packageJson.devDependencies as Record<string, string>;
      const hookContent = await readFile(prePushHookPath, "utf8");

      expect(devDependencies["agent-badge"]).toBe(expectedRuntimeDependencySpecifier);
      expect(devDependencies["agent-badge"]).not.toBe(
        (initializerPackageJson.dependencies as Record<string, string>)["agent-badge"]
      );
      expect(packageScripts["agent-badge:init"]).toBe("agent-badge init");
      expect(packageScripts["agent-badge:refresh"]).toBe(
        "agent-badge refresh --hook pre-push --fail-soft"
      );
      expect(publishFiles.config.publish).toEqual({
        provider: "github-gist",
        gistId: null,
        badgeUrl: null
      });
      expect(publishFiles.state.publish).toEqual({
        status: "deferred",
        gistId: null,
        lastPublishedHash: null
      });
      expect(hookContent.match(/# agent-badge:start/gm)).toHaveLength(1);
      expect(hookContent.match(/# agent-badge:end/gm)).toHaveLength(1);

      const secondRun = await runInitCommand({
        cwd: repo.root,
        homeRoot: providers.root,
        env: {
          GITHUB_TOKEN: "test-token"
        },
        stdout: secondOutput.writer
      });

      expect(secondRun.runtimeWiring.created).toEqual([]);
      expect(secondRun.runtimeWiring.updated).toEqual([]);
      expect(secondRun.runtimeWiring.reused).toEqual(
        expect.arrayContaining([
          "package.json#devDependencies.agent-badge",
          "package.json#scripts.agent-badge:init",
          "package.json#scripts.agent-badge:refresh",
          "package.json",
          ".git/hooks/pre-push"
        ])
      );

      const secondHookContent = await readFile(prePushHookPath, "utf8");

      expect(secondHookContent.match(/# agent-badge:start/gm)).toHaveLength(1);
      expect(secondHookContent.match(/# agent-badge:end/gm)).toHaveLength(1);
      expect(output.read()).toContain("agent-badge init preflight");
      expect(output.read()).toContain("agent-badge init scaffold");
      expect(output.read()).toContain("agent-badge init runtime wiring");
      expect(output.read()).toContain("GitHub auth: env:GITHUB_TOKEN");
      expect(output.read()).toContain("- Publish target: deferred");
      expect(secondOutput.read()).toContain("agent-badge init runtime wiring");
      expect(secondOutput.read()).toContain("- Publish target: deferred");
    } finally {
      await Promise.all([repo.cleanup(), providers.cleanup()]);
    }
  });

  it("connects an explicit gist id when --gist-id is supplied", async () => {
    const repo = await createRepoFixture({
      files: {
        "package-lock.json": "{}"
      }
    });
    const output = createOutputCapture();

    try {
      const getGist = async () => ({
        id: "gist_connected",
        ownerLogin: "octocat",
        public: true,
        files: ["agent-badge.json"]
      });
      const createPublicGist = async () => {
        throw new Error("create should not run");
      };

      await runInitCommand({
        cwd: repo.root,
        gistId: "gist_connected",
        stdout: output.writer,
        gistClient: {
          getGist,
          createPublicGist,
          updateGistFile: async () => {
            throw new Error("update should not run");
          }
        }
      });

      const publishFiles = await readPublishFiles(repo.root);

      expect(publishFiles.config.publish).toEqual({
        provider: "github-gist",
        gistId: "gist_connected",
        badgeUrl:
          "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_connected%2Fraw%2Fagent-badge.json&cacheSeconds=3600"
      });
      expect(publishFiles.state.publish).toEqual({
        status: "pending",
        gistId: "gist_connected",
        lastPublishedHash: null
      });
      expect(output.read()).toContain("- Publish target: connected existing gist");
    } finally {
      await repo.cleanup();
    }
  });

  it("creates a public gist automatically when auth is available", async () => {
    const repo = await createRepoFixture({
      files: {
        "package-lock.json": "{}"
      }
    });
    const output = createOutputCapture();
    let createCalls = 0;

    try {
      await runInitCommand({
        cwd: repo.root,
        env: {
          GH_TOKEN: "test-token"
        },
        stdout: output.writer,
        gistClient: {
          getGist: async () => ({
            id: "unused",
            ownerLogin: "octocat",
            public: true,
            files: ["agent-badge.json"]
          }),
          createPublicGist: async () => {
            createCalls += 1;

            return {
              id: "gist_created",
              ownerLogin: "octocat",
              public: true,
              files: ["agent-badge.json"]
            };
          },
          updateGistFile: async () => {
            throw new Error("update should not run");
          }
        }
      });

      const publishFiles = await readPublishFiles(repo.root);

      expect(createCalls).toBe(1);
      expect(publishFiles.config.publish).toEqual({
        provider: "github-gist",
        gistId: "gist_created",
        badgeUrl:
          "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_created%2Fraw%2Fagent-badge.json&cacheSeconds=3600"
      });
      expect(publishFiles.state.publish).toEqual({
        status: "pending",
        gistId: "gist_created",
        lastPublishedHash: null
      });
      expect(output.read()).toContain("- Publish target: created public gist");
    } finally {
      await repo.cleanup();
    }
  });

  it("reuses an already configured gist on deferred-mode reruns without creating another gist", async () => {
    const repo = await createRepoFixture({
      files: {
        "package-lock.json": "{}",
        ".agent-badge/config.json": `${JSON.stringify(
          {
            ...defaultAgentBadgeConfig,
            publish: {
              provider: "github-gist",
              gistId: "gist_existing",
              badgeUrl:
                "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_existing%2Fraw%2Fagent-badge.json&cacheSeconds=3600"
            }
          },
          null,
          2
        )}\n`,
        ".agent-badge/state.json": `${JSON.stringify(
          {
            ...defaultAgentBadgeState,
            init: {
              initialized: true,
              scaffoldVersion: 1,
              lastInitializedAt: "2026-03-30T00:00:00.000Z"
            },
            publish: {
              status: "deferred",
              gistId: "gist_existing",
              lastPublishedHash: null
            }
          },
          null,
          2
        )}\n`
      }
    });
    const output = createOutputCapture();
    let createCalls = 0;
    let getCalls = 0;

    try {
      await runInitCommand({
        cwd: repo.root,
        stdout: output.writer,
        gistClient: {
          getGist: async () => {
            getCalls += 1;

            return {
              id: "gist_existing",
              ownerLogin: "octocat",
              public: true,
              files: ["agent-badge.json"]
            };
          },
          createPublicGist: async () => {
            createCalls += 1;
            throw new Error("create should not run");
          },
          updateGistFile: async () => {
            throw new Error("update should not run");
          }
        }
      });

      const publishFiles = await readPublishFiles(repo.root);

      expect(getCalls).toBe(1);
      expect(createCalls).toBe(0);
      expect(publishFiles.config.publish).toEqual({
        provider: "github-gist",
        gistId: "gist_existing",
        badgeUrl:
          "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_existing%2Fraw%2Fagent-badge.json&cacheSeconds=3600"
      });
      expect(publishFiles.state.publish).toEqual({
        status: "pending",
        gistId: "gist_existing",
        lastPublishedHash: null
      });
      expect(output.read()).toContain("- Publish target: reused existing gist");
    } finally {
      await repo.cleanup();
    }
  });

  it("bootstraps git before scaffolding when non-git initialization is allowed", async () => {
    const repo = await createRepoFixture({
      git: false,
      files: {
        "package-lock.json": "{}"
      }
    });
    const output = createOutputCapture();

    try {
      const result = await runInitCommand({
        cwd: repo.root,
        allowGitInit: true,
        stdout: output.writer
      });

      expect(result.preflight.git.isRepo).toBe(true);
      expect(result.runtimeWiring.created).toEqual(
        expect.arrayContaining([
          "package.json#devDependencies.agent-badge",
          ".git/hooks/pre-push"
        ])
      );
      expect(existsSync(join(repo.root, ".git"))).toBe(true);
      expect(existsSync(join(repo.root, ".agent-badge/config.json"))).toBe(true);
      expect(existsSync(join(repo.root, "package.json"))).toBe(true);
      expect(output.read()).toContain("Git bootstrap: running");
      expect(output.read()).toContain("Git bootstrap: repository initialized");
    } finally {
      await repo.cleanup();
    }
  });

  it("blocks a non-git directory when non-git initialization is disabled", async () => {
    const repo = await createRepoFixture({
      git: false
    });
    const output = createOutputCapture();

    try {
      await expect(
        runInitCommand({
          cwd: repo.root,
          allowGitInit: false,
          stdout: output.writer
        })
      ).rejects.toThrow(/non-git workspace/i);

      expect(output.read()).toContain("non-git directory");
      expect(output.read()).toContain("Git bootstrap: blocked");
      expect(output.read()).toContain("Blocked:");
      expect(existsSync(join(repo.root, ".git"))).toBe(false);
      expect(existsSync(join(repo.root, ".agent-badge"))).toBe(false);
    } finally {
      await repo.cleanup();
    }
  });
});
