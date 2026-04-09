import { spawnSync } from "node:child_process";

export interface SharedRuntimeAvailable {
  readonly status: "available";
  readonly version: string;
}

export interface SharedRuntimeMissing {
  readonly status: "missing";
}

export interface SharedRuntimeBroken {
  readonly status: "broken";
  readonly detail: string;
}

export type SharedRuntimeInspection =
  | SharedRuntimeAvailable
  | SharedRuntimeMissing
  | SharedRuntimeBroken;

const sharedRuntimeInstallCommands = [
  "npm install -g @legotin/agent-badge",
  "pnpm add -g @legotin/agent-badge",
  "bun add -g @legotin/agent-badge"
] as const;

const unknownSharedRuntimeVersion = "unknown";

type SharedRuntimeProbeResult =
  | {
      readonly status: "ok";
      readonly stdout: string;
    }
  | {
      readonly status: "missing";
    }
  | {
      readonly status: "failed";
      readonly detail: string;
    };

function probeSharedRuntimeCommand(
  args: readonly string[],
  env: NodeJS.ProcessEnv
): SharedRuntimeProbeResult {
  const result = spawnSync("agent-badge", [...args], {
    encoding: "utf8",
    env,
    shell: false,
    stdio: "pipe",
    windowsHide: true
  });

  if (result.error) {
    if ("code" in result.error && result.error.code === "ENOENT") {
      return { status: "missing" };
    }

    return {
      status: "failed",
      detail: result.error.message
    };
  }

  if (result.status !== 0) {
    const commandLabel = ["agent-badge", ...args].join(" ");

    return {
      status: "failed",
      detail:
        result.stderr.trim() ||
        result.stdout.trim() ||
        `${commandLabel} exited unsuccessfully.`
    };
  }

  return {
    status: "ok",
    stdout: result.stdout.trim()
  };
}

export function inspectSharedRuntime(
  env: NodeJS.ProcessEnv = process.env
): SharedRuntimeInspection {
  const versionProbe = probeSharedRuntimeCommand(["--version"], env);

  if (versionProbe.status === "missing") {
    return { status: "missing" };
  }

  if (versionProbe.status === "ok" && versionProbe.stdout.length > 0) {
    return {
      status: "available",
      version: versionProbe.stdout
    };
  }

  const compatibilityProbe = probeSharedRuntimeCommand(["refresh", "--help"], env);

  if (compatibilityProbe.status === "missing") {
    return { status: "missing" };
  }

  if (compatibilityProbe.status === "ok") {
    return {
      status: "available",
      version: unknownSharedRuntimeVersion
    };
  }

  if (versionProbe.status === "failed") {
    return {
      status: "broken",
      detail: `Version probe failed: ${versionProbe.detail} | Compatibility probe failed: ${compatibilityProbe.detail}`
    };
  }

  return {
    status: "broken",
    detail: `Version probe returned empty output. Compatibility probe failed: ${compatibilityProbe.detail}`
  };
}

export function buildSharedRuntimeRemediation(): string {
  return [
    "Install the shared agent-badge CLI once, then ensure the corresponding bin directory is on PATH:",
    ...sharedRuntimeInstallCommands.map((command) => `- ${command}`),
    "If agent-badge is already installed, update PATH so shells and Git hooks can resolve it."
  ].join("\n");
}

export function getSharedAgentBadgeCommand(...args: string[]): string {
  return ["agent-badge", ...args].join(" ");
}
