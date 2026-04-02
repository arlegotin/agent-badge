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

  it("returns unchanged when the last refresh skipped the badge write", () => {
    const state = {
      ...defaultAgentBadgeState,
      publish: {
        ...defaultAgentBadgeState.publish,
        status: "published" as const,
        gistId: "gist_123",
        lastPublishedAt: "2026-03-30T18:30:00.000Z"
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

  it("returns current when the last refresh published the badge", () => {
    const state = {
      ...defaultAgentBadgeState,
      publish: {
        ...defaultAgentBadgeState.publish,
        status: "published" as const,
        gistId: "gist_123",
        lastPublishedAt: "2026-03-30T19:00:00.000Z"
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

  it("returns stale-failed-publish when the refresh is newer than the last successful publish", () => {
    const state = {
      ...defaultAgentBadgeState,
      publish: {
        ...defaultAgentBadgeState.publish,
        status: "error" as const,
        gistId: "gist_123",
        lastPublishedAt: "2026-03-30T18:30:00.000Z"
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
});
