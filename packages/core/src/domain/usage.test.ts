import { describe, expect, it } from "vitest";
import { protocolObservationFixture } from "@agent-badge/testkit";
import { parseObservation, meterSegmentSchema } from "./usage.js";
import { checkpointSchema } from "./capabilities.js";
import { parseSharedPolicy } from "./policy.js";
import { parsePublicRecord, parseLedgerMeta, validatePublicBlob as validateBlob, validateEnvelope } from "./ledger.js";
import { createAccountingRegistry, getAccountingContract } from "../providers/registry.js";
import type { AccountingContract } from "./capabilities.js";
import { sanitizeObservation } from "../ledger/sanitize.js";

const repositoryId = "d9428888-122b-4aab-9bc4-111111111111";
const validatePublicBlob = (path: string, mode: string, bytes: Uint8Array) => validateBlob(path, mode, bytes, "blob");
export const policy = { schemaVersion: 1, repositoryId, normalizationVersion: 1,
  discovery: "auto", disabledProviders: [], badge: { label: "AI usage", metric: "tokens" } } as const;

describe("strict accounting protocol", () => {
  it("preserves measured zero and unknown independently", () => {
    const parsed = parseObservation(protocolObservationFixture());
    expect(parsed.meters[0]).toMatchObject({ total: 140, input: 100, cachedInput: 40,
      uncachedInput: 60, output: 40, reasoningOutput: 0, cacheCreation: { fiveMinutes: null, oneHour: null, other: null } });
    expect(meterSegmentSchema.safeParse({ ...parsed.meters[0], output: undefined }).success).toBe(false);
  });
  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN])("rejects unsafe counters %s", (total) => {
    const observation = protocolObservationFixture();
    expect(() => parseObservation({ ...observation, meters: [{ ...observation.meters[0], total }] })).toThrow();
  });
  it("enforces registered model/vendor pairs and subset semantics", () => {
    const meter = parseObservation(protocolObservationFixture()).meters[0];
    for (const invalid of [{ model: "gpt-5.4-mini-suffix" }, { vendor: "anthropic" },
      { cachedInput: 101 }, { reasoningOutput: 41 }, { uncachedInput: 61 },
      { semantics: { ...meter.semantics, input: "add-cache-twice" } }]) {
      expect(meterSegmentSchema.safeParse({ ...meter, ...invalid }).success).toBe(false);
    }
    expect(meterSegmentSchema.safeParse({ ...meter, model: null, vendor: null }).success).toBe(true);
    expect(meterSegmentSchema.safeParse({ ...meter, input: Number.MAX_SAFE_INTEGER,
      cachedInput: null, uncachedInput: null, total: null }).success).toBe(true);
  });
  it("rejects future versions and unknown fields at nested boundaries with redacted errors", () => {
    const fixture = protocolObservationFixture();
    for (const input of [{ ...fixture, schemaVersion: 3 }, { ...fixture, normalizationVersion: 2 },
      { ...fixture, "secret@example.invalid": "secret-canary" },
      { ...fixture, meters: [{ ...fixture.meters[0], prompt: "secret-canary" }] }]) {
      expect(() => parseObservation(input)).toThrow("invalid-record");
      try { parseObservation(input); } catch (error) {
        expect(String(error)).not.toMatch(/secret-canary|secret@example/);
      }
    }
  });
  it("bounds labels by Unicode code points and rejects unsafe XML text", () => {
    expect(parseSharedPolicy({ ...policy, badge: { ...policy.badge, label: "😀".repeat(64) } }).badge.label).toHaveLength(128);
    for (const label of ["😀".repeat(65), "bad\u0000label", "bad\ud800label"]) {
      expect(() => parseSharedPolicy({ ...policy, badge: { ...policy.badge, label } })).toThrow();
    }
  });
  it("requires all checkpoint identity and invalidation dimensions", () => {
    const checkpoint = { schemaVersion: 1, provider: "codex", instanceKey: "private-instance",
      sourceIdentity: "private-source", sourceGeneration: "generation-1", sourceSchema: "rollout-v1",
      readerVersion: "1", normalizationVersion: 1, repositoryId, attributionPolicyHash: "a".repeat(64),
      cursor: { offset: 123, prefixHash: "b".repeat(64), size: 200, incompleteTail: "" } };
    expect(checkpointSchema.safeParse(checkpoint).success).toBe(true);
    for (const key of Object.keys(checkpoint)) {
      const missing = { ...checkpoint } as Record<string, unknown>; delete missing[key];
      expect(checkpointSchema.safeParse(missing).success).toBe(false);
    }
    expect(checkpointSchema.safeParse({ ...checkpoint, cursor: { ...checkpoint.cursor, offset: 201 } }).success).toBe(false);
  });
  it("validates metadata and opaque controls without free-form notes", () => {
    const record = sanitizeObservation(parseObservation(protocolObservationFixture()), parseSharedPolicy(policy));
    const control = { schemaVersion: 2, normalizationVersion: 1, repositoryId, kind: "exclude",
      targetUnitKey: record.unitKey, supersedes: [] };
    expect(parsePublicRecord(control)).toEqual(control);
    expect(() => parsePublicRecord({ ...control, note: "secret-canary" })).toThrow("invalid-record");
    const meta = { schemaVersion: 2, protocolVersion: 1, repositoryId, normalizationVersion: 1,
      catalogVersion: 1, catalogHash: "c".repeat(64), policy };
    expect(parseLedgerMeta(meta)).toEqual(meta);
    expect(() => parseLedgerMeta({ ...meta, repositoryId: "d9428888-122b-4aab-9bc4-222222222222" })).toThrow();
    expect(() => parseLedgerMeta({ ...meta, protocolVersion: 2 })).toThrow();
  });
  it("quarantines oversized objects and envelopes without truncating accounting", () => {
    const object = Buffer.alloc(256 * 1024);
    expect(() => validatePublicBlob("meta.json", "100644", object)).not.toThrow();
    expect(() => validatePublicBlob("meta.json", "100644", Buffer.alloc(object.length + 1))).toThrow("object-too-large");
    expect(() => validateBlob("meta.json", "100644", Buffer.alloc(1), "tree")).toThrow("invalid-object-type");
    expect(() => validateEnvelope(10 * 1024 * 1024, 10_000)).not.toThrow();
    expect(() => validateEnvelope(10 * 1024 * 1024 + 1, 1)).toThrow("envelope-too-large");
    expect(() => validateEnvelope(1, 10_001)).toThrow("too-many-objects");
    for (const [path, mode] of [["../meta.json", "100644"], ["meta.json", "120000"],
      ["meta.json", "160000"], ["observations/aa/" + "b".repeat(64) + ".json", "100644"],
      ["observations/aa/" + "a".repeat(64) + ".json", "100755"], ["private.json", "100644"]]) {
      expect(() => validatePublicBlob(path, mode, Buffer.alloc(1))).toThrow();
    }
    expect(() => validatePublicBlob("observations/aa/" + "a".repeat(64) + ".json", "100644", Buffer.alloc(1))).not.toThrow();
    const record = sanitizeObservation(parseObservation(protocolObservationFixture()), parseSharedPolicy(policy));
    expect(() => parsePublicRecord({ ...record, meters: Array.from({ length: 1024 }, () => record.meters[0]) })).toThrow("object-too-large");
  });
});

describe("provider accounting contracts", () => {
  it("compares finalized native requests using public evidence without ordering conflicts", () => {
    const observation = sanitizeObservation(parseObservation(protocolObservationFixture()), parseSharedPolicy(policy));
    const contract = getAccountingContract("codex", 1);
    expect(contract.compareRevision(observation, observation)).toBe("equal");
    expect(contract.compareRevision(observation, { ...observation,
      meters: [{ ...observation.meters[0], total: 141, input: 101, uncachedInput: 61 }] })).toBe("incomparable");
    expect(contract.compareRevision(observation, { ...observation, unitKey: "d".repeat(64) })).toBe("incomparable");
  });
  it("does not certify cumulative ordering from file timestamps or offsets", () => {
    const fixture = protocolObservationFixture();
    const observation = sanitizeObservation(parseObservation({ ...fixture, representation: "cumulative",
      coverage: "origin-stream", revision: { kind: "unordered", evidence: "offset:123-mtime:456" } }), parseSharedPolicy(policy));
    const contract = getAccountingContract("codex", 1);
    expect(contract.compareRevision(observation, observation)).toBe("incomparable");
    expect(() => getAccountingContract("private-provider-canary", 1)).toThrow("unsupported-contract");
    expect(() => getAccountingContract("codex", 2)).toThrow("unsupported-contract");
  });
  it("allows an immutable fixture contract without granting default certification", () => {
    const fixture = protocolObservationFixture();
    const before = sanitizeObservation(parseObservation({ ...fixture, representation: "cumulative", coverage: "origin-stream",
      revision: { kind: "certified", evidence: "synthetic-epoch", sequence: 1 } }), parseSharedPolicy(policy));
    const after = { ...before, revision: before.revision.replace(/:1$/, ":2") };
    const baseline = getAccountingContract("codex", 1);
    const contract: AccountingContract = { ...baseline, cumulativeRevision: "provider-certified", requestCoverage: "origin-stream",
      compareRevision(a, b) {
        const left = /^certified:([a-f0-9]{64}):(\d+)$/.exec(a.revision);
        const right = /^certified:([a-f0-9]{64}):(\d+)$/.exec(b.revision);
        if (!left || !right || left[1] !== right[1]) return "incomparable";
        return Number(left[2]) < Number(right[2]) ? "before" : Number(left[2]) > Number(right[2]) ? "after" : "equal";
      } };
    const registry = createAccountingRegistry([contract]);
    expect(baseline.compareRevision(before, after)).toBe("incomparable");
    expect(registry.getAccountingContract("codex", 1).compareRevision(before, after)).toBe("before");
    expect(registry.getAccountingContract("codex", 1).compareRevision(after, before)).toBe("after");
    expect(registry.getAccountingContract("claude", 1).cumulativeRevision).toBe("uncertified");
    expect(() => createAccountingRegistry([contract, contract])).toThrow("unsupported-contract");
    expect(() => parseObservation({ ...fixture, representation: "cumulative", coverage: "origin-stream",
      revision: { kind: "certified", evidence: "epoch", sequence: Number.MAX_SAFE_INTEGER + 1 } })).toThrow();
  });
});
