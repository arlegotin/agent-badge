import {
  packageManagerSchema,
  type PackageManager
} from "./package-manager.js";

const localAgentBadgeCommands: Record<PackageManager, string> = {
  npm: "npx --no-install agent-badge",
  pnpm: "pnpm exec agent-badge",
  yarn: "yarn agent-badge",
  bun: "bunx --bun agent-badge"
};

export function getLocalAgentBadgeCommand(packageManager: PackageManager): string {
  return localAgentBadgeCommands[packageManagerSchema.parse(packageManager)];
}

export function getPrePushRefreshCommand(packageManager: PackageManager): string {
  return `${getLocalAgentBadgeCommand(packageManager)} refresh --hook pre-push --fail-soft`;
}
