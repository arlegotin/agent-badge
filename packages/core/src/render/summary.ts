import { ProtocolError } from "../domain/capabilities.js";
import { parseLedgerMeta } from "../domain/ledger.js";
import type { LedgerMeta } from "../domain/ledger.js";
import { canonicalJson } from "../ledger/canonical-json.js";
import type { ReducedLedger } from "../ledger/reduce.js";
import { catalogHash, contentHash, defaultCatalog, parsePriceCatalog, stableJson } from "../pricing/catalog.js";
import type { PriceCatalog } from "../pricing/catalog.js";
import { priceMeters } from "../pricing/price.js";
import { renderReport } from "./report.js";
import { compactInteger, compactMicroUsd, renderSvg } from "./svg.js";
/** The caller supplies the accepted data-branch catalog. Shipped rates are a bootstrap default only. */
export function renderArtifacts(ledger: ReducedLedger, inputMeta: LedgerMeta,
  inputCatalog: PriceCatalog = defaultCatalog): Map<string, Uint8Array> {
  const meta = parseLedgerMeta(inputMeta); const catalog = parsePriceCatalog(inputCatalog);
  if (contentHash(meta) !== ledger.metaHash || catalog.version !== meta.catalogVersion || catalogHash(catalog) !== meta.catalogHash)
    throw new ProtocolError("invalid-record");
  const included = ledger.units.filter((unit) => unit.state === "included").map((unit) => unit.observation!);
  const segmentPrice = priceMeters(included.flatMap((unit) => unit.meters), catalog);
  const pricedUnits = included.filter((unit) => priceMeters(unit.meters, catalog).unpricedUnits === 0).length;
  const price = { ...segmentPrice, pricedSegments: segmentPrice.pricedUnits, unpricedSegments: segmentPrice.unpricedUnits,
    pricedUnits, unpricedUnits: included.length - pricedUnits };
  const summary = { schemaVersion: 2, normalizationVersion: 1, repositoryId: meta.repositoryId,
    inputSetHash: ledger.inputSetHash, catalogVersion: catalog.version, catalogSnapshotDate: catalog.snapshotDate,
    valuation: catalog.valuation, recordedUnits: ledger.recordedUnits, includedUnits: ledger.includedUnits,
    excludedUnits: ledger.excludedUnits, conflictingUnits: ledger.conflictingUnits, partialUnits: ledger.partialUnits,
    knownTokens: ledger.knownTokens, unknownTokenUnits: ledger.unknownTokenUnits,
    repositoryCompleteness: ledger.repositoryCompleteness, price };
  const partial = ledger.unknownTokenUnits > 0 || ledger.conflictingUnits > 0 || ledger.partialUnits > 0;
  const value = meta.policy.badge.metric === "tokens"
    ? `${compactInteger(ledger.knownTokens)}${partial ? " known" : ""} tokens`
    : `~${compactMicroUsd(price.knownMicroUsd)}${price.unpricedUnits > 0 || partial ? " known" : ""}`;
  const artifacts = new Map<string, Uint8Array>();
  const add = (path: string, value: string) => artifacts.set(path, Buffer.from(value, "utf8"));
  add("meta.json", stableJson(meta)); add("catalog.json", stableJson(catalog)); add("summary.json", stableJson(summary));
  add("badge.svg", renderSvg(meta.policy, value, ledger.inputSetHash)); add("README.md", renderReport(ledger, price, catalog));
  ledger.records.forEach((record, index) => {
    const hash = ledger.recordHashes[index];
    add(`${"kind" in record ? "controls" : "observations"}/${hash.slice(0, 2)}/${hash}.json`, canonicalJson(record));
  });
  return new Map([...artifacts].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
