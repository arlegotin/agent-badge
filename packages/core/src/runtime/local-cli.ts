import type { PackageManager } from "./package-manager.js";
import type { AgentBadgeRefreshMode } from "../config/config-schema.js";
import { getSharedAgentBadgeCommand } from "./shared-cli.js";

export const agentBadgeInitScriptName = "agent-badge:init";
export const agentBadgeRefreshScriptName = "agent-badge:refresh";

export function getLocalAgentBadgeCommand(_packageManager: PackageManager): string {
  return getSharedAgentBadgeCommand();
}

export function getAgentBadgeInitScriptCommand(): string {
  return getSharedAgentBadgeCommand("init");
}

export function getAgentBadgeRefreshScriptCommand(
  mode: AgentBadgeRefreshMode = "fail-soft"
): string {
  return getSharedAgentBadgeCommand(
    "refresh",
    "--hook",
    "pre-push",
    "--hook-policy",
    mode
  );
}

export function getPrePushRefreshCommand(
  _packageManager: PackageManager,
  mode: AgentBadgeRefreshMode = "fail-soft"
): string {
  return getAgentBadgeRefreshScriptCommand(mode);
}
