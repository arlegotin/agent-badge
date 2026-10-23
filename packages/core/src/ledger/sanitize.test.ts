import { describe, expect, it } from "vitest";
import { protocolObservationFixture, protocolPrivacyCanaries } from "@agent-badge/testkit";
import { parseObservation } from "../domain/usage.js";
import { parseSharedPolicy } from "../domain/policy.js";
import { canonicalJson, recordHash } from "./canonical-json.js";
import { sanitizeObservation } from "./sanitize.js";

const policy = parseSharedPolicy({ schemaVersion: 1, repositoryId: "d9428888-122b-4aab-9bc4-111111111111",
  normalizationVersion: 1, discovery: "auto", disabledProviders: [], badge: { label: "AI usage", metric: "tokens" } });

describe("public observation projection", () => {
  it("removes every private canary from JSON, hash preimages, filenames and errors", () => {
    const observation = parseObservation(protocolObservationFixture());
    const output = sanitizeObservation(observation, policy);
    const json = canonicalJson(output);
    const filename = `observations/${recordHash(output).slice(0, 2)}/${recordHash(output)}.json`;
    for (const canary of Object.values(protocolPrivacyCanaries)) {
      expect(json).not.toContain(canary); expect(filename).not.toContain(canary);
      try { sanitizeObservation({ ...observation, provider: canary } as never, policy); }
      catch (error) { expect(String(error)).not.toContain(canary); }
    }
    expect(Object.keys(output).sort()).toEqual(["coverageKey", "meters", "normalizationVersion", "provider", "quality",
      "repositoryId", "representation", "revision", "schemaVersion", "supersedes", "unitKey"]);
  });
  it("dedupes native requests copied between machines and forked conversation streams", () => {
    const fixture = protocolObservationFixture();
    const original = sanitizeObservation(parseObservation(fixture), policy);
    const copy = sanitizeObservation(parseObservation({ ...fixture, nativeCoverageId: "fork-conversation",
      source: { ...fixture.source, instanceKey: "another-machine", sourceIdentity: "/copied/path" },
      lineage: { kind: "fork", parentNativeId: "original-conversation", inherited: "isolated" } }), policy);
    expect(copy.unitKey).toBe(original.unitKey);
    expect(copy.coverageKey).toBe(original.coverageKey);
    expect(canonicalJson(copy)).toBe(canonicalJson(original));
    const otherRepository = sanitizeObservation(parseObservation(fixture), { ...policy,
      repositoryId: "d9428888-122b-4aab-9bc4-222222222222" });
    expect(otherRepository.unitKey).not.toBe(original.unitKey);
    expect(otherRepository.coverageKey).not.toBe(original.coverageKey);
  });
  it("rejects uncertain inherited cumulative usage and mismatched repository evidence", () => {
    const fixture = protocolObservationFixture();
    expect(() => sanitizeObservation(parseObservation({ ...fixture, representation: "cumulative",
      coverage: "origin-stream",
      revision: { kind: "unordered", evidence: "1" },
      lineage: { kind: "fork", parentNativeId: "parent", inherited: "uncertain" } }), policy)).toThrow("uncertain-lineage");
    expect(() => sanitizeObservation(parseObservation({ ...fixture, execution: { ...fixture.execution,
      repositoryId: "d9428888-122b-4aab-9bc4-222222222222" } }), policy)).toThrow("repository-mismatch");
  });
  it("shares certified origin coverage across request and cumulative representations", () => {
    const fixture = { ...protocolObservationFixture(), coverage: "origin-stream", nativeCoverageId: "original-stream" };
    const request = sanitizeObservation(parseObservation(fixture), policy);
    const cumulative = sanitizeObservation(parseObservation({ ...fixture, representation: "cumulative",
      revision: { kind: "unordered", evidence: "untrusted-offset" } }), policy);
    expect(cumulative.coverageKey).toBe(request.coverageKey);
    expect(cumulative.unitKey).not.toBe(request.unitKey);
    expect(cumulative.quality).toBe("partial");
    expect(() => parseObservation({ ...fixture, representation: "cumulative", coverage: "native-request",
      revision: { kind: "unordered", evidence: "offset" } })).toThrow();
    expect(() => sanitizeObservation(parseObservation({ ...fixture, identity: "local-fallback" }), policy)).toThrow("unsupported-identity");
  });
  it("marks unknown models and dimensions partial without inventing price or zero", () => {
    const fixture = protocolObservationFixture();
    const result = sanitizeObservation(parseObservation({ ...fixture,
      meters: [{ ...fixture.meters[0], model: null, vendor: null, total: null }] }), policy);
    expect(result.quality).toBe("partial");
    expect(result.meters[0]).toMatchObject({ model: null, vendor: null, total: null });
    expect(canonicalJson(result)).not.toContain("cost");
  });
});
