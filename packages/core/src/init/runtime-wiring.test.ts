import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { createGitRepoFixture } from "@agent-badge/testkit";
import { describe, expect, it } from "vitest";

import {
  agentBadgeHookEndMarker,
  agentBadgeHookStartMarker,
  applyRepoLocalRuntimeWiring
} from "./runtime-wiring.js";

const execFileAsync = promisify(execFile);

describe("applyRepoLocalRuntimeWiring", () => {
  it("creates package.json wiring and a runnable first-run pre-push hook", async () => {
    const repo = await createGitRepoFixture();
    const packageJsonPath = join(repo.root, "package.json");
    const prePushHookPath = join(repo.root, ".git/hooks/pre-push");

    try {
      const result = await applyRepoLocalRuntimeWiring({
        cwd: repo.root,
        packageManager: "npm",
        runtimeDependencySpecifier: "latest"
      });

      expect(result.created).toEqual(
        expect.arrayContaining([
          "package.json",
          "package.json#devDependencies.agent-badge",
          "package.json#scripts.agent-badge:init",
          "package.json#scripts.agent-badge:refresh",
          ".git/hooks/pre-push"
        ])
      );
      expect(result.updated).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(existsSync(packageJsonPath)).toBe(true);
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
      const hookStats = await stat(prePushHookPath);

      expect(hookContent.startsWith("#!/bin/sh\n")).toBe(true);
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
        ".git/hooks/pre-push": "#!/bin/sh\n\necho custom-check\n"
      }
    });
    const packageJsonPath = join(repo.root, "package.json");
    const prePushHookPath = join(repo.root, ".git/hooks/pre-push");

    try {
      await chmod(prePushHookPath, 0o644);

      const firstRun = await applyRepoLocalRuntimeWiring({
        cwd: repo.root,
        packageManager: "npm",
        runtimeDependencySpecifier: "^1.2.3"
      });

      expect(firstRun.updated).toEqual(
        expect.arrayContaining(["package.json", ".git/hooks/pre-push"])
      );

      const secondRun = await applyRepoLocalRuntimeWiring({
        cwd: repo.root,
        packageManager: "npm",
        runtimeDependencySpecifier: "^1.2.3"
      });

      expect(secondRun.created).toEqual([]);
      expect(secondRun.updated).toEqual([]);
      expect(secondRun.reused).toEqual(
        expect.arrayContaining([
          "package.json#devDependencies.agent-badge",
          "package.json#scripts.agent-badge:init",
          "package.json#scripts.agent-badge:refresh",
          "package.json",
          ".git/hooks/pre-push"
        ])
      );
      expect(secondRun.warnings).toEqual([]);

      const packageJson = JSON.parse(
        await readFile(packageJsonPath, "utf8")
      ) as Record<string, unknown>;
      const packageScripts = packageJson.scripts as Record<string, string>;
      const devDependencies = packageJson.devDependencies as Record<string, string>;
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
      expect(hookContent).toContain("echo custom-check");
      expect(hookContent.match(/# agent-badge:start/gm)).toHaveLength(1);
      expect(hookContent.match(/# agent-badge:end/gm)).toHaveLength(1);
      expect(hookStats.mode & 0o111).toBe(0o111);
    } finally {
      await repo.cleanup();
    }
  });
});
