import { ProtocolError } from "../domain/capabilities.js";
import { parseLedgerMeta } from "../domain/ledger.js";
import type { LedgerMeta } from "../domain/ledger.js";
import { canonicalJson } from "../ledger/canonical-json.js";
import type { ReducedLedger, ReducedUnit } from "../ledger/reduce.js";
import { catalogHash, contentHash, defaultCatalog, parsePriceCatalog, stableJson } from "../pricing/catalog.js";
import type { PriceCatalog } from "../pricing/catalog.js";
import { compilePricing } from "../pricing/price.js";
import { renderLegacySvg } from "./legacy-svg.js";
import { renderReport } from "./report.js";
import { compactInteger, compactMicroUsd, renderSvg } from "./svg.js";
export type LedgerSummary=Omit<ReducedLedger,'records'|'recordHashes'|'units'>;
export interface LedgerValuation {numerator:string;pricedSegments:number;unpricedSegments:number;pricedUnits:number;unknownTokenOnlyUnits:number}
/** Same exact component pricing feeds full rebuild and indexed updates. */
export function summarizeValuation(units:readonly ReducedUnit[],catalog:PriceCatalog):LedgerValuation {
  const pricing=compilePricing(catalog);let numerator=0n,pricedSegments=0,unpricedSegments=0,pricedUnits=0,unknownTokenOnlyUnits=0;
  for(const unit of units)if(unit.state==='included') {
    const meters=unit.observation!.meters,value=pricing.accumulate(meters);
    numerator+=value.numerator;pricedSegments+=value.pricedUnits;unpricedSegments+=value.unpricedUnits;
    if(value.unpricedUnits===0)pricedUnits++;
    if(meters.every(meter=>meter.total===null))unknownTokenOnlyUnits++;
  }
  return {numerator:numerator.toString(),pricedSegments,unpricedSegments,pricedUnits,unknownTokenOnlyUnits};
}
/** The caller supplies the accepted data-branch catalog. Shipped rates are a bootstrap default only. */
export function renderArtifacts(ledger: ReducedLedger, inputMeta: LedgerMeta,
  inputCatalog: PriceCatalog = defaultCatalog): Map<string, Uint8Array> {
  const artifacts=renderDerivedArtifacts(ledger,summarizeValuation(ledger.units,inputCatalog),inputMeta,inputCatalog);
  ledger.records.forEach((record,index)=>{
    const hash=ledger.recordHashes[index];artifacts.set(`${"kind" in record?"controls":"observations"}/${hash.slice(0,2)}/${hash}.json`,Buffer.from(canonicalJson(record),'utf8'));
  });
  return new Map([...artifacts].sort(([a],[b])=>a<b?-1:a>b?1:0));
}
/** Five mutable derived files. Immutable record files are retained by exact OID. */
export function renderDerivedArtifacts(ledger:LedgerSummary,valuation:LedgerValuation,inputMeta:LedgerMeta,inputCatalog:PriceCatalog):Map<string,Uint8Array> {
  const meta = parseLedgerMeta(inputMeta); const catalog = parsePriceCatalog(inputCatalog);
  if (contentHash(meta) !== ledger.metaHash || catalog.version !== meta.catalogVersion || catalogHash(catalog) !== meta.catalogHash)
    throw new ProtocolError("invalid-record");
  const price = {knownMicroUsd:((BigInt(valuation.numerator)+500000n)/1000000n).toString(),catalogHash:meta.catalogHash,
    pricedSegments:valuation.pricedSegments,unpricedSegments:valuation.unpricedSegments,
    pricedUnits:valuation.pricedUnits,unpricedUnits:ledger.includedUnits-valuation.pricedUnits};
  const summary = { schemaVersion: 2, normalizationVersion: 1, repositoryId: meta.repositoryId,
    inputSetHash: ledger.inputSetHash, catalogVersion: catalog.version, catalogSnapshotDate: catalog.snapshotDate,
    valuation: catalog.valuation, recordedUnits: ledger.recordedUnits, includedUnits: ledger.includedUnits,
    excludedUnits: ledger.excludedUnits, conflictingUnits: ledger.conflictingUnits, partialUnits: ledger.partialUnits,
    knownTokens: ledger.knownTokens, unknownTokenUnits: ledger.unknownTokenUnits,
    repositoryCompleteness: ledger.repositoryCompleteness, price };
  const partial = ledger.unknownTokenUnits > 0 || ledger.conflictingUnits > 0 || ledger.partialUnits > 0;
  const unknownTokensOnly = ledger.includedUnits > 0 && valuation.unknownTokenOnlyUnits===ledger.includedUnits;
  const unknownPriceOnly = ledger.includedUnits > 0 && price.pricedSegments === 0 && price.unpricedSegments > 0;
  const legacyValue = meta.policy.badge.metric === "tokens"
    ? unknownTokensOnly ? "usage unknown" : `${compactInteger(ledger.knownTokens)}${partial ? " known" : ""} tokens`
    : unknownPriceOnly ? "cost unknown" : `~${compactMicroUsd(price.knownMicroUsd)}${price.unpricedUnits > 0 || partial ? " known" : ""}`;
  const value = meta.policy.badge.metric === "tokens"
    ? unknownTokensOnly ? "— tokens" : `${compactInteger(ledger.knownTokens)} tokens`
    : unknownPriceOnly ? "$—" : compactMicroUsd(price.knownMicroUsd);
  const artifacts = new Map<string, Uint8Array>();
  const add = (path: string, value: string) => artifacts.set(path, Buffer.from(value, "utf8"));
  add("meta.json", stableJson(meta)); add("catalog.json", stableJson(catalog)); add("summary.json", stableJson(summary));
  add("badge.svg", meta.presentationVersion === 2 ? renderSvg(meta.policy, value, ledger.inputSetHash)
    : renderLegacySvg(meta.policy, legacyValue, ledger.inputSetHash)); add("README.md", renderReport(ledger, price, catalog));
  return new Map([...artifacts].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
