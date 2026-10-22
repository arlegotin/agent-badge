import { parseLedgerMeta, parsePublicRecord } from "../domain/ledger.js";
import type { LedgerMeta, PublicRecord } from "../domain/ledger.js";
import { contentHash } from "../pricing/catalog.js";
import type { PriceCatalog } from "../pricing/catalog.js";
import { summarizeValuation } from "../render/summary.js";
import type { LedgerSummary, LedgerValuation } from "../render/summary.js";
import { recordHash } from "./canonical-json.js";
import { reduceLedger } from "./reduce.js";
export interface ProjectionBase {
  summary: LedgerSummary;
  valuation: LedgerValuation;
  meta: LedgerMeta;
  catalog: PriceCatalog;
  recordHashes: readonly string[];
  /** Validated records indexed by unit or provider/coverage identity. */
  related(
    units: ReadonlySet<string>,
    coverages: ReadonlySet<string>
  ): readonly PublicRecord[];
}
/** Expand the complete connected unit/coverage component. Controls and revisions
 * are unit-local; the existing reducer validates their complete causal closure.
 * No alternate overlap, correction or winner-selection rules live in this index. */
export function extendProjection(
  base: ProjectionBase,
  input: readonly PublicRecord[]
) {
  const meta = parseLedgerMeta(base.meta),
    added = input.map(parsePublicRecord);
  if (contentHash(meta) !== base.summary.metaHash)
    throw Error("invalid-record");
  const units = new Set<string>(),
    coverages = new Set<string>(),
    old = new Map<string, PublicRecord>();
  const visit = (record: PublicRecord) => {
    units.add("kind" in record ? record.targetUnitKey : record.unitKey);
    if (!("kind" in record))
      coverages.add(record.provider + "/" + record.coverageKey);
  };
  added.forEach(visit);
  let size = -1;
  while (size !== units.size + coverages.size) {
    size = units.size + coverages.size;
    for (const record of base.related(units, coverages)) {
      old.set(recordHash(record), record);
      visit(record);
    }
  }
  const before = reduceLedger([...old.values()], meta),
    after = reduceLedger([...old.values(), ...added], meta);
  const hashes = [
      ...new Set([...base.recordHashes, ...after.recordHashes]),
    ].sort(),
    metaHash = contentHash(meta);
  const summary: LedgerSummary = {
    ...base.summary,
    metaHash,
    inputSetHash: contentHash({ metaHash, recordHashes: hashes }),
    knownTokens: (
      BigInt(base.summary.knownTokens) +
      BigInt(after.knownTokens) -
      BigInt(before.knownTokens)
    ).toString(),
  };
  for (const key of [
    "recordedUnits",
    "includedUnits",
    "excludedUnits",
    "conflictingUnits",
    "partialUnits",
    "unknownTokenUnits",
  ] as const)
    summary[key] += after[key] - before[key];
  const priorPrice = summarizeValuation(before.units, base.catalog),
    nextPrice = summarizeValuation(after.units, base.catalog);
  const valuation: LedgerValuation = {
    ...base.valuation,
    numerator: (
      BigInt(base.valuation.numerator) +
      BigInt(nextPrice.numerator) -
      BigInt(priorPrice.numerator)
    ).toString(),
  };
  for (const key of [
    "pricedSegments",
    "unpricedSegments",
    "pricedUnits",
    "unknownTokenOnlyUnits",
  ] as const)
    valuation[key] += nextPrice[key] - priorPrice[key];
  return { summary, valuation, recordHashes: hashes, records: added };
}
