import { describe, expect, it } from "vitest";
import type { AccountingContract } from "../domain/capabilities.js";
import type { ControlRecord, PublicRecord } from "../domain/ledger.js";
import type { PublicObservation } from "../domain/usage.js";
import { getAccountingContract } from "../providers/registry.js";
import { recordHash } from "./canonical-json.js";
import { reduceLedger } from "./reduce.js";
import { catalogHash, defaultCatalog } from "../pricing/catalog.js";

export const repositoryId = "d9428888-122b-4aab-9bc4-111111111111";
export const meta = { schemaVersion: 2, protocolVersion: 1, repositoryId, normalizationVersion: 1,
  catalogVersion: 1, catalogHash: catalogHash(defaultCatalog), policy: { schemaVersion: 1, repositoryId,
    normalizationVersion: 1, discovery: "auto", disabledProviders: [], badge: { label: "AI usage", metric: "tokens" } } } as const;
export function observation(key = "a", total = 100): PublicObservation {
  return { schemaVersion: 2, normalizationVersion: 1, repositoryId, unitKey: key.repeat(64), coverageKey: key.repeat(64),
    provider: "codex", representation: "request", revision: "final", supersedes: [], quality: "exact", meters: [{
      vendor: "openai", model: "gpt-5.4-mini", total, input: total, uncachedInput: total, cachedInput: 0,
      cacheCreation: { fiveMinutes: 0, oneHour: 0, other: 0 }, output: 0, reasoningOutput: 0, toolInput: 0,
      semantics: { toolInput: "included-in-input", input: "includes-cached", output: "includes-reasoning", cacheCreation: "included-in-input", total: "input-plus-output" }
    }] };
}
function control(record: PublicObservation, kind: "exclude" | "include", supersedes: string[] = []): ControlRecord {
  return { schemaVersion: 2, normalizationVersion: 1, repositoryId, kind, targetUnitKey: record.unitKey, supersedes };
}
function correction(old: PublicObservation, replacement: PublicObservation, supersedes: string[] = []): ControlRecord {
  return { ...control(old, "include", supersedes), kind: "correct", replacedObservationHashes: [recordHash(old)],
    replacementObservationHashes: [recordHash(replacement)] };
}
const certified: AccountingContract = { ...getAccountingContract("codex", 1), cumulativeRevision: "provider-certified",
  requestCoverage: "origin-stream", compareRevision(a, b) {
    if (a.unitKey !== b.unitKey || a.coverageKey !== b.coverageKey || a.provider !== b.provider ||
      a.repositoryId !== b.repositoryId || a.representation !== b.representation) return "incomparable";
    const x = /^certified:([a-f0-9]{64}):(\d+)$/.exec(a.revision); const y = /^certified:([a-f0-9]{64}):(\d+)$/.exec(b.revision);
    if (!x || !y || x[1] !== y[1] || a.meters.length !== b.meters.length || a.meters.some((m, i) =>
      m.model !== b.meters[i].model || m.vendor !== b.meters[i].vendor ||
      JSON.stringify(m.semantics) !== JSON.stringify(b.meters[i].semantics))) return "incomparable";
    if (x[2] === y[2]) return JSON.stringify(a.meters) === JSON.stringify(b.meters) ? "equal" : "incomparable";
    return Number(x[2]) < Number(y[2]) ? "before" : "after";
  } };

describe("deterministic ledger", () => {
  it("commutes and replays duplicates without counting copied request history", () => {
    const a = observation(); const b = observation("b", 50); const expected = reduceLedger([a, b], meta);
    for (let seed = 1; seed <= 32; seed++) {
      const shuffled = [a, b, a, b].map((value, index) => ({ value, order: ((index + 1) * seed * 16807) % 31 }))
        .sort((x, y) => x.order - y.order).map((item) => item.value);
      expect(reduceLedger(shuffled, meta)).toEqual(expected);
    }
    expect(expected.knownTokens).toBe("150"); expect(expected.recordedUnits).toBe(2);
    expect(reduceLedger([a, observation("c", 40)], meta).knownTokens).toBe("140");
  });
  it("selects certified cumulative 150 rather than adding 100 and 150", () => {
    const first = { ...observation(), representation: "cumulative", revision: `certified:${"d".repeat(64)}:1` } as PublicObservation;
    const last = { ...first, meters: observation("a", 150).meters, revision: first.revision.replace(/:1$/, ":2") };
    expect(reduceLedger([last, first], meta, () => certified).knownTokens).toBe("150");
    expect(reduceLedger([last, first], meta).conflictingUnits).toBe(1);
    expect(reduceLedger([first, { ...last, revision: `certified:${"e".repeat(64)}:2` }], meta, () => certified).conflictingUnits).toBe(1);
  });
  it("quarantines same-unit disagreements and overlapping mixed representations", () => {
    const a = observation();
    expect(reduceLedger([a, observation("a", 150)], meta)).toMatchObject({ knownTokens: "0", conflictingUnits: 1 });
    const cumulative = { ...observation("b", 150), representation: "cumulative", coverageKey: a.coverageKey,
      revision: `unordered:${"d".repeat(64)}` } as PublicObservation;
    expect(reduceLedger([a, cumulative], meta)).toMatchObject({ knownTokens: "0", conflictingUnits: 2 });
  });
  it("quarantines distinct cumulative units claiming the same coverage stream", () => {
    const first = { ...observation(), representation: "cumulative", revision: `unordered:${"d".repeat(64)}` } as PublicObservation;
    const second = { ...first, unitKey: "b".repeat(64), meters: observation("b", 40).meters };
    expect(reduceLedger([first, second], meta)).toMatchObject({ knownTokens: "0", conflictingUnits: 2 });
    expect(reduceLedger([first, second, control(second, "exclude")], meta)).toMatchObject({ knownTokens: "100", excludedUnits: 1 });
  });
  it("excludes explicitly, permits causal re-inclusion, and gives concurrent exclusion priority", () => {
    const a = observation(); const excluded = control(a, "exclude"); const included = control(a, "include", [recordHash(excluded)]);
    expect(reduceLedger([a, excluded], meta)).toMatchObject({ knownTokens: "0", excludedUnits: 1 });
    expect(reduceLedger([included, a, excluded], meta).knownTokens).toBe("100");
    const otherExclude = { ...excluded, supersedes: [recordHash(included)] };
    const concurrentInclude = { ...included, supersedes: [recordHash(included)] };
    expect(reduceLedger([a, excluded, included, otherExclude, concurrentInclude], meta).knownTokens).toBe("0");
  });
  it("allows downward causal correction and flags incompatible concurrent corrections", () => {
    const a = observation(); const lower = observation("a", 40); const fixed = correction(a, lower);
    expect(reduceLedger([a, lower, fixed], meta).knownTokens).toBe("40");
    const lowest = observation("a", 20); const next = correction(lower, lowest, [recordHash(fixed)]);
    expect(reduceLedger([a, lower, fixed, lowest, next], meta).knownTokens).toBe("20");
    expect(reduceLedger([a, lower, fixed, lowest, correction(a, lowest)], meta).conflictingUnits).toBe(1);
  });
  it("rejects dangling or cross-unit correction and supersession closure", () => {
    const a = observation(); const b = observation("b", 40);
    for (const records of [[a, correction(a, b)], [a, b, correction(a, b)],
      [{ ...a, supersedes: ["d".repeat(64)] }], [a, control(a, "include", [recordHash(a)])]]) {
      expect(() => reduceLedger(records as PublicRecord[], meta)).toThrow("invalid-record");
    }
  });
  it("guards coverage and representation even when a supplied comparator says equal", () => {
    const a = observation(); const unsafe = { ...certified, compareRevision: () => "equal" as const };
    const other = { ...a, coverageKey: "b".repeat(64), meters: observation("a", 40).meters };
    expect(reduceLedger([a, other], meta, () => unsafe)).toMatchObject({ knownTokens: "0", conflictingUnits: 1 });
  });
  it("accepts explicit observation correction and quarantines incompatible certified meters", () => {
    const a = observation(); const lower = { ...observation("a", 40), supersedes: [recordHash(a)] };
    expect(reduceLedger([a, lower], meta).knownTokens).toBe("40");
    const first = { ...a, representation: "cumulative", revision: `certified:${"d".repeat(64)}:1` } as PublicObservation;
    const next = { ...first, revision: first.revision.replace(/:1$/, ":2"), meters: [{ ...a.meters[0], model: "gpt-4.1-mini" as const }] };
    expect(reduceLedger([first, next], meta, () => certified)).toMatchObject({ knownTokens: "0", conflictingUnits: 1 });
  });
  it("preserves unknown tokens and partial recorded coverage", () => {
    const a = observation(); a.meters[0].total = null;
    expect(reduceLedger([a], meta)).toMatchObject({ knownTokens: "0", unknownTokenUnits: 1, partialUnits: 1 });
  });
});
