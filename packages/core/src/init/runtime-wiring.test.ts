import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  agentBadgeGitignoreEndMarker,
  agentBadgeGitignoreStartMarker,
  agentBadgeHookEndMarker,
  agentBadgeHookStartMarker,
  applyRepoLocalRuntimeWiring,
  removeRepoLocalRuntimeWiring
} from "./runtime-wiring.js";

const execFileAsync = promisify(execFile);
const failSoftRefresh = {
  prePush: {
    enabled: true,
    mode: "fail-soft"
  }
} as const;
const strictRefresh = {
  prePush: {
    enabled: true,
    mode: "strict"
  }
} as const;
const disabledPrePushRefresh = {
  prePush: {
    enabled: false,
    mode: "fail-soft"
  }
} as const;

interface Fixture {
  readonly root: string;
  cleanup(): Promise<void>;
}

async function createGitRepoFixture(options: {
  readonly files?: Record<string, string>;
} = {}): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "agent-badge-runtime-wiring-"));

  await execFileAsync("git", ["init", "--quiet"], { cwd: root });

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

describe("applyRepoLocalRuntimeWiring", () => {
  it("creates package.json wiring and a runnable first-run pre-push hook", async () => {
    const repo = await createGitRepoFixture();
    const packageJsonPath = join(repo.root, "package.json");
    const gitignorePath = join(repo.root, ".gitignore");
    const prePushHookPath = join(repo.root, ".git/hooks/pre-push");

    try {
      const result = await applyRepoLocalRuntimeWiring({
        cwd: repo.root,
        packageManager: "npm",
        runtimeDependencySpecifier: "latest",
        refresh: failSoftRefresh
      });

      expect(result.created).toEqual(
        expect.arrayContaining([
          "package.json",
          "package.json#devDependencies.agent-badge",
          "package.json#scripts.agent-badge:init",
          "package.json#scripts.agent-badge:refresh",
          ".gitignore",
          ".git/hooks/pre-push"
        ])
      );
      expect(result.updated).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(existsSync(packageJsonPath)).toBe(true);
      expect(existsSync(gitignorePath)).toBe(true);
      expect(existsSync(prePushHookPath)).toBe(true);

      const packageJson = JSON.parse(
        await readFile(packageJsonPath, "utf8")
      ) as Record<string, unknown>;
      const packageScripts = packageJson.scripts as Record<string, string>;
      const devDependencies = packageJson.devDependencies as Record<string, string>;

      expect(devDependencies["agent-badge"]).toBe("latest");
      expect(packageScripts["agent-badge:init"]).toBe("agent-badge init");
      expect(packageScripts["agent-badge:refresh"]).toBe(
        "agent-badge refresh --hook pre-push --fail-soft"
      );

      const hookContent = await readFile(prePushHookPath, "utf8");
      const gitignoreContent = await readFile(gitignorePath, "utf8");
      const hookStats = await stat(prePushHookPath);

      expect(hookContent.startsWith("#!/bin/sh\n")).toBe(true);
      expect(gitignoreContent).toContain(agentBadgeGitignoreStartMarker);
      expect(gitignoreContent).toContain(".agent-badge/state.json");
      expect(gitignoreContent).toContain(".agent-badge/cache/");
      expect(gitignoreContent).toContain(".agent-badge/logs/");
      expect(gitignoreContent).toContain(agentBadgeGitignoreEndMarker);
      expect(hookContent).toContain(agentBadgeHookStartMarker);
      expect(hookContent).toContain(agentBadgeHookEndMarker);
      expect(hookContent).toContain("npm run --silent agent-badge:refresh || true");
      expect(hookStats.mode & 0o111).toBe(0o111);

      await expect(
        execFileAsync(prePushHookPath, [], {
          cwd: repo.root
        })
      ).resolves.toMatchObject({
        stdout: expect.any(String),
        stderr: expect.any(String)
      });
    } finally {
      await repo.cleanup();
    }
  });

  it("preserves unrelated content and converges on a single managed hook block across reruns", async () => {
    const repo = await createGitRepoFixture({
      files: {
        "package.json": JSON.stringify(
          {
            name: "fixture-repo",
            private: true,
            scripts: {
              test: "vitest --run"
            },
            devDependencies: {
              typescript: "^5.0.0"
            }
          },
          null,
          2
        ),
        ".git/hooks/pre-push": "#!/bin/sh\n\necho custom-check\n",
        ".gitignore": "coverage/\n.agent-badge/cache/\n"
      }
    });
    const packageJsonPath = join(repo.root, "package.json");
    const gitignorePath = join(repo.root, ".gitignore");
    const prePushHookPath = join(repo.root, ".git/hooks/pre-push");

    try {
      await chmod(prePushHookPath, 0o644);

      const firstRun = await applyRepoLocalRuntimeWiring({
        cwd: repo.root,
        packageManager: "npm",
        runtimeDependencySpecifier: "^1.2.3",
        refresh: failSoftRefresh
      });

      expect(firstRun.updated).toEqual(
        expect.arrayContaining(["package.json", ".gitignore", ".git/hooks/pre-push"])
      );

      const secondRun = await applyRepoLocalRuntimeWiring({
        cwd: repo.root,
        packageManager: "npm",
        runtimeDependencySpecifier: "^1.2.3",
        refresh: failSoftRefresh
      });

      expect(secondRun.created).toEqual([]);
      expect(secondRun.updated).toEqual([]);
      expect(secondRun.reused).toEqual(
        expect.arrayContaining([
          "package.json#devDependencies.agent-badge",
          "package.json#scripts.agent-badge:init",
          "package.json#scripts.agent-badge:refresh",
          "package.json",
          ".gitignore",
          ".git/hooks/pre-push"
        ])
      );
      expect(secondRun.warnings).toEqual([]);

      const packageJson = JSON.parse(
        await readFile(packageJsonPath, "utf8")
      ) as Record<string, unknown>;
      const packageScripts = packageJson.scripts as Record<string, string>;
      const devDependencies = packageJson.devDependencies as Record<string, string>;
      const gitignoreContent = await readFile(gitignorePath, "utf8");
      const hookContent = await readFile(prePushHookPath, "utf8");
      const hookStats = await stat(prePushHookPath);

      expect(packageJson.name).toBe("fixture-repo");
      expect(packageJson.private).toBe(true);
      expect(packageScripts.test).toBe("vitest --run");
      expect(packageScripts["agent-badge:init"]).toBe("agent-badge init");
      expect(packageScripts["agent-badge:refresh"]).toBe(
        "agent-badge refresh --hook pre-push --fail-soft"
      );
      expect(devDependencies.typescript).toBe("^5.0.0");
      expect(devDependencies["agent-badge"]).toBe("^1.2.3");
      expect(gitignoreContent).toContain("coverage/");
      expect(gitignoreContent.match(/^\.agent-badge\/cache\/$/gm)).toHaveLength(1);
      expect(gitignoreContent).toContain(".agent-badge/state.json");
      expect(gitignoreContent).toContain(".agent-badge/logs/");
      expect(gitignoreContent.match(/# agent-badge:gitignore:start/gm)).toHaveLength(1);
      expect(gitignoreContent.match(/# agent-badge:gitignore:end/gm)).toHaveLength(1);
      expect(hookContent).toContain("echo custom-check");
      expect(hookContent.match(/# agent-badge:start/gm)).toHaveLength(1);
      expect(hookContent.match(/# agent-badge:end/gm)).toHaveLength(1);
      expect(hookStats.mode & 0o111).toBe(0o111);
    } finally {
      await repo.cleanup();
    }
  });

  it("reuses a manual gitignore when all runtime entries are already ignored", async () => {
    const repo = await createGitRepoFixture({
      files: {
        ".gitignore":
          "coverage/\n.agent-badge/state.json\n.agent-badge/cache/\n.agent-badge/logs/\n"
      }
    });
    const gitignorePath = join(repo.root, ".gitignore");

    try {
      const result = await applyRepoLocalRuntimeWiring({
        cwd: repo.root,
        packageManager: "npm",
        runtimeDependencySpecifier: "^1.2.3",
        refresh: failSoftRefresh
      });

      expect(result.reused).toEqual(expect.arrayContaining([".gitignore"]));

      const gitignoreContent = await readFile(gitignorePath, "utf8");

      expect(gitignoreContent).not.toContain(agentBadgeGitignoreStartMarker);
      expect(gitignoreContent).not.toContain(agentBadgeGitignoreEndMarker);
      expect(gitignoreContent.match(/^\.agent-badge\/state\.json$/gm)).toHaveLength(1);
      expect(gitignoreContent.match(/^\.agent-badge\/cache\/$/gm)).toHaveLength(1);
      expect(gitignoreContent.match(/^\.agent-badge\/logs\/$/gm)).toHaveLength(1);
    } finally {
      await repo.cleanup();
    }
  });

  it("writes a strict pre-push hook without fail-soft fallback", async () => {
    const repo = await createGitRepoFixture();
    const packageJsonPath = join(repo.root, "package.json");
    const prePushHookPath = join(repo.root, ".git/hooks/pre-push");

    try {
      await applyRepoLocalRuntimeWiring({
        cwd: repo.root,
        packageManager: "npm",
        runtimeDependencySpecifier: "^1.2.3",
        refresh: failSoftRefresh
      });

      const result = await applyRepoLocalRuntimeWiring({
        cwd: repo.root,
        packageManager: "npm",
        runtimeDependencySpecifier: "^1.2.3",
        refresh: strictRefresh
      });

      expect(result.updated).toEqual(
        expect.arrayContaining([
          "package.json#scripts.agent-badge:refresh",
          "package.json",
          ".git/hooks/pre-push"
        ])
      );

      const packageJson = JSON.parse(
        await readFile(packageJsonPath, "utf8")
      ) as Record<string, unknown>;
      const packageScripts = packageJson.scripts as Record<string, string>;
      const hookContent = await readFile(prePushHookPath, "utf8");

      expect(packageScripts["agent-badge:refresh"]).toBe(
        "agent-badge refresh --hook pre-push"
      );
      expect(hookContent).toContain("npm run --silent agent-badge:refresh");
      expect(hookContent).not.toContain("|| true");
    } finally {
      await repo.cleanup();
    }
  });

  it("removes only the managed hook block when pre-push is disabled", async () => {
    const repo = await createGitRepoFixture({
      files: {
        ".git/hooks/pre-push":
          "#!/bin/sh\n\necho custom-check\n\n# agent-badge:start\nnpm run --silent agent-badge:refresh || true\n# agent-badge:end\n"
      }
    });
    const prePushHookPath = join(repo.root, ".git/hooks/pre-push");

    try {
      const result = await applyRepoLocalRuntimeWiring({
        cwd: repo.root,
        packageManager: "npm",
        runtimeDependencySpecifier: "^1.2.3",
        refresh: disabledPrePushRefresh
      });

      expect(result.created).toEqual(
        expect.arrayContaining([
          "package.json",
          "package.json#devDependencies.agent-badge",
          "package.json#scripts.agent-badge:init",
          "package.json#scripts.agent-badge:refresh"
        ])
      );
      expect(result.updated).toEqual(
        expect.arrayContaining([".git/hooks/pre-push"])
      );

      const hookContent = await readFile(prePushHookPath, "utf8");

      expect(hookContent).toBe("#!/bin/sh\n\necho custom-check\n");
      expect(hookContent).not.toContain(agentBadgeHookStartMarker);
      expect(hookContent).not.toContain(agentBadgeHookEndMarker);

      const managedOnlyRepo = await createGitRepoFixture();

      try {
        const managedOnlyHookPath = join(managedOnlyRepo.root, ".git/hooks/pre-push");

        await applyRepoLocalRuntimeWiring({
          cwd: managedOnlyRepo.root,
          packageManager: "npm",
          runtimeDependencySpecifier: "^1.2.3",
          refresh: failSoftRefresh
        });

        await applyRepoLocalRuntimeWiring({
          cwd: managedOnlyRepo.root,
          packageManager: "npm",
          runtimeDependencySpecifier: "^1.2.3",
          refresh: disabledPrePushRefresh
        });

        expect(await readFile(managedOnlyHookPath, "utf8")).toBe("#!/bin/sh\n");
      } finally {
        await managedOnlyRepo.cleanup();
      }
    } finally {
      await repo.cleanup();
    }
  });
});

describe("removeRepoLocalRuntimeWiring", () => {
  it("removes managed hook and gitignore blocks while preserving custom content", async () => {
    const repo = await createGitRepoFixture({
      files: {
        "package.json": JSON.stringify(
          {
            name: "fixture-repo",
            private: true,
            scripts: {
              test: "vitest --run"
            },
            devDependencies: {
              "agent-badge": "^1.2.3",
              typescript: "^5.0.0"
            }
          },
          null,
          2
        ),
        ".git/hooks/pre-push":
          "#!/bin/sh\n\necho custom-check\n\n# agent-badge:start\nnpm run --silent agent-badge:refresh || true\n# agent-badge:end\n",
        ".gitignore":
          "coverage/\n# agent-badge:gitignore:start\n.agent-badge/state.json\n.agent-badge/cache/\n.agent-badge/logs/\n# agent-badge:gitignore:end\nnotes/\n"
      }
    });

    try {
      const result = await removeRepoLocalRuntimeWiring({
        cwd: repo.root,
        packageManager: "npm"
      });
      const packageJson = JSON.parse(
        await readFile(join(repo.root, "package.json"), "utf8")
      ) as {
        scripts: Record<string, string>;
        devDependencies: Record<string, string>;
      };
      const hookContent = await readFile(
        join(repo.root, ".git/hooks/pre-push"),
        "utf8"
      );
      const gitignoreContent = await readFile(join(repo.root, ".gitignore"), "utf8");

      expect(result.updated).toEqual(
        expect.arrayContaining([
          "package.json#devDependencies.agent-badge",
          "package.json",
          ".gitignore",
          ".git/hooks/pre-push"
        ])
      );
      expect(packageJson.scripts.test).toBe("vitest --run");
      expect(packageJson.scripts["agent-badge:init"]).toBeUndefined();
      expect(packageJson.scripts["agent-badge:refresh"]).toBeUndefined();
      expect(packageJson.devDependencies.typescript).toBe("^5.0.0");
      expect(packageJson.devDependencies["agent-badge"]).toBeUndefined();
      expect(hookContent).toContain("echo custom-check");
      expect(hookContent).not.toContain("# agent-badge:start");
      expect(hookContent).not.toContain("# agent-badge:end");
      expect(gitignoreContent).toContain("coverage/");
      expect(gitignoreContent).toContain("notes/");
      expect(gitignoreContent).not.toContain("# agent-badge:gitignore:start");
      expect(gitignoreContent).not.toContain("# agent-badge:gitignore:end");
      expect(gitignoreContent).not.toContain(".agent-badge/state.json");
    } finally {
      await repo.cleanup();
    }
  });

  it("is idempotent on a second remove run", async () => {
    const repo = await createGitRepoFixture();

    try {
      await applyRepoLocalRuntimeWiring({
        cwd: repo.root,
        packageManager: "npm",
        runtimeDependencySpecifier: "^1.2.3",
        refresh: failSoftRefresh
      });

      await removeRepoLocalRuntimeWiring({
        cwd: repo.root,
        packageManager: "npm"
      });
      const secondRun = await removeRepoLocalRuntimeWiring({
        cwd: repo.root,
        packageManager: "npm"
      });

      expect(secondRun.updated).toEqual([]);
      expect(secondRun.reused).toEqual(
        expect.arrayContaining(["package.json", ".gitignore", ".git/hooks/pre-push"])
      );
      expect(secondRun.warnings).toEqual([]);
    } finally {
      await repo.cleanup();
    }
  });
});
