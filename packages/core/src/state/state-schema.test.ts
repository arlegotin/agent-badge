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

  it("parses the deferred publish state without dropping gist bookkeeping", () => {
    expect(
      parseAgentBadgeState({
        ...defaultAgentBadgeState,
        publish: {
          status: "deferred",
          gistId: "gist_123",
          lastPublishedHash: "hash_123"
        }
      }).publish
    ).toEqual({
      status: "deferred",
      gistId: "gist_123",
      lastPublishedHash: "hash_123"
    });
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

  it("rejects transcript-like publish fields", () => {
    expect(() =>
      parseAgentBadgeState({
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          transcript: "do not persist prompt text"
        }
      })
    ).toThrow();
  });

  it("rejects path-like publish fields", () => {
    expect(() =>
      parseAgentBadgeState({
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          localPath: "/Users/example/.codex/session.jsonl"
        }
      })
    ).toThrow();
  });
});
