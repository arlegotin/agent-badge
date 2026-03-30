import {
  packageManagerSchema,
  type PackageManager
} from "./package-manager.js";

export const agentBadgeInitScriptName = "agent-badge:init";
export const agentBadgeRefreshScriptName = "agent-badge:refresh";

const localAgentBadgeCommands: Record<PackageManager, string> = {
  npm: "npx --no-install agent-badge",
  pnpm: "pnpm exec agent-badge",
  yarn: "yarn agent-badge",
  bun: "bunx --bun agent-badge"
};

const packageScriptRunnerCommands: Record<PackageManager, string> = {
  npm: "npm run --silent",
  pnpm: "pnpm run --silent",
  yarn: "yarn run",
  bun: "bun run"
};

export function getLocalAgentBadgeCommand(packageManager: PackageManager): string {
  return localAgentBadgeCommands[packageManagerSchema.parse(packageManager)];
}

export function getAgentBadgeInitScriptCommand(): string {
  return "agent-badge init";
}

export function getAgentBadgeRefreshScriptCommand(): string {
  return "agent-badge refresh --hook pre-push --fail-soft";
}

export function getPackageScriptRunnerCommand(
  packageManager: PackageManager,
  scriptName: string
): string {
  return `${packageScriptRunnerCommands[
    packageManagerSchema.parse(packageManager)
  ]} ${scriptName}`;
}

export function getPrePushRefreshCommand(packageManager: PackageManager): string {
  return getPackageScriptRunnerCommand(
    packageManager,
    agentBadgeRefreshScriptName
  );
}
