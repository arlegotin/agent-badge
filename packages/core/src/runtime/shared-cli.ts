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

export function inspectSharedRuntime(
  env: NodeJS.ProcessEnv = process.env
): SharedRuntimeInspection {
  const result = spawnSync("agent-badge", ["--version"], {
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
      status: "broken",
      detail: result.error.message
    };
  }

  if (result.status !== 0) {
    return {
      status: "broken",
      detail: result.stderr.trim() || result.stdout.trim() || "agent-badge exited unsuccessfully."
    };
  }

  return {
    status: "available",
    version: result.stdout.trim()
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
