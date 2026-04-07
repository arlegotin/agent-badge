import { describe, expect, it } from "vitest";

import { buildEndpointBadgePayload } from "./badge-payload.js";

describe("buildEndpointBadgePayload", () => {
  it("builds a combined badge payload with the exact Shields fields", () => {
    const payload = buildEndpointBadgePayload({
      label: "AI Usage",
      mode: "combined",
      color: "#E8A515",
      colorZero: "lightgrey",
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
      color: "#E8A515"
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
        color: "#E8A515",
        colorZero: "lightgrey",
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
      color: "#E8A515"
    });
  });

  it("uses a neutral color when the selected total is zero", () => {
    expect(
      buildEndpointBadgePayload({
        label: "AI Usage",
        mode: "combined",
        color: "orange",
        colorZero: "silver",
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
      color: "silver"
    });
  });

  it("builds an estimated cost badge payload", () => {
    expect(
      buildEndpointBadgePayload({
        label: "AI Usage",
        mode: "cost",
        color: "#E8A515",
        colorZero: "lightgrey",
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
      color: "#E8A515"
    });
  });

  it("formats compact estimated cost badge payloads", () => {
    expect(
      buildEndpointBadgePayload({
        label: "AI Usage",
        mode: "cost",
        color: "#E8A515",
        colorZero: "lightgrey",
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
      color: "#E8A515"
    });
  });

  it("rounds very large compact token values to whole units", () => {
    expect(
      buildEndpointBadgePayload({
        label: "AI Usage",
        mode: "tokens",
        color: "#E8A515",
        colorZero: "lightgrey",
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
      color: "#E8A515"
    });
  });

  it("rounds very large compact cost values to whole units", () => {
    expect(
      buildEndpointBadgePayload({
        label: "AI Usage",
        mode: "cost",
        color: "#E8A515",
        colorZero: "lightgrey",
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
      color: "#E8A515"
    });
  });

  it("formats compact combined badge payloads", () => {
    expect(
      buildEndpointBadgePayload({
        label: "AI Usage",
        mode: "combined",
        color: "#E8A515",
        colorZero: "lightgrey",
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
      color: "#E8A515"
    });
  });

  it("formats billion-scale badge payloads with a B suffix", () => {
    expect(
      buildEndpointBadgePayload({
        label: "AI Usage",
        mode: "tokens",
        color: "#E8A515",
        colorZero: "lightgrey",
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
      color: "#E8A515"
    });

    expect(
      buildEndpointBadgePayload({
        label: "AI Usage",
        mode: "cost",
        color: "#E8A515",
        colorZero: "lightgrey",
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
      color: "#E8A515"
    });
  });
});
