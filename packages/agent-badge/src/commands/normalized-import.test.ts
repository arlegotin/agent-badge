import { afterEach, expect, test } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GitFixture } from '@agent-badge/testkit';
import { protocolObservationFixture } from '@agent-badge/testkit';
import { openStore, exportContribution, contributionBytes } from '@legotin/agent-badge-core';
import { activatedFixture } from '../../test/operational-fixture.js';
import { runNormalizedImportCommand } from './normalized-import.js';
const fixtures:GitFixture[]=[];afterEach(async()=>{await Promise.all(fixtures.splice(0).map(f=>f.cleanup()));});
function expectNoPrivateMetadata(value: unknown) {
 expect(JSON.stringify(value)).not.toMatch(/private-original-id|source\.json/);
 // The numeric cost canary is forbidden as a value, not as a substring of an opaque hash.
 const inspect=(item:unknown):void=>{
  expect(item).not.toBe(999);expect(item).not.toBe('999');
  if(item!==null&&typeof item==='object')for(const [key,child] of Object.entries(item)){
   expect(key).not.toBe('providerReportedCostUsd');inspect(child);
  }
 };
 inspect(value);
}
test('normalized import requires its strict discriminator and persists attribute-only private provenance with no invented cwd',async()=>{
 const {f,cwd,plan}=await activatedFixture();fixtures.push(f);const file=join(f.root,'source.json');
 const value={kind:'agent-badge/normalized-source',schemaVersion:1,normalizationVersion:1,repositoryId:plan.declaration.repositoryId,provenance:{kind:'independent-request',producerId:'12345678-1234-4234-8234-123456789abc',sourceId:'22345678-1234-4234-8234-123456789abc',producerVersion:'synthetic',assertion:'original-independent-requests-no-native-agent-usage',identity:'preserved-across-copies-and-reexports'},requests:[{requestId:'private-original-id',meters:protocolObservationFixture().meters,providerReportedCostUsd:999}]};
 await writeFile(file,JSON.stringify(value));const result=await runNormalizedImportCommand({cwd,file});
 expect(result).toMatchObject({kind:'agent-badge/normalized-source',status:'recorded',exitCode:0,coverage:'partial'});
 expectNoPrivateMetadata(result);
 const store=await openStore(plan.repository),entries=await store.journal(),observations=entries.flatMap(e=>e.observations);
 expect(observations).toHaveLength(1);expect(observations[0].execution).toEqual({cwd:null,repositoryId:plan.declaration.repositoryId,remoteUrl:null});
 const publicRecords=await store.pending();expect(publicRecords).toHaveLength(1);expectNoPrivateMetadata(publicRecords);
 await writeFile(file,contributionBytes(exportContribution({meta:{schemaVersion:2,protocolVersion:1,repositoryId:plan.declaration.repositoryId,normalizationVersion:1,catalogVersion:1,catalogHash:'a'.repeat(64),policy:plan.declaration.policy},records:[]})));
 await expect(runNormalizedImportCommand({cwd,file})).rejects.toThrow();
});
