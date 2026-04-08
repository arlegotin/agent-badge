import { readFile } from "node:fs/promises";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { isDirectExecution } from "./index.js";

const originalArgv = [...process.argv];
const originalExitCode = process.exitCode;
const originalCwd = process.cwd();

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock("@legotin/agent-badge");
  vi.doUnmock("node:child_process");
  process.argv = [...originalArgv];
  process.exitCode = originalExitCode;
  process.chdir(originalCwd);
});

describe("create-agent-badge entrypoint", () => {
  it("declares a node shebang for the published bin entry", async () => {
    const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");

    expect(source.startsWith("#!/usr/bin/env node\n")).toBe(true);
  });

  it("treats a symlinked bin path as direct execution", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "create-agent-badge-cli-"));
    const symlinkPath = join(tempRoot, "create-agent-badge");
    const mainPath = new URL("./index.ts", import.meta.url);

    try {
      await symlink(mainPath, symlinkPath);

      expect(isDirectExecution([process.execPath, symlinkPath])).toBe(true);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("returns false when no entry path is supplied", () => {
    expect(isDirectExecution([process.execPath])).toBe(false);
  });

  it("passes the GitHub CLI token resolver through init and installs the local runtime", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "create-agent-badge-run-"));
    const runInitCommand = vi.fn().mockResolvedValue({
      preflight: {
        packageManager: {
          name: "npm"
        }
      }
    });
    const resolveGitHubCliToken = vi.fn();
    const spawnSync = vi.fn().mockReturnValue({
      status: 0,
      stdout: "",
      stderr: ""
    });

    try {
      await writeFile(
        join(tempRoot, "package.json"),
        `${JSON.stringify(
          {
            devDependencies: {
              "@legotin/agent-badge": "^1.2.3"
            }
          },
          null,
          2
        )}\n`,
        "utf8"
      );
      process.chdir(tempRoot);
      const cwd = process.cwd();

      vi.doMock("@legotin/agent-badge", () => ({
        runInitCommand,
        resolveGitHubCliToken
      }));
      vi.doMock("node:child_process", () => ({
        spawnSync
      }));

      const module = await import(new URL("./index.ts?run-create-agent-badge", import.meta.url).href);

      await module.runCreateAgentBadge();

      expect(runInitCommand).toHaveBeenCalledWith({
        cwd,
        ghCliTokenResolver: resolveGitHubCliToken
      });
      expect(spawnSync).toHaveBeenCalledWith(
        "npm",
        ["install", "-D", "@legotin/agent-badge@^1.2.3"],
        expect.objectContaining({
          cwd,
          encoding: "utf8",
          stdio: "pipe",
          windowsHide: true
        })
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("surfaces runtime installation failures after init", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "create-agent-badge-install-fail-"));
    const runInitCommand = vi.fn().mockResolvedValue({
      preflight: {
        packageManager: {
          name: "npm"
        }
      }
    });
    const spawnSync = vi.fn().mockReturnValue({
      status: 1,
      stdout: "",
      stderr: "npm ERR! registry unavailable"
    });

    try {
      await writeFile(
        join(tempRoot, "package.json"),
        `${JSON.stringify(
          {
            devDependencies: {
              "@legotin/agent-badge": "^1.2.3"
            }
          },
          null,
          2
        )}\n`,
        "utf8"
      );
      process.chdir(tempRoot);

      vi.doMock("@legotin/agent-badge", () => ({
        runInitCommand,
        resolveGitHubCliToken: vi.fn()
      }));
      vi.doMock("node:child_process", () => ({
        spawnSync
      }));

      const module = await import(
        new URL("./index.ts?run-create-agent-badge-install-fail", import.meta.url).href
      );

      await expect(module.runCreateAgentBadge()).rejects.toThrow(
        "Failed to install repo-local @legotin/agent-badge via npm. npm ERR! registry unavailable"
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("prints direct execution errors and sets process.exitCode", async () => {
    vi.doMock("@legotin/agent-badge", () => ({
      runInitCommand: vi.fn().mockRejectedValue(new Error("direct execution failed")),
      resolveGitHubCliToken: vi.fn()
    }));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.argv = [
      process.execPath,
      fileURLToPath(new URL("./index.ts", import.meta.url))
    ];
    process.exitCode = undefined;

    const directExecutionModule = new URL(
      "./index.ts?direct-execution",
      import.meta.url
    ).href;

    await import(directExecutionModule);
    await Promise.resolve();
    await Promise.resolve();

    expect(errorSpy).toHaveBeenCalledWith("direct execution failed");
    expect(process.exitCode).toBe(1);
  });
});
