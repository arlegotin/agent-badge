import { createHash } from "node:crypto";
import { ProtocolError } from "../domain/capabilities.js";
import { parsePublicRecord, PUBLIC_OBJECT_MAX_BYTES } from "../domain/ledger.js";
import type { PublicRecord } from "../domain/ledger.js";

function serialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(serialize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${serialize(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
/** Sorted UTF-16 keys, preserved array order, UTF-8, no trailing newline. */
export function canonicalJson(input: PublicRecord): string {
  const json = serialize(parsePublicRecord(input));
  if (Buffer.byteLength(json, "utf8") > PUBLIC_OBJECT_MAX_BYTES) throw new ProtocolError("object-too-large");
  return json;
}
export function recordHash(input: PublicRecord): string {
  return createHash("sha256").update(canonicalJson(input), "utf8").digest("hex");
}
