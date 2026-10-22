/** Synthetic-only benchmark. Invoke with the repository's run-isolated.py wrapper. */
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { AcceptedIndex } from '../../packages/core/src/storage/accepted-index.js';
import { reduceLedger } from '../../packages/core/src/ledger/reduce.js';
import { renderArtifacts } from '../../packages/core/src/render/summary.js';
import { createBareRemoteFixture, protocolObservationFixture } from '../../packages/testkit/src/index.js';
import { resolveRepository, bindRemote, openStore, sanitizeObservation, recordHash, collectUsage, attributionPolicyHash,
  parsePrivateAttributionPolicy, observationEvidenceHash, syncUsage, defaultCatalog, catalogHash } from '../../packages/core/src/index.js';
const units = Number(process.argv[2] ?? 100), streams = Number(process.argv[3] ?? 10);
if (!Number.isSafeInteger(units) || !Number.isSafeInteger(streams) || units < streams || streams < 1) throw Error('invalid benchmark size');
const repositoryId = '12345678-1234-4234-8234-123456789abc';
const policy = { schemaVersion:1 as const, repositoryId, normalizationVersion:1 as const, discovery:'auto' as const,
  disabledProviders:[], badge:{label:'Synthetic usage',metric:'tokens' as const} };
const privatePolicy = parsePrivateAttributionPolicy({}), policyHash = attributionPolicyHash(policy, privatePolicy);
const meta = {schemaVersion:2 as const, protocolVersion:1 as const, repositoryId, normalizationVersion:1 as const, catalogVersion:1, catalogHash:catalogHash(defaultCatalog),policy};
const f = await createBareRemoteFixture();
try {
  const repository = await resolveRepository(f.clones[0]), store = await openStore(repository, {processNamespace:async ()=>'synthetic-benchmark'});
  const times:Record<string,number>={};
  async function measure<T>(name:string, task:()=>Promise<T>) { const start=performance.now(); const value=await task();times[name]=performance.now()-start;return value; }
  await measure('coldCollectionMs',async()=>{
    for (let stream=0;stream<streams;stream++) {
      const observations=Array.from({length:Math.floor((units-stream-1)/streams)+1},(_,index)=>{
        const o=protocolObservationFixture();o.nativeUnitId=`unit-${stream+index*streams}`;o.nativeCoverageId=o.nativeUnitId;
        o.source.sourceIdentity=`stream-${stream}`;o.execution={cwd:repository.worktreeRoot,repositoryId,remoteUrl:null};return o;
      });
      const {sourceSchema,...identity}=observations[0].source;
      const source={provider:'codex' as const,root:f.root,schema:sourceSchema,...identity};
      const batch={source,observations,outcome:'complete' as const,diagnostics:[],nextCheckpoint:{schemaVersion:1 as const,provider:source.provider,
        instanceKey:source.instanceKey,sourceIdentity:source.sourceIdentity,sourceGeneration:source.generation,sourceSchema:source.schema,readerVersion:source.readerVersion,
        repositoryId,normalizationVersion:1 as const,attributionPolicyHash:policyHash,continuation:null,cursor:{offset:0,size:0,prefixHash:'b'.repeat(64),incompleteTail:''}}};
      await store.commitBatch(source,batch,observations.map(o=>sanitizeObservation(o,policy)),{schemaVersion:1,policyHash,policy:{remoteAliases:[],mappings:[],overrides:[]},
        decisions:observations.map(o=>({observationHash:observationEvidenceHash(o),status:'included' as const,reason:'git-membership' as const,verifiedCommonDir:repository.commonDir}))});
    }
  });
  const pending=await measure('pendingMs',()=>store.pending());
  if(process.argv[4]==='phases'){
    const records=pending.slice(0,Math.min(2048,Math.floor(pending.length/2))),ledger=reduceLedger(records,meta),artifacts=renderArtifacts(ledger,meta,defaultCatalog);
    await store.acknowledge(records.map(recordHash));
    const db=new DatabaseSync(join(repository.privateDir,'cache/index.sqlite'),{readOnly:true});
    try{console.log(JSON.stringify({phase:'pending-query-plan',plan:db.prepare('EXPLAIN QUERY PLAN SELECT data,hash FROM records WHERE unit=? AND pending=1 ORDER BY hash').all('a'.repeat(64)),unitPlan:db.prepare('EXPLAIN QUERY PLAN SELECT data,hash FROM records INDEXED BY records_unit WHERE unit=? AND pending=1 ORDER BY hash').all('a'.repeat(64))}));}finally{db.close();}
    await store.withLock(AbortSignal.timeout(120000),async()=>{
      const index=await AcceptedIndex.create(repository.privateDir,{commit:'a'.repeat(40),records,ledger,artifacts,meta,catalog:defaultCatalog});
      try{for(let run=0;run<3;run++){const start=performance.now(),selected=await store.pendingBatch(128,512*1024),selectionMs=performance.now()-start,next=performance.now();index.extend(selected.records);console.log(JSON.stringify({phase:'pending-extension',run,units,accepted:records.length,selected:selected.records.length,selectionMs,extensionMs:performance.now()-next}));}}finally{await index.close();}
    });
  }else{
  const result=await measure('warmCollectionMs',()=>collectUsage({repository,store,policy,signal:AbortSignal.timeout(60000),roots:{codex:[],claude:[],gemini:[],opencode:[]}}));
  const binding=await bindRemote(repository,{repositoryId,declaredUrl:f.remote,target:'origin'});
  if(binding.status!=='bound')throw Error('unbound benchmark');
  const cold=await measure('coldSyncMs',()=>syncUsage({repository,store,binding,collect:'none',initialize:{meta,catalog:defaultCatalog},signal:AbortSignal.timeout(120000),deadline:Date.now()+120000}));
  const warm=await measure('warmSyncMs',()=>syncUsage({repository,store:store,binding,collect:'none',signal:AbortSignal.timeout(120000),deadline:Date.now()+120000}));
  console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,units,streams,times,rss:process.memoryUsage().rss,pending:pending.length,
    collection:result.cancelled?'cancelled':'completed',cold:cold.status,warm:warm.status,accepted:warm.accepted?.ledger.recordedUnits,remaining:(await store.pending()).length}));
  }
} finally {await f.cleanup();}
