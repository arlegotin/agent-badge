import { realpath as fixtureRealpath } from 'node:fs/promises';
import { tmpdir as fixtureTmpdir } from 'node:os';
import { join as fixtureJoin } from 'node:path';
import {expect,test} from 'vitest';
import {mkdtemp,mkdir,rm,writeFile,readFile,copyFile,stat,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {protocolObservationFixture} from '@agent-badge/testkit';
import {runStorageFixtureProcess} from '@agent-badge/testkit';
import {pathToFileURL} from 'node:url';
import {parseObservation} from '../domain/usage.js';
import {parseLedgerMeta} from '../domain/ledger.js';
import {sanitizeObservation} from '../ledger/sanitize.js';
import {reduceLedger} from '../ledger/reduce.js';
import {renderArtifacts} from '../render/summary.js';
import {catalogHash,defaultCatalog} from '../pricing/catalog.js';
import {recordHash} from '../ledger/canonical-json.js';
import {AcceptedIndex} from './accepted-index.js';
const repositoryId='d9428888-122b-4aab-9bc4-111111111111';
const meta=parseLedgerMeta({schemaVersion:2,protocolVersion:1,repositoryId,normalizationVersion:1,catalogVersion:1,catalogHash:catalogHash(defaultCatalog),policy:{schemaVersion:1,repositoryId,normalizationVersion:1,discovery:'auto',disabledProviders:[],badge:{label:'AI usage',metric:'tokens'}}});
test('accepted index binds exact validated commit, persists only installed extensions and detects corruption',async()=>{
  const root=await fixtureRealpath(await mkdtemp(fixtureJoin(fixtureTmpdir(), 'agent-badge-accepted-index-')));await mkdir(join(root,'cache'),{mode:0o700});
  try{
    const record=sanitizeObservation(parseObservation(protocolObservationFixture()),meta.policy),ledger=reduceLedger([record],meta),artifacts=renderArtifacts(ledger,meta,defaultCatalog),commit='a'.repeat(40);
    let index=await AcceptedIndex.create(root,{commit,meta,catalog:defaultCatalog,records:ledger.records,ledger,artifacts});
    const added={...record,unitKey:'b'.repeat(64),coverageKey:'b'.repeat(64)},extension=index.extend([added]);
    expect(index.hasHashes([recordHash(added)])).toBe(false);
    await index.close();expect(await AcceptedIndex.load(root,'b'.repeat(40))).toBeNull();
    index=(await AcceptedIndex.load(root,commit))!;expect(index.hasHashes([recordHash(record)])).toBe(true);
    await index.install('b'.repeat(40),extension);await index.close();
    index=(await AcceptedIndex.load(root,'b'.repeat(40)))!;
    expect(index.snapshot().artifacts).toEqual(renderArtifacts(reduceLedger([record,added],meta),meta,defaultCatalog));
    const activePath=index.databasePath;await index.close();await writeFile(activePath,'ordinary corrupt bytes');
    expect(await AcceptedIndex.load(root,'b'.repeat(40))).toBeNull();
  }finally{await rm(root,{recursive:true,force:true});}
});
test('an unpublished extension leaves the last complete generation readable',async()=>{
  const root=await fixtureRealpath(await mkdtemp(fixtureJoin(fixtureTmpdir(), 'agent-badge-accepted-generation-')));await mkdir(join(root,'cache'),{mode:0o700});
  try {
    const record=sanitizeObservation(parseObservation(protocolObservationFixture()),meta.policy),ledger=reduceLedger([record],meta);
    let index=await AcceptedIndex.create(root,{commit:'a'.repeat(40),meta,catalog:defaultCatalog,records:ledger.records,ledger,artifacts:renderArtifacts(ledger,meta,defaultCatalog)});await index.close();
    index=(await AcceptedIndex.load(root,'a'.repeat(40)))!;
    const added={...record,unitKey:'d'.repeat(64),coverageKey:'d'.repeat(64)};
    await index.install('b'.repeat(40),index.extend([added]));
    const prior=await AcceptedIndex.load(root,'a'.repeat(40));
    expect(prior,'old generation must survive before manifest publication').not.toBeNull();
    expect(prior!.hasHashes([recordHash(added)])).toBe(false);await prior!.close();
    expect(await AcceptedIndex.load(root,'b'.repeat(40))).toBeNull();
    await index.close();
    const published=(await AcceptedIndex.load(root,'b'.repeat(40)))!;
    expect(published.snapshot().artifacts).toEqual(renderArtifacts(reduceLedger([record,added],meta),meta,defaultCatalog));await published.close();
  }finally {await rm(root,{recursive:true,force:true});}
});
test.each(['copy','transaction','committed','before-manifest','after-manifest'])('actual death at accepted generation %s leaves a complete usable generation',async phase=>{
  const root=await fixtureRealpath(await mkdtemp(fixtureJoin(fixtureTmpdir(), 'agent-badge-accepted-death-')));await mkdir(join(root,'cache'),{mode:0o700});
  try {
    const record=sanitizeObservation(parseObservation(protocolObservationFixture()),meta.policy),ledger=reduceLedger([record],meta),added={...record,unitKey:'e'.repeat(64),coverageKey:'e'.repeat(64)};
    const seed=await AcceptedIndex.create(root,{commit:'a'.repeat(40),meta,catalog:defaultCatalog,records:ledger.records,ledger,artifacts:renderArtifacts(ledger,meta,defaultCatalog)});await seed.close();
    const child=await runStorageFixtureProcess(process.cwd(),`
      const fs=(await import('node:fs/promises')).default;
      const {DatabaseSync}=await import('node:sqlite');
      const {AcceptedIndex}=await import(${JSON.stringify(pathToFileURL(join(process.cwd(),'packages/core/src/storage/accepted-index.ts')).href)});
      const phase=${JSON.stringify(phase)},kill=()=>process.kill(process.pid,'SIGKILL');
      const copy=fs.copyFile;fs.copyFile=async(...args)=>{await copy(...args);if(phase==='copy')kill();};
      const exec=DatabaseSync.prototype.exec;DatabaseSync.prototype.exec=function(sql){if(sql==='COMMIT'&&phase==='transaction')kill();const result=exec.call(this,sql);if(sql==='COMMIT'&&phase==='committed')kill();return result;};
      const rename=fs.rename;fs.rename=async(...args)=>{if(String(args[1]).endsWith('/accepted.json')&&phase==='before-manifest')kill();await rename(...args);if(String(args[1]).endsWith('/accepted.json')&&phase==='after-manifest')kill();};
      const index=await AcceptedIndex.load(${JSON.stringify(root)},'a'.repeat(40));
      await index.install('b'.repeat(40),index.extend([${JSON.stringify(added)}]));await index.close();
    `);
    expect(child.signal).toBe('SIGKILL');expect(child.stderr).toBe('');
    const old=await AcceptedIndex.load(root,'a'.repeat(40)),next=await AcceptedIndex.load(root,'b'.repeat(40));
    if(phase==='after-manifest'){expect(old).toBeNull();expect(next).not.toBeNull();}
    else {
      expect(old,'interrupted inactive slot must preserve active generation').not.toBeNull();expect(next).toBeNull();
      expect(old!.hasHashes([recordHash(added)])).toBe(false);
      await old!.install('b'.repeat(40),old!.extend([added]));await old!.close();
    }
    await next?.close();const final=(await AcceptedIndex.load(root,'b'.repeat(40)))!;
    expect(final.snapshot().artifacts).toEqual(renderArtifacts(reduceLedger([record,added],meta),meta,defaultCatalog));await final.close();
  }finally {await rm(root,{recursive:true,force:true});}
});
test.each([false,true])('interrupted stage publication keeps completed stage retryable (prior generation %s)',async prior=>{
  const root=await fixtureRealpath(await mkdtemp(fixtureJoin(fixtureTmpdir(), 'agent-badge-accepted-promotion-')));await mkdir(join(root,'cache'),{mode:0o700});
  try {
    const record=sanitizeObservation(parseObservation(protocolObservationFixture()),meta.policy),ledger=reduceLedger([record],meta),artifacts=renderArtifacts(ledger,meta,defaultCatalog);
    const seed=await AcceptedIndex.create(root,{commit:'a'.repeat(40),meta,catalog:defaultCatalog,records:ledger.records,ledger,artifacts});const state={...seed.validatedState,commit:'b'.repeat(40)};await seed.close();
    const stage=join(root,'cache/accepted-stage.sqlite');await copyFile(join(root,'cache/accepted.sqlite'),stage);
    if(!prior){await rm(join(root,'cache/accepted.sqlite'));await rm(join(root,'cache/accepted.json'));}
    const child=await runStorageFixtureProcess(process.cwd(),`
      const fs=(await import('node:fs/promises')).default;
      const {AcceptedIndex}=await import(${JSON.stringify(pathToFileURL(join(process.cwd(),'packages/core/src/storage/accepted-index.ts')).href)});
      const rename=fs.rename;fs.rename=async(...args)=>{if(String(args[1]).endsWith('/accepted.json'))process.kill(process.pid,'SIGKILL');return rename(...args);};
      await AcceptedIndex.promote(${JSON.stringify(root)},${JSON.stringify(stage)},${JSON.stringify(state)});
    `);
    expect(child.signal).toBe('SIGKILL');expect(child.stderr).toBe('');
    expect((await stat(stage)).isFile()).toBe(true);
    const old=await AcceptedIndex.load(root,'a'.repeat(40));expect(!!old).toBe(prior);await old?.close();
    expect(await AcceptedIndex.load(root,'b'.repeat(40))).toBeNull();
    const promoted=await AcceptedIndex.promote(root,stage,state);expect(promoted.snapshot().artifacts).toEqual(artifacts);await promoted.close();
  }finally {await rm(root,{recursive:true,force:true});}
});
test('manifest publication cannot reuse the prior anchor or live candidate base slot before confirmation',async()=>{
  const root=await fixtureRealpath(await mkdtemp(fixtureJoin(fixtureTmpdir(), 'agent-badge-accepted-pins-')));await mkdir(join(root,'cache'),{mode:0o700});
  try {
    const record=sanitizeObservation(parseObservation(protocolObservationFixture()),meta.policy),ledger=reduceLedger([record],meta),added={...record,unitKey:'f'.repeat(64),coverageKey:'f'.repeat(64)};
    const seed=await AcceptedIndex.create(root,{commit:'a'.repeat(40),meta,catalog:defaultCatalog,records:ledger.records,ledger,artifacts:renderArtifacts(ledger,meta,defaultCatalog)});await seed.close();
    const transport={schemaVersion:1,repositoryId,canonicalPushUrl:'https://github.com/synthetic/generations',dataRef:'refs/heads/agent-badge/data',commit:'a'.repeat(40)};
    await writeFile(join(root,'transport.json'),JSON.stringify(transport),{mode:0o600});
    const base=(await AcceptedIndex.load(root,'a'.repeat(40)))!;await base.install('b'.repeat(40),base.extend([added]));await base.close();
    const oldBytes=await readFile(join(root,'cache/accepted.sqlite'));
    const next=(await AcceptedIndex.load(root,'b'.repeat(40)))!,extension=next.extend([]);
    await expect(next.install('c'.repeat(40),extension)).rejects.toMatchObject({code:'store-busy'});
    expect(await readFile(join(root,'cache/accepted.sqlite'))).toEqual(oldBytes);
    await writeFile(join(root,'transport.json'),JSON.stringify({...transport,commit:'b'.repeat(40)}));
    const owner=join(root,'cache/accepted-stage-owner.json');await writeFile(owner,JSON.stringify({candidateBase:'a'.repeat(40)}),{mode:0o600});
    await expect(next.install('c'.repeat(40),extension)).rejects.toMatchObject({code:'store-busy'});
    await rm(owner);await next.install('c'.repeat(40),extension);await next.close();
    const published=(await AcceptedIndex.load(root,'c'.repeat(40)))!;expect(published.recordCount).toBe(2);await published.close();
  }finally {await rm(root,{recursive:true,force:true});}
});
test('manifest slot corruption and inactive symlinks cannot select external paths or mutate the active generation',async()=>{
  const root=await fixtureRealpath(await mkdtemp(fixtureJoin(fixtureTmpdir(), 'agent-badge-accepted-slots-')));await mkdir(join(root,'cache'),{mode:0o700});
  try {
    const record=sanitizeObservation(parseObservation(protocolObservationFixture()),meta.policy),ledger=reduceLedger([record],meta);
    const seed=await AcceptedIndex.create(root,{commit:'a'.repeat(40),meta,catalog:defaultCatalog,records:ledger.records,ledger,artifacts:renderArtifacts(ledger,meta,defaultCatalog)});await seed.close();
    const manifestPath=join(root,'cache/accepted.json'),manifest=await readFile(manifestPath,'utf8');
    await writeFile(manifestPath,JSON.stringify({...JSON.parse(manifest),slot:'../outside.sqlite'}));expect(await AcceptedIndex.loadCurrent(root)).toBeNull();await writeFile(manifestPath,manifest);
    const outside=join(root,'outside');await writeFile(outside,'preserved');await symlink(outside,join(root,'cache/accepted-next.sqlite'));
    const base=(await AcceptedIndex.loadCurrent(root))!;await expect(base.install('b'.repeat(40),base.extend([]))).rejects.toMatchObject({code:'unsafe-store-path'});await base.close();
    expect(await readFile(outside,'utf8')).toBe('preserved');const retained=await AcceptedIndex.loadCurrent(root);expect(retained!.commit).toBe('a'.repeat(40));await retained!.close();
  }finally {await rm(root,{recursive:true,force:true});}
});
test('configuration replacement and interrupted generation rebuild preserve full artifact equivalence',async()=>{
  const root=await fixtureRealpath(await mkdtemp(fixtureJoin(fixtureTmpdir(), 'agent-badge-accepted-rebuild-')));await mkdir(join(root,'cache'),{mode:0o700});
  try {
    const record=sanitizeObservation(parseObservation(protocolObservationFixture()),meta.policy),records=[record];
    const snapshot=(commit:string,m=meta,catalog=defaultCatalog)=>{const ledger=reduceLedger(records,m);return {commit,meta:m,catalog,records,ledger,artifacts:renderArtifacts(ledger,m,catalog)};};
    let index=await AcceptedIndex.create(root,snapshot('a'.repeat(40)));await index.close();
    const staleManifest=await readFile(join(root,'cache/accepted.json'));
    const catalog={...defaultCatalog,version:2,cards:defaultCatalog.cards.map(card=>({...card,input:(card.input??0)+123}))};
    const configured={...meta,catalogVersion:2,catalogHash:catalogHash(catalog),policy:{...meta.policy,badge:{label:'Configured',metric:'estimated-cost' as const}}};
    const changed=snapshot('b'.repeat(40),configured,catalog);
    index=await AcceptedIndex.create(root,changed);await index.close();
    // Simulate DB durability before publishing its matching generation manifest.
    await writeFile(join(root,'cache/accepted.json'),staleManifest);
    expect(await AcceptedIndex.load(root,changed.commit)).toBeNull();
    index=await AcceptedIndex.create(root,changed);await index.close();
    index=(await AcceptedIndex.load(root,changed.commit))!;
    expect(index.snapshot().artifacts).toEqual(changed.artifacts);
    const added={...record,unitKey:'c'.repeat(64),coverageKey:'c'.repeat(64)},extension=index.extend([added]);
    const full=renderArtifacts(reduceLedger([record,added],configured),configured,catalog);
    for(const [path,bytes]of extension.artifacts)expect(bytes,path).toEqual(full.get(path));
    await index.close();
  }finally{await rm(root,{recursive:true,force:true});}
});
