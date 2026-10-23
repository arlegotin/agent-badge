import { assertOwnedGitFixture } from '../validation/fixture-root.js';
/** Instrument only a retained synthetic runtime copy, restoring production afterward. */
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, readlink, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { observeProgress } from './observer.js';
import { startFixtureGitDaemon } from '../../packages/testkit/src/git-daemon.js';

const root = await realpath(process.argv[2]), runs = Number(process.argv[3] ?? 3);
if (!(await assertOwnedGitFixture(root))) throw Error('synthetic fixture required');
const cwd = join(root, 'clone-a'), privateDir = join(cwd, '.git/agent-badge');
const declaration = JSON.parse(await readFile(join(cwd, '.agent-badge/config.json'), 'utf8'));
if (declaration.declaredUrl !== 'https://github.com/synthetic/benchmark') throw Error('synthetic fixture required');
const activation = JSON.parse(await readFile(join(privateDir, 'local.json'), 'utf8'));
const core = join(privateDir, 'runtime', activation.lockHash, 'node_modules/@legotin/agent-badge-core');
if (await readlink(core) !== resolve('packages/core')) throw Error('production runtime link required');
const traceFile = join(root, 'stall-trace.jsonl');
const receiver = JSON.parse(await readFile(join(root, 'receiver.json'), 'utf8'));
const daemon = await startFixtureGitDaemon({root, remote: join(root, 'remote.git')}, receiver.port);
async function state() {
  const json = async (path: string) => JSON.parse(await readFile(join(privateDir, path), 'utf8').catch(() => 'null'));
  const accepted = await json('cache/accepted.json');
  return { reconciliation: await json('reconciliation.json'), transport: await json('transport.json'),
    accepted: accepted && { slot: accepted.slot, commit: accepted.state?.commit, database: accepted.database },
    nativeSources: (await readdir(join(root, 'codex/sessions'))).length };
}
const prefix = `import {appendFileSync as benchmarkAppend} from 'node:fs';
const benchmarkTrace=(phase,extra={})=>benchmarkAppend(${JSON.stringify(traceFile)},JSON.stringify({phase,pid:process.pid,ms:performance.now(),...extra})+'\\n');
const benchmarkAsync=(object,name,label)=>{const original=object[name];object[name]=async function(...args){benchmarkTrace(label+'-start');try{return await original.apply(this,args);}finally{benchmarkTrace(label+'-end');}};};
const benchmarkSync=(object,name,label)=>{const original=object[name];object[name]=function(...args){benchmarkTrace(label+'-start');try{return original.apply(this,args);}finally{benchmarkTrace(label+'-end');}};};
`;
async function instrument(file: string, replacements: [string, string][] = [], suffix = '') {
  let bytes = await readFile(join(core, 'dist', file), 'utf8');
  for (const [from, to] of replacements) {
    if (!bytes.includes(from)) throw Error('missing trace point: ' + file + ': ' + from);
    bytes = bytes.replace(from, to);
  }
  await writeFile(join(core, 'dist', file), prefix + bytes + '\n' + suffix);
}
await rm(core);
try {
  await mkdir(core);
  await cp(resolve('packages/core/dist'), join(core, 'dist'), { recursive: true });
  await cp(resolve('packages/core/package.json'), join(core, 'package.json'));
  await symlink(resolve('node_modules'), join(core, 'node_modules'));
  await instrument('operations/worker-sync.js', [
    ['const policy = await loadCapturePolicy', "benchmarkTrace('policy-start');const policy = await loadCapturePolicy"],
    ['captured = await collectUsage', "benchmarkTrace('collection-start');captured = await collectUsage"],
    ['if (input.synchronize === false)', "benchmarkTrace('collection-end');if (input.synchronize === false)"],
    ['const result = await syncUsage', "benchmarkTrace('sync-start',{remaining:context.deadline-Date.now()});const result = await syncUsage"],
    ['const collected = captured', "benchmarkTrace('sync-end');const collected = captured"],
  ]);
  await instrument('storage/store.js', [], `for(const name of ['projectionSources','checkpointCandidate','relatedJournal','commitBatch','pendingHashes','pendingCount','pendingBatch','flushDerivedIndex','acknowledge','recordAcceptedLedger'])benchmarkAsync(Store.prototype,name,'store-'+name);`);
  await instrument('storage/index-cache.js', [], `benchmarkAsync(StoreIndex,'open','local-index-open');`);
  await instrument('collection/collect.js', [
    ['const discovery = await discoverSources({', "benchmarkTrace('discovery-start');const discovery = await discoverSources({"],
    ['result.sourceOutcomes.push(...discovery.outcomes);', "benchmarkTrace('discovery-end',{sources:discovery.sources.length});result.sourceOutcomes.push(...discovery.outcomes);"],
    ['source = await resolveSourceEpoch(source, options.signal);', "benchmarkTrace('source-start',{index,position});source = await resolveSourceEpoch(source, options.signal);"],
  ]);
  await instrument('storage/accepted-index.js', [
    ['function requireGenerationBudget(budget) {', "function requireGenerationBudget(budget) {benchmarkTrace('generation-admission',{remaining:budget?.deadline-Date.now()});"],
  ], `benchmarkAsync(AcceptedIndex,'load','accepted-load');benchmarkSync(AcceptedIndex.prototype,'extend','candidate-regeneration');benchmarkAsync(AcceptedIndex.prototype,'install','generation-install');benchmarkAsync(AcceptedIndex.prototype,'close','accepted-close');`);
  await instrument('storage/accepted-stage.js', [
    ['if (owner?.candidateBase) {', "if (owner?.candidateBase) {benchmarkTrace('candidate-recovery-start',{remaining:options.deadline-Date.now()});"],
    ['const extension = base.extend(records), expected = new Map();', "benchmarkTrace('candidate-records-validated');const extension = base.extend(records), expected = new Map();"],
    ['if (options.deadline - Date.now() < 500)', "benchmarkTrace('candidate-delta-validated',{remaining:options.deadline-Date.now()});if (options.deadline - Date.now() < 500)"],
  ]);
  await instrument('git/data-transport.js', [], `for(const name of ['verifyRoute','remoteTip','fetch','assertDescendant','anchor','commitExtension','push'])benchmarkAsync(DataTransport.prototype,name,'transport-'+name);`);
  await instrument('git/process.js', [
    ['export async function runGit(args, options) {', 'async function benchmarkRunGit(args, options) {'],
    ['function diagnostic(value, limit) {', "function diagnostic(value, limit) {if(value)benchmarkTrace('synthetic-stderr',{stderr:value.slice(0,4096)});"],
  ], `export async function runGit(args,options){const command=args.find(value=>['rev-parse','show','diff-tree','fetch','ls-remote','cat-file','merge-base','update-ref','config','worktree','rev-list','push'].includes(value))??'other';benchmarkTrace('git-'+command+'-start');try{const result=await benchmarkRunGit(args,options);if(command==='push')benchmarkTrace('push-result',{status:result.status,exitCode:result.exitCode,stderr:result.stderr?.slice(0,2048),stdout:result.stdout?.slice(0,2048)});return result;}finally{benchmarkTrace('git-'+command+'-end');}}`);
  let offset = (await readFile(traceFile, 'utf8').catch(() => '')).length;
  for (let operation = 1; operation <= runs; operation++) {
    console.log(JSON.stringify({phase:'before',operation,...await state()}));
    const start = performance.now();
    const child = spawnSync(process.execPath, [join(privateDir, 'git-hook.cjs'), ''], { cwd, input: 'refs\n', encoding: 'utf8', timeout: 3500 });
    const ms = performance.now() - start;
    const progress = await observeProgress(privateDir, async commit => {
      const result = spawnSync('git', ['--no-replace-objects', 'show', `${commit}:summary.json`], { cwd, encoding: 'utf8' });
      if (result.status !== 0) throw Error('summary unavailable'); return result.stdout;
    });
    console.log(JSON.stringify({ operation, ms, status: child.status, diagnostic: child.stderr.trim(), ...progress, ...await state() }));
    const bytes = await readFile(traceFile, 'utf8'); console.log(bytes.slice(offset)); offset = bytes.length;
  }
} finally {
  await rm(core, { recursive: true, force: true });
  await symlink(resolve('packages/core'), core);
  await daemon.stop();
}
