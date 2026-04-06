import { describe, expect, it } from "vitest";

import { buildEndpointBadgePayload } from "./badge-payload.js";

describe("buildEndpointBadgePayload", () => {
  it("builds a combined badge payload with the exact Shields fields", () => {
    const payload = buildEndpointBadgePayload({
      label: "AI Usage",
      mode: "combined",
      includedTotals: {
        sessions: 3,
        tokens: 120,
        estimatedCostUsdMicros: 12_340_000
      }
    });

    expect(payload).toEqual({
      schemaVersion: 1,
      label: "AI Usage",
      message: "120 tokens | $12",
      color: "blue"
    });
    expect(Object.keys(payload)).toEqual([
      "schemaVersion",
      "label",
      "message",
      "color"
    ]);
  });

  it("formats compact token badge payloads", () => {
    expect(
      buildEndpointBadgePayload({
        label: "Token Usage",
        mode: "tokens",
        includedTotals: {
          sessions: 3,
          tokens: 17_600,
          estimatedCostUsdMicros: null
        }
      })
    ).toEqual({
      schemaVersion: 1,
      label: "Token Usage",
      message: "17.6K tokens",
      color: "blue"
    });
  });

  it("uses a neutral color when the selected total is zero", () => {
    expect(
      buildEndpointBadgePayload({
        label: "AI Usage",
        mode: "combined",
        includedTotals: {
          sessions: 0,
          tokens: 0,
          estimatedCostUsdMicros: 0
        }
      })
    ).toEqual({
      schemaVersion: 1,
      label: "AI Usage",
      message: "0 tokens | $0",
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
      message: "$12",
      color: "blue"
    });
  });

  it("formats compact estimated cost badge payloads", () => {
    expect(
      buildEndpointBadgePayload({
        label: "AI Usage",
        mode: "cost",
        includedTotals: {
          sessions: 3,
          tokens: 120,
          estimatedCostUsdMicros: 1_400_000_000
        }
      })
    ).toEqual({
      schemaVersion: 1,
      label: "AI Usage",
      message: "$1.4K",
      color: "blue"
    });
  });

  it("rounds very large compact token values to whole units", () => {
    expect(
      buildEndpointBadgePayload({
        label: "AI Usage",
        mode: "tokens",
        includedTotals: {
          sessions: 3,
          tokens: 456_300_000,
          estimatedCostUsdMicros: null
        }
      })
    ).toEqual({
      schemaVersion: 1,
      label: "AI Usage",
      message: "456M tokens",
      color: "blue"
    });
  });

  it("rounds very large compact cost values to whole units", () => {
    expect(
      buildEndpointBadgePayload({
        label: "AI Usage",
        mode: "cost",
        includedTotals: {
          sessions: 3,
          tokens: 120,
          estimatedCostUsdMicros: 456_300_000_000_000
        }
      })
    ).toEqual({
      schemaVersion: 1,
      label: "AI Usage",
      message: "$456M",
      color: "blue"
    });
  });

  it("formats compact combined badge payloads", () => {
    expect(
      buildEndpointBadgePayload({
        label: "AI Usage",
        mode: "combined",
        includedTotals: {
          sessions: 3,
          tokens: 42_300_000,
          estimatedCostUsdMicros: 57_500_000
        }
      })
    ).toEqual({
      schemaVersion: 1,
      label: "AI Usage",
      message: "42.3M tokens | $58",
      color: "blue"
    });
  });

  it("formats billion-scale badge payloads with a B suffix", () => {
    expect(
      buildEndpointBadgePayload({
        label: "AI Usage",
        mode: "tokens",
        includedTotals: {
          sessions: 3,
          tokens: 1_300_000_000,
          estimatedCostUsdMicros: null
        }
      })
    ).toEqual({
      schemaVersion: 1,
      label: "AI Usage",
      message: "1.3B tokens",
      color: "blue"
    });

    expect(
      buildEndpointBadgePayload({
        label: "AI Usage",
        mode: "cost",
        includedTotals: {
          sessions: 3,
          tokens: 120,
          estimatedCostUsdMicros: 1_300_000_000_000_000
        }
      })
    ).toEqual({
      schemaVersion: 1,
      label: "AI Usage",
      message: "$1.3B",
      color: "blue"
    });
  });
});
