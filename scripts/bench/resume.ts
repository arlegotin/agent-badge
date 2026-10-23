import { assertOwnedGitFixture } from '../validation/fixture-root.js';
/** Diagnose a retained synthetic benchmark only; never accepts a real repository. */
import {spawnSync} from 'node:child_process';
import {cp,mkdir,readFile,readlink,realpath,rm,symlink,writeFile} from 'node:fs/promises';
import {join,resolve,basename} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const root=await realpath(process.argv[2]),runs=Number(process.argv[3]??15),trace=process.argv[4]?.startsWith('trace');
if(!(await assertOwnedGitFixture(root)))throw Error('synthetic fixture required');
const cwd=join(root,'clone-a'),privateDir=join(cwd,'.git/agent-badge'),declaration=JSON.parse(await readFile(join(cwd,'.agent-badge/config.json'),'utf8'));
if(declaration.declaredUrl!=='https://github.com/synthetic/benchmark')throw Error('synthetic fixture required');
const activation=JSON.parse(await readFile(join(privateDir,'local.json'),'utf8')),modules=join(privateDir,'runtime',activation.lockHash,'node_modules'),core=join(modules,'@legotin/agent-badge-core'),traceFile=join(root,process.argv[4]?.startsWith('trace-stage')?'resume-stage-trace.jsonl':'resume-trace.jsonl');
if(process.argv[4]==='refresh'){
  if(JSON.parse(await readFile(join(core,'package.json'),'utf8')).name!=='@legotin/agent-badge-core')throw Error('unexpected fixture runtime');
  await rm(core,{recursive:true,force:true});await symlink(resolve('packages/core'),core);
}
if(process.argv[4]==='trace'){
  if(await readlink(core)!==resolve('packages/core'))throw Error('unexpected fixture runtime');await rm(core);await mkdir(core);
  await cp(resolve('packages/core/dist'),join(core,'dist'),{recursive:true});await cp(resolve('packages/core/package.json'),join(core,'package.json'));await symlink(resolve('node_modules'),join(core,'node_modules'));
  const prefix=`import {appendFileSync as benchmarkAppend} from 'node:fs';const benchmarkTrace=stage=>benchmarkAppend(${JSON.stringify(traceFile)},JSON.stringify({stage,pid:process.pid,ms:performance.now()})+'\\n');\n`;
  for(const [file,replacements]of [
    ['operations/worker-sync.js',[
      ['const store = await openStore',"benchmarkTrace('store-start');const store = await openStore"],
      ['return store.withLock',"benchmarkTrace('store-open');return store.withLock"],
      ['captured = await collectUsage',"benchmarkTrace('collection-start');captured = await collectUsage"],
      ['const result = await syncUsage',"benchmarkTrace('sync-start');const result = await syncUsage"],
      ['const collected = captured',"benchmarkTrace('sync-end');const collected = captured"],
    ]],
    ['operations/sync.js',[
      ['const selection = bounded ?',"benchmarkTrace('selection-start');const selection = bounded ?"],
      ['const localHashes = localPending',"benchmarkTrace('selection-end');const localHashes = localPending"],
      ['let commit;',"benchmarkTrace('transaction-admission');let commit;"],
      ['await options.store.acknowledge(localHashes);',"benchmarkTrace('receipt-start');await options.store.acknowledge(localHashes);benchmarkTrace('receipt-end');"],
    ]],
    ['git/data-transport.js',[
      ['async fetch() {',"async fetch() {benchmarkTrace('fetch-start');"],
      ['this.acceptedIndex.install(commit, candidate);',"{benchmarkTrace({phase:'candidate-install-start',remaining:this.options.deadline-Date.now()});this.acceptedIndex.install(commit, candidate);benchmarkTrace('candidate-install-end');}"],
      ['if (!this.acceptedIndex) {',"benchmarkTrace(this.acceptedIndex?'cache-hit':'cache-miss');if (!this.acceptedIndex) {"],
      ['const snapshot = this.acceptedIndex.snapshot();',"benchmarkTrace('cache-ready');const snapshot = this.acceptedIndex.snapshot();"],
      ['async commit(artifacts, parent, patch = false) {',"async commit(artifacts, parent, patch = false) {benchmarkTrace('objects-start');"],
      ['async push(commit, parent) {',"async push(commit, parent) {benchmarkTrace('push-start');"],
      ['async closeCache() {',"async closeCache() {benchmarkTrace('cache-close-start');"],
      ['await index?.close();',"await index?.close();benchmarkTrace('cache-close-end');"],
    ]],
    ['storage/accepted-index.js',[
      ["const database = fingerprint(join(root, 'cache/accepted.sqlite'), true);","const database = fingerprint(join(root, 'cache/accepted.sqlite'), true);benchmarkTrace({phase:'index-binding',databaseMatches:manifest.database===database,commitMatches:manifest.state?.commit===commit,digestMatches:manifest.digest===digest(JSON.stringify({state:manifest.state,database})),version:manifest.state?.version});"],
      ["await fs.lstat(join(root, 'cache/accepted.sqlite' + suffix));","await fs.lstat(join(root, 'cache/accepted.sqlite' + suffix));benchmarkTrace({phase:'index-sidefile',suffix});"],
      ['if (contentHash(state.meta) !== state.summary.metaHash',"benchmarkTrace({phase:'index-schema',metaMatches:contentHash(state.meta)===state.summary.metaHash,catalogMatches:catalogHash(state.catalog)===state.meta.catalogHash});if (contentHash(state.meta) !== state.summary.metaHash"],
      ['static async create(root, snapshot) {',"static async create(root, snapshot) {benchmarkTrace('index-create-start');"],
      ['install(commit, extension) {',"install(commit, extension) {benchmarkTrace('index-mutation-start');"],
      ['this.state = { ...this.state, commit, summary: extension.summary, valuation: extension.valuation };',"benchmarkTrace('index-mutation-committed');this.state = { ...this.state, commit, summary: extension.summary, valuation: extension.valuation };"],
      ['static async promote(root, path, state) {',"static async promote(root, path, state) {benchmarkTrace('stage-promotion-start');"],
      ['return (await this.load(root, state.commit));',"benchmarkTrace('stage-promotion-end');return (await this.load(root, state.commit));"],
      ['async close() {',"async close() {benchmarkTrace('accepted-publication-start');"],
      ['if (!this.changed)',"benchmarkTrace({phase:'index-closed',changed:this.changed});if (!this.changed)"],
      ["await atomicFile(join(this.root, 'cache/accepted.json'), { ...body, digest: digest(JSON.stringify(body)) });","await atomicFile(join(this.root, 'cache/accepted.json'), { ...body, digest: digest(JSON.stringify(body)) });benchmarkTrace('accepted-publication-end');"],
    ]],
    ['storage/accepted-stage.js',[
      ['if (owner?.candidateBase) {',"if (owner?.candidateBase) {benchmarkTrace('candidate-recovery-start');"],
      ['base = await AcceptedIndex.load(root, owner.candidateBase);',"benchmarkTrace('candidate-parent-checked');base = await AcceptedIndex.load(root, owner.candidateBase);benchmarkTrace(base?'candidate-base-valid':'candidate-base-missing');"],
      ['const extension = base.extend(records), expected = new Map();',"benchmarkTrace('candidate-records-checked');const extension = base.extend(records), expected = new Map();"],
      ['base.install(owner.commit, extension);',"benchmarkTrace({phase:'candidate-delta-checked',remaining:options.deadline-Date.now()});base.install(owner.commit, extension);"],
      ['if (error instanceof ProtocolError || options.signal.aborted',"benchmarkTrace('candidate-recovery-rejected');if (error instanceof ProtocolError || options.signal.aborted"],
    ]],
  ]as [string,string[][]][]){let bytes=await readFile(join(core,'dist',file),'utf8');for(const [from,to]of replacements){if(!bytes.includes(from))throw Error('missing trace point '+file+': '+from);bytes=bytes.replace(from,to);}await writeFile(join(core,'dist',file),prefix+bytes);}
}
if(process.argv[4]==='trace-stage'){
  if(await readlink(core)!==resolve('packages/core'))throw Error('unexpected fixture runtime');await rm(core);await mkdir(core);
  await cp(resolve('packages/core/dist'),join(core,'dist'),{recursive:true});await cp(resolve('packages/core/package.json'),join(core,'package.json'));await symlink(resolve('node_modules'),join(core,'node_modules'));
  const prefix=`import {appendFileSync as benchmarkAppend} from 'node:fs';const benchmarkTrace=stage=>benchmarkAppend(${JSON.stringify(traceFile)},JSON.stringify({stage,pid:process.pid,ms:performance.now()})+'\\n');\n`;
  for(const [file,replacements]of [
    ['operations/worker-sync.js',[
      ['captured = await collectUsage',"benchmarkTrace('collection-start');captured = await collectUsage"],
      ['const result = await syncUsage',"benchmarkTrace('sync-start');const result = await syncUsage"],
    ]],
    ['storage/accepted-stage.js',[
      ['const end = Math.min(Date.now() + 700, options.deadline - 500)',"benchmarkTrace({phase:'stage-start',remaining:options.deadline-Date.now(),progress:progress.phase,cursor:progress.lastPath});const end = Math.min(Date.now() + 700, options.deadline - 500)"],
      ['async function save() {',"async function save() {benchmarkTrace({phase:'save-start',remaining:options.deadline-Date.now(),progress:progress.phase,cursor:progress.lastPath});"],
      ['digest: digest({ owner, progress, database }),\n        });',"digest: digest({ owner, progress, database }),\n        });benchmarkTrace('save-end');"],
      ['const resumePath = progress.lastPath;',"const resumePath = progress.lastPath;benchmarkTrace('tree-enumeration-start');"],
      ['if (!available() || seen >= max) {',"if (!available() || seen >= max) {benchmarkTrace({phase:'tree-boundary',seen,remaining:options.deadline-Date.now(),cursor:name});"],
      ['const resume = progress.retentionCursor ?? "";',"const resume = progress.retentionCursor ?? '';benchmarkTrace({phase:'retention-start',remaining:options.deadline-Date.now(),cursor:resume});"],
    ]],
  ]as [string,string[][]][]){let bytes=await readFile(join(core,'dist',file),'utf8');for(const [from,to]of replacements){if(!bytes.includes(from))throw Error('missing trace point '+file+': '+from);bytes=bytes.replace(from,to);}await writeFile(join(core,'dist',file),prefix+bytes);}
}
let traceOffset=0;
for(let operation=1;operation<=runs;operation++){
  const start=performance.now(),child=spawnSync(process.execPath,[join(privateDir,'git-hook.cjs'),''],{cwd,input:'refs\n',encoding:'utf8',timeout:3500});
  const state=JSON.parse(await readFile(join(privateDir,'transport.json'),'utf8'));
  const summary=spawnSync('git',['--no-replace-objects','show',`${state.commit}:summary.json`],{cwd,encoding:'utf8'});if(summary.status!==0)throw Error('summary unavailable');
  const stages:Record<string,unknown>={};for(const name of ['index','accepted'])try{const progress=JSON.parse(await readFile(join(privateDir,`cache/${name}-stage.json`),'utf8')).progress;stages[name]=progress?{phase:progress.phase,lastPath:progress.lastPath,copied:progress.copied,reducedUnits:progress.state?.summary.recordedUnits}:'incomplete';}catch{}
  let pending:unknown=null;try{const db=new DatabaseSync(join(privateDir,'cache/index.sqlite'),{readOnly:true});try{pending=db.prepare('SELECT count(*) AS n FROM records WHERE pending=1').get()!.n;}finally{db.close();}}catch{}
  console.log(JSON.stringify({operation,ms:performance.now()-start,status:child.status,diagnostic:child.stderr.trim(),confirmedUnits:JSON.parse(summary.stdout).recordedUnits,pending,stages}));
  if(trace){const bytes=await readFile(traceFile,'utf8').catch(()=>'');console.log(bytes.slice(traceOffset).replaceAll('\\n','\n'));traceOffset=bytes.length;}
}
