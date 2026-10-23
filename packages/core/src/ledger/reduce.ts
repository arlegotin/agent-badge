import { ProtocolError } from "../domain/capabilities.js";
import type { AccountingContract } from "../domain/capabilities.js";
import { parseLedgerMeta, parsePublicRecord } from "../domain/ledger.js";
import type { LedgerMeta, PublicRecord } from "../domain/ledger.js";
import type { PublicObservation } from "../domain/usage.js";
import { contentHash } from "../pricing/catalog.js";
import { getAccountingContract } from "../providers/registry.js";
import { recordHash } from "./canonical-json.js";
import { isObservation, resolveControls } from "./controls.js";
export type ContractResolver = (provider: string, normalizationVersion: number) => AccountingContract;
export interface ReducedUnit { unitKey: string; state: "included" | "excluded" | "conflict";
  observation: PublicObservation | null; partial: boolean }
export interface ReducedLedger {
  records: PublicRecord[];
  recordHashes: string[];
  metaHash: string;
  inputSetHash: string;
  units: ReducedUnit[];
  recordedUnits: number;
  includedUnits: number;
  excludedUnits: number;
  conflictingUnits: number;
  partialUnits: number;
  knownTokens: string;
  unknownTokenUnits: number;
  repositoryCompleteness: "unknown";
}
/** One canonical reduction of repository-owned immutable evidence, independent of scan time. */
export function reduceLedger(input: readonly PublicRecord[], inputMeta: LedgerMeta,
  resolve: ContractResolver = getAccountingContract): ReducedLedger {
  const meta = parseLedgerMeta(inputMeta); const indexed = new Map<string, PublicRecord>();
  for (const raw of input) {
    const record = parsePublicRecord(raw);
    if (record.repositoryId !== meta.repositoryId || record.normalizationVersion !== meta.normalizationVersion)
      throw new ProtocolError("repository-mismatch");
    indexed.set(recordHash(record), record);
  }
  const recordHashes = [...indexed.keys()].sort(); const records = recordHashes.map((hash) => indexed.get(hash)!);
  const controls = resolveControls(indexed); const groups = new Map<string, [string, PublicObservation][]>();
  const coverage = new Map<string, { representations: Set<string>; units: Set<string> }>();
  for (const hash of recordHashes) {
    const record = indexed.get(hash)!;
    if (!isObservation(record)) continue;
    if (!groups.has(record.unitKey)) groups.set(record.unitKey, []);
    if (controls.withdrawn.has(hash)) continue;
    groups.get(record.unitKey)!.push([hash, record]);
    if (controls.excluded.has(record.unitKey)) continue;
    const key = `${record.provider}/${record.coverageKey}`;
    const stream = coverage.get(key) ?? { representations: new Set<string>(), units: new Set<string>() };
    stream.representations.add(record.representation); stream.units.add(record.unitKey); coverage.set(key, stream);
  }
  const conflicts = new Set(controls.conflicting);
  for (const stream of coverage.values()) {
    if (stream.representations.size > 1 || (stream.representations.has("cumulative") && stream.units.size > 1))
      stream.units.forEach((key) => conflicts.add(key));
  }
  const units: ReducedUnit[] = []; let knownTokens = 0n; let unknownTokenUnits = 0;
  for (const key of [...groups.keys()].sort()) {
    const candidates = groups.get(key)!; let selected: PublicObservation | null = null;
    if (controls.excluded.has(key)) { units.push({ unitKey: key, state: "excluded", observation: null, partial: false }); continue; }
    // A candidate is maximal only if the contract proves it at least as late as EVERY other candidate.
    // Unknown/incomparable evidence cannot be silently discarded by another ordered pair.
    const maxima = candidates.filter(([, candidate]) => candidates.every(([, other]) => {
      if (candidate === other) return true;
      if (candidate.provider !== other.provider || candidate.coverageKey !== other.coverageKey ||
        candidate.representation !== other.representation) return false;
      const order = resolve(candidate.provider, candidate.normalizationVersion).compareRevision(candidate, other);
      return order === "equal" || order === "after";
    }));
    if (maxima.length > 0 && !conflicts.has(key)) selected = maxima[0][1];
    if (!selected) { units.push({ unitKey: key, state: "conflict", observation: null, partial: true }); continue; }
    const unknown = selected.meters.some((m) => m.total === null);
    const partial = unknown || selected.quality === "partial" || selected.meters.some((m) => m.model === null || m.vendor === null);
    for (const meter of selected.meters) if (meter.total !== null) knownTokens += BigInt(meter.total);
    if (unknown) unknownTokenUnits++;
    units.push({ unitKey: key, state: "included", observation: selected, partial });
  }
  const metaHash = contentHash(meta);
  return { records, recordHashes, metaHash, inputSetHash: contentHash({ metaHash, recordHashes }), units,
    recordedUnits: units.length, includedUnits: units.filter((u) => u.state === "included").length,
    excludedUnits: units.filter((u) => u.state === "excluded").length,
    conflictingUnits: units.filter((u) => u.state === "conflict").length,
    partialUnits: units.filter((u) => u.partial).length, knownTokens: knownTokens.toString(), unknownTokenUnits,
    repositoryCompleteness: "unknown" };
}
