/** Integrated synthetic provider/activation benchmark; run only through run-isolated.py. */
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, readFile, appendFile, cp, symlink, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setImmediate as yieldToReceiver } from 'node:timers/promises';
import { createBareRemoteFixture, codexContext, codexRequest } from '../../packages/testkit/src/index.js';
import { planSetup, applySetup } from '../../packages/agent-badge/src/integration/setup.js';
import { openStore, collectUsage, syncUsage, catalogHash, defaultCatalog } from '../../packages/core/src/index.js';
import { readStoreSnapshot } from '../../packages/core/src/storage/store.js';
import { readLedgerCommit } from '../../packages/core/src/git/data-transport.js';
import { startFixtureGitDaemon } from '../../packages/testkit/src/git-daemon.js';
import { observeProgress, observeStage } from './observer.js';
const streams=Number(process.argv[2]??100),perStream=10,sampleCount=Number(process.argv[3]??10);
const trace=process.argv.includes('trace');
const offline=process.argv[4]==='offline';
const bounded=process.argv[4]==='bounded'||offline;
const f=await createBareRemoteFixture(),daemon=await startFixtureGitDaemon(f),cwd=f.clones[0],home=join(f.root,'codex'),version='1.1.20';
console.log(JSON.stringify({phase:'fixture',root:f.root,node:process.version,streams,units:streams*perStream,sampleCount}));
try {
 await writeFile(join(f.root,'receiver.json'),JSON.stringify({port:daemon.port,url:daemon.url}),{mode:0o600,flag:'wx'});
 for(const clone of f.clones)await f.git(clone,['remote','set-url','origin',daemon.url]);
 await mkdir(join(home,'sessions'),{recursive:true});
 const pin={manifest:JSON.stringify({private:true,dependencies:{'@legotin/agent-badge':version}}),lock:JSON.stringify({lockfileVersion:3,packages:{'':{dependencies:{'@legotin/agent-badge':version}},'node_modules/@legotin/agent-badge':{version,resolved:'https://registry.npmjs.org/badge.tgz',integrity:'sha512-c3ludGhldGlj'}}})};
 const roots={codex:[home],claude:[],gemini:[],opencode:[]};
 const plan=await planSetup({cwd,nodeVersion:process.versions.node,runtimeVersion:version,declaredUrl:'https://github.com/synthetic/benchmark',target:'origin',roots:{codex:roots.codex,claude:[],gemini:[]},resolvePin:async()=>pin,
   installRuntime:async directory=>{
     const cli=join(directory,'node_modules/@legotin/agent-badge');await mkdir(join(cli,'dist'),{recursive:true});
     await cp(resolve('packages/agent-badge/dist/integration'),join(cli,'dist/integration'),{recursive:true});
     await mkdir(join(cli,'dist/cli'));await writeFile(join(cli,'dist/cli/main.js'),'// synthetic installation entry');
     await writeFile(join(cli,'package.json'),JSON.stringify({name:'@legotin/agent-badge',type:'module',version}));
     const core=join(directory,'node_modules/@legotin/agent-badge-core');
     if(!trace)await symlink(resolve('packages/core'),core);
     else {
       await mkdir(core);await cp(resolve('packages/core/dist'),join(core,'dist'),{recursive:true});await cp(resolve('packages/core/package.json'),join(core,'package.json'));
       await symlink(resolve('node_modules'),join(core,'node_modules'));
       const traceFile=join(f.root,'trace.jsonl');
       const prefix=`import {appendFileSync as benchmarkAppend} from 'node:fs';const benchmarkTrace=stage=>benchmarkAppend(${JSON.stringify(traceFile)},JSON.stringify({stage,pid:process.pid,ms:performance.now(),uptime:process.uptime()})+'\\n');benchmarkTrace('module-loaded');\n`;
       for(const [file,replacements] of [
         [join(core,'dist/operations/worker-sync.js'),[
           ['const repository = await resolveRepository(cwd, context);',"benchmarkTrace('repository-start');const repository = await resolveRepository(cwd, context);benchmarkTrace('repository-end');"],
           ['const store = await openStore',"benchmarkTrace('store-start');const store = await openStore"],
           ['return store.withLock',"benchmarkTrace('store-end');return store.withLock"],
           ['const policy = await loadCapturePolicy',"benchmarkTrace('policy-start');const policy = await loadCapturePolicy"],
           ['captured = await collectUsage',"benchmarkTrace('collection-start');captured = await collectUsage"],
           ['if (input.synchronize === false)',"benchmarkTrace('collection-end');if (input.synchronize === false)"],
           ['const result = await syncUsage',"benchmarkTrace('sync-start');const result = await syncUsage"],
           ['const collected = captured',"benchmarkTrace('sync-end');const collected = captured"],
         ]],
         [join(cli,'dist/integration/runtime-worker.js'),[
           ['const checkedTask = checkActivation',"benchmarkTrace('activation-start');const checkedTask = checkActivation"],
           ["if (checked.status !== 'approved')","benchmarkTrace('activation-end');if (checked.status !== 'approved')"],
         ]],
         [join(core,'dist/git/data-transport.js'),[
           ['async fetch() {',"async fetch() {benchmarkTrace('fetch-start');"],
           ['this.acceptedIndex.install(commit, candidate);',"{benchmarkTrace('candidate-install-start');this.acceptedIndex.install(commit, candidate);benchmarkTrace('candidate-install-end');}"],
           ['this.acceptedIndex = await AcceptedIndex.load',"benchmarkTrace('cache-load-start');this.acceptedIndex = await AcceptedIndex.load"],
           ['if (!this.acceptedIndex) {',"benchmarkTrace(this.acceptedIndex?'cache-hit':'cache-miss');if (!this.acceptedIndex) {benchmarkTrace('cache-rebuild-start');"],
           ['const snapshot = this.acceptedIndex.snapshot();',"benchmarkTrace('cache-ready');const snapshot = this.acceptedIndex.snapshot();"],
           ['async commitExtension(extension) {',"async commitExtension(extension) {benchmarkTrace('commit-extension-start');"],
           ['async commit(artifacts, parent, patch = false) {',"async commit(artifacts, parent, patch = false) {benchmarkTrace('object-publication-start');"],
           ['async push(commit, parent) {',"async push(commit, parent) {benchmarkTrace('push-start');"],
           ['async closeCache() {',"async closeCache() {benchmarkTrace('cache-close-start');"],
           ['await index?.close();',"await index?.close();benchmarkTrace('cache-close-end');"],
         ]],
         [join(core,'dist/operations/sync.js'),[
           ['await options.store.acknowledge(localHashes);',"benchmarkTrace('receipt-start');await options.store.acknowledge(localHashes);benchmarkTrace('receipt-end');"],
         ]],
       ] as [string,string[][]][]) {
         let bytes=await readFile(file,'utf8');for(const [from,to] of replacements){if(!bytes.includes(from))throw Error('trace point unavailable');bytes=bytes.replace(from,to);}await writeFile(file,prefix+bytes);
       }
     }
   },runInitialOperation:async()=>({status:'queued',exitCode:1,acknowledgedCount:0,queuedCount:null,pendingReconciliation:true})});
 await applySetup(plan);
 const source=(i:number)=>join(home,'sessions',`source-${String(i).padStart(5,'0')}.jsonl`);
 for(let start=0;start<streams;start+=64)await Promise.all(Array.from({length:Math.min(64,streams-start)},async(_,n)=>{
   const i=start+n,owner=`stream-${i}`,lines:unknown[]=[{type:'session_meta',ordinal:0,payload:{id:owner,cli_version:'synthetic-source-pin'}}];
   for(let j=0;j<perStream;j++)lines.push({...codexContext(`turn-${j}`),ordinal:j*2+1},codexRequest(owner,`turn-${j}`,`response-${i}-${j}`,100,j*2+2));
   await writeFile(source(i),lines.map(line=>JSON.stringify(line).replaceAll('/synthetic/repo',cwd)).join('\n')+'\n');
 }));
 const {repository}=plan,policy=plan.declaration.policy,binding=plan.activation.binding;
 const store=await openStore(repository),times:Record<string,number>={};
 const progress=()=>observeProgress(repository.privateDir,commit=>f.git(cwd,['--no-replace-objects','show',`${commit}:summary.json`]));
 const sample=(targeted:boolean)=>{const start=performance.now(),args=targeted?[join(repository.privateDir,'bootstrap.cjs'),'--hook','codex']:[join(repository.privateDir,'git-hook.cjs'),''];
   const child=spawnSync(process.execPath,args,{cwd,input:targeted?JSON.stringify({hook_event_name:'Stop',transcript_path:source(0)}):'refs\n',encoding:'utf8',timeout:3500});
   if(child.status!==0)throw Error('synthetic hook failed');return {ms:performance.now()-start,queued:/queued|deadline/.test(child.stderr)};};
 const meta={schemaVersion:2 as const,protocolVersion:1 as const,repositoryId:policy.repositoryId,normalizationVersion:1 as const,catalogVersion:1,catalogHash:catalogHash(defaultCatalog),policy};
 let collectionCancelled=false,seeded:Awaited<ReturnType<typeof syncUsage>>|undefined,start=performance.now();
 const coldProgress:{operation:number;ms:number;queued:boolean;confirmedUnits:number;pending:number|null;journalFiles:number;stage:Record<string,unknown>}[]=[];
 if(bounded){
   await syncUsage({repository,store,binding,collect:'none',initialize:{meta,catalog:defaultCatalog},signal:AbortSignal.timeout(120000),deadline:Date.now()+120000});
   times.initializeEmptyMs=performance.now()-start;
   if(offline){start=performance.now();await store.withLock(AbortSignal.timeout(3600000),()=>collectUsage({repository,store,policy,privatePolicy:plan.activation.privatePolicy,roots,signal:AbortSignal.timeout(3600000)}));times.offlineCollectionMs=performance.now()-start;console.log(JSON.stringify({phase:'offline-backlog',units:(await readStoreSnapshot(repository)).pending.length,ms:times.offlineCollectionMs}));}
   start=performance.now();let confirmedUnits=0,pending:number|null=null;
   for(let operation=1;(confirmedUnits<streams*perStream||pending!==0)&&operation<=streams*2+10;operation++){
     const outcome=sample(false),observed=await progress();confirmedUnits=observed.confirmedUnits;
     if(confirmedUnits===streams*perStream){const check=performance.now();pending=(await readStoreSnapshot(repository)).pending.length;times.coldReadOnlyAuthorityCheckMs=(times.coldReadOnlyAuthorityCheckMs??0)+performance.now()-check;}
     coldProgress.push({operation,...outcome,...observed,pending});
     await appendFile(join(f.root,'cold-samples.jsonl'),JSON.stringify(coldProgress.at(-1))+'\n');
     if(operation===1||operation%25===0||confirmedUnits===streams*perStream)console.log(JSON.stringify({phase:'cold-progress',...coldProgress.at(-1),elapsedMs:performance.now()-start}));
     if(operation>=10&&coldProgress.slice(-10).every(value=>value.confirmedUnits===confirmedUnits&&value.journalFiles===observed.journalFiles&&JSON.stringify(value.stage)===JSON.stringify(observed.stage))){console.log(JSON.stringify({phase:'no-confirmed-progress',coldProgress}));throw Error('bounded cold path made no confirmed, collection or staged progress in ten invocations');}
   }
   if(confirmedUnits!==streams*perStream||pending!==0)throw Error('bounded cold incomplete');times.coldWallWithReadOnlyObservationMs=performance.now()-start;times.coldHookMs=coldProgress.reduce((sum,item)=>sum+item.ms,0);
 }else{
   const collection=await store.withLock(AbortSignal.timeout(3600000),()=>collectUsage({repository,store,policy,privatePolicy:plan.activation.privatePolicy,roots,signal:AbortSignal.timeout(3600000)}));collectionCancelled=collection.cancelled;times.coldCollectionMs=performance.now()-start;
   start=performance.now();seeded=await syncUsage({repository,store,binding,collect:'none',initialize:{meta,catalog:defaultCatalog},signal:AbortSignal.timeout(3600000),deadline:Date.now()+3600000});times.coldSyncMs=performance.now()-start;
 }
 // No discarded warmups: each sample is a fresh production process after cold completion.
 // This parent owns the receiver's stderr pipe. Service it between synchronous
 // samples; otherwise a full log pipe blocks the independent receiver.
 const targeted:ReturnType<typeof sample>[]=[],untargeted:ReturnType<typeof sample>[]=[];
 for(const [targetedHook,samples] of [[true,targeted],[false,untargeted]] as const)
   for(let i=0;i<sampleCount;i++){await yieldToReceiver();samples.push(sample(targetedHook));}
 const p95=(samples:{ms:number}[])=>samples.map(s=>s.ms).sort((a,b)=>a-b)[Math.ceil(samples.length*.95)-1];
 console.log(JSON.stringify({phase:'warm-hooks',untargetedEntry:'installed private Git driver via approved Node; shell wrapper measured separately',streams,units:streams*perStream,sampleCount,targeted,untargeted,targetedP95:p95(targeted),untargetedP95:p95(untargeted)}));
 const memory:Record<string,number|null>={};
 // macOS time -l requires sysctl permission; run this separate probe explicitly.
 if(process.platform==='darwin'&&process.argv.includes('memory'))for(const targeted of [true,false]){
   const args=targeted?[join(repository.privateDir,'bootstrap.cjs'),'--hook','codex']:[join(repository.privateDir,'git-hook.cjs'),''];
   const measured=spawnSync('/usr/bin/time',['-l',process.execPath,...args],{cwd,input:targeted?JSON.stringify({hook_event_name:'Stop',transcript_path:source(0)}):'refs\n',encoding:'utf8',timeout:3500});
   if(measured.status!==0)throw Error('memory probe hook failed');const match=/(\d+)\s+maximum resident set size/.exec(measured.stderr);memory[targeted?'targetedMaxRssBytes':'untargetedMaxRssBytes']=match?Number(match[1]):null;
 }
 await appendFile(source(0),[{...codexContext('turn-appended'),ordinal:10000},codexRequest('stream-0','turn-appended','response-appended',300,10001)].map(line=>JSON.stringify(line).replaceAll('/synthetic/repo',cwd)).join('\n')+'\n');
 const appendProgress:{ms:number;queued:boolean;pending:number|null;confirmedUnits:number}[]=[];
 for(let attempt=0;attempt<10;attempt++){
   const outcome=sample(true),{confirmedUnits}=await progress();
   const pending=confirmedUnits===streams*perStream+1?(await readStoreSnapshot(repository)).pending.length:null;
   appendProgress.push({...outcome,pending,confirmedUnits});await appendFile(join(f.root,'append-samples.jsonl'),JSON.stringify(appendProgress.at(-1))+'\n');
   if(pending===0&&confirmedUnits===streams*perStream+1)break;
 }
 if(appendProgress.at(-1)?.pending!==0||appendProgress.at(-1)?.confirmedUnits!==streams*perStream+1)throw Error('automatic append did not confirm');
 const append=appendProgress[0],pendingAfterInitialAppend=append.pending,pendingAfterAppend=appendProgress.at(-1)!.pending,entries=(await readStoreSnapshot(repository)).entries.filter(entry=>entry.source.provider==='codex'&&entry.source.instanceKey===home&&entry.source.sourceIdentity===source(0));
 console.log(JSON.stringify({phase:'append',append,appendProgress,pendingAfterInitialAppend,pendingAfterAppend,sourceObservations:entries.flatMap(e=>e.observations).length,memory}));
 const recovery:Record<string,unknown[]>={};
 if(process.argv.includes('recover'))for(const kind of ['index','accepted']){
   for(const name of kind==='accepted'?['accepted.sqlite','accepted-next.sqlite','accepted.json']:['index.sqlite','index.json'])await rm(join(repository.privateDir,'cache',name),{force:true});
   if(kind==='accepted')await appendFile(source(0),[{...codexContext('turn-recovery'),ordinal:10002},codexRequest('stream-0','turn-recovery','response-recovery',400,10003)].map(line=>JSON.stringify(line).replaceAll('/synthetic/repo',cwd)).join('\n')+'\n');
   const progress:{operation:number;ms:number;queued:boolean;stage:Record<string,unknown>}[]=[];recovery[kind]=progress;
   for(let operation=1;operation<=streams+100;operation++){
     const outcome=sample(true),stage=await observeStage(repository.privateDir);progress.push({operation,...outcome,stage});
     await appendFile(join(f.root,kind+'-recovery-samples.jsonl'),JSON.stringify(progress.at(-1))+'\n');
     if(operation===1||operation%25===0||!outcome.queued)console.log(JSON.stringify({phase:kind+'-recovery',...progress.at(-1)}));
     if(!outcome.queued)break;
     if(operation>=10&&progress.slice(-10).every(value=>JSON.stringify(value.stage)===JSON.stringify(stage)))throw Error('cache recovery made no staged progress in ten invocations');
   }
   if(progress.at(-1)?.queued)throw Error('cache recovery incomplete');
 }
 let recoveredUnits:number|undefined;
 if(process.argv.includes('recover')){const snapshot=await readStoreSnapshot(repository);if(snapshot.pending.length||!snapshot.transport?.commit)throw Error('recovery left unconfirmed usage');recoveredUnits=JSON.parse(await f.git(cwd,['--no-replace-objects','show',`${snapshot.transport.commit}:summary.json`])).recordedUnits;if(recoveredUnits!==streams*perStream+2)throw Error('recovery count differs');}
 const verificationStart=performance.now(),verifiedSnapshot=await readStoreSnapshot(repository);
 if(verifiedSnapshot.pending.length||!verifiedSnapshot.transport?.commit)throw Error('final readonly verification found pending usage');
 const final=await readLedgerCommit(repository,verifiedSnapshot.transport.commit,{signal:AbortSignal.timeout(3600000),deadline:Date.now()+3600000});
 times.observerStrictVerificationMs=performance.now()-verificationStart;
 if(final.ledger.recordedUnits!==streams*perStream+(process.argv.includes('recover')?2:1))throw Error('strict final unit count differs');
 console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,streams,units:streams*perStream,sampleCount,times,observerRssBytes:process.memoryUsage().rss,hookProcessTreeMemory:memory,recoveredUnits,
   collectionCancelled,coldProgress,recovery,untargetedEntry:'installed private Git driver via approved Node; shell wrapper measured separately',warmup:'no discarded samples; every hook is a fresh process',seeded:seeded?.status??'automatic-confirmed',seededUnits:seeded?.accepted?.ledger.recordedUnits??streams*perStream,targeted,untargeted,targetedP95:p95(targeted),untargetedP95:p95(untargeted),
   append,appendProgress,pendingAfterInitialAppend,pendingAfterAppend,sourceObservations:entries.flatMap(e=>e.observations).length,final:'readonly-verified',finalUnits:final.ledger.recordedUnits}));
}finally{await daemon.stop();if(trace)console.log(await readFile(join(f.root,'trace.jsonl'),'utf8').catch(()=>''));if(process.argv.includes('keep'))console.log(JSON.stringify({phase:'retained-fixture',root:f.root}));else await f.cleanup();}
