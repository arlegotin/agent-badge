import type { AgentBadgeConfig } from "../config/config-schema.js";
import type { AgentBadgeState, AgentBadgePublishStatus } from "../state/state-schema.js";
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

function resolvePublishStatus(
  target: PublishTargetResult
): Extract<AgentBadgePublishStatus, "deferred" | "pending"> {
  return target.status === "deferred" ? "deferred" : "pending";
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
