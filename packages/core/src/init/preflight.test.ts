import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { runInitPreflight } from "./preflight.js";

const execFileAsync = promisify(execFile);

interface RepoFixture {
  readonly root: string;
  cleanup(): Promise<void>;
}

async function createRepoFixture(options: {
  readonly git?: boolean;
  readonly readme?: boolean;
  readonly files?: Record<string, string>;
} = {}): Promise<RepoFixture> {
  const root = await mkdtemp(join(tmpdir(), "agent-badge-preflight-"));

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

async function createProviderFixture(options: {
  readonly codex?: boolean;
  readonly claude?: boolean;
} = {}): Promise<RepoFixture> {
  const root = await mkdtemp(join(tmpdir(), "agent-badge-providers-"));

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

describe("runInitPreflight", () => {
  it("reports git, README, provider, and existing scaffold facts for a repository", async () => {
    const repo = await createRepoFixture({
      files: {
        "package-lock.json": "{}"
      }
    });
    const providers = await createProviderFixture({
      claude: false
    });

    try {
      const preflight = await runInitPreflight({
        cwd: repo.root,
        homeRoot: providers.root
      });

      expect(preflight.git.isRepo).toBe(true);
      expect(preflight.git.canInitialize).toBe(true);
      expect(preflight.git.hasOrigin).toBe(false);
      expect(preflight.readme).toEqual({
        exists: true,
        fileName: "README.md"
      });
      expect(preflight.packageManager.name).toBe("npm");
      expect(preflight.providers.codex).toEqual({
        available: true,
        homeLabel: "~/.codex"
      });
      expect(preflight.providers.claude).toEqual({
        available: false,
        homeLabel: "~/.claude"
      });
      expect(preflight.existingScaffold.exists).toBe(false);
    } finally {
      await Promise.all([repo.cleanup(), providers.cleanup()]);
    }
  });

  it("does not mutate a non-git directory before scaffold execution", async () => {
    const repo = await createRepoFixture({
      git: false,
      readme: false
    });

    try {
      const preflight = await runInitPreflight({
        cwd: repo.root,
        allowGitInit: true
      });

      expect(preflight.git.isRepo).toBe(false);
      expect(preflight.git.canInitialize).toBe(true);
      expect(preflight.readme.exists).toBe(false);
      expect(existsSync(join(repo.root, ".git"))).toBe(false);
      expect(existsSync(join(repo.root, ".agent-badge"))).toBe(false);
    } finally {
      await repo.cleanup();
    }
  });

  it("detects GitHub auth from env vars before consulting the injected checker", async () => {
    const repo = await createRepoFixture();

    try {
      const preflight = await runInitPreflight({
        cwd: repo.root,
        env: {
          GH_TOKEN: "test-token"
        },
        checker: () => {
          throw new Error("checker should not run when env auth exists");
        }
      });

      expect(preflight.githubAuth).toEqual({
        available: true,
        source: "env:GH_TOKEN"
      });
    } finally {
      await repo.cleanup();
    }
  });

  it("uses the injected GitHub auth checker when env auth is absent", async () => {
    const repo = await createRepoFixture();

    try {
      const preflight = await runInitPreflight({
        cwd: repo.root,
        env: {},
        checker: () => true
      });

      expect(preflight.githubAuth).toEqual({
        available: true,
        source: "checker"
      });
    } finally {
      await repo.cleanup();
    }
  });
});
