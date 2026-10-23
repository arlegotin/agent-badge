import {expect,test} from 'vitest';
import {protocolObservationFixture} from '@agent-badge/testkit';
import {parseObservation} from '../domain/usage.js';
import {parseLedgerMeta} from '../domain/ledger.js';
import type {PublicRecord} from '../domain/ledger.js';
import {sanitizeObservation} from './sanitize.js';
import {reduceLedger} from './reduce.js';
import {recordHash} from './canonical-json.js';
import {catalogHash,defaultCatalog} from '../pricing/catalog.js';
import {renderArtifacts,renderDerivedArtifacts,summarizeValuation} from '../render/summary.js';
import {extendProjection} from './indexed.js';
const repositoryId='d9428888-122b-4aab-9bc4-111111111111';
const meta=parseLedgerMeta({schemaVersion:2,protocolVersion:1,repositoryId,normalizationVersion:1,catalogVersion:1,catalogHash:catalogHash(defaultCatalog),policy:{schemaVersion:1,repositoryId,normalizationVersion:1,discovery:'auto',disabledProviders:[],badge:{label:'AI usage',metric:'tokens'}}});
const base=sanitizeObservation(parseObservation(protocolObservationFixture()),meta.policy);
test('indexed affected closure matches full reduction and every derived artifact through overlap and controls',()=>{
  let records:PublicRecord[]=[base,{...base,unitKey:'b'.repeat(64),coverageKey:'b'.repeat(64)}];
  const cumulative={...base,unitKey:'c'.repeat(64),representation:'cumulative' as const,revision:'unordered:'+'d'.repeat(64)};
  const excluded={schemaVersion:2 as const,normalizationVersion:1 as const,repositoryId,kind:'exclude' as const,targetUnitKey:cumulative.unitKey,supersedes:[]};
  const replacement={...base,meters:base.meters.map(m=>({...m,model:null}))};
  const batches:PublicRecord[][]=[[{...base,unitKey:'e'.repeat(64),coverageKey:'e'.repeat(64)}],[cumulative],[excluded],[{...excluded,kind:'include',supersedes:[recordHash(excluded)]}],[replacement,{...excluded,kind:'correct',targetUnitKey:base.unitKey,replacedObservationHashes:[recordHash(base)],replacementObservationHashes:[recordHash(replacement)]}]];
  for(const added of batches){
    const before=reduceLedger(records,meta),valuation=summarizeValuation(before.units,defaultCatalog);
    const extension=extendProjection({summary:before,valuation,meta,catalog:defaultCatalog,recordHashes:before.recordHashes,
      related:(units,coverages)=>records.filter(r=>units.has('kind'in r?r.targetUnitKey:r.unitKey)||(!('kind'in r)&&coverages.has(r.provider+'/'+r.coverageKey)))},added);
    records=[...records,...added];const full=reduceLedger(records,meta);
    for(const key of ['recordedUnits','includedUnits','excludedUnits','conflictingUnits','partialUnits','knownTokens','unknownTokenUnits','inputSetHash'] as const)expect(extension.summary[key],key).toEqual(full[key]);
    expect(extension.valuation).toEqual(summarizeValuation(full.units,defaultCatalog));
    const actual=renderDerivedArtifacts(extension.summary,extension.valuation,meta,defaultCatalog),expected=renderArtifacts(full,meta,defaultCatalog);
    for(const [path,bytes]of actual)expect(bytes,path).toEqual(expected.get(path));
  }
});
test('incremental projection rejects dangling closure instead of trusting indexed membership',()=>{
  const before=reduceLedger([base],meta);
  expect(()=>extendProjection({summary:before,valuation:summarizeValuation(before.units,defaultCatalog),meta,catalog:defaultCatalog,recordHashes:before.recordHashes,related:()=>[base]},[{...base,supersedes:['f'.repeat(64)]}])).toThrow('invalid-record');
});
