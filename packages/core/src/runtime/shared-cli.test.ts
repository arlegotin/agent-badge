import type { SpawnSyncReturns } from "node:child_process";

import { afterEach, describe, expect, it, vi } from "vitest";

const { spawnSyncMock } = vi.hoisted(() => ({
  spawnSyncMock: vi.fn()
}));

vi.mock("node:child_process", () => ({
  spawnSync: spawnSyncMock
}));

import {
  buildSharedRuntimeRemediation,
  getSharedAgentBadgeCommand,
  inspectSharedRuntime
} from "./shared-cli.js";

function createSpawnResult(
  overrides: Partial<SpawnSyncReturns<string>>
): SpawnSyncReturns<string> {
  return {
    output: [null, "", ""],
    pid: 0,
    signal: null,
    status: 0,
    stdout: "",
    stderr: "",
    ...overrides
  };
}

describe("inspectSharedRuntime", () => {
  afterEach(() => {
    spawnSyncMock.mockReset();
  });

  it("returns available with the reported version when agent-badge resolves on PATH", () => {
    spawnSyncMock.mockReturnValue(
      createSpawnResult({
        stdout: "1.2.3\n"
      })
    );

    expect(inspectSharedRuntime()).toEqual({
      status: "available",
      version: "1.2.3"
    });
    expect(spawnSyncMock).toHaveBeenCalledWith("agent-badge", ["--version"], {
      encoding: "utf8",
      env: process.env,
      shell: false,
      stdio: "pipe",
      windowsHide: true
    });
  });

  it("trims surrounding whitespace from the reported version", () => {
    spawnSyncMock.mockReturnValue(
      createSpawnResult({
        stdout: "  1.2.3  \n"
      })
    );

    expect(inspectSharedRuntime()).toEqual({
      status: "available",
      version: "1.2.3"
    });
  });

  it("falls back to refresh help and reports an unknown version when --version is unsupported", () => {
    spawnSyncMock
      .mockReturnValueOnce(
        createSpawnResult({
          status: 1,
          stderr: "error: unknown option '--version'\n"
        })
      )
      .mockReturnValueOnce(
        createSpawnResult({
          status: 0,
          stdout: "Usage: agent-badge refresh [options]\n"
        })
      );

    expect(inspectSharedRuntime()).toEqual({
      status: "available",
      version: "unknown"
    });
    expect(spawnSyncMock).toHaveBeenNthCalledWith(
      2,
      "agent-badge",
      ["refresh", "--help"],
      {
        encoding: "utf8",
        env: process.env,
        shell: false,
        stdio: "pipe",
        windowsHide: true
      }
    );
  });

  it("falls back to refresh help when version output is empty", () => {
    spawnSyncMock
      .mockReturnValueOnce(
        createSpawnResult({
          status: 0,
          stdout: "\n"
        })
      )
      .mockReturnValueOnce(
        createSpawnResult({
          status: 0,
          stdout: "Usage: agent-badge refresh [options]\n"
        })
      );

    expect(inspectSharedRuntime()).toEqual({
      status: "available",
      version: "unknown"
    });
  });

  it("returns missing when the shared runtime is not resolvable on PATH", () => {
    spawnSyncMock.mockReturnValue(
      createSpawnResult({
        error: Object.assign(new Error("spawnSync agent-badge ENOENT"), {
          code: "ENOENT"
        })
      })
    );

    expect(inspectSharedRuntime()).toEqual({
      status: "missing"
    });
  });

  it("returns broken with both probe details when version and compatibility probes fail", () => {
    spawnSyncMock
      .mockReturnValueOnce(
        createSpawnResult({
          status: 1,
          stderr: "error: unknown option '--version'\n"
        })
      )
      .mockReturnValueOnce(
        createSpawnResult({
          status: 1,
          stderr: "error: unknown command 'refresh'\n"
        })
      );

    expect(inspectSharedRuntime()).toEqual({
      status: "broken",
      detail:
        "Version probe failed: error: unknown option '--version' | Compatibility probe failed: error: unknown command 'refresh'"
    });
  });

  it("returns broken when version output is empty and compatibility probe fails", () => {
    spawnSyncMock
      .mockReturnValueOnce(
        createSpawnResult({
          status: 0,
          stdout: "\n"
        })
      )
      .mockReturnValueOnce(
        createSpawnResult({
          status: 1,
          stderr: "permission denied\n"
        })
      );

    expect(inspectSharedRuntime()).toEqual({
      status: "broken",
      detail:
        "Version probe returned empty output. Compatibility probe failed: permission denied"
    });
  });
});

describe("buildSharedRuntimeRemediation", () => {
  it("returns privacy-safe install and PATH guidance", () => {
    const remediation = buildSharedRuntimeRemediation();

    expect(remediation).toContain("npm install -g @legotin/agent-badge");
    expect(remediation).toContain("pnpm add -g @legotin/agent-badge");
    expect(remediation).toContain("bun add -g @legotin/agent-badge");
    expect(remediation).toContain("ensure the corresponding bin directory is on PATH");
    expect(remediation).not.toContain("node_modules/.bin");
  });
});

describe("getSharedAgentBadgeCommand", () => {
  it("builds plain agent-badge commands without package-manager wrappers", () => {
    expect(getSharedAgentBadgeCommand()).toBe("agent-badge");
    expect(getSharedAgentBadgeCommand("init")).toBe("agent-badge init");
    expect(
      getSharedAgentBadgeCommand(
        "refresh",
        "--hook",
        "pre-push",
        "--hook-policy",
        "fail-soft"
      )
    ).toBe("agent-badge refresh --hook pre-push --hook-policy fail-soft");
  });
});
