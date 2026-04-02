import { describe, expect, it } from "vitest";

import { defaultAgentBadgeState } from "../state/state-schema.js";
import { derivePublishTrustReport } from "./publish-trust.js";

describe("derivePublishTrustReport", () => {
  it("returns not-attempted when no publish has been configured", () => {
    expect(
      derivePublishTrustReport({
        state: defaultAgentBadgeState,
        now: "2026-03-30T19:00:00.000Z"
      })
    ).toEqual({
      status: "not-attempted",
      lastPublishedAt: null,
      lastRefreshedAt: null
    });
  });

  it("returns current when the last publish attempt updated the live badge", () => {
    const state = {
      ...defaultAgentBadgeState,
      publish: {
        ...defaultAgentBadgeState.publish,
        status: "published" as const,
        gistId: "gist_123",
        lastPublishedAt: "2026-03-30T19:00:00.000Z",
        lastAttemptedAt: "2026-03-30T19:00:00.000Z",
        lastAttemptOutcome: "published" as const,
        lastSuccessfulSyncAt: "2026-03-30T19:00:00.000Z",
        lastAttemptCandidateHash: "hash_current",
        lastAttemptChangedBadge: "yes" as const
      },
      refresh: {
        ...defaultAgentBadgeState.refresh,
        lastRefreshedAt: "2026-03-30T19:00:00.000Z",
        lastScanMode: "incremental" as const,
        lastPublishDecision: "published" as const
      }
    };

    expect(
      derivePublishTrustReport({
        state,
        now: "2026-03-30T19:05:00.000Z"
      })
    ).toEqual({
      status: "current",
      lastPublishedAt: "2026-03-30T19:00:00.000Z",
      lastRefreshedAt: "2026-03-30T19:00:00.000Z"
    });
  });

  it("returns unchanged when a successful sync reused the existing live badge", () => {
    const state = {
      ...defaultAgentBadgeState,
      publish: {
        ...defaultAgentBadgeState.publish,
        status: "published" as const,
        gistId: "gist_123",
        lastPublishedAt: "2026-03-30T18:30:00.000Z",
        lastAttemptedAt: "2026-03-30T19:00:00.000Z",
        lastAttemptOutcome: "unchanged" as const,
        lastSuccessfulSyncAt: "2026-03-30T19:00:00.000Z",
        lastAttemptCandidateHash: "hash_current",
        lastAttemptChangedBadge: "no" as const
      },
      refresh: {
        ...defaultAgentBadgeState.refresh,
        lastRefreshedAt: "2026-03-30T19:00:00.000Z",
        lastScanMode: "incremental" as const,
        lastPublishDecision: "skipped" as const
      }
    };

    expect(
      derivePublishTrustReport({
        state,
        now: "2026-03-30T19:05:00.000Z"
      })
    ).toEqual({
      status: "unchanged",
      lastPublishedAt: "2026-03-30T18:30:00.000Z",
      lastRefreshedAt: "2026-03-30T19:00:00.000Z"
    });
  });

  it("failed publish with an unchanged candidate badge is not stale", () => {
    const state = {
      ...defaultAgentBadgeState,
      publish: {
        ...defaultAgentBadgeState.publish,
        status: "error" as const,
        gistId: "gist_123",
        lastPublishedHash: "hash_current",
        lastPublishedAt: "2026-03-30T18:30:00.000Z",
        lastAttemptedAt: "2026-03-30T19:00:00.000Z",
        lastAttemptOutcome: "failed" as const,
        lastSuccessfulSyncAt: "2026-03-30T18:30:00.000Z",
        lastAttemptCandidateHash: "hash_current",
        lastAttemptChangedBadge: "no" as const,
        lastFailureCode: "remote-write-failed" as const
      },
      refresh: {
        ...defaultAgentBadgeState.refresh,
        lastRefreshedAt: "2026-03-30T19:00:00.000Z",
        lastScanMode: "incremental" as const,
        lastPublishDecision: "failed" as const
      }
    };

    expect(
      derivePublishTrustReport({
        state,
        now: "2026-03-30T19:05:00.000Z"
      })
    ).toEqual({
      status: "failed-but-unchanged",
      lastPublishedAt: "2026-03-30T18:30:00.000Z",
      lastRefreshedAt: "2026-03-30T19:00:00.000Z"
    });
  });

  it("failed publish with a changed candidate badge is stale", () => {
    const state = {
      ...defaultAgentBadgeState,
      publish: {
        ...defaultAgentBadgeState.publish,
        status: "error" as const,
        gistId: "gist_123",
        lastPublishedHash: "hash_live",
        lastPublishedAt: "2026-03-30T18:30:00.000Z",
        lastAttemptedAt: "2026-03-30T19:00:00.000Z",
        lastAttemptOutcome: "failed" as const,
        lastSuccessfulSyncAt: "2026-03-30T18:30:00.000Z",
        lastAttemptCandidateHash: "hash_next",
        lastAttemptChangedBadge: "yes" as const,
        lastFailureCode: "remote-write-failed" as const
      },
      refresh: {
        ...defaultAgentBadgeState.refresh,
        lastRefreshedAt: "2026-03-30T19:00:00.000Z",
        lastScanMode: "incremental" as const,
        lastPublishDecision: "failed" as const
      }
    };

    expect(
      derivePublishTrustReport({
        state,
        now: "2026-03-30T19:05:00.000Z"
      })
    ).toEqual({
      status: "stale-failed-publish",
      lastPublishedAt: "2026-03-30T18:30:00.000Z",
      lastRefreshedAt: "2026-03-30T19:00:00.000Z"
    });
  });

  it("returns unknown when persisted attempt facts are incomplete", () => {
    const state = {
      ...defaultAgentBadgeState,
      publish: {
        ...defaultAgentBadgeState.publish,
        status: "error" as const,
        gistId: "gist_123",
        lastPublishedHash: "hash_live",
        lastPublishedAt: "2026-03-30T18:30:00.000Z",
        lastAttemptedAt: "2026-03-30T19:00:00.000Z",
        lastAttemptOutcome: "failed" as const,
        lastSuccessfulSyncAt: "2026-03-30T18:30:00.000Z",
        lastAttemptCandidateHash: null,
        lastAttemptChangedBadge: "unknown" as const,
        lastFailureCode: "unknown" as const
      },
      refresh: {
        ...defaultAgentBadgeState.refresh,
        lastRefreshedAt: "2026-03-30T19:00:00.000Z",
        lastScanMode: "incremental" as const,
        lastPublishDecision: "failed" as const
      }
    };

    expect(
      derivePublishTrustReport({
        state,
        now: "2026-03-30T19:05:00.000Z"
      })
    ).toEqual({
      status: "unknown",
      lastPublishedAt: "2026-03-30T18:30:00.000Z",
      lastRefreshedAt: "2026-03-30T19:00:00.000Z"
    });
  });
});
