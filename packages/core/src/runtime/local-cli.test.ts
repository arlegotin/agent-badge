import { describe, expect, it } from "vitest";

import {
  agentBadgeRefreshScriptName,
  getAgentBadgeInitScriptCommand,
  getAgentBadgeRefreshScriptCommand,
  getLocalAgentBadgeCommand,
  getPackageScriptRunnerCommand,
  getPrePushRefreshCommand
} from "./local-cli.js";

describe("getLocalAgentBadgeCommand", () => {
  it("returns the exact repo-local command for each supported package manager", () => {
    expect(getLocalAgentBadgeCommand("npm")).toBe("npx --no-install agent-badge");
    expect(getLocalAgentBadgeCommand("pnpm")).toBe("pnpm exec agent-badge");
    expect(getLocalAgentBadgeCommand("yarn")).toBe("yarn agent-badge");
    expect(getLocalAgentBadgeCommand("bun")).toBe("bunx --bun agent-badge");
  });

  it("returns stable managed script commands", () => {
    expect(getAgentBadgeInitScriptCommand()).toBe("agent-badge init");
    expect(getAgentBadgeRefreshScriptCommand()).toBe(
      "agent-badge refresh --hook pre-push --fail-soft"
    );
    expect(getAgentBadgeRefreshScriptCommand("fail-soft")).toBe(
      "agent-badge refresh --hook pre-push --fail-soft"
    );
  });

  it("returns the exact pre-push refresh command for strict mode", () => {
    expect(getAgentBadgeRefreshScriptCommand("strict")).toBe(
      "agent-badge refresh --hook pre-push"
    );
  });

  it("returns package-manager-specific script runner commands", () => {
    expect(getPackageScriptRunnerCommand("npm", agentBadgeRefreshScriptName)).toBe(
      "npm run --silent agent-badge:refresh"
    );
    expect(getPackageScriptRunnerCommand("pnpm", agentBadgeRefreshScriptName)).toBe(
      "pnpm run --silent agent-badge:refresh"
    );
    expect(getPackageScriptRunnerCommand("yarn", agentBadgeRefreshScriptName)).toBe(
      "yarn run agent-badge:refresh"
    );
    expect(getPackageScriptRunnerCommand("bun", agentBadgeRefreshScriptName)).toBe(
      "bun run agent-badge:refresh"
    );
  });

  it("returns the exact pre-push refresh hook command for each supported package manager", () => {
    expect(getPrePushRefreshCommand("npm")).toBe(
      "npm run --silent agent-badge:refresh"
    );
    expect(getPrePushRefreshCommand("pnpm")).toBe(
      "pnpm run --silent agent-badge:refresh"
    );
    expect(getPrePushRefreshCommand("yarn")).toBe(
      "yarn run agent-badge:refresh"
    );
    expect(getPrePushRefreshCommand("bun")).toBe(
      "bun run agent-badge:refresh"
    );
  });
});
