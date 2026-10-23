import { assertOwnedGitFixture } from '../validation/fixture-root.js';
/** Reapprove a retained synthetic fixture with this Node, then measure real hooks. */
import {startFixtureGitDaemon} from '../../packages/testkit/src/git-daemon.js';
import {spawnSync} from 'node:child_process';
import {setImmediate as yieldToReceiver} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {appendFile,readFile,readdir,realpath,writeFile} from 'node:fs/promises';
import {basename,join} from 'node:path';
import {planSetup,applySetup} from '../../packages/agent-badge/src/integration/setup.js';
import {readStoreSnapshot} from '../../packages/core/src/storage/store.js';
import {readLedgerCommit} from '../../packages/core/src/git/data-transport.js';
import {observeProgress} from './observer.js';
import {codexContext,codexRequest} from '../../packages/testkit/src/index.js';
const root=await realpath(process.argv[2]),samples=Number(process.argv[3]??30);
if(!(await assertOwnedGitFixture(root)))throw Error('synthetic fixture required');
const cwd=join(root,'clone-a'),privateDir=join(cwd,'.git/agent-badge'),declaration=JSON.parse(await readFile(join(cwd,'.agent-badge/config.json'),'utf8'));
if(declaration.declaredUrl!=='https://github.com/synthetic/benchmark')throw Error('synthetic fixture required');
const receiver=JSON.parse(await readFile(join(root,'receiver.json'),'utf8'));
const daemon=await startFixtureGitDaemon({root,remote:join(root,'remote.git')},receiver.port);
try {
const plan=await planSetup({cwd,target:'origin',nodeVersion:process.versions.node,
  installRuntime:async()=>{throw Error('retained runtime expected');},
  runInitialOperation:async()=>({status:'queued',exitCode:1,acknowledgedCount:0,queuedCount:null,pendingReconciliation:true})});
await applySetup(plan);
const source=join(root,'codex/sessions/source-00000.jsonl'),wrapper=join(plan.repository.hooksPath,'pre-push');
if(!(await readFile(wrapper,'utf8')).includes(process.execPath))throw Error('owning setup did not select this Node');
const invoke=(targeted:boolean)=>{
  const start=performance.now(),child=targeted?
    spawnSync(process.execPath,[join(privateDir,'bootstrap.cjs'),'--hook','codex'],{cwd,input:JSON.stringify({hook_event_name:'Stop',transcript_path:source}),encoding:'utf8',timeout:3500}):
    spawnSync(wrapper,[],{cwd,input:'refs\n',encoding:'utf8',timeout:3500});
  if(child.status!==0)throw Error('synthetic hook failed');return {ms:performance.now()-start,queued:/queued|deadline/.test(child.stderr)};
};
// Separate runtime-observation probe. Restore production bytes before timed samples.
const worker=join(privateDir,'runtime',plan.lockHash,'node_modules/@legotin/agent-badge/dist/integration/runtime-worker.js'),original=await readFile(worker,'utf8'),proof=join(root,'runtime-proof-'+process.versions.node+'.json');
try{
  await writeFile(worker,`import {writeFileSync as benchmarkRuntimeProof} from 'node:fs';benchmarkRuntimeProof(${JSON.stringify(proof)},JSON.stringify({node:process.version,execPath:process.execPath}));\n`+original);
  invoke(false);
}finally{await writeFile(worker,original);}
const actual=JSON.parse(await readFile(proof,'utf8'));if(actual.node!==process.version||actual.execPath!==process.execPath)throw Error('worker runtime differs');
const snapshot=await readStoreSnapshot(plan.repository);if(snapshot.pending.length)throw Error('warm fixture has pending records');
const progress=()=>observeProgress(privateDir,async commit=>{const result=spawnSync('git',['--no-replace-objects','show',`${commit}:summary.json`],{cwd,encoding:'utf8'});if(result.status!==0)throw Error('accepted summary unavailable');return result.stdout;});
const nativeSources=(await readdir(join(root,'codex/sessions'))).length;
const core=join(privateDir,'runtime',plan.lockHash,'node_modules/@legotin/agent-badge-core');
const artifactHashes={remoteBinding:createHash('sha256').update(await readFile(join(core,'dist/git/remote-binding.js'))).digest('hex'),workerSync:createHash('sha256').update(await readFile(join(core,'dist/operations/worker-sync.js'))).digest('hex'),integrationWorker:createHash('sha256').update(original).digest('hex')};
const before=(await progress()).confirmedUnits,targeted:ReturnType<typeof invoke>[]=[],untargeted:ReturnType<typeof invoke>[]=[];
for(const [targetedHook,values] of [[true,targeted],[false,untargeted]] as const)
  for(let i=0;i<samples;i++){await yieldToReceiver();values.push(invoke(targetedHook));}
const p95=(values:{ms:number}[])=>values.map(value=>value.ms).sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1];
console.log(JSON.stringify({phase:'warm-hooks',root,node:process.version,actualWorker:actual,artifactHashes,nativeSources,untargetedEntry:'installed pre-push shell wrapper',units:before,samples,warmup:'one separate runtime proof probe; no discarded timed samples',targeted,untargeted,targetedP95:p95(targeted),untargetedP95:p95(untargeted)}));
const records=(await readFile(source,'utf8')).trim().split('\n').map(line=>JSON.parse(line)),ordinal=Math.max(...records.map(record=>record.ordinal??0))+1,turn='runtime-'+process.versions.node;
await appendFile(source,[{...codexContext(turn),ordinal},codexRequest('stream-0',turn,turn,500,ordinal+1)].map(line=>JSON.stringify(line).replaceAll('/synthetic/repo',cwd)).join('\n')+'\n');
const append=[];let pending:number|null=null,after=before;
for(let n=0;n<10;n++){append.push(invoke(true));after=(await progress()).confirmedUnits;if(after===before+1)pending=(await readStoreSnapshot(plan.repository)).pending.length;if(pending===0)break;}
console.log(JSON.stringify({phase:'append',root,node:process.version,append,pending,confirmedUnits:after,observerRssBytes:process.memoryUsage().rss}));
if(pending||after!==before+1)throw Error('automatic append did not confirm');
const verified=await readStoreSnapshot(plan.repository);
if(verified.pending.length||!verified.transport?.commit)throw Error('readonly verification found pending usage');
const accepted=await readLedgerCommit(plan.repository,verified.transport.commit,{signal:AbortSignal.timeout(3600000),deadline:Date.now()+3600000});
if(accepted.ledger.recordedUnits!==before+1)throw Error('strict final unit count differs');

} finally { await daemon.stop(); }
