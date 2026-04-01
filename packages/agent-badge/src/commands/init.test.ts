import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { defaultAgentBadgeConfig, defaultAgentBadgeState } from "@legotin/agent-badge-core";
import { runInitCommand } from "./init.js";
import { runUninstallCommand } from "./uninstall.js";

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

async function readReadmeContent(repoRoot: string): Promise<string> {
  return readFile(join(repoRoot, "README.md"), "utf8");
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
  it("creates exactly one managed pre-push block by default", async () => {
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
    const gitignorePath = join(repo.root, ".gitignore");
    const prePushHookPath = join(repo.root, ".git/hooks/pre-push");
    const deferredGistClient = {
      getGist: async () => {
        throw new Error("get should not run");
      },
      createPublicGist: async () => {
        throw new Error("simulated gist create failure");
      },
      updateGistFile: async () => {
        throw new Error("update should not run");
      }
    };

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
        stdout: output.writer,
        gistClient: deferredGistClient
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
          "package.json#devDependencies.@legotin/agent-badge",
          "package.json#scripts.agent-badge:init",
          "package.json#scripts.agent-badge:refresh",
          ".gitignore",
          ".git/hooks/pre-push"
        ])
      );
      expect(existsSync(join(repo.root, ".agent-badge/config.json"))).toBe(true);
      expect(existsSync(packageJsonPath)).toBe(true);
      expect(existsSync(gitignorePath)).toBe(true);
      expect(existsSync(prePushHookPath)).toBe(true);

      const packageJson = await readJsonObject(packageJsonPath);
      const publishFiles = await readPublishFiles(repo.root);
      const packageScripts = packageJson.scripts as Record<string, string>;
      const devDependencies = packageJson.devDependencies as Record<string, string>;
      const gitignoreContent = await readFile(gitignorePath, "utf8");
      const hookContent = await readFile(prePushHookPath, "utf8");
      const readmeContent = await readReadmeContent(repo.root);

      expect(devDependencies["@legotin/agent-badge"]).toBe(expectedRuntimeDependencySpecifier);
      expect(initializerPackageJson).toMatchObject({
        dependencies: {
          "@legotin/agent-badge": expectedRuntimeDependencySpecifier
        }
      });
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
        lastPublishedHash: null,
        lastPublishedAt: null
      });
      expect(gitignoreContent).toContain(".agent-badge/state.json");
      expect(gitignoreContent).toContain(".agent-badge/cache/");
      expect(gitignoreContent).toContain(".agent-badge/logs/");
      expect(readmeContent).toBe("# Fixture Repo\n");
      expect(hookContent.match(/# agent-badge:start/gm)).toHaveLength(1);
      expect(hookContent.match(/# agent-badge:end/gm)).toHaveLength(1);

      const secondRun = await runInitCommand({
        cwd: repo.root,
        homeRoot: providers.root,
        env: {
          GITHUB_TOKEN: "test-token"
        },
        stdout: secondOutput.writer,
        gistClient: deferredGistClient
      });

      expect(secondRun.runtimeWiring.created).toEqual([]);
      expect(secondRun.runtimeWiring.updated).toEqual([]);
      expect(secondRun.runtimeWiring.reused).toEqual(
        expect.arrayContaining([
          "package.json#devDependencies.@legotin/agent-badge",
          "package.json#scripts.agent-badge:init",
          "package.json#scripts.agent-badge:refresh",
          "package.json",
          ".gitignore",
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
      expect(output.read()).toContain("- Badge setup deferred:");
      expect(secondOutput.read()).toContain("agent-badge init runtime wiring");
      expect(secondOutput.read()).toContain("- Publish target: deferred");
      expect(secondOutput.read()).toContain("- Badge setup deferred:");
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
    const providers = await createProviderHome();
    const output = createOutputCapture();

    try {
      const getGist = async () => createGistMetadata("gist_connected");
      const createPublicGist = async () => {
        throw new Error("create should not run");
      };

      await runInitCommand({
        cwd: repo.root,
        homeRoot: providers.root,
        gistId: "gist_connected",
        stdout: output.writer,
        gistClient: {
          getGist,
          createPublicGist,
          updateGistFile: async () => createGistMetadata("gist_connected")
        }
      });

      const publishFiles = await readPublishFiles(repo.root);
      const readmeContent = await readReadmeContent(repo.root);

      expect(publishFiles.config.publish).toEqual({
        provider: "github-gist",
        gistId: "gist_connected",
        badgeUrl:
          "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_connected%2Fraw%2Fagent-badge.json&cacheSeconds=300"
      });
      expect(publishFiles.state.publish).toMatchObject({
        status: "published",
        gistId: "gist_connected"
      });
      expect(
        (publishFiles.state.publish as Record<string, unknown>).lastPublishedHash
      ).toMatch(/^[0-9a-f]{64}$/);
      expect(output.read()).toContain("- Publish target: connected existing gist");
      expect(readmeContent).toContain("<!-- agent-badge:start -->");
      expect(readmeContent).toContain("<!-- agent-badge:end -->");
      expect(readmeContent).toContain(
        "![Vibe budget](https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_connected%2Fraw%2Fagent-badge.json&cacheSeconds=300)"
      );
    } finally {
      await Promise.all([repo.cleanup(), providers.cleanup()]);
    }
  });

  it("reconciles runtime wiring from persisted refresh config on rerun", async () => {
    const repo = await createRepoFixture({
      files: {
        "package-lock.json": "{}"
      }
    });
    const providers = await createProviderHome({
      claude: false
    });
    const deferredGistClient = {
      getGist: async () => {
        throw new Error("get should not run");
      },
      createPublicGist: async () => {
        throw new Error("simulated gist create failure");
      },
      updateGistFile: async () => {
        throw new Error("update should not run");
      }
    };

    try {
      await runInitCommand({
        cwd: repo.root,
        homeRoot: providers.root,
        env: {
          GITHUB_TOKEN: "test-token"
        },
        gistClient: deferredGistClient
      });

      const configPath = join(repo.root, ".agent-badge/config.json");
      const config = await readJsonObject(configPath);

      await writeFile(
        configPath,
        `${JSON.stringify(
          {
            ...config,
            refresh: {
              prePush: {
                enabled: true,
                mode: "strict"
              }
            }
          },
          null,
          2
        )}\n`,
        "utf8"
      );

      await runInitCommand({
        cwd: repo.root,
        homeRoot: providers.root,
        env: {
          GITHUB_TOKEN: "test-token"
        },
        gistClient: deferredGistClient
      });

      const packageJson = await readJsonObject(join(repo.root, "package.json"));
      const packageScripts = packageJson.scripts as Record<string, string>;
      const hookContent = await readFile(join(repo.root, ".git/hooks/pre-push"), "utf8");

      expect(packageScripts["agent-badge:refresh"]).toBe(
        "agent-badge refresh --hook pre-push"
      );
      expect(hookContent).toContain("npm run --silent agent-badge:refresh");
      expect(hookContent).not.toContain("|| true");
      expect(hookContent.match(/# agent-badge:start/gm)).toHaveLength(1);
      expect(hookContent.match(/# agent-badge:end/gm)).toHaveLength(1);
    } finally {
      await Promise.all([repo.cleanup(), providers.cleanup()]);
    }
  });

  it("creates a public gist automatically when auth is available", async () => {
    const repo = await createRepoFixture({
      files: {
        "package-lock.json": "{}"
      }
    });
    const providers = await createProviderHome();
    const output = createOutputCapture();
    let createCalls = 0;

    try {
      await runInitCommand({
        cwd: repo.root,
        homeRoot: providers.root,
        env: {
          GH_TOKEN: "test-token"
        },
        stdout: output.writer,
        gistClient: {
          getGist: async () => createGistMetadata("unused"),
          createPublicGist: async () => {
            createCalls += 1;

            return createGistMetadata("gist_created");
          },
          updateGistFile: async () => createGistMetadata("gist_created")
        }
      });

      const publishFiles = await readPublishFiles(repo.root);
      const readmeContent = await readReadmeContent(repo.root);

      expect(createCalls).toBe(1);
      expect(publishFiles.config.publish).toEqual({
        provider: "github-gist",
        gistId: "gist_created",
        badgeUrl:
          "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_created%2Fraw%2Fagent-badge.json&cacheSeconds=300"
      });
      expect(publishFiles.state.publish).toMatchObject({
        status: "published",
        gistId: "gist_created"
      });
      expect(
        (publishFiles.state.publish as Record<string, unknown>).lastPublishedHash
      ).toMatch(/^[0-9a-f]{64}$/);
      expect(output.read()).toContain("- Publish target: created public gist");
      expect(readmeContent).toContain("<!-- agent-badge:start -->");
    } finally {
      await Promise.all([repo.cleanup(), providers.cleanup()]);
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
                "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_existing%2Fraw%2Fagent-badge.json&cacheSeconds=300"
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
    const providers = await createProviderHome();
    const output = createOutputCapture();
    let createCalls = 0;
    let getCalls = 0;

    try {
      await runInitCommand({
        cwd: repo.root,
        homeRoot: providers.root,
        stdout: output.writer,
        gistClient: {
          getGist: async () => {
            getCalls += 1;

            return createGistMetadata("gist_existing");
          },
          createPublicGist: async () => {
            createCalls += 1;
            throw new Error("create should not run");
          },
          updateGistFile: async () => createGistMetadata("gist_existing")
        }
      });

      const publishFiles = await readPublishFiles(repo.root);
      const readmeContent = await readReadmeContent(repo.root);

      expect(getCalls).toBe(1);
      expect(createCalls).toBe(0);
      expect(publishFiles.config.publish).toEqual({
        provider: "github-gist",
        gistId: "gist_existing",
        badgeUrl:
          "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_existing%2Fraw%2Fagent-badge.json&cacheSeconds=300"
      });
      expect(publishFiles.state.publish).toMatchObject({
        status: "published",
        gistId: "gist_existing"
      });
      expect(
        (publishFiles.state.publish as Record<string, unknown>).lastPublishedHash
      ).toMatch(/^[0-9a-f]{64}$/);
      expect(output.read()).toContain("- Publish target: reused existing gist");
      expect(readmeContent).toContain("<!-- agent-badge:start -->");
    } finally {
      await Promise.all([repo.cleanup(), providers.cleanup()]);
    }
  });

  it("prints a pasteable snippet when README is missing", async () => {
    const repo = await createRepoFixture({
      readme: false,
      files: {
        "package-lock.json": "{}"
      }
    });
    const providers = await createProviderHome();
    const output = createOutputCapture();

    try {
      await runInitCommand({
        cwd: repo.root,
        homeRoot: providers.root,
        gistId: "gist_snippet",
        stdout: output.writer,
        gistClient: {
          getGist: async () => createGistMetadata("gist_snippet"),
          createPublicGist: async () => {
            throw new Error("create should not run");
          },
          updateGistFile: async () => createGistMetadata("gist_snippet")
        }
      });

      expect(existsSync(join(repo.root, "README.md"))).toBe(false);
      expect(output.read()).toContain(
        "- Badge snippet: ![Vibe budget](https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_snippet%2Fraw%2Fagent-badge.json&cacheSeconds=300)"
      );
    } finally {
      await Promise.all([repo.cleanup(), providers.cleanup()]);
    }
  });

  it("does not duplicate the badge on re-running init", async () => {
    const repo = await createRepoFixture({
      files: {
        "package-lock.json": "{}"
      }
    });
    const providers = await createProviderHome();
    const firstOutput = createOutputCapture();
    const secondOutput = createOutputCapture();

    try {
      const gistClient = {
        getGist: async () => createGistMetadata("gist_idempotent"),
        createPublicGist: async () => {
          throw new Error("create should not run");
        },
        updateGistFile: async () => createGistMetadata("gist_idempotent")
      };

      await runInitCommand({
        cwd: repo.root,
        homeRoot: providers.root,
        gistId: "gist_idempotent",
        stdout: firstOutput.writer,
        gistClient
      });
      await runInitCommand({
        cwd: repo.root,
        homeRoot: providers.root,
        stdout: secondOutput.writer,
        gistClient
      });

      const readmeContent = await readReadmeContent(repo.root);

      expect(readmeContent.match(/<!-- agent-badge:start -->/g)).toHaveLength(1);
      expect(readmeContent.match(/<!-- agent-badge:end -->/g)).toHaveLength(1);
      expect(
        readmeContent.match(
          /!\[Vibe budget\]\(https:\/\/img\.shields\.io\/endpoint\?url=https%3A%2F%2Fgist\.githubusercontent\.com%2Foctocat%2Fgist_idempotent%2Fraw%2Fagent-badge\.json&cacheSeconds=300\)/g
        )
      ).toHaveLength(1);
      expect(secondOutput.read()).toContain("- Publish target: reused existing gist");
    } finally {
      await Promise.all([repo.cleanup(), providers.cleanup()]);
    }
  });

  it("stays idempotent across init -> uninstall -> init", async () => {
    const repo = await createRepoFixture({
      files: {
        "package-lock.json": "{}"
      }
    });
    const providers = await createProviderHome();
    const gistClient = {
      getGist: async () => createGistMetadata("gist_reentry"),
      createPublicGist: async () => {
        throw new Error("create should not run");
      },
      updateGistFile: async () => createGistMetadata("gist_reentry"),
      deleteGist: async () => undefined
    };

    try {
      await runInitCommand({
        cwd: repo.root,
        homeRoot: providers.root,
        gistId: "gist_reentry",
        gistClient
      });

      await runUninstallCommand({
        cwd: repo.root,
        gistClient
      });
      await runUninstallCommand({
        cwd: repo.root,
        gistClient
      });

      await runInitCommand({
        cwd: repo.root,
        homeRoot: providers.root,
        gistId: "gist_reentry",
        gistClient
      });

      const readmeContent = await readReadmeContent(repo.root);
      const hookContent = await readFile(join(repo.root, ".git/hooks/pre-push"), "utf8");
      const packageJson = await readJsonObject(join(repo.root, "package.json"));
      const scripts = packageJson.scripts as Record<string, string>;
      const devDependencies = packageJson.devDependencies as Record<string, string>;

      expect(readmeContent.match(/<!-- agent-badge:start -->/g)).toHaveLength(1);
      expect(readmeContent.match(/<!-- agent-badge:end -->/g)).toHaveLength(1);
      expect(hookContent.match(/# agent-badge:start/gm)).toHaveLength(1);
      expect(hookContent.match(/# agent-badge:end/gm)).toHaveLength(1);
      expect(scripts["agent-badge:init"]).toBe("agent-badge init");
      expect(scripts["agent-badge:refresh"]).toBe(
        "agent-badge refresh --hook pre-push --fail-soft"
      );
      expect(typeof devDependencies["@legotin/agent-badge"]).toBe("string");
    } finally {
      await Promise.all([repo.cleanup(), providers.cleanup()]);
    }
  });

  it("does not insert a broken badge when publish target is deferred", async () => {
    const repo = await createRepoFixture({
      files: {
        "package-lock.json": "{}"
      }
    });
    const providers = await createProviderHome({
      codex: false,
      claude: false
    });
    const output = createOutputCapture();

    try {
      const originalReadme = await readReadmeContent(repo.root);

      await runInitCommand({
        cwd: repo.root,
        homeRoot: providers.root,
        env: {
          GH_TOKEN: "",
          GITHUB_TOKEN: "",
          GITHUB_PAT: ""
        },
        stdout: output.writer
      });

      const readmeContent = await readReadmeContent(repo.root);

      expect(readmeContent).toBe(originalReadme);
      expect(readmeContent).not.toContain("<!-- agent-badge:start -->");
      expect(readmeContent).not.toContain("https://img.shields.io/endpoint");
      expect(output.read()).toContain("- Publish target: deferred");
      expect(output.read()).toContain("- Badge setup deferred:");
    } finally {
      await Promise.all([repo.cleanup(), providers.cleanup()]);
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
        env: {
          GH_TOKEN: "",
          GITHUB_TOKEN: "",
          GITHUB_PAT: ""
        },
        stdout: output.writer
      });

      expect(result.preflight.git.isRepo).toBe(true);
      expect(result.runtimeWiring.created).toEqual(
        expect.arrayContaining([
          "package.json#devDependencies.@legotin/agent-badge",
          ".gitignore",
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
