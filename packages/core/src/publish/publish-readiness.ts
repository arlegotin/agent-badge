import type { AgentBadgeConfig } from "../config/config-schema.js";
import type { GitHubAuthStatus } from "../init/github-auth.js";
import type {
  AgentBadgePublishFailureCode,
  AgentBadgeState
} from "../state/state-schema.js";
import type { PublishTargetResult } from "./publish-target.js";

export type PublishReadinessStatus = "ready" | AgentBadgePublishFailureCode;

export interface PublishReadinessReport {
  readonly status: PublishReadinessStatus;
  readonly summary: string;
  readonly fix: readonly string[];
}

export interface InspectPublishReadinessOptions {
  readonly config?: Pick<AgentBadgeConfig, "publish"> | null;
  readonly state?: AgentBadgeState | null;
  readonly githubAuth?: GitHubAuthStatus | null;
  readonly target?: PublishTargetResult | null;
}

function buildFix(messages: string[]): readonly string[] {
  return [...messages];
}

function statusFromTarget(target: PublishTargetResult): PublishReadinessStatus {
  if (target.status !== "deferred") {
    return "ready";
  }

  switch (target.reason) {
    case "auth-missing":
      return "auth-missing";
    case "gist-unreachable":
      return "gist-unreachable";
    case "gist-not-public":
      return "gist-not-public";
    case "gist-missing-owner":
      return "gist-missing-owner";
    case "gist-create-failed":
      return "remote-write-failed";
    default:
      return "deferred";
  }
}

export function formatPublishReadinessStatus(
  status: PublishReadinessStatus
): string {
  switch (status) {
    case "ready":
      return "ready";
    case "auth-missing":
      return "auth missing";
    case "gist-unreachable":
      return "gist unreachable";
    case "gist-not-public":
      return "gist not public";
    case "gist-missing-owner":
      return "gist missing owner";
    case "not-configured":
      return "not configured";
    case "deferred":
      return "deferred";
    case "remote-write-failed":
      return "remote write failed";
    case "remote-readback-failed":
      return "remote readback failed";
    case "remote-readback-mismatch":
      return "remote readback mismatch";
    case "remote-state-invalid":
      return "remote state invalid";
    case "remote-inspection-failed":
      return "remote inspection failed";
    case "unknown":
      return "unknown";
  }
}

export function buildPublishReadinessFixes(
  status: PublishReadinessStatus
): readonly string[] {
  switch (status) {
    case "ready":
      return [];
    case "auth-missing":
      return buildFix([
        "Set GH_TOKEN, GITHUB_TOKEN, or GITHUB_PAT in the environment and rerun the command."
      ]);
    case "gist-unreachable":
    case "gist-not-public":
    case "gist-missing-owner":
    case "not-configured":
    case "deferred":
      return buildFix([
        "Run `agent-badge init --gist-id <id>` to reconnect a valid public gist target."
      ]);
    case "remote-write-failed":
      return buildFix([
        "Retry publish from the machine with the latest local state by rerunning `agent-badge refresh`.",
        "If writes still fail, verify gist access or reconnect the gist with `agent-badge init --gist-id <id>`."
      ]);
    case "remote-readback-failed":
    case "remote-readback-mismatch":
    case "remote-state-invalid":
      return buildFix([
        "Rerun `agent-badge refresh` or `agent-badge publish` and inspect `agent-badge doctor` before trusting the live badge."
      ]);
    case "remote-inspection-failed":
    case "unknown":
      return buildFix([
        "Rerun `agent-badge doctor` to inspect publish readiness and reconnect the gist target if needed."
      ]);
  }
}

export function inspectPublishReadiness(
  options: InspectPublishReadinessOptions = {}
): PublishReadinessReport {
  let status: PublishReadinessStatus = "ready";

  if (options.target) {
    status = statusFromTarget(options.target);
  } else if (
    options.config &&
    (options.config.publish.gistId === null ||
      options.config.publish.badgeUrl === null)
  ) {
    status =
      options.state?.publish.lastFailureCode === "deferred"
        ? "deferred"
        : "not-configured";
  } else if (
    options.state?.publish.lastAttemptOutcome === "failed" &&
    options.state.publish.lastFailureCode !== null
  ) {
    status = options.state.publish.lastFailureCode;
  } else if (options.githubAuth && !options.githubAuth.available) {
    status = "auth-missing";
  }

  return {
    status,
    summary: formatPublishReadinessStatus(status),
    fix: buildPublishReadinessFixes(status)
  };
}
