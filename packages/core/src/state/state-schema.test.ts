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
    expect(defaultAgentBadgeState.publish.lastPublishedAt).toBeNull();
    expect(defaultAgentBadgeState.refresh.summary).toBeNull();
  });

  it("parses the deferred publish state without dropping gist bookkeeping", () => {
    expect(
      parseAgentBadgeState({
        ...defaultAgentBadgeState,
        publish: {
          status: "deferred",
          gistId: "gist_123",
          lastPublishedHash: "hash_123",
          lastPublishedAt: "2026-03-30T12:00:00Z"
        }
      }).publish
    ).toEqual({
      status: "deferred",
      gistId: "gist_123",
      lastPublishedHash: "hash_123",
      lastPublishedAt: "2026-03-30T12:00:00Z"
    });
  });

  it("parses refresh summary state without allowing extra persisted evidence", () => {
    expect(
      parseAgentBadgeState({
        ...defaultAgentBadgeState,
        refresh: {
          lastRefreshedAt: "2026-03-30T12:05:00Z",
          lastScanMode: "incremental",
          lastPublishDecision: "skipped",
          summary: {
            includedSessions: 4,
            includedTokens: 2400,
            ambiguousSessions: 1,
            excludedSessions: 2
          }
        }
      }).refresh
    ).toEqual({
      lastRefreshedAt: "2026-03-30T12:05:00Z",
      lastScanMode: "incremental",
      lastPublishDecision: "skipped",
      summary: {
        includedSessions: 4,
        includedTokens: 2400,
        ambiguousSessions: 1,
        excludedSessions: 2
      }
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

  it("rejects raw evidence fields inside refresh summary state", () => {
    expect(() =>
      parseAgentBadgeState({
        ...defaultAgentBadgeState,
        refresh: {
          lastRefreshedAt: "2026-03-30T12:05:00Z",
          lastScanMode: "full",
          lastPublishDecision: "published",
          summary: {
            includedSessions: 1,
            includedTokens: 42,
            ambiguousSessions: 0,
            excludedSessions: 0,
            evidence: []
          }
        }
      })
    ).toThrow();
  });
});
