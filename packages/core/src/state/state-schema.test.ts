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
    expect(
      (defaultAgentBadgeState.publish as Record<string, unknown>).publisherId
    ).toBeNull();
    expect((defaultAgentBadgeState.publish as Record<string, unknown>).mode).toBe(
      "legacy"
    );
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
          lastPublishedAt: "2026-03-30T12:00:00Z",
          publisherId: "publisher_123",
          mode: "shared"
        }
      }).publish
    ).toEqual({
      status: "deferred",
      gistId: "gist_123",
      lastPublishedHash: "hash_123",
      lastPublishedAt: "2026-03-30T12:00:00Z",
      lastAttemptedAt: null,
      lastAttemptOutcome: "not-attempted",
      lastSuccessfulSyncAt: null,
      lastAttemptCandidateHash: null,
      lastAttemptChangedBadge: "unknown",
      lastFailureCode: null,
      publisherId: "publisher_123",
      mode: "shared"
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
            includedEstimatedCostUsdMicros: null,
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
        includedEstimatedCostUsdMicros: null,
        ambiguousSessions: 1,
        excludedSessions: 2
      }
    });
  });

  it("parses publish attempt diagnostics without raw error detail", () => {
    expect(
      parseAgentBadgeState({
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          status: "error",
          gistId: "gist_123",
          lastPublishedHash: "hash_published",
          lastPublishedAt: "2026-03-30T12:00:00Z",
          publisherId: "publisher_123",
          mode: "shared",
          lastAttemptedAt: "2026-03-30T12:05:00Z",
          lastAttemptOutcome: "failed",
          lastSuccessfulSyncAt: "2026-03-30T12:00:00Z",
          lastAttemptCandidateHash: "hash_candidate",
          lastAttemptChangedBadge: "yes",
          lastFailureCode: "remote-write-failed"
        }
      }).publish
    ).toEqual({
      status: "error",
      gistId: "gist_123",
      lastPublishedHash: "hash_published",
      lastPublishedAt: "2026-03-30T12:00:00Z",
      publisherId: "publisher_123",
      mode: "shared",
      lastAttemptedAt: "2026-03-30T12:05:00Z",
      lastAttemptOutcome: "failed",
      lastSuccessfulSyncAt: "2026-03-30T12:00:00Z",
      lastAttemptCandidateHash: "hash_candidate",
      lastAttemptChangedBadge: "yes",
      lastFailureCode: "remote-write-failed"
    });
  });

  it("accepts expanded publish failure codes without raw detail", () => {
    expect(
      parseAgentBadgeState({
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          status: "error",
          lastFailureCode: "auth-missing"
        }
      }).publish.lastFailureCode
    ).toBe("auth-missing");

    expect(
      parseAgentBadgeState({
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          status: "error",
          lastFailureCode: "remote-readback-mismatch"
        }
      }).publish.lastFailureCode
    ).toBe("remote-readback-mismatch");

    expect(
      parseAgentBadgeState({
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          status: "error",
          lastFailureCode: "remote-state-invalid"
        }
      }).publish.lastFailureCode
    ).toBe("remote-state-invalid");
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
          publisherId: "publisher_123",
          mode: "shared",
          localPath: "/Users/example/.codex/session.jsonl"
        }
      })
    ).toThrow();
  });

  it("rejects invalid extra publish fields while keeping publisherId and mode explicit", () => {
    expect(() =>
      parseAgentBadgeState({
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          publisherId: "publisher_123",
          mode: "shared",
          machineName: "workstation-01"
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
            includedEstimatedCostUsdMicros: null,
            ambiguousSessions: 0,
            excludedSessions: 0,
            evidence: []
          }
        }
      })
    ).toThrow();
  });
});
