import { describe, expect, it } from "vitest";

import {
  getAgentBadgeInitScriptCommand,
  getAgentBadgeRefreshScriptCommand,
  getLocalAgentBadgeCommand,
  getPrePushRefreshCommand
} from "./local-cli.js";

describe("getLocalAgentBadgeCommand", () => {
  it("returns the shared PATH-based command for each supported package manager context", () => {
    expect(getLocalAgentBadgeCommand("npm")).toBe("agent-badge");
    expect(getLocalAgentBadgeCommand("pnpm")).toBe("agent-badge");
    expect(getLocalAgentBadgeCommand("yarn")).toBe("agent-badge");
    expect(getLocalAgentBadgeCommand("bun")).toBe("agent-badge");
  });

  it("returns stable managed script commands", () => {
    expect(getAgentBadgeInitScriptCommand()).toBe("agent-badge init");
    expect(getAgentBadgeRefreshScriptCommand()).toBe(
      "agent-badge refresh --hook pre-push --hook-policy fail-soft"
    );
    expect(getAgentBadgeRefreshScriptCommand("fail-soft")).toBe(
      "agent-badge refresh --hook pre-push --hook-policy fail-soft"
    );
  });

  it("returns the exact pre-push refresh command for strict mode", () => {
    expect(getAgentBadgeRefreshScriptCommand("strict")).toBe(
      "agent-badge refresh --hook pre-push --hook-policy strict"
    );
  });

  it("returns the exact pre-push refresh hook command for each supported package manager", () => {
    expect(getPrePushRefreshCommand("npm")).toBe(
      "agent-badge refresh --hook pre-push --hook-policy fail-soft"
    );
    expect(getPrePushRefreshCommand("pnpm")).toBe(
      "agent-badge refresh --hook pre-push --hook-policy fail-soft"
    );
    expect(getPrePushRefreshCommand("yarn")).toBe(
      "agent-badge refresh --hook pre-push --hook-policy fail-soft"
    );
    expect(getPrePushRefreshCommand("bun")).toBe(
      "agent-badge refresh --hook pre-push --hook-policy fail-soft"
    );
  });
});
