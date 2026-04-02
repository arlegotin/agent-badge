import type {
  AgentBadgeConfig,
  AgentBadgeRefreshMode
} from "../config/config-schema.js";
import type { AgentBadgeState } from "../state/state-schema.js";
import {
  inspectPublishReadiness,
  type PublishReadinessStatus
} from "./publish-readiness.js";
import {
  derivePublishTrustReport,
  type PublishTrustStatus
} from "./publish-trust.js";

export interface PrePushPolicyReport {
  readonly policy: AgentBadgeRefreshMode;
  readonly readinessStatus: PublishReadinessStatus;
  readonly trustStatus: PublishTrustStatus;
  readonly degraded: boolean;
}

function isDegradedTrustStatus(status: PublishTrustStatus): boolean {
  return status !== "current" && status !== "unchanged";
}

export function derivePrePushPolicyReport(options: {
  readonly config: Pick<AgentBadgeConfig, "refresh" | "publish">;
  readonly state: AgentBadgeState;
  readonly now: string;
}): PrePushPolicyReport {
  const readiness = inspectPublishReadiness({
    config: options.config,
    state: options.state
  });
  const trust = derivePublishTrustReport({
    state: options.state,
    now: options.now
  });

  return {
    policy: options.config.refresh.prePush.mode,
    readinessStatus: readiness.status,
    trustStatus: trust.status,
    degraded:
      readiness.status !== "ready" || isDegradedTrustStatus(trust.status)
  };
}

export function formatPrePushPolicyLine(policy: AgentBadgeRefreshMode): string {
  return `Pre-push policy: ${policy}`;
}

export function derivePrePushPolicyConsequence(
  report: PrePushPolicyReport
): {
  readonly level: "warning" | "blocking" | null;
  readonly message: string | null;
} {
  if (!report.degraded) {
    return {
      level: null,
      message: null
    };
  }

  if (report.policy === "fail-soft") {
    return {
      level: "warning",
      message:
        "live badge may be stale; push continues because pre-push policy is fail-soft."
    };
  }

  return {
    level: "blocking",
    message: "push stopped because pre-push policy is strict."
  };
}
