import { ProtocolError } from "../domain/capabilities.js";
import { parseLedgerMeta, parsePublicRecord, validatePublicBlob } from "../domain/ledger.js";
import type { PublicRecord } from "../domain/ledger.js";
import { parsePriceCatalog } from "../pricing/catalog.js";
import { renderArtifacts } from "../render/summary.js";
import { canonicalJson, recordHash } from "./canonical-json.js";
import { reduceLedger } from "./reduce.js";
import type { ContractResolver } from "./reduce.js";
export interface PublicTreeEntry { path: string; mode: string; objectType: string; bytes: Uint8Array }
function json(bytes: Uint8Array): unknown {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new ProtocolError("invalid-record"); }
}
/** Validate untrusted full trees before any transport accepts or regenerates public state. */
export function validateLedgerTree(entries: readonly PublicTreeEntry[], resolve?: ContractResolver, signal?: AbortSignal) {
  const tree = new Map<string, Uint8Array>();
  for (const entry of entries) {
    signal?.throwIfAborted();
    validatePublicBlob(entry.path, entry.mode, entry.bytes, entry.objectType);
    if (tree.has(entry.path)) throw new ProtocolError("invalid-path");
    tree.set(entry.path, entry.bytes);
  }
  const required = (path: string) => { const bytes = tree.get(path); if (!bytes) throw new ProtocolError("invalid-path"); return bytes; };
  const meta = parseLedgerMeta(json(required("meta.json"))); const catalog = parsePriceCatalog(json(required("catalog.json")));
  const records: PublicRecord[] = [];
  for (const [path, bytes] of tree) {
    signal?.throwIfAborted();
    if (!path.startsWith("observations/") && !path.startsWith("controls/")) continue;
    const record = parsePublicRecord(json(bytes)); const hash = recordHash(record);
    const expected = `${"kind" in record ? "controls" : "observations"}/${hash.slice(0, 2)}/${hash}.json`;
    if (expected !== path || !Buffer.from(bytes).equals(Buffer.from(canonicalJson(record)))) throw new ProtocolError("invalid-record");
    records.push(record);
  }
  signal?.throwIfAborted();
  const ledger = reduceLedger(records, meta, resolve); const expected = renderArtifacts(ledger, meta, catalog);
  if (tree.size !== expected.size) throw new ProtocolError("invalid-record");
  for (const [path, bytes] of expected) if (!Buffer.from(required(path)).equals(Buffer.from(bytes))) throw new ProtocolError("invalid-record");
  signal?.throwIfAborted();
  return { meta, catalog, records: ledger.records, ledger, artifacts: expected };
}
