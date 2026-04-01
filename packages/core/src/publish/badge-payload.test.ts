import { describe, expect, it } from "vitest";

import { buildEndpointBadgePayload } from "./badge-payload.js";

describe("buildEndpointBadgePayload", () => {
  it("builds a sessions badge payload with the exact Shields fields", () => {
    const payload = buildEndpointBadgePayload({
      label: "AI Usage",
      mode: "sessions",
      includedTotals: {
        sessions: 3,
        tokens: 120,
        estimatedCostUsdMicros: null
      }
    });

    expect(payload).toEqual({
      schemaVersion: 1,
      label: "AI Usage",
      message: "3 sessions",
      color: "brightgreen"
    });
    expect(Object.keys(payload)).toEqual([
      "schemaVersion",
      "label",
      "message",
      "color"
    ]);
  });

  it("builds a token badge payload", () => {
    expect(
      buildEndpointBadgePayload({
        label: "Token Usage",
        mode: "tokens",
        includedTotals: {
          sessions: 3,
          tokens: 120,
          estimatedCostUsdMicros: null
        }
      })
    ).toEqual({
      schemaVersion: 1,
      label: "Token Usage",
      message: "120 tokens",
      color: "brightgreen"
    });
  });

  it("uses a neutral color when the selected total is zero", () => {
    expect(
      buildEndpointBadgePayload({
        label: "AI Usage",
        mode: "sessions",
        includedTotals: {
          sessions: 0,
          tokens: 42,
          estimatedCostUsdMicros: null
        }
      })
    ).toEqual({
      schemaVersion: 1,
      label: "AI Usage",
      message: "0 sessions",
      color: "lightgrey"
    });
  });

  it("builds an estimated cost badge payload", () => {
    expect(
      buildEndpointBadgePayload({
        label: "AI Usage",
        mode: "cost",
        includedTotals: {
          sessions: 3,
          tokens: 120,
          estimatedCostUsdMicros: 12_340_000
        }
      })
    ).toEqual({
      schemaVersion: 1,
      label: "AI Usage",
      message: "$12.34 est",
      color: "brightgreen"
    });
  });
});
