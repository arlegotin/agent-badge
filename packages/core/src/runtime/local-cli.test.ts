import { describe, expect, it } from "vitest";

import {
  getLocalAgentBadgeCommand,
  getPrePushRefreshCommand
} from "./local-cli.js";

describe("getLocalAgentBadgeCommand", () => {
  it("returns the exact repo-local command for each supported package manager", () => {
    expect(getLocalAgentBadgeCommand("npm")).toBe("npx --no-install agent-badge");
    expect(getLocalAgentBadgeCommand("pnpm")).toBe("pnpm exec agent-badge");
    expect(getLocalAgentBadgeCommand("yarn")).toBe("yarn agent-badge");
    expect(getLocalAgentBadgeCommand("bun")).toBe("bunx --bun agent-badge");
  });

  it("returns the exact pre-push refresh command for each supported package manager", () => {
    expect(getPrePushRefreshCommand("npm")).toBe(
      "npx --no-install agent-badge refresh --hook pre-push --fail-soft"
    );
    expect(getPrePushRefreshCommand("pnpm")).toBe(
      "pnpm exec agent-badge refresh --hook pre-push --fail-soft"
    );
    expect(getPrePushRefreshCommand("yarn")).toBe(
      "yarn agent-badge refresh --hook pre-push --fail-soft"
    );
    expect(getPrePushRefreshCommand("bun")).toBe(
      "bunx --bun agent-badge refresh --hook pre-push --fail-soft"
    );
  });
});
