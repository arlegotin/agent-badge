import { applyAmbiguousSessionDecision } from "../attribution/override-store.js";

import type { AppliedScanOverrideAction } from "./scan-report.js";
import type { AgentBadgeState } from "../state/state-schema.js";

type ProviderName = keyof AgentBadgeState["checkpoints"];

export interface ApplyCompletedScanStateResult {
  readonly scannedProviders: readonly ProviderName[];
  readonly providerCursors?: Partial<Record<ProviderName, string | null>>;
  readonly overrideActions?: readonly AppliedScanOverrideAction[];
}

export interface ApplyCompletedScanStateOptions {
  readonly previousState: AgentBadgeState;
  readonly scanResult: ApplyCompletedScanStateResult;
  readonly now: string;
}

function applyProviderCheckpoint(
  previousState: AgentBadgeState,
  scanResult: ApplyCompletedScanStateResult,
  provider: ProviderName,
  now: string
): AgentBadgeState["checkpoints"][ProviderName] {
  const previousCheckpoint = previousState.checkpoints[provider];
  const scanned = scanResult.scannedProviders.includes(provider);
  const nextCursor = scanResult.providerCursors?.[provider];

  return {
    cursor:
      typeof nextCursor === "string" && nextCursor.length > 0
        ? nextCursor
        : previousCheckpoint.cursor,
    lastScannedAt: scanned ? now : previousCheckpoint.lastScannedAt
  };
}

export function applyCompletedScanState(
  options: ApplyCompletedScanStateOptions
): AgentBadgeState {
  let nextState: AgentBadgeState = {
    ...options.previousState,
    checkpoints: {
      codex: applyProviderCheckpoint(
        options.previousState,
        options.scanResult,
        "codex",
        options.now
      ),
      claude: applyProviderCheckpoint(
        options.previousState,
        options.scanResult,
        "claude",
        options.now
      )
    },
    overrides: {
      ...options.previousState.overrides,
      ambiguousSessions: {
        ...options.previousState.overrides.ambiguousSessions
      }
    }
  };

  for (const action of options.scanResult.overrideActions ?? []) {
    nextState = applyAmbiguousSessionDecision(
      nextState,
      action.sessionKey,
      action.decision
    );
  }

  return nextState;
}
