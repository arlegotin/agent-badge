import type { AgentBadgeBadgeMode } from "../config/config-schema.js";

export interface IncludedTotals {
  readonly sessions: number;
  readonly tokens: number;
}

export interface BuildEndpointBadgePayloadOptions {
  readonly label: string;
  readonly mode: AgentBadgeBadgeMode;
  readonly includedTotals: IncludedTotals;
}

export interface EndpointBadgePayload {
  readonly schemaVersion: 1;
  readonly label: string;
  readonly message: string;
  readonly color: "brightgreen" | "lightgrey";
}

const COST_MODE_ERROR =
  'Badge mode "cost" is not yet supported because scan results do not include cost totals.';

function resolveBadgeValue(
  mode: AgentBadgeBadgeMode,
  includedTotals: IncludedTotals
): { readonly total: number; readonly suffix: "sessions" | "tokens" } {
  if (mode === "sessions") {
    return {
      total: includedTotals.sessions,
      suffix: "sessions"
    };
  }

  if (mode === "tokens") {
    return {
      total: includedTotals.tokens,
      suffix: "tokens"
    };
  }

  throw new Error(COST_MODE_ERROR);
}

export function buildEndpointBadgePayload({
  label,
  mode,
  includedTotals
}: BuildEndpointBadgePayloadOptions): EndpointBadgePayload {
  const { total, suffix } = resolveBadgeValue(mode, includedTotals);

  return {
    schemaVersion: 1,
    label,
    message: `${total} ${suffix}`,
    color: total > 0 ? "brightgreen" : "lightgrey"
  };
}

