import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson, recordHash } from "./canonical-json.js";

const control = { schemaVersion: 2, normalizationVersion: 1,
  repositoryId: "d9428888-122b-4aab-9bc4-111111111111", kind: "exclude" as const,
  targetUnitKey: "a".repeat(64), supersedes: [] };
const expected = '{"kind":"exclude","normalizationVersion":1,"repositoryId":"d9428888-122b-4aab-9bc4-111111111111","schemaVersion":2,"supersedes":[],"targetUnitKey":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}';

describe("canonical public JSON", () => {
  it("sorts object keys recursively with stable bytes and SHA-256 content names", () => {
    expect(canonicalJson(control)).toBe(expected);
    expect(canonicalJson(Object.fromEntries(Object.entries(control).reverse()) as typeof control)).toBe(expected);
    expect(recordHash(control)).toBe(createHash("sha256").update(expected, "utf8").digest("hex"));
  });
  it("validates before serialization rather than dropping private fields or coercing values", () => {
    for (const extra of [{ prompt: "privacy-canary" }, { schemaVersion: 3 }, { supersedes: [undefined] }]) {
      expect(() => canonicalJson({ ...control, ...extra } as never)).toThrow("invalid-record");
    }
    try { canonicalJson({ ...control, "private-path-canary": "privacy-canary" } as never); }
    catch (error) { expect(String(error)).not.toContain("canary"); }
  });
});
