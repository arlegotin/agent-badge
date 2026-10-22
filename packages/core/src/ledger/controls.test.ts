import { expect, it } from "vitest";
import { resolveControls } from "./controls.js";
import type { PublicRecord } from "../domain/ledger.js";
it("validates a deep control history without exhausting the call stack", () => {
  const records = new Map<string, PublicRecord>();
  // Opaque synthetic hash keys exercise the graph independently of cryptographic content addressing.
  // The reducer and full-tree validator separately verify actual content hashes.
  for (let index = 0; index < 12000; index++) {
    const hash = index.toString(16).padStart(64, "0");
    records.set(hash, { schemaVersion: 2, normalizationVersion: 1,
      repositoryId: "d9428888-122b-4aab-9bc4-111111111111", kind: "exclude", targetUnitKey: "f".repeat(64),
      supersedes: index === 11999 ? [] : [(index + 1).toString(16).padStart(64, "0")] });
  }
  expect(resolveControls(records).excluded).toEqual(new Set(["f".repeat(64)]));
});
it("rejects cyclic control histories", () => {
  const a = "a".repeat(64); const b = "b".repeat(64);
  const record = { schemaVersion: 2, normalizationVersion: 1,
    repositoryId: "d9428888-122b-4aab-9bc4-111111111111", kind: "exclude", targetUnitKey: "f".repeat(64) } as const;
  expect(() => resolveControls(new Map([[a, { ...record, supersedes: [b] }], [b, { ...record, supersedes: [a] }]]))).toThrow("invalid-record");
});
