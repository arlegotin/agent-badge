import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { protocolObservationFixture } from "@agent-badge/testkit";
import { parseObservation } from "../domain/usage.js";
import { sanitizeObservation } from "../ledger/sanitize.js";
import { parseLedgerMeta } from "../domain/ledger.js";
import { reduceLedger } from "../ledger/reduce.js";
import { renderArtifacts } from "./summary.js";
import { catalogHash, defaultCatalog } from "../pricing/catalog.js";
import { validateLedgerTree } from "../ledger/validate-tree.js";
const repositoryId = "d9428888-122b-4aab-9bc4-111111111111";
function snapshot(label = "AI usage", metric = "tokens") {
  const meta = parseLedgerMeta({ schemaVersion: 2, protocolVersion: 1, repositoryId, normalizationVersion: 1,
    catalogVersion: 1, catalogHash: catalogHash(defaultCatalog), policy: { schemaVersion: 1, repositoryId,
      normalizationVersion: 1, discovery: "auto", disabledProviders: [], badge: { label, metric } } });
  const privateRecord = parseObservation(protocolObservationFixture());
  privateRecord.meters[0].cacheCreation = { fiveMinutes: 0, oneHour: 0, other: 0 };
  privateRecord.meters[0].semantics.cacheCreation = "included-in-input";
  const record = sanitizeObservation(privateRecord, meta.policy);
  return { meta, record, ledger: reduceLedger([record], meta) };
}
function entries(map: Map<string, Uint8Array>) { return [...map].map(([path, bytes]) => ({ path, bytes, mode: "100644", objectType: "blob" })); }
describe("one snapshot artifacts and strict tree validation", () => {
  it("binds all artifacts to the same stable input and ignores duplicate replay", () => {
    const { meta, record, ledger } = snapshot(); const artifacts = renderArtifacts(ledger, meta);
    expect(artifacts).toEqual(renderArtifacts(reduceLedger([record, record], meta), meta));
    const summary = JSON.parse(Buffer.from(artifacts.get("summary.json")!).toString());
    expect(summary).toMatchObject({ inputSetHash: ledger.inputSetHash, recordedUnits: 1, knownTokens: "140",
      repositoryCompleteness: "unknown", price: { knownMicroUsd: "228", pricedUnits: 1, unpricedUnits: 0 } });
    for (const path of ["badge.svg", "README.md"]) expect(Buffer.from(artifacts.get(path)!).toString()).toContain(ledger.inputSetHash);
    expect(Buffer.from(artifacts.get("README.md")!).toString()).toContain("2026-10-22");
    expect(validateLedgerTree(entries(artifacts)).ledger).toEqual(ledger);
  });
  it("escapes XML while preserving Unicode and contains no executable or remote content", () => {
    const { ledger, meta } = snapshot('用量 😀 <script>&"');
    const svg = Buffer.from(renderArtifacts(ledger, meta).get("badge.svg")!).toString();
    expect(svg).toContain("用量 😀 &lt;script&gt;&amp;&quot;");
    expect(svg).not.toMatch(/<script|<foreignObject|href=|url\(|onload=|<image/);
    expect(svg).toMatch(/width="\d+" height="20"/);
  });
  it("names wholly unknown cost honestly and rejects mismatched catalog pins", () => {
    const { ledger, meta, record } = snapshot("AI usage", "estimated-cost");
    const unknown = { ...record, meters: [{ ...record.meters[0], model: null }] };
    const partial = reduceLedger([unknown], meta);
    expect(Buffer.from(renderArtifacts(partial, meta).get("badge.svg")!).toString()).toContain("cost unknown");
    expect(() => renderArtifacts(ledger, { ...meta, catalogHash: "a".repeat(64) })).toThrow();
    const custom = { ...defaultCatalog, version: 2, snapshotDate: "2026-10-23" };
    const newMeta = { ...meta, catalogVersion: 2, catalogHash: catalogHash(custom) };
    const artifacts = renderArtifacts(reduceLedger(ledger.records, newMeta), newMeta, custom);
    expect(JSON.parse(Buffer.from(artifacts.get("catalog.json")!).toString()).snapshotDate).toBe("2026-10-23");
  });
  it("keeps measured zero separate from unknown-only coverage and retains mixed known subtotals", () => {
    const { meta, record } = snapshot();
    const zero = { ...record, meters: record.meters.map(meter => ({ ...meter,total:0,input:0,uncachedInput:0,cachedInput:0,output:0 })) };
    const zeroLedger=reduceLedger([zero],meta);
    expect(Buffer.from(renderArtifacts(zeroLedger,meta).get("badge.svg")!).toString()).toContain("0 tokens");
    const costMeta={...meta,policy:{...meta.policy,badge:{...meta.policy.badge,metric:"estimated-cost" as const}}};
    expect(Buffer.from(renderArtifacts(reduceLedger([zero],costMeta),costMeta).get("badge.svg")!).toString()).toContain("~$0");
    const unknown={...record,unitKey:"b".repeat(64),coverageKey:"b".repeat(64),meters:[{...record.meters[0],total:null,model:null}]};
    const mixed=reduceLedger([record,unknown],meta);
    expect(Buffer.from(renderArtifacts(mixed,meta).get("badge.svg")!).toString()).toContain("140 known tokens");
    expect(Buffer.from(renderArtifacts(reduceLedger([record,unknown],costMeta),costMeta).get("badge.svg")!).toString()).toContain("known");
  });
  it("validates a full ledger above the incoming batch object limit", () => {
    const { meta, record } = snapshot();
    const records = Array.from({ length: 10001 }, (_, index) => ({ ...record,
      unitKey: index.toString(16).padStart(64, "0"), coverageKey: index.toString(16).padStart(64, "0") }));
    const artifacts = renderArtifacts(reduceLedger(records, meta), meta);
    expect(validateLedgerTree(entries(artifacts)).ledger.recordedUnits).toBe(10001);
  }, 30000);
  it("rejects tampered paths, blobs, generated artifacts, and duplicate tree names", () => {
    const { ledger, meta } = snapshot(); const valid = entries(renderArtifacts(ledger, meta));
    for (const corrupted of [valid.map((entry) => entry.path === "badge.svg" ? { ...entry, bytes: Buffer.from("<svg/>") } : entry),
      [...valid, valid[0]], valid.map((entry) => ({ ...entry, mode: "120000" })),
      valid.map((entry) => ({ ...entry, path: "../meta.json" })), valid.filter((entry) => entry.path !== "catalog.json")]) {
      expect(() => validateLedgerTree(corrupted)).toThrow();
    }
  });
});


describe("versioned badge presentation", () => {
  const frozen = JSON.parse(readFileSync(new URL('./fixtures/v2.0.0-trees.json', import.meta.url), 'utf8')) as Record<string, Record<string,string>>;
  it.each(['tokens', 'estimated-cost'])('accepts exact frozen v2.0.0 %s trees and rejects tampering', metric => {
    const tree = Object.entries(frozen[metric]).map(([path, text]) => ({path, bytes: Buffer.from(text), mode:'100644', objectType:'blob'}));
    const accepted = validateLedgerTree(tree);
    expect(accepted.meta).not.toHaveProperty('presentationVersion');
    expect(Buffer.from(accepted.artifacts.get('badge.svg')!).toString()).toBe(frozen[metric]['badge.svg']);
    expect(frozen[metric]['badge.svg']).toContain(metric === 'tokens' ? '140 known tokens' : '~$0 known');
    for (const path of ['badge.svg', 'summary.json', 'README.md']) {
      expect(() => validateLedgerTree(tree.map(entry => entry.path === path ? {...entry,bytes:Buffer.concat([entry.bytes,Buffer.from(' ')])} : entry))).toThrow();
    }
  });
  it.each(['tokens', 'estimated-cost'])('renders plain complete, partial, zero and unavailable %s without changing accounting', metric => {
    const { meta: oldMeta, record } = snapshot('AI usage', metric);
    const meta = parseLedgerMeta({...oldMeta,presentationVersion:2});
    const zero = {...record, meters:record.meters.map(m => ({...m,total:0,input:0,uncachedInput:0,cachedInput:0,output:0}))};
    const unknown = {...record,unitKey:'b'.repeat(64),coverageKey:'b'.repeat(64),meters:[{...record.meters[0],total:null,model:null}]};
    for (const [records,want] of [ [[record], metric === 'tokens' ? '140 tokens' : '$0'], [[record,unknown],metric === 'tokens' ? '140 tokens' : '$0'], [[zero],metric === 'tokens' ? '0 tokens' : '$0'], [[unknown],metric === 'tokens' ? '— tokens' : '$—'] ] as const) {
      const ledger = reduceLedger([...records],meta), artifacts = renderArtifacts(ledger,meta);
      const svg = Buffer.from(artifacts.get('badge.svg')!).toString();
      expect(svg).toContain(`AI usage: ${want}`); expect(svg).toContain('fill="#E8A515"');
      expect(svg).not.toMatch(/known|~|usage unknown|cost unknown/);
      expect(validateLedgerTree(entries(artifacts)).ledger).toEqual(ledger);
    }
    const partialSummary = JSON.parse(Buffer.from(renderArtifacts(reduceLedger([record,unknown],meta),meta).get('summary.json')!).toString());
    expect(partialSummary).toMatchObject({knownTokens:'140',unknownTokenUnits:1,price:{unpricedUnits:1}});
  });
  it('requires presentation version 2 for color and rejects unsupported presentation versions', () => {
    const { meta } = snapshot();
    const colored = {...meta,policy:{...meta.policy,badge:{...meta.policy.badge,color:'#2563EB'}}};
    expect(() => parseLedgerMeta(colored)).toThrow();
    expect(() => parseLedgerMeta({...colored,presentationVersion:2})).not.toThrow();
    expect(() => parseLedgerMeta({...meta,presentationVersion:1})).toThrow();
    expect(() => parseLedgerMeta({...meta,presentationVersion:3})).toThrow();
  });
  it('upgrades only presentation metadata and derived files, preserving immutable record bytes and totals', () => {
    const tree = Object.entries(frozen.tokens).map(([path,text])=>({path,bytes:Buffer.from(text),mode:'100644',objectType:'blob'}));
    const old = validateLedgerTree(tree), meta = parseLedgerMeta({...old.meta,presentationVersion:2,policy:{...old.meta.policy,badge:{...old.meta.policy.badge,color:'#2563EB'}}});
    const upgraded = renderArtifacts(reduceLedger(old.records,meta),meta,old.catalog);
    expect(validateLedgerTree(entries(upgraded)).ledger.knownTokens).toBe('140');
    for (const [path,bytes] of old.artifacts) if(path.startsWith('observations/')) expect(upgraded.get(path)).toEqual(bytes);
    expect(Buffer.from(upgraded.get('badge.svg')!).toString()).toContain('fill="#2563EB"');
  });
});
