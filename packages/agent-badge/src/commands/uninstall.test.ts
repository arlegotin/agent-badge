import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it, vi } from "vitest";

import { parseAgentBadgeConfig, parseAgentBadgeState } from "@legotin/agent-badge-core";

import { runInitCommand } from "./init.js";
import { runUninstallCommand } from "./uninstall.js";

const execFileAsync = promisify(execFile);

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
  readonly files?: Record<string, string>;
} = {}): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "agent-badge-uninstall-repo-"));

  await execFileAsync("git", ["init", "--quiet"], { cwd: root });
  await writeFile(join(root, "README.md"), "# Fixture Repo\n", "utf8");

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

async function createProviderHome(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "agent-badge-uninstall-home-"));

  await Promise.all([
    mkdir(join(root, ".codex"), { recursive: true }),
    mkdir(join(root, ".claude"), { recursive: true })
  ]);

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

function createGistClient(gistId: string) {
  return {
    getGist: async () => ({
      id: gistId,
      ownerLogin: "octocat",
      public: true,
      files: ["agent-badge.json"]
    }),
    createPublicGist: async () => ({
      id: gistId,
      ownerLogin: "octocat",
      public: true,
      files: ["agent-badge.json"]
    }),
    updateGistFile: async () => ({
      id: gistId,
      ownerLogin: "octocat",
      public: true,
      files: ["agent-badge.json"]
    })
  };
}

function buildSharedManagedHookBlock(mode: "fail-soft" | "strict" = "fail-soft"): string {
  const fallback = mode === "fail-soft" ? " || true" : "";
  const exitCode = mode === "fail-soft" ? "0" : "1";

  return [
    "#!/bin/sh",
    "",
    "echo custom-check",
    "",
    "# agent-badge:start",
    "if ! command -v agent-badge >/dev/null 2>&1; then",
    "  printf '%s\\n' 'Shared agent-badge runtime not found on PATH.'",
    `  exit ${exitCode}`,
    "fi",
    `agent-badge refresh --hook pre-push --hook-policy ${mode}${fallback}`,
    "# agent-badge:end",
    ""
  ].join("\n");
}

describe("runUninstallCommand", () => {
  it(
    "removes the shared managed hook block while preserving custom pre-push lines",
    async () => {
      const repo = await createRepoFixture({
        files: {
          "package-lock.json": "{}"
        }
      });
      const providers = await createProviderHome();
      const output = createOutputCapture();
      const gistClient = createGistClient("gist_uninstall");

      try {
        await runInitCommand({
          cwd: repo.root,
          homeRoot: providers.root,
          gistId: "gist_uninstall",
          gistClient
        });

      const hookPath = join(repo.root, ".git/hooks/pre-push");
      await writeFile(
        hookPath,
        buildSharedManagedHookBlock(),
        "utf8"
      );

      const result = await runUninstallCommand({
        cwd: repo.root,
        stdout: output.writer
      });
      const hookContent = await readFile(hookPath, "utf8");

      expect(hookContent).toContain("echo custom-check");
      expect(hookContent).not.toContain("# agent-badge:start");
      expect(hookContent).not.toContain("# agent-badge:end");
      expect(result.remote).toBeNull();
        expect(output.read()).toContain("- uninstall: start");
        expect(output.read()).toContain("- remote: preserved");
      } finally {
        await Promise.all([repo.cleanup(), providers.cleanup()]);
      }
    },
    15_000
  );

  it(
    "removes legacy managed hook markers while preserving custom pre-push lines",
    async () => {
      const repo = await createRepoFixture({
        files: {
          "package-lock.json": "{}"
        }
      });
      const providers = await createProviderHome();
      const output = createOutputCapture();
      const gistClient = createGistClient("gist_uninstall_legacy");

      try {
        await runInitCommand({
          cwd: repo.root,
          homeRoot: providers.root,
          gistId: "gist_uninstall_legacy",
          gistClient
        });

        const hookPath = join(repo.root, ".git/hooks/pre-push");
        await writeFile(
          hookPath,
          "#!/bin/sh\n\necho custom-check\n\n# agent-badge:start\nnpm run --silent agent-badge:refresh || true\n# agent-badge:end\n",
          "utf8"
        );

        const result = await runUninstallCommand({
          cwd: repo.root,
          stdout: output.writer
        });
        const hookContent = await readFile(hookPath, "utf8");

        expect(hookContent).toContain("echo custom-check");
        expect(hookContent).not.toContain("# agent-badge:start");
        expect(hookContent).not.toContain("# agent-badge:end");
        expect(result.remote).toBeNull();
        expect(output.read()).toContain("- uninstall: start");
        expect(output.read()).toContain("- remote: preserved");
      } finally {
        await Promise.all([repo.cleanup(), providers.cleanup()]);
      }
    },
    15_000
  );

  it("preserves config and state by default while removing runtime wiring", async () => {
    const repo = await createRepoFixture({
      files: {
        "package-lock.json": "{}"
      }
    });
    const providers = await createProviderHome();
    const gistClient = createGistClient("gist_default_preserve");
    const deleteGist = vi.fn();

    try {
      await runInitCommand({
        cwd: repo.root,
        homeRoot: providers.root,
        gistId: "gist_default_preserve",
        gistClient
      });

      await runUninstallCommand({
        cwd: repo.root,
        gistClient: {
          ...gistClient,
          deleteGist
        }
      });

      expect(existsSync(join(repo.root, ".agent-badge/config.json"))).toBe(true);
      expect(existsSync(join(repo.root, ".agent-badge/state.json"))).toBe(true);
      expect(deleteGist).not.toHaveBeenCalled();

      const packageJson = JSON.parse(
        await readFile(join(repo.root, "package.json"), "utf8")
      ) as {
        scripts?: Record<string, string>;
      };

      expect(packageJson.scripts?.["agent-badge:init"]).toBeUndefined();
      expect(packageJson.scripts?.["agent-badge:refresh"]).toBeUndefined();
    } finally {
      await Promise.all([repo.cleanup(), providers.cleanup()]);
    }
  });

  it("purges remote gist association when --purge-remote is enabled", async () => {
    const repo = await createRepoFixture({
      files: {
        "package-lock.json": "{}"
      }
    });
    const providers = await createProviderHome();
    const gistClient = createGistClient("gist_remote_purge");
    const deleteGist = vi.fn().mockResolvedValue(undefined);

    try {
      await runInitCommand({
        cwd: repo.root,
        homeRoot: providers.root,
        gistId: "gist_remote_purge",
        gistClient
      });

      const result = await runUninstallCommand({
        cwd: repo.root,
        purgeRemote: true,
        gistClient: {
          ...gistClient,
          deleteGist
        }
      });

      expect(deleteGist).toHaveBeenCalledWith({
        gistId: "gist_remote_purge"
      });
      expect(result.remote).toEqual({
        gistId: "gist_remote_purge",
        deleted: true
      });

      const config = parseAgentBadgeConfig(
        JSON.parse(await readFile(join(repo.root, ".agent-badge/config.json"), "utf8"))
      );
      const state = parseAgentBadgeState(
        JSON.parse(await readFile(join(repo.root, ".agent-badge/state.json"), "utf8"))
      );

      expect(config.publish.gistId).toBeNull();
      expect(config.publish.badgeUrl).toBeNull();
      expect(state.publish.gistId).toBeNull();
    } finally {
      await Promise.all([repo.cleanup(), providers.cleanup()]);
    }
  });
});
