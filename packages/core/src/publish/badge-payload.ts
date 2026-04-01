import type { AgentBadgeBadgeMode } from "../config/config-schema.js";
import {
  formatCompactInteger,
  formatCompactUsd
} from "./compact-format.js";

export interface IncludedTotals {
  readonly sessions: number;
  readonly tokens: number;
  readonly estimatedCostUsdMicros: number | null;
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
  readonly color: "blue" | "lightgrey";
}

const COST_MODE_ERROR =
  'Badge mode "cost" needs an estimatedCostUsdMicros total.';
const COMBINED_MODE_ERROR =
  'Badge mode "combined" needs an estimatedCostUsdMicros total.';

function formatBadgeEstimatedCost(micros: number): string {
  return formatCompactUsd(micros / 1_000_000);
}

function resolveBadgeValue(
  mode: AgentBadgeBadgeMode,
  includedTotals: IncludedTotals
): { readonly total: number; readonly message: string } {
  if (mode === "combined") {
    if (includedTotals.estimatedCostUsdMicros === null) {
      throw new Error(COMBINED_MODE_ERROR);
    }

    return {
      total: includedTotals.tokens,
      message: `${formatCompactInteger(includedTotals.tokens)} tokens | ${formatBadgeEstimatedCost(
        includedTotals.estimatedCostUsdMicros
      )}`
    };
  }

  if (mode === "tokens") {
    return {
      total: includedTotals.tokens,
      message: `${formatCompactInteger(includedTotals.tokens)} tokens`
    };
  }

  if (includedTotals.estimatedCostUsdMicros === null) {
    throw new Error(COST_MODE_ERROR);
  }

  return {
    total: includedTotals.estimatedCostUsdMicros,
    message: formatBadgeEstimatedCost(includedTotals.estimatedCostUsdMicros)
  };
}

export function buildEndpointBadgePayload({
  label,
  mode,
  includedTotals
}: BuildEndpointBadgePayloadOptions): EndpointBadgePayload {
  const { total, message } = resolveBadgeValue(mode, includedTotals);

  return {
    schemaVersion: 1,
    label,
    message,
    color: total > 0 ? "blue" : "lightgrey"
  };
}
