import { describe, expect, it } from "vitest";

import { defaultAgentBadgeConfig } from "../config/config-schema.js";
import { defaultAgentBadgeState } from "../state/state-schema.js";
import {
  formatPublishReadinessStatus,
  inspectPublishReadiness
} from "./publish-readiness.js";

describe("inspectPublishReadiness", () => {
  it("returns auth missing when GitHub auth is unavailable", () => {
    expect(
      inspectPublishReadiness({
        githubAuth: {
          available: false,
          source: "none"
        }
      })
    ).toMatchObject({
      status: "auth-missing",
      summary: "auth missing"
    });
  });

  it("returns not configured when the gist target is missing", () => {
    expect(
      inspectPublishReadiness({
        config: defaultAgentBadgeConfig,
        state: defaultAgentBadgeState
      }).status
    ).toBe("not-configured");
  });

  it("returns remote readback mismatch from failed publish state", () => {
    expect(
      inspectPublishReadiness({
        config: {
          ...defaultAgentBadgeConfig,
          publish: {
            ...defaultAgentBadgeConfig.publish,
            gistId: "gist_123",
            badgeUrl: "https://example.com/badge.json"
          }
        },
        state: {
          ...defaultAgentBadgeState,
          publish: {
            ...defaultAgentBadgeState.publish,
            status: "error",
            gistId: "gist_123",
            lastAttemptOutcome: "failed",
            lastFailureCode: "remote-readback-mismatch"
          }
        }
      }).status
    ).toBe("remote-readback-mismatch");
  });

  it("formats gist-unreachable with operator-readable wording", () => {
    expect(formatPublishReadinessStatus("gist-unreachable")).toBe(
      "gist unreachable"
    );
  });
});
