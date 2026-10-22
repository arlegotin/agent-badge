import {expect,test,vi} from 'vitest';
import {join} from 'node:path';
import {readdir,readFile,writeFile,rm,rename} from 'node:fs/promises';
import {createBareRemoteFixture,commitFixtureTree,protocolObservationFixture} from '@agent-badge/testkit';
import {resolveRepository} from '../git/context.js';
import {openStore} from './store.js';
import {catalogHash,defaultCatalog} from '../pricing/catalog.js';
import {sanitizeObservation} from '../ledger/sanitize.js';
import {reduceLedger} from '../ledger/reduce.js';
import {renderArtifacts} from '../render/summary.js';
import {AcceptedIndex} from './accepted-index.js';
import {rebuildAcceptedIndex,prepareAcceptedCandidate} from './accepted-stage.js';
import * as gitProcess from '../git/process.js';
const repositoryId='12345678-1234-4234-8234-123456789abc';
const policy={schemaVersion:1 as const,repositoryId,normalizationVersion:1 as const,discovery:'auto' as const,disabledProviders:[],badge:{label:'Usage',metric:'tokens' as const}};
const meta={schemaVersion:2 as const,protocolVersion:1 as const,repositoryId,normalizationVersion:1 as const,catalogVersion:1,catalogHash:catalogHash(defaultCatalog),policy};
test('reused exact blob OID still validates observation versus control path',async()=>{
  const f=await createBareRemoteFixture();try {
    const repository=await resolveRepository(f.clones[0]),store=await openStore(repository),record=sanitizeObservation(protocolObservationFixture(),policy),ledger=reduceLedger([record],meta),artifacts=renderArtifacts(ledger,meta,defaultCatalog);
    const commit=(files:Map<string,Uint8Array>,parent?:string)=>commitFixtureTree(f,repository.worktreeRoot,[...files].map(([path,bytes])=>({path,mode:'100644',content:Buffer.from(bytes).toString('utf8')})),parent);
    const old=await commit(artifacts),base=await AcceptedIndex.create(repository.privateDir,{commit:old,records:[record],ledger,artifacts,meta,catalog:defaultCatalog});await base.close();
    const bad=new Map(artifacts),source=[...bad.keys()].find(path=>path.startsWith('observations/'))!;bad.set(source.replace('observations/','controls/'),bad.get(source)!);bad.delete(source);const next=await commit(bad,old);
    await expect(store.withLock(AbortSignal.timeout(10000),async()=>{for(let n=0;n<10;n++){const index=await rebuildAcceptedIndex(repository,next,{signal:AbortSignal.timeout(10000),deadline:Date.now()+10000});if(index){await index.close();return;}}})).rejects.toThrow();
    expect(await AcceptedIndex.load(repository.privateDir,next)).toBeNull();
  }finally {await f.cleanup();}
});
test('resumed tree inventory sizes only its bounded unverified blob batch',async()=>{
  const f=await createBareRemoteFixture(),stream=vi.spyOn(gitProcess,'streamGitRecords'),commands=vi.spyOn(gitProcess,'runGit');
  try {
    const repository=await resolveRepository(f.clones[0]),store=await openStore(repository),records=Array.from({length:6},(_,i)=>sanitizeObservation({...protocolObservationFixture(),nativeUnitId:'sized-'+i,nativeCoverageId:'sized-coverage-'+i},policy));
    const artifacts=renderArtifacts(reduceLedger(records,meta),meta,defaultCatalog),commit=await commitFixtureTree(f,repository.worktreeRoot,[...artifacts].map(([path,bytes])=>({path,mode:'100644',content:Buffer.from(bytes).toString('utf8')})));
    let index:AcceptedIndex|null=null;
    for(let n=0;n<30&&!index;n++)index=await store.withLock(AbortSignal.timeout(2000),()=>rebuildAcceptedIndex(repository,commit,{signal:AbortSignal.timeout(2000),deadline:Date.now()+2000,maxEntries:2}));
    expect(index).not.toBeNull();expect(index!.snapshot().artifacts).toEqual(artifacts);await index!.close();
    expect(stream.mock.calls.filter(([args])=>args.includes('ls-tree')).every(([args])=>!args.includes('-l'))).toBe(true);
    const batches=commands.mock.calls.filter(([args])=>args.includes('--batch-check'));expect(batches.length).toBeGreaterThan(0);
    for(const [,options]of batches)expect(String(options?.input).trim().split('\n').length).toBeLessThanOrEqual(2);
  }finally {stream.mockRestore();commands.mockRestore();await f.cleanup();}
},30000);
test.each(['parent','object'])('prepared candidate with mismatched %s cannot become accepted cached authority',async fault=>{
  const f=await createBareRemoteFixture();try{
    const repository=await resolveRepository(f.clones[0]),store=await openStore(repository),record=sanitizeObservation(protocolObservationFixture(),policy),ledger=reduceLedger([record],meta),artifacts=renderArtifacts(ledger,meta,defaultCatalog);
    const files=(items:Map<string,Uint8Array>)=>[...items].map(([path,bytes])=>({path,mode:'100644',content:Buffer.from(bytes).toString('utf8')}));
    const old=await commitFixtureTree(f,repository.worktreeRoot,files(artifacts));await f.git(repository.worktreeRoot,['update-ref',`refs/agent-badge/accepted/${old}`,old]);
    const index=await AcceptedIndex.create(repository.privateDir,{commit:old,records:[record],ledger,artifacts,meta,catalog:defaultCatalog});await index.close();
    const base=(await AcceptedIndex.load(repository.privateDir,old))!,control={schemaVersion:2 as const,normalizationVersion:1 as const,repositoryId,kind:'exclude' as const,targetUnitKey:record.unitKey,supersedes:[]},extension=base.extend([control]);await base.close();
    const nextArtifacts=new Map([...artifacts,...extension.artifacts]);if(fault==='object')nextArtifacts.set('badge.svg',Buffer.from('<svg>incorrect derived output</svg>'));
    const candidate=await commitFixtureTree(f,repository.worktreeRoot,files(nextArtifacts),fault==='parent'?undefined:old),options={signal:AbortSignal.timeout(10000),deadline:Date.now()+10000,binding:'synthetic',priorCommit:old};
    await store.withLock(options.signal,()=>prepareAcceptedCandidate(repository,candidate,extension,options));
    await expect(store.withLock(options.signal,async()=>{for(let n=0;n<10;n++){const result=await rebuildAcceptedIndex(repository,candidate,options);if(result){await result.close();throw Error('unexpected candidate acceptance');}}})).rejects.toThrow();
    expect(await AcceptedIndex.load(repository.privateDir,candidate)).toBeNull();
  }finally{await f.cleanup();}
},30000);
test('accepted rebuild persists bounded verified progress and promotes only complete equivalent artifacts',async()=>{
  const f=await createBareRemoteFixture();
  try {
    const repository=await resolveRepository(f.clones[0]),store=await openStore(repository);
    const records=Array.from({length:12},(_,i)=>sanitizeObservation({...protocolObservationFixture(),nativeUnitId:'stage-'+i,nativeCoverageId:'coverage-'+i},policy));
    const artifacts=renderArtifacts(reduceLedger(records,meta),meta,defaultCatalog);
    const commit=await commitFixtureTree(f,repository.worktreeRoot,[...artifacts].map(([path,bytes])=>({path,mode:'100644',content:Buffer.from(bytes).toString('utf8')})));
    let index:AcceptedIndex|null=null,deferred=0,acceptedStages=0;
    for(let run=0;run<50&&!index;run++){
      index=await store.withLock(AbortSignal.timeout(2000),()=>rebuildAcceptedIndex(repository,commit,{signal:AbortSignal.timeout(2000),deadline:Date.now()+2000,maxEntries:3,onValidatedStage:async snapshot=>{acceptedStages++;expect(snapshot.commit).toBe(commit);expect(snapshot.artifacts).toEqual(artifacts);}}));
      if(!index){deferred++;expect(acceptedStages).toBe(0);expect(await AcceptedIndex.load(repository.privateDir,commit)).toBeNull();}
    }
    expect(deferred).toBeGreaterThan(1);expect(acceptedStages).toBe(1);expect(index).not.toBeNull();expect(index!.snapshot().artifacts).toEqual(artifacts);await index!.close();
    expect(await f.git(repository.worktreeRoot,['for-each-ref','--format=%(refname)','refs/agent-badge/staging'])).toBe('');
    expect(await readdir(join(repository.privateDir,'cache'))).not.toContain('accepted-stage.sqlite');
  }finally{await f.cleanup();}
},30000);

test.each(['corrupt-database','missing-manifest','interrupted-promotion','missing-ref','corrupt-owner'])('accepted rebuild recovers %s with intact immutable Git authority',async fault=>{
  const f=await createBareRemoteFixture();
  try {
    const repository=await resolveRepository(f.clones[0]),store=await openStore(repository),cache=join(repository.privateDir,'cache');
    const records=Array.from({length:4},(_,i)=>sanitizeObservation({...protocolObservationFixture(),nativeUnitId:'recovery-'+i,nativeCoverageId:'coverage-'+i},policy));
    const artifacts=renderArtifacts(reduceLedger(records,meta),meta,defaultCatalog);
    const commit=await commitFixtureTree(f,repository.worktreeRoot,[...artifacts].map(([path,bytes])=>({path,mode:'100644',content:Buffer.from(bytes).toString('utf8')})));
    const run=()=>store.withLock(AbortSignal.timeout(2000),()=>rebuildAcceptedIndex(repository,commit,{signal:AbortSignal.timeout(2000),deadline:Date.now()+2000,maxEntries:3}));
    expect(await run()).toBeNull();expect(await AcceptedIndex.load(repository.privateDir,commit)).toBeNull();
    if(fault==='corrupt-database')await writeFile(join(cache,'accepted-stage.sqlite'),'corrupt');
    if(fault==='missing-manifest')await rm(join(cache,'accepted-stage.json'));
    if(fault==='interrupted-promotion')await rename(join(cache,'accepted-stage.sqlite'),join(cache,'accepted.sqlite'));
    if(fault==='missing-ref'){const owner=JSON.parse(await readFile(join(cache,'accepted-stage-owner.json'),'utf8'));await f.git(repository.worktreeRoot,['update-ref','-d',owner.ref,commit]);}
    if(fault==='corrupt-owner')await writeFile(join(cache,'accepted-stage-owner.json'),'corrupt');
    let index:AcceptedIndex|null=null;
    for(let n=0;n<50&&!index;n++)index=await run();
    expect(index).not.toBeNull();expect(index!.snapshot().artifacts).toEqual(artifacts);await index!.close();
  }finally{await f.cleanup();}
},30000);

test('advanced remote tips finish the bound old generation before reusing verified immutable records',async()=>{
  const f=await createBareRemoteFixture();
  try {
    const repository=await resolveRepository(f.clones[0]),store=await openStore(repository);
    const records=Array.from({length:8},(_,i)=>sanitizeObservation({...protocolObservationFixture(),nativeUnitId:'advanced-'+i,nativeCoverageId:'coverage-'+i},policy));
    const artifacts=renderArtifacts(reduceLedger(records,meta),meta,defaultCatalog),oldArtifacts=renderArtifacts(reduceLedger(records.slice(0,7),meta),meta,defaultCatalog);
    const commit=(files:Map<string,Uint8Array>)=>commitFixtureTree(f,repository.worktreeRoot,[...files].map(([path,bytes])=>({path,mode:'100644',content:Buffer.from(bytes).toString('utf8')})));
    const old=await commit(oldArtifacts),next=await commit(artifacts);
    const acceptedStages:string[]=[];
    const run=(tip:string)=>store.withLock(AbortSignal.timeout(2000),()=>rebuildAcceptedIndex(repository,tip,{signal:AbortSignal.timeout(2000),deadline:Date.now()+2000,maxEntries:3,onValidatedStage:async snapshot=>{acceptedStages.push(snapshot.commit);expect(snapshot.commit).toBe(tip);}}));
    expect(await run(old)).toBeNull();let index:AcceptedIndex|null=null,oldComplete=false;
    for(let n=0;n<60&&!index;n++){index=await run(next);const prior=await AcceptedIndex.load(repository.privateDir,old);if(prior){oldComplete=true;await prior.close();}}
    expect(oldComplete).toBe(true);expect(acceptedStages).toEqual([next]);expect(index).not.toBeNull();expect(index!.snapshot().artifacts).toEqual(artifacts);await index!.close();
    expect(await f.git(repository.worktreeRoot,['for-each-ref','--format=%(refname)','refs/agent-badge/accepted'])).toBe('');
  }finally{await f.cleanup();}
},30000);

test('lost staging ref and object must recover the exact bound commit before resuming',async()=>{
  const f=await createBareRemoteFixture();
  try {
    const repository=await resolveRepository(f.clones[0]),store=await openStore(repository),artifacts=renderArtifacts(reduceLedger([],meta),meta,defaultCatalog);
    const commit=await commitFixtureTree(f,repository.worktreeRoot,[...artifacts].map(([path,bytes])=>({path,mode:'100644',content:Buffer.from(bytes).toString('utf8')})));
    const options={signal:AbortSignal.timeout(10000),deadline:Date.now()+10000,maxEntries:2};
    expect(await store.withLock(options.signal,()=>rebuildAcceptedIndex(repository,commit,options))).toBeNull();
    const owner=JSON.parse(await readFile(join(repository.privateDir,'cache/accepted-stage-owner.json'),'utf8'));
    await f.git(repository.worktreeRoot,['update-ref','-d',owner.ref,commit]);
    const path=join(repository.commonDir,'objects',commit.slice(0,2),commit.slice(2)),bytes=await readFile(path);await rm(path);
    await expect(store.withLock(options.signal,()=>rebuildAcceptedIndex(repository,commit,options))).rejects.toThrow('store-busy');
    let recovered=0,index:AcceptedIndex|null=null;
    for(let n=0;n<20&&!index;n++)index=await store.withLock(options.signal,()=>rebuildAcceptedIndex(repository,commit,{...options,recoverCommit:async oid=>{expect(oid).toBe(commit);await writeFile(path,bytes);recovered++;return true;}}));
    expect(recovered).toBe(1);expect(index).not.toBeNull();expect(index!.snapshot().artifacts).toEqual(artifacts);await index!.close();
  }finally{await f.cleanup();}
},30000);

test('a verified prior snapshot rejects removed immutable history before staged promotion',async()=>{
  const f=await createBareRemoteFixture();
  try {
    const repository=await resolveRepository(f.clones[0]),store=await openStore(repository),records=[sanitizeObservation(protocolObservationFixture(),policy)];
    const ledger=reduceLedger(records,meta),artifacts=renderArtifacts(ledger,meta,defaultCatalog),empty=renderArtifacts(reduceLedger([],meta),meta,defaultCatalog);
    const commit=(files:Map<string,Uint8Array>,parent?:string)=>commitFixtureTree(f,repository.worktreeRoot,[...files].map(([path,bytes])=>({path,mode:'100644',content:Buffer.from(bytes).toString('utf8')})),parent);
    const old=await commit(artifacts),next=await commit(empty,old);
    await store.withLock(AbortSignal.timeout(10000),async()=>{const index=await AcceptedIndex.create(repository.privateDir,{commit:old,records,ledger,artifacts,meta,catalog:defaultCatalog});await index.close();});
    await f.git(repository.worktreeRoot,['update-ref',`refs/agent-badge/accepted/${old}`,old]);
    await expect(store.withLock(AbortSignal.timeout(2000),()=>rebuildAcceptedIndex(repository,next,{signal:AbortSignal.timeout(2000),deadline:Date.now()+2000,priorCommit:old}))).rejects.toThrow();
    expect(await AcceptedIndex.load(repository.privateDir,next)).toBeNull();const retained=await AcceptedIndex.load(repository.privateDir,old);expect(retained).not.toBeNull();await retained!.close();
  }finally{await f.cleanup();}
},30000);

test('an unavailable discarded old stage cannot prevent validating a fetched newer tip',async()=>{
  const f=await createBareRemoteFixture();
  try{
    const repository=await resolveRepository(f.clones[0]),store=await openStore(repository),artifacts=renderArtifacts(reduceLedger([],meta),meta,defaultCatalog);
    const files=[...artifacts].map(([path,bytes])=>({path,mode:'100644',content:Buffer.from(bytes).toString('utf8')}));
    const old=await commitFixtureTree(f,repository.worktreeRoot,files),next=await commitFixtureTree(f,repository.worktreeRoot,files,old);
    const options={signal:AbortSignal.timeout(10000),deadline:Date.now()+10000,maxEntries:2,recoverCommit:async()=>false};
    expect(await store.withLock(options.signal,()=>rebuildAcceptedIndex(repository,old,options))).toBeNull();
    const owner=JSON.parse(await readFile(join(repository.privateDir,'cache/accepted-stage-owner.json'),'utf8'));
    await f.git(repository.worktreeRoot,['update-ref','-d',owner.ref,old]);await rm(join(repository.commonDir,'objects',old.slice(0,2),old.slice(2)));
    let index:AcceptedIndex|null=null;
    for(let n=0;n<20&&!index;n++)index=await store.withLock(options.signal,()=>rebuildAcceptedIndex(repository,next,options));
    expect(index).not.toBeNull();expect(index!.commit).toBe(next);expect(index!.snapshot().artifacts).toEqual(artifacts);await index!.close();
  }finally{await f.cleanup();}
},30000);
