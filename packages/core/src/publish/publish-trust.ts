import type { AgentBadgeState } from "../state/state-schema.js";

export type PublishTrustStatus =
  | "current"
  | "failed-but-unchanged"
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

export function derivePublishTrustReport({
  state,
  now: _now
}: DerivePublishTrustReportOptions): PublishTrustReport {
  const report: PublishTrustReport = {
    status: "unknown",
    lastRefreshedAt: state.refresh.lastRefreshedAt,
    lastPublishedAt: state.publish.lastPublishedAt
  };
  const { publish } = state;

  if (
    publish.gistId === null ||
    publish.lastAttemptOutcome === "not-attempted" ||
    publish.lastFailureCode === "not-configured" ||
    publish.lastFailureCode === "deferred"
  ) {
    return {
      ...report,
      status: "not-attempted"
    };
  }

  if (
    publish.lastAttemptOutcome === "published" &&
    publish.lastPublishedAt !== null &&
    publish.lastSuccessfulSyncAt !== null
  ) {
    return {
      ...report,
      status: "current"
    };
  }

  if (
    publish.lastAttemptOutcome === "unchanged" &&
    publish.lastSuccessfulSyncAt !== null
  ) {
    return {
      ...report,
      status: "unchanged"
    };
  }

  if (publish.lastAttemptOutcome !== "failed" || publish.lastAttemptedAt === null) {
    return report;
  }

  if (
    publish.lastAttemptChangedBadge === "no" &&
    publish.lastAttemptCandidateHash !== null &&
    publish.lastPublishedHash !== null &&
    publish.lastAttemptCandidateHash === publish.lastPublishedHash
  ) {
    return {
      ...report,
      status: "failed-but-unchanged"
    };
  }

  if (
    publish.lastAttemptChangedBadge === "yes" &&
    publish.lastAttemptCandidateHash !== null
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
    case "failed-but-unchanged":
      return "publish failed but live badge is unchanged";
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
