import {
  defaultAgentBadgeState,
  parseAgentBadgeState,
  type AgentBadgeState
} from "../state/state-schema.js";

export interface CreateDefaultAgentBadgeStateOptions {
  readonly initialized?: boolean;
  readonly scaffoldVersion?: number;
  readonly initializedAt?: string | null;
}

export function createDefaultAgentBadgeState(
  options: CreateDefaultAgentBadgeStateOptions = {}
): AgentBadgeState {
  const initialized = options.initialized ?? true;

  return parseAgentBadgeState({
    ...defaultAgentBadgeState,
    init: {
      initialized,
      scaffoldVersion:
        options.scaffoldVersion ?? defaultAgentBadgeState.init.scaffoldVersion,
      lastInitializedAt:
        options.initializedAt ??
        (initialized ? new Date().toISOString() : null)
    }
  });
}
