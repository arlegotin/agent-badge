import type { PublishReadinessReport } from "./publish-readiness.js";
import type { PublishTrustReport } from "./publish-trust.js";
import type { SharedPublishHealthReport } from "./shared-health.js";

export type RecoveryPlanStatus =
  | "healthy"
  | "recoverable"
  | "manual-team-action"
  | "blocked";

export type RecoveryCommand =
  | "agent-badge refresh"
  | "agent-badge init"
  | "agent-badge init --gist-id <id>";

export interface RecoveryPlan {
  readonly status: RecoveryPlanStatus;
  readonly primaryAction: string | null;
  readonly command: RecoveryCommand | null;
  readonly secondaryActions: readonly string[];
  readonly reasonCodes: readonly string[];
}

export interface DeriveRecoveryPlanOptions {
  readonly readiness: PublishReadinessReport;
  readonly trust: PublishTrustReport;
  readonly sharedHealth?: SharedPublishHealthReport | null;
}

export function formatRecoveryResult(command: RecoveryCommand): string {
  return `healthy after ${command}`;
}

export function deriveRecoveryPlan(
  options: DeriveRecoveryPlanOptions
): RecoveryPlan {
  const sharedHealth = options.sharedHealth ?? null;
  const reasonCodes = new Set<string>([
    options.readiness.status,
    options.trust.status
  ]);

  if (sharedHealth !== null) {
    reasonCodes.add(sharedHealth.status);

    for (const issueId of sharedHealth.issues) {
      reasonCodes.add(issueId);
    }
  }

  if (sharedHealth?.issues.includes("missing-shared-overrides")) {
    return {
      status: "recoverable",
      primaryAction: "Run `agent-badge init` to repair shared publish metadata.",
      command: "agent-badge init",
      secondaryActions: [],
      reasonCodes: [...reasonCodes]
    };
  }

  if (sharedHealth?.issues.includes("missing-local-contributor")) {
    return {
      status: "recoverable",
      primaryAction:
        "Run `agent-badge refresh` to recreate the local contributor record.",
      command: "agent-badge refresh",
      secondaryActions: [
        "If this repo is migrating from legacy publish state, migrate from the original publisher machine by rerunning `agent-badge init`."
      ],
      reasonCodes: [...reasonCodes]
    };
  }

  if (sharedHealth?.issues.includes("stale-contributor")) {
    return {
      status: "manual-team-action",
      primaryAction:
        "Ask stale contributors to run `agent-badge refresh` on their machines.",
      command: null,
      secondaryActions: [],
      reasonCodes: [...reasonCodes]
    };
  }

  if (sharedHealth?.issues.includes("conflicting-session-observations")) {
    return {
      status: "manual-team-action",
      primaryAction:
        "Coordinate with contributors to rerun `agent-badge refresh` on the machines that published conflicting observations.",
      command: null,
      secondaryActions: [],
      reasonCodes: [...reasonCodes]
    };
  }

  if (
    options.readiness.status === "not-configured" ||
    options.readiness.status === "deferred" ||
    options.readiness.status === "gist-unreachable" ||
    options.readiness.status === "gist-not-public" ||
    options.readiness.status === "gist-missing-owner"
  ) {
    reasonCodes.add("gist-target-reconnect");

    return {
      status: "recoverable",
      primaryAction:
        "Run `agent-badge init --gist-id <id>` to reconnect a valid public gist target.",
      command: "agent-badge init --gist-id <id>",
      secondaryActions: [],
      reasonCodes: [...reasonCodes]
    };
  }

  if (
    options.readiness.status === "auth-missing" &&
    (options.trust.status === "stale-failed-publish" ||
      options.trust.status === "failed-but-unchanged" ||
      options.trust.status === "unknown")
  ) {
    return {
      status: "recoverable",
      primaryAction: "Restore GitHub auth, then run `agent-badge refresh`.",
      command: "agent-badge refresh",
      secondaryActions: [],
      reasonCodes: [...reasonCodes]
    };
  }

  if (
    options.trust.status === "stale-failed-publish" ||
    options.trust.status === "failed-but-unchanged"
  ) {
    return {
      status: "recoverable",
      primaryAction:
        "Retry publish from the machine with the latest local state by rerunning `agent-badge refresh`.",
      command: "agent-badge refresh",
      secondaryActions: [],
      reasonCodes: [...reasonCodes]
    };
  }

  if (
    options.readiness.status === "remote-write-failed" ||
    options.readiness.status === "remote-readback-failed" ||
    options.readiness.status === "remote-readback-mismatch" ||
    options.readiness.status === "remote-state-invalid"
  ) {
    return {
      status: "recoverable",
      primaryAction:
        "Retry publish from the machine with the latest local state by rerunning `agent-badge refresh`.",
      command: "agent-badge refresh",
      secondaryActions: [],
      reasonCodes: [...reasonCodes]
    };
  }

  if (sharedHealth?.issues.includes("legacy-no-contributors")) {
    return {
      status: "manual-team-action",
      primaryAction:
        "Run `agent-badge init` on the original publisher machine to migrate existing single-writer repos.",
      command: null,
      secondaryActions: [],
      reasonCodes: [...reasonCodes]
    };
  }

  if (
    options.readiness.status === "remote-inspection-failed" ||
    options.readiness.status === "unknown"
  ) {
    reasonCodes.add("gist-target-reconnect");

    return {
      status: "blocked",
      primaryAction:
        "Run `agent-badge init --gist-id <id>` to reconnect a valid public gist target.",
      command: "agent-badge init --gist-id <id>",
      secondaryActions: [],
      reasonCodes: [...reasonCodes]
    };
  }

  return {
    status: "healthy",
    primaryAction: null,
    command: null,
    secondaryActions: [],
    reasonCodes: [...reasonCodes]
  };
}
