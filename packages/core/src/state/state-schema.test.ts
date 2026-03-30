import { describe, expect, it } from "vitest";

import { defaultAgentBadgeState, parseAgentBadgeState } from "./state-schema.js";

describe("agentBadgeStateSchema", () => {
  it("parses default placeholder state", () => {
    expect(parseAgentBadgeState(defaultAgentBadgeState)).toEqual(
      defaultAgentBadgeState
    );
  });

  it("keeps ambiguity overrides empty until the user makes an explicit choice", () => {
    expect(defaultAgentBadgeState.overrides.ambiguousSessions).toEqual({});
    expect(defaultAgentBadgeState.publish.lastPublishedHash).toBeNull();
  });

  it("rejects transcript-like fields", () => {
    expect(() =>
      parseAgentBadgeState({
        ...defaultAgentBadgeState,
        transcript: "do not persist prompt text"
      })
    ).toThrow();
  });

  it("rejects filename-style fields inside checkpoint data", () => {
    expect(() =>
      parseAgentBadgeState({
        ...defaultAgentBadgeState,
        checkpoints: {
          ...defaultAgentBadgeState.checkpoints,
          codex: {
            ...defaultAgentBadgeState.checkpoints.codex,
            fileName: "session.jsonl"
          }
        }
      })
    ).toThrow();
  });
});
