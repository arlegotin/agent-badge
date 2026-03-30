import { describe, expect, it } from "vitest";

import { buildEndpointBadgePayload } from "./badge-payload.js";

describe("buildEndpointBadgePayload", () => {
  it("builds a sessions badge payload with the exact Shields fields", () => {
    const payload = buildEndpointBadgePayload({
      label: "AI Usage",
      mode: "sessions",
      includedTotals: {
        sessions: 3,
        tokens: 120
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
          tokens: 120
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
          tokens: 42
        }
      })
    ).toEqual({
      schemaVersion: 1,
      label: "AI Usage",
      message: "0 sessions",
      color: "lightgrey"
    });
  });

  it("fails explicitly for the unsupported cost badge mode", () => {
    expect(() =>
      buildEndpointBadgePayload({
        label: "AI Usage",
        mode: "cost",
        includedTotals: {
          sessions: 3,
          tokens: 120
        }
      })
    ).toThrow(
      'Badge mode "cost" is not yet supported because scan results do not include cost totals.'
    );
  });
});

