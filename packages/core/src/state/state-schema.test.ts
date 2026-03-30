import { describe, expect, it } from "vitest";

import { defaultAgentBadgeState, parseAgentBadgeState } from "./state-schema.js";

describe("agentBadgeStateSchema", () => {
  it("parses default placeholder state", () => {
    expect(parseAgentBadgeState(defaultAgentBadgeState)).toEqual(
      defaultAgentBadgeState
    );
  });

  it("rejects transcript-like fields", () => {
    expect(() =>
      parseAgentBadgeState({
        ...defaultAgentBadgeState,
        transcript: "do not persist prompt text"
      })
    ).toThrow();
  });
});
