import { describe, expect, it } from "vitest";
import { protocolObservationFixture } from "@agent-badge/testkit";
import { parseObservation } from "../domain/usage.js";
import { priceMeters } from "./price.js";
import { catalogHash, defaultCatalog, parsePriceCatalog } from "./catalog.js";
const meter = () => { const m = parseObservation(protocolObservationFixture()).meters[0];
  return { ...m, cacheCreation: { fiveMinutes: 0, oneHour: 0, other: 0 }, semantics: { ...m.semantics, cacheCreation: "included-in-input" as const } }; };
describe("exact catalog pricing", () => {
  it("uses each exact model rate and rounds the combined rational amount once", () => {
    const a = meter(); const b = { ...meter(), model: "gpt-4.1-mini" as const };
    // 60*.75 + 40*.075 + 40*4.5 = 228 microUSD; 60*.4 + 40*.1 + 40*1.6 = 92.
    expect(priceMeters([a, b], defaultCatalog)).toMatchObject({ knownMicroUsd: "320", pricedUnits: 2, unpricedUnits: 0,
      catalogHash: catalogHash(defaultCatalog) });
  });
  it("prices Claude cache TTL creation independently of ordinary input and cache reads", () => {
    const a = { ...meter(), model: "claude-sonnet-4-6" as const, vendor: "anthropic" as const, input: 100,
      uncachedInput: 100, cachedInput: 20, total: null, cacheCreation: { fiveMinutes: 10, oneHour: 5, other: 0 },
      semantics: { ...meter().semantics, input: "excludes-cached" as const, cacheCreation: "separate" as const,
        total: "provider-defined" as const } };
    // 100*3 +20*.3 +10*3.75 +5*6 +40*15 = 973.5, half-up to 974.
    expect(priceMeters([a], defaultCatalog)).toMatchObject({ knownMicroUsd: "974", pricedUnits: 1, unpricedUnits: 0 });
  });
  it("leaves unknown models, unknown dimensions and missing tariffs unpriced", () => {
    for (const a of [{ ...meter(), model: null }, { ...meter(), cachedInput: null },
      { ...meter(), toolInput: null }, { ...meter(), toolInput: 4, semantics: { ...meter().semantics, toolInput: "separate" as const } },
      { ...meter(), cacheCreation: { fiveMinutes: 1, oneHour: 0, other: 0 } }]) {
      expect(priceMeters([a], defaultCatalog)).toMatchObject({ knownMicroUsd: "0", pricedUnits: 0, unpricedUnits: 1 });
    }
    expect(priceMeters([meter()], { ...defaultCatalog, cards: [] }).unpricedUnits).toBe(1);
  });
  it("does not lose precision beyond safe JS integer multiplication or addition", () => {
    const huge = { ...meter(), input: Number.MAX_SAFE_INTEGER, uncachedInput: Number.MAX_SAFE_INTEGER, cachedInput: 0,
      total: null, output: Number.MAX_SAFE_INTEGER, reasoningOutput: 0 };
    expect(priceMeters([huge, huge], defaultCatalog).knownMicroUsd).toBe("94575592174780406");
  });
  it("rejects arbitrary catalog metadata and vendor/model mismatches", () => {
    expect(() => parsePriceCatalog({ ...defaultCatalog, secret: "private" })).toThrow("invalid-record");
    expect(() => parsePriceCatalog({ ...defaultCatalog, cards: [{ ...defaultCatalog.cards[0], sourceUrl: "https://evil.invalid/?secret" }] })).toThrow();
  });
});
