import type { AgentBadgeConfig } from "../config/config-schema.js";
import type {
  AgentBadgePublishAttemptChangedBadge,
  AgentBadgePublishFailureCode,
  AgentBadgePublishMode,
  AgentBadgePublishStatus,
  AgentBadgeState
} from "../state/state-schema.js";
import type { PublishTargetResult } from "./publish-target.js";

export interface ApplyPublishTargetResultOptions {
  readonly config: AgentBadgeConfig;
  readonly state: AgentBadgeState;
  readonly target: PublishTargetResult;
}

export interface PublishTargetPersistenceResult {
  readonly config: AgentBadgeConfig;
  readonly state: AgentBadgeState;
}

export interface ApplyPublishAttemptNotAttemptedOptions {
  readonly state: AgentBadgeState;
  readonly at: string;
  readonly failureCode: Extract<
    AgentBadgePublishFailureCode,
    "deferred" | "not-configured"
  >;
  readonly status?: AgentBadgePublishStatus;
  readonly gistId?: string | null;
}

export interface ApplyPublishAttemptFailureOptions {
  readonly state: AgentBadgeState;
  readonly at: string;
  readonly failureCode: AgentBadgePublishFailureCode;
  readonly candidateHash?: string | null;
  readonly changedBadge?: AgentBadgePublishAttemptChangedBadge;
  readonly status?: AgentBadgePublishStatus;
  readonly gistId?: string | null;
}

export interface ApplySuccessfulPublishAttemptOptions {
  readonly state: AgentBadgeState;
  readonly at: string;
  readonly gistId: string;
  readonly hash: string;
  readonly publisherId: string;
  readonly mode?: AgentBadgePublishMode;
  readonly changedBadge: boolean;
  readonly status?: AgentBadgePublishStatus;
}

function resolvePublishStatus(
  target: PublishTargetResult
): Extract<AgentBadgePublishStatus, "deferred" | "pending"> {
  return target.status === "deferred" ? "deferred" : "pending";
}

export function toPublishAttemptChangedBadge(
  changedBadge: boolean | null | undefined
): AgentBadgePublishAttemptChangedBadge {
  if (changedBadge === true) {
    return "yes";
  }

  if (changedBadge === false) {
    return "no";
  }

  return "unknown";
}

export function applyPublishTargetResult({
  config,
  state,
  target
}: ApplyPublishTargetResultOptions): PublishTargetPersistenceResult {
  return {
    config: {
      ...config,
      publish: {
        ...config.publish,
        gistId: target.gistId,
        badgeUrl: target.badgeUrl
      }
    },
    state: {
      ...state,
      publish: {
        ...state.publish,
        status: resolvePublishStatus(target),
        gistId: target.gistId
      }
    }
  };
}

export function applyPublishAttemptNotAttempted({
  state,
  at,
  failureCode,
  status,
  gistId
}: ApplyPublishAttemptNotAttemptedOptions): AgentBadgeState {
  return {
    ...state,
    publish: {
      ...state.publish,
      status: status ?? state.publish.status,
      gistId: gistId ?? state.publish.gistId,
      lastAttemptedAt: at,
      lastAttemptOutcome: "not-attempted",
      lastAttemptCandidateHash: null,
      lastAttemptChangedBadge: "unknown",
      lastFailureCode: failureCode
    }
  };
}

export function applyPublishAttemptFailure({
  state,
  at,
  failureCode,
  candidateHash,
  changedBadge,
  status,
  gistId
}: ApplyPublishAttemptFailureOptions): AgentBadgeState {
  return {
    ...state,
    publish: {
      ...state.publish,
      status: status ?? "error",
      gistId: gistId ?? state.publish.gistId,
      lastAttemptedAt: at,
      lastAttemptOutcome: "failed",
      lastAttemptCandidateHash: candidateHash ?? null,
      lastAttemptChangedBadge: changedBadge ?? "unknown",
      lastFailureCode: failureCode
    }
  };
}

export function applySuccessfulPublishAttempt({
  state,
  at,
  gistId,
  hash,
  publisherId,
  mode,
  changedBadge,
  status
}: ApplySuccessfulPublishAttemptOptions): AgentBadgeState {
  return {
    ...state,
    publish: {
      ...state.publish,
      status: status ?? "published",
      gistId,
      lastPublishedHash: hash,
      lastPublishedAt: changedBadge ? at : state.publish.lastPublishedAt,
      lastAttemptedAt: at,
      lastAttemptOutcome: changedBadge ? "published" : "unchanged",
      lastSuccessfulSyncAt: at,
      lastAttemptCandidateHash: hash,
      lastAttemptChangedBadge: toPublishAttemptChangedBadge(changedBadge),
      lastFailureCode: null,
      publisherId,
      mode: mode ?? "shared"
    }
  };
}
