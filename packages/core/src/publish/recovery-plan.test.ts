import { describe, expect, it } from "vitest";

import { defaultAgentBadgeConfig } from "../config/config-schema.js";
import { defaultAgentBadgeState } from "../state/state-schema.js";
import { inspectPublishReadiness } from "./publish-readiness.js";
import { derivePublishTrustReport } from "./publish-trust.js";
import type { SharedPublishHealthReport } from "./shared-health.js";
import { deriveRecoveryPlan } from "./recovery-plan.js";

function healthySharedHealth(): SharedPublishHealthReport {
  return {
    mode: "shared",
    status: "healthy",
    remoteContributorCount: 1,
    hasSharedOverrides: true,
    conflictingSessionCount: 0,
    stalePublisherIds: [],
    orphanedLocalPublisher: false,
    issues: []
  };
}

describe("deriveRecoveryPlan", () => {
  it("routes auth-missing stale shared publish to agent-badge refresh", () => {
    const state = {
      ...defaultAgentBadgeState,
      publish: {
        ...defaultAgentBadgeState.publish,
        status: "error",
        gistId: "gist_789",
        lastPublishedHash: "hash_live",
        lastPublishedAt: "2026-04-02T11:44:53.548Z",
        lastAttemptedAt: "2026-04-05T12:19:48.949Z",
        lastAttemptOutcome: "failed",
        lastSuccessfulSyncAt: "2026-04-02T11:44:53.548Z",
        lastAttemptCandidateHash: "hash_next",
        lastAttemptChangedBadge: "yes",
        lastFailureCode: "auth-missing",
        publisherId: "publisher-local",
        mode: "shared"
      },
      refresh: {
        ...defaultAgentBadgeState.refresh,
        lastRefreshedAt: "2026-04-05T12:19:48.949Z",
        lastScanMode: "incremental",
        lastPublishDecision: "failed"
      }
    };

    const plan = deriveRecoveryPlan({
      readiness: inspectPublishReadiness({
        config: {
          publish: {
            gistId: "gist_789",
            badgeUrl: "https://example.com/badge"
          }
        },
        state
      }),
      trust: derivePublishTrustReport({
        state,
        now: "2026-04-05T12:20:00.000Z"
      }),
      sharedHealth: healthySharedHealth()
    });

    expect(plan).toMatchObject({
      status: "recoverable",
      primaryAction:
        "Restore GitHub auth, then run `agent-badge refresh`."
    });
    expect(plan.reasonCodes).toContain("stale-failed-publish");
    expect(plan.reasonCodes).toContain("auth-missing");
  });

  it("routes missing local contributor to agent-badge refresh", () => {
    const plan = deriveRecoveryPlan({
      readiness: inspectPublishReadiness({
        config: defaultAgentBadgeConfig,
        state: defaultAgentBadgeState
      }),
      trust: derivePublishTrustReport({
        state: defaultAgentBadgeState,
        now: "2026-04-05T12:20:00.000Z"
      }),
      sharedHealth: {
        ...healthySharedHealth(),
        status: "orphaned",
        orphanedLocalPublisher: true,
        issues: ["missing-local-contributor"]
      }
    });

    expect(plan.primaryAction).toBe(
      "Run `agent-badge refresh` to recreate the local contributor record."
    );
    expect(plan.reasonCodes).toContain("missing-local-contributor");
  });

  it("routes missing shared metadata to agent-badge init", () => {
    const plan = deriveRecoveryPlan({
      readiness: inspectPublishReadiness({
        config: defaultAgentBadgeConfig,
        state: defaultAgentBadgeState
      }),
      trust: derivePublishTrustReport({
        state: defaultAgentBadgeState,
        now: "2026-04-05T12:20:00.000Z"
      }),
      sharedHealth: {
        ...healthySharedHealth(),
        status: "partial",
        hasSharedOverrides: false,
        issues: ["missing-shared-overrides"]
      }
    });

    expect(plan.primaryAction).toBe(
      "Run `agent-badge init` to repair shared publish metadata."
    );
    expect(plan.reasonCodes).toContain("missing-shared-overrides");
  });

  it("routes gist reconnection to agent-badge init --gist-id <id>", () => {
    const plan = deriveRecoveryPlan({
      readiness: inspectPublishReadiness({
        target: {
          status: "deferred",
          gistId: null,
          badgeUrl: null,
          reason: "gist-unreachable"
        }
      }),
      trust: derivePublishTrustReport({
        state: defaultAgentBadgeState,
        now: "2026-04-05T12:20:00.000Z"
      }),
      sharedHealth: null
    });

    expect(plan.primaryAction).toBe(
      "Run `agent-badge init --gist-id <id>` to reconnect a valid public gist target."
    );
    expect(plan.reasonCodes).toContain("gist-target-reconnect");
  });

  it("routes stale contributors to team coordination", () => {
    const plan = deriveRecoveryPlan({
      readiness: inspectPublishReadiness({
        config: defaultAgentBadgeConfig,
        state: defaultAgentBadgeState
      }),
      trust: derivePublishTrustReport({
        state: defaultAgentBadgeState,
        now: "2026-04-05T12:20:00.000Z"
      }),
      sharedHealth: {
        ...healthySharedHealth(),
        status: "stale",
        stalePublisherIds: ["publisher-a", "publisher-b"],
        issues: ["stale-contributor"]
      }
    });

    expect(plan).toMatchObject({
      status: "manual-team-action",
      primaryAction:
        "Ask stale contributors to run `agent-badge refresh` on their machines."
    });
    expect(plan.reasonCodes).toContain("stale-contributor");
  });
});
