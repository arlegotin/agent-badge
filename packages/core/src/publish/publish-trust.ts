import type { AgentBadgeState } from "../state/state-schema.js";

export type PublishTrustStatus =
  | "current"
  | "unchanged"
  | "not-attempted"
  | "stale-failed-publish"
  | "unknown";

export interface PublishTrustReport {
  readonly status: PublishTrustStatus;
  readonly lastRefreshedAt: AgentBadgeState["refresh"]["lastRefreshedAt"];
  readonly lastPublishedAt: AgentBadgeState["publish"]["lastPublishedAt"];
}

export interface DerivePublishTrustReportOptions {
  readonly state: AgentBadgeState;
  readonly now: string;
}

function isNewerThan(left: string | null, right: string | null): boolean {
  if (left === null) {
    return false;
  }

  if (right === null) {
    return true;
  }

  return Date.parse(left) > Date.parse(right);
}

export function derivePublishTrustReport({
  state,
  now: _now
}: DerivePublishTrustReportOptions): PublishTrustReport {
  const report: PublishTrustReport = {
    status: "unknown",
    lastRefreshedAt: state.refresh.lastRefreshedAt,
    lastPublishedAt: state.publish.lastPublishedAt
  };
  const publishDecision = state.refresh.lastPublishDecision;

  if (
    state.publish.gistId === null ||
    publishDecision === "not-configured" ||
    publishDecision === "deferred"
  ) {
    return {
      ...report,
      status: "not-attempted"
    };
  }

  if (publishDecision === "skipped") {
    return {
      ...report,
      status: "unchanged"
    };
  }

  if (publishDecision === "published") {
    return {
      ...report,
      status: "current"
    };
  }

  if (
    publishDecision === "failed" &&
    isNewerThan(state.refresh.lastRefreshedAt, state.publish.lastPublishedAt)
  ) {
    return {
      ...report,
      status: "stale-failed-publish"
    };
  }

  return report;
}

export function formatPublishTrustStatus(status: PublishTrustStatus): string {
  switch (status) {
    case "current":
      return "current";
    case "unchanged":
      return "unchanged";
    case "not-attempted":
      return "not attempted";
    case "stale-failed-publish":
      return "stale after failed publish";
    case "unknown":
      return "unknown";
  }
}
