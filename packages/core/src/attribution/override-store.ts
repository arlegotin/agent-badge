import type { NormalizedSessionSummary } from "../providers/session-summary.js";
import type {
  AgentBadgeAmbiguousSessionOverride,
  AgentBadgeState
} from "../state/state-schema.js";

export function buildAmbiguousSessionKey(
  session: Pick<NormalizedSessionSummary, "provider" | "providerSessionId">
): string {
  return `${session.provider}:${session.providerSessionId}`;
}

export function readAmbiguousSessionOverride(
  state: Pick<AgentBadgeState, "overrides">,
  session: Pick<NormalizedSessionSummary, "provider" | "providerSessionId">
): AgentBadgeAmbiguousSessionOverride | null {
  return (
    state.overrides.ambiguousSessions[buildAmbiguousSessionKey(session)] ?? null
  );
}

export function applyAmbiguousSessionDecision(
  state: AgentBadgeState,
  sessionKey: string,
  decision: AgentBadgeAmbiguousSessionOverride
): AgentBadgeState {
  return {
    ...state,
    overrides: {
      ...state.overrides,
      ambiguousSessions: {
        ...state.overrides.ambiguousSessions,
        [sessionKey]: decision
      }
    }
  };
}
