import { afterEach, expect, test, vi } from "vitest";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runStorageFixtureProcess } from "@agent-badge/testkit";
import {
  createBareRemoteFixture,
  protocolObservationFixture,
  snapshotUserCheckout,
} from "@agent-badge/testkit";
import type { GitFixture } from "@agent-badge/testkit";
import { resolveRepository } from "../git/context.js";
import { bindRemote } from "../git/remote-binding.js";
import { openStore } from "../storage/store.js";
import { sanitizeObservation } from "../ledger/sanitize.js";
import { recordHash } from "../ledger/canonical-json.js";
import { catalogHash, defaultCatalog } from "../pricing/catalog.js";
import * as gitProcess from "../git/process.js";
import { codexRollout } from "@agent-badge/testkit";
import { createCodexAdapter } from "../providers/codex/adapter.js";
import { DataTransport } from "../git/data-transport.js";
import { renderArtifacts } from "../render/summary.js";
import { reduceLedger } from "../ledger/reduce.js";
import { commitFixtureTree } from "@agent-badge/testkit";
import { syncUsage } from "./sync.js";
import { runRepositoryOperation } from './runner.js';
import { createOperationBudget } from './budget.js';
import { readStoreSnapshot } from '../storage/store.js';
import { loadCapturePolicy } from './capture-policy.js';
import { AcceptedIndex } from '../storage/accepted-index.js';

const repositoryId = "12345678-1234-4234-8234-123456789abc";
const policy = {
  schemaVersion: 1 as const,
  repositoryId,
  normalizationVersion: 1 as const,
  discovery: "auto" as const,
  disabledProviders: [],
  badge: { label: "Shared label", metric: "tokens" as const },
};
const meta = {
  schemaVersion: 2 as const,
  protocolVersion: 1 as const,
  repositoryId,
  normalizationVersion: 1 as const,
  catalogVersion: 1,
  catalogHash: catalogHash(defaultCatalog),
  policy,
};
const fixtures: GitFixture[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(fixtures.splice(0).map((f) => f.cleanup()));
});
async function fixture() {
  const f = await createBareRemoteFixture();
  fixtures.push(f);
  return f;
}
test('a published candidate survives a lost response without replaying accepted history or acknowledging before confirmation',async()=>{
  const f=await fixture(),a=await client(f);await syncUsage({...a,initialize:{meta,catalog:defaultCatalog}});
  const prior=(await a.store.transportState())!.commit;
  const control={schemaVersion:2 as const,normalizationVersion:1 as const,repositoryId,kind:'exclude' as const,targetUnitKey:a.record.unitKey,supersedes:[]};await a.store.commitControl(control);
  const push=DataTransport.prototype.push;
  const lost=vi.spyOn(DataTransport.prototype,'push').mockImplementation(async function(this:DataTransport,...args){await push.apply(this,args);throw Error('synthetic lost response after remote acceptance');});
  const first=await syncUsage({...a,snapshotMode:'summary'});expect(first.status).toBe('queued');expect(first.acknowledgedHashes).toEqual([]);expect(await a.store.pendingCount()).toBe(1);expect((await a.store.transportState())!.commit).toBe(prior);lost.mockRestore();
  const promotion=vi.spyOn(AcceptedIndex,'promote');
  const store=await openStore(a.repository),recovered=await syncUsage({...a,store,snapshotMode:'summary',deadline:Date.now()+10000,signal:AbortSignal.timeout(10000)});
  expect(recovered.acknowledgedHashes).toEqual([recordHash(control)]);expect(await store.pendingCount()).toBe(0);expect(promotion).not.toHaveBeenCalled();
});
test.each(['before-push','corrupt-stage','missing-base','advanced','advanced-removal'])('candidate recovery handles %s without using unconfirmed membership',async fault=>{
  const f=await fixture(),a=await client(f);await syncUsage({...a,initialize:{meta,catalog:defaultCatalog}});
  const control={schemaVersion:2 as const,normalizationVersion:1 as const,repositoryId,kind:'exclude' as const,targetUnitKey:a.record.unitKey,supersedes:[]};await a.store.commitControl(control);
  const push=DataTransport.prototype.push;let candidate='';const lost=vi.spyOn(DataTransport.prototype,'push').mockImplementation(async function(this:DataTransport,...args){candidate=args[0];if(fault!=='before-push')await push.apply(this,args);throw Error('synthetic interrupted send');});
  expect((await syncUsage({...a,snapshotMode:'summary'})).acknowledgedHashes).toEqual([]);lost.mockRestore();expect(await a.store.pendingCount()).toBe(1);
  if(fault==='corrupt-stage')await writeFile(join(a.repository.privateDir,'cache/accepted-stage.sqlite'),'corrupt');
  if(fault==='missing-base')await rm(join(a.repository.privateDir,'cache/accepted.json'));
  if(fault==='before-push')await a.store.commitControl({...control,kind:'include',supersedes:[recordHash(control)]});
  if(fault.startsWith('advanced')){
    const records=fault==='advanced-removal'?[a.record]:[a.record,control,{...control,targetUnitKey:'f'.repeat(64)}];
    const artifacts=renderArtifacts(reduceLedger(records,meta),meta,defaultCatalog);
    const next=await commitFixtureTree(f,a.repository.worktreeRoot,[...artifacts].map(([path,bytes])=>({path,mode:'100644',content:Buffer.from(bytes).toString('utf8')})),candidate);
    await f.git(a.repository.worktreeRoot,['-c','core.hooksPath=/dev/null','push',f.remote,`${next}:refs/heads/agent-badge/data`]);
  }
  const store=await openStore(a.repository);let result;
  for(let n=0;n<8;n++){result=await syncUsage({...a,store,snapshotMode:'summary',deadline:Date.now()+10000,signal:AbortSignal.timeout(10000)});if(fault==='advanced-removal'||!(await store.pendingCount()))break;}
  if(fault==='advanced-removal'){expect(result!.status).toBe('unsupported');expect(result!.acknowledgedHashes).toEqual([]);expect(await store.pendingCount()).toBe(1);}
  else{expect(await store.pendingCount()).toBe(0);const full=await syncUsage({...a,store});expect(full.accepted!.ledger.excludedUnits).toBe(fault==='before-push'?0:1);}
},30000);
test.each(['before','after','after-confirmation'])('real death %s candidate push retains retryable durable intent',async phase=>{
  const f=await fixture(),a=await client(f);await syncUsage({...a,initialize:{meta,catalog:defaultCatalog}});
  const control={schemaVersion:2 as const,normalizationVersion:1 as const,repositoryId,kind:'exclude' as const,targetUnitKey:a.record.unitKey,supersedes:[]};await a.store.commitControl(control);
  const input=join(f.root,'candidate-input.json');await writeFile(input,JSON.stringify({repository:a.repository,binding:a.binding,prior:(await a.store.transportState())!.commit}));
  const module=(name:string)=>JSON.stringify(pathToFileURL(join(process.cwd(),'packages/core/src',name+'.ts')).href);
  const child=await runStorageFixtureProcess(process.cwd(),`
    const fs=await import('node:fs/promises');const {repository,binding,prior}=JSON.parse(await fs.readFile(${JSON.stringify(input)},'utf8'));
    const {openStore}=await import(${module('storage/store')});const {syncUsage}=await import(${module('operations/sync')});const {DataTransport}=await import(${module('git/data-transport')});
    ${phase==='after-confirmation'?`const anchor=DataTransport.prototype.anchor;DataTransport.prototype.anchor=async function(commit){if(commit!==prior)process.kill(process.pid,'SIGKILL');return anchor.call(this,commit);};`:`const push=DataTransport.prototype.push;DataTransport.prototype.push=async function(...args){${phase==='after'?'await push.apply(this,args);':''}process.kill(process.pid,'SIGKILL');};`}
    await syncUsage({repository,binding,store:await openStore(repository,{processNamespace:async()=> 'synthetic'}),collect:'none',snapshotMode:'summary',signal:AbortSignal.timeout(10000),deadline:Date.now()+10000});
  `);
  expect(child.signal).toBe('SIGKILL');expect(child.stderr).toBe('');
  const store=await openStore(a.repository,{processNamespace:async()=> 'synthetic'});expect(await store.pendingCount()).toBe(1);
  const promotion=vi.spyOn(AcceptedIndex,'promote');const result=await syncUsage({...a,store,snapshotMode:'summary',signal:AbortSignal.timeout(10000),deadline:Date.now()+10000});
  expect(result.acknowledgedHashes).toEqual([recordHash(control)]);expect(await store.pendingCount()).toBe(0);expect(promotion).not.toHaveBeenCalled();
},30000);
test('advanced current stage survives death after accepted-anchor handoff and before cache publication',async()=>{
  const f=await fixture(),a=await client(f);await syncUsage({...a,initialize:{meta,catalog:defaultCatalog}});
  const prior=(await a.store.transportState())!.commit!;
  const control={schemaVersion:2 as const,normalizationVersion:1 as const,repositoryId,kind:'exclude' as const,targetUnitKey:a.record.unitKey,supersedes:[]};await a.store.commitControl(control);
  const input=join(f.root,'handoff-input.json');await writeFile(input,JSON.stringify({repository:a.repository,binding:a.binding,prior}));
  const module=(name:string)=>JSON.stringify(pathToFileURL(join(process.cwd(),'packages/core/src',name+'.ts')).href);
  const header=`const fs=await import('node:fs/promises');const {repository,binding,prior}=JSON.parse(await fs.readFile(${JSON.stringify(input)},'utf8'));const {openStore}=await import(${module('storage/store')});const {syncUsage}=await import(${module('operations/sync')});const {DataTransport}=await import(${module('git/data-transport')});const {AcceptedIndex}=await import(${module('storage/accepted-index')});`;
  const run=`await syncUsage({repository,binding,store:await openStore(repository,{processNamespace:async()=> 'synthetic'}),collect:'none',snapshotMode:'summary',signal:AbortSignal.timeout(10000),deadline:Date.now()+10000});`;
  const first=await runStorageFixtureProcess(process.cwd(),header+`const anchor=DataTransport.prototype.anchor;DataTransport.prototype.anchor=async function(commit){if(commit!==prior)process.kill(process.pid,'SIGKILL');return anchor.call(this,commit);};`+run);
  expect(first.signal).toBe('SIGKILL');expect(first.stderr).toBe('');
  const cached=(await AcceptedIndex.loadCurrent(a.repository.privateDir))!,candidate=cached.commit;expect(candidate).not.toBe(prior);await cached.close();
  const records=[a.record,control,{...control,targetUnitKey:'a'.repeat(64)}],artifacts=renderArtifacts(reduceLedger(records,meta),meta,defaultCatalog);
  const current=await commitFixtureTree(f,a.repository.worktreeRoot,[...artifacts].map(([path,bytes])=>({path,mode:'100644',content:Buffer.from(bytes).toString('utf8')})),candidate);
  await f.git(a.repository.worktreeRoot,['-c','core.hooksPath=/dev/null','push',f.remote,`${current}:refs/heads/agent-badge/data`]);
  const second=await runStorageFixtureProcess(process.cwd(),header+`AcceptedIndex.promote=async()=>{process.kill(process.pid,'SIGKILL');};`+run);
  expect(second.signal).toBe('SIGKILL');expect(second.stderr).toBe('');
  const store=await openStore(a.repository,{processNamespace:async()=> 'synthetic'});
  expect((await store.transportState())!.commit).toBe(current);expect(await store.pendingCount()).toBe(1);
  expect(JSON.parse(await readFile(join(a.repository.privateDir,'cache/accepted-stage.json'),'utf8')).progress.phase).toBe('retention');
  expect(await AcceptedIndex.load(a.repository.privateDir,current)).toBeNull();
  for(let n=0;n<3&&(await store.pendingCount());n++)await syncUsage({...a,store,snapshotMode:'summary',signal:AbortSignal.timeout(10000),deadline:Date.now()+10000});
  expect(await store.pendingCount()).toBe(0);const final=(await AcceptedIndex.load(a.repository.privateDir,current))!;expect(final.snapshot().artifacts).toEqual(artifacts);await final.close();
},30000);
test('automatic summary checks current remote authority but avoids unchanged accepted-tree replay', async () => {
  const f=await fixture(),a=await client(f);
  const seeded=await syncUsage({...a,initialize:{meta,catalog:defaultCatalog}});
  expect(seeded.status).toBe('synced');
  const fetch=vi.spyOn(DataTransport.prototype,'fetch').mockRejectedValue(new Error('Unexpected historical replay'));
  const unchanged=await syncUsage({...a,snapshotMode:'summary'});
  expect(unchanged.status).toBe('unchanged');expect(unchanged.confirmedCommit).toBe(seeded.confirmedCommit);
  expect(unchanged.accepted).toBeNull();expect(unchanged.acknowledgedHashes).toEqual([]);expect(fetch).not.toHaveBeenCalled();
  await f.git(f.remote,['update-ref','-d','refs/heads/agent-badge/data']);
  expect((await syncUsage({...a,snapshotMode:'summary'})).status).toBe('conflict');
});
test('controlled remote conflicts exhaust the bounded retry budget without acknowledging local intent',async()=>{
  const f=await fixture(),a=await client(f);await syncUsage({...a,initialize:{meta,catalog:defaultCatalog}});
  const control={schemaVersion:2 as const,normalizationVersion:1 as const,repositoryId,kind:'exclude' as const,targetUnitKey:a.record.unitKey,supersedes:[]};await a.store.commitControl(control);
  const competing:typeof control[]=[];
  const push=vi.spyOn(DataTransport.prototype,'push').mockImplementation(async(_candidate,parent)=>{
    competing.push({...control,targetUnitKey:String(competing.length+1).padStart(64,'0')});const artifacts=renderArtifacts(reduceLedger([a.record,...competing],meta),meta,defaultCatalog);
    const commit=await commitFixtureTree(f,a.repository.worktreeRoot,[...artifacts].map(([path,bytes])=>({path,mode:'100644',content:Buffer.from(bytes).toString('utf8')})),parent!);
    await f.git(a.repository.worktreeRoot,['-c','core.hooksPath=/dev/null','push',f.remote,`${commit}:refs/heads/agent-badge/data`]);
  });
  const result=await syncUsage({...a,maxRetries:3,deadline:Date.now()+20000,signal:AbortSignal.timeout(20000)});
  expect(push).toHaveBeenCalledTimes(4);expect(result.status).toBe('queued');expect(result.acknowledgedHashes).toEqual([]);expect(await a.store.pending()).toEqual([control]);
},30000);
test('capture policy reuses verified accepted metadata while checking the local anchor and falls back on cache mismatch',async()=>{
  const f=await fixture(),a=await client(f);const seeded=await syncUsage({...a,initialize:{meta,catalog:defaultCatalog}});
  const calls=vi.spyOn(gitProcess,'runGit');
  const load=()=>a.store.withLock(a.signal,()=>loadCapturePolicy(a.repository,a.store,policy,repositoryId,a));
  expect(await load()).toEqual(policy);
  expect(calls.mock.calls.map(([args])=>args[1])).toEqual(['rev-parse']);
  calls.mockClear();await writeFile(join(a.repository.privateDir,'cache/accepted.json'),'{}');
  expect(await load()).toEqual(policy);expect(calls.mock.calls.map(([args])=>args[1])).toEqual(['rev-parse','ls-tree','cat-file']);
  await f.git(a.repository.worktreeRoot,['update-ref','-d',`refs/agent-badge/accepted/${seeded.confirmedCommit}`]);
  await expect(load()).rejects.toThrow('store-io'); // Owning lease sanitizes callback errors.
});
test('automatic append uses validated accepted index and confirms source-free controls without historical blob replay',async()=>{
  const f=await fixture(),a=await client(f);await syncUsage({...a,initialize:{meta,catalog:defaultCatalog}});
  const control={schemaVersion:2 as const,normalizationVersion:1 as const,repositoryId,kind:'exclude' as const,targetUnitKey:a.record.unitKey,supersedes:[]};
  await a.store.commitControl(control);
  const calls=vi.spyOn(gitProcess,'runGit');
  const appended=await syncUsage({...a,snapshotMode:'summary'});
  expect(appended.status).toBe('synced');expect(await a.store.pending()).toEqual([]);
  expect(calls.mock.calls.filter(([args])=>args.includes('cat-file'))).toHaveLength(0);
  calls.mockRestore();
  const full=await syncUsage(a);expect(full.accepted!.artifacts).toEqual(renderArtifacts(reduceLedger([a.record,control],meta),meta,defaultCatalog));
});
test('automatic local backlog confirms bounded complete unit groups and drains after a lost response and restart',async()=>{
  const f=await fixture(),a=await client(f);await syncUsage({...a,initialize:{meta,catalog:defaultCatalog}});
  for(let i=0;i<140;i++)await a.store.commitControl({schemaVersion:2,normalizationVersion:1,repositoryId,kind:'exclude',targetUnitKey:i.toString(16).padStart(64,'0'),supersedes:[]});
  const excluded={schemaVersion:2 as const,normalizationVersion:1 as const,repositoryId,kind:'exclude' as const,targetUnitKey:a.record.unitKey,supersedes:[]};
  await a.store.commitControl(excluded);await a.store.commitControl({...excluded,kind:'include',supersedes:[recordHash(excluded)]});
  const original=(await a.store.journal())[0],replacement={...a.record,meters:a.record.meters.map(meter=>({...meter,model:null}))};
  await a.store.commitBatch(original.source,{source:original.source,observations:original.observations,outcome:original.outcome,diagnostics:original.diagnostics,nextCheckpoint:original.checkpoint},[replacement]);
  await a.store.commitControl({...excluded,kind:'correct',replacedObservationHashes:[recordHash(a.record)],replacementObservationHashes:[recordHash(replacement)]});
  const expected=await a.store.pending(),push=DataTransport.prototype.push;let lost=false;
  const sending=vi.spyOn(DataTransport.prototype,'push').mockImplementation(async function(this:DataTransport,...args){await push.apply(this,args);if(!lost){lost=true;throw new Error('synthetic lost response');}});
  expect((await syncUsage({...a,snapshotMode:'summary'})).status).toBe('queued');expect(await a.store.pendingCount()).toBe(144);sending.mockRestore();
  const restarted=await openStore(a.repository),first=await syncUsage({...a,store:restarted,snapshotMode:'summary'});
  expect(first.status).toBe('queued');expect(first.acknowledgedHashes.length).toBeGreaterThan(0);expect(first.acknowledgedHashes.length).toBeLessThanOrEqual(128);
  expect(first.remainingPendingCount).toBe(144-first.acknowledgedHashes.length);
  const last=await syncUsage({...a,store:restarted,snapshotMode:'summary'});expect(last.status).toBe('synced');expect(await restarted.pendingCount()).toBe(0);
  const full=await syncUsage({...a,store:restarted});expect(full.accepted!.artifacts).toEqual(renderArtifacts(reduceLedger([a.record,...expected],meta),meta,defaultCatalog));
},30000);
test('oversized automatic unit groups defer explicitly while unrelated units confirm and manual sync completes',async()=>{
  const f=await fixture(),a=await client(f);await syncUsage({...a,initialize:{meta,catalog:defaultCatalog}});
  let previous:string|undefined;
  for(let i=0;i<129;i++){const control={schemaVersion:2 as const,normalizationVersion:1 as const,repositoryId,kind:'exclude' as const,targetUnitKey:a.record.unitKey,supersedes:previous?[previous]:[]};await a.store.commitControl(control);previous=recordHash(control);}
  const unrelated={schemaVersion:2 as const,normalizationVersion:1 as const,repositoryId,kind:'exclude' as const,targetUnitKey:'f'.repeat(64),supersedes:[]};await a.store.commitControl(unrelated);
  const automatic=await syncUsage({...a,snapshotMode:'summary'});
  expect(automatic).toMatchObject({status:'queued',deferredUnitCount:1,remainingPendingCount:129,acknowledgedHashes:[recordHash(unrelated)]});
  expect((await syncUsage({...a,snapshotMode:'summary'}))).toMatchObject({status:'queued',deferredUnitCount:1,remainingPendingCount:129,acknowledgedHashes:[]});
  expect((await syncUsage(a)).status).toBe('synced');expect(await a.store.pendingCount()).toBe(0);
},30000);
test('automatic accepted-cache promotion queues before new publication and the next call advances',async()=>{
  const f=await fixture(),a=await client(f);await syncUsage({...a,initialize:{meta,catalog:defaultCatalog}});
  const control={schemaVersion:2 as const,normalizationVersion:1 as const,repositoryId,kind:'exclude' as const,targetUnitKey:a.record.unitKey,supersedes:[]};await a.store.commitControl(control);
  await rm(join(a.repository.privateDir,'cache/accepted.sqlite'));await rm(join(a.repository.privateDir,'cache/accepted.json'));
  const writes=vi.spyOn(DataTransport.prototype,'commitExtension');
  const rebuilt=await syncUsage({...a,snapshotMode:'summary'});expect(rebuilt.status).toBe('queued');expect(writes).not.toHaveBeenCalled();expect(await a.store.pendingCount()).toBe(1);
  const cache=await AcceptedIndex.load(a.repository.privateDir,rebuilt.confirmedCommit!);expect(cache).not.toBeNull();await cache!.close();
  const next=await syncUsage({...a,snapshotMode:'summary'});expect(next.status).toBe('synced');expect(await a.store.pendingCount()).toBe(0);expect(writes).toHaveBeenCalledTimes(1);
},30000);

test('mixed accepted and new pending records recover confirmed receipts before another transport attempt',async()=>{
  const f=await fixture(),a=await client(f),push=DataTransport.prototype.push;
  const lost=vi.spyOn(DataTransport.prototype,'push').mockImplementation(async function(this:DataTransport,...args){await push.apply(this,args);throw Error('synthetic lost response');});
  expect((await syncUsage({...a,initialize:{meta,catalog:defaultCatalog}})).status).toBe('queued');lost.mockRestore();
  await a.store.commitControl({schemaVersion:2,normalizationVersion:1,repositoryId,kind:'exclude',targetUnitKey:'e'.repeat(64),supersedes:[]});
  // Materialize a complete accepted generation without acknowledging local usage.
  await a.store.withLock(a.signal,async()=>{const t=await DataTransport.open({...a,indexMode:'full'});try{await t.fetch();}finally{await t.closeCache();await t.close();}});
  const writes=vi.spyOn(DataTransport.prototype,'commitExtension').mockRejectedValue(Error('new send unavailable'));
  const recovered=await syncUsage({...a,snapshotMode:'summary'});
  expect(recovered).toMatchObject({status:'queued',acknowledgedHashes:[recordHash(a.record)],remainingPendingCount:1});expect(writes).not.toHaveBeenCalled();expect(await a.store.pendingCount()).toBe(1);
  writes.mockRestore();expect((await syncUsage({...a,snapshotMode:'summary'})).status).toBe('synced');expect(await a.store.pendingCount()).toBe(0);
},30000);
test('deadline immediately after complete cache promotion preserves verified recovery for the next invocation',async()=>{
  const f=await fixture(),a=await client(f),seeded=await syncUsage({...a,initialize:{meta,catalog:defaultCatalog}});
  await a.store.commitControl({schemaVersion:2,normalizationVersion:1,repositoryId,kind:'exclude',targetUnitKey:a.record.unitKey,supersedes:[]});
  await rm(join(a.repository.privateDir,'cache/accepted.sqlite'));await rm(join(a.repository.privateDir,'cache/accepted.json'));
  const controller=new AbortController(),promote=AcceptedIndex.promote;
  const interrupted=vi.spyOn(AcceptedIndex,'promote').mockImplementation(async(...args)=>{const index=await promote.apply(AcceptedIndex,args);controller.abort();return index;});
  const result=await syncUsage({...a,snapshotMode:'summary',signal:controller.signal});expect(result.status).toBe('queued');expect(result.acknowledgedHashes).toEqual([]);interrupted.mockRestore();
  const cache=await AcceptedIndex.load(a.repository.privateDir,seeded.confirmedCommit!);expect(cache).not.toBeNull();await cache!.close();expect(await a.store.pendingCount()).toBe(1);
  expect((await syncUsage({...a,snapshotMode:'summary'})).status).toBe('synced');expect(await a.store.pendingCount()).toBe(0);
},30000);
async function client(f: GitFixture, cwd = f.clones[0], key = "first") {
  const repository = await resolveRepository(cwd);
  const store = await openStore(repository, {
    processNamespace: async () => "synthetic",
  });
  const binding = await bindRemote(repository, {
    repositoryId,
    declaredUrl: f.remote,
    target: "origin",
  });
  if (binding.status !== "bound") throw Error("fixture");
  const observation = protocolObservationFixture();
  observation.nativeUnitId = key;
  observation.nativeCoverageId = key;
  const source = {
    provider: "codex" as const,
    root: "/synthetic",
    schema: observation.source.sourceSchema,
    instanceKey: observation.source.instanceKey,
    sourceIdentity: observation.source.sourceIdentity,
    generation: observation.source.generation,
    readerVersion: "1",
  };
  const record = sanitizeObservation(observation, policy);
  await store.commitBatch(
    source,
    {
      source,
      observations: [observation],
      outcome: "complete",
      diagnostics: [],
      nextCheckpoint: {
        schemaVersion: 1,
        provider: "codex",
        instanceKey: source.instanceKey,
        sourceIdentity: source.sourceIdentity,
        sourceGeneration: source.generation,
        sourceSchema: source.schema,
        readerVersion: "1",
        normalizationVersion: 1,
        repositoryId,
        attributionPolicyHash: "a".repeat(64),
        continuation: null,
        cursor: {
          offset: 1,
          size: 1,
          prefixHash: "b".repeat(64),
          incompleteTail: "",
        },
      },
    },
    [record]
  );
  return {
    repository,
    store,
    binding,
    record,
    signal: AbortSignal.timeout(20000),
    deadline: Date.now() + 20000,
    collect: "none" as const,
  };
}
test("explicit initialization syncs only public records, confirms inclusion, and replays without a new commit", async () => {
  const f = await fixture(),
    c = await client(f);
  const before = await snapshotUserCheckout(c.repository.worktreeRoot);
  const result = await syncUsage({
    ...c,
    initialize: { meta, catalog: defaultCatalog },
  });
  expect(result.status).toBe("synced");
  expect(result.acknowledgedHashes).toEqual([recordHash(c.record)]);
  expect(await c.store.pending()).toEqual([]);
  expect(result.accepted.meta.policy.badge.label).toBe("Shared label");
  expect(await snapshotUserCheckout(c.repository.worktreeRoot)).toEqual(before);
  const second = await syncUsage(c);
  expect(second.status).toBe("unchanged");
  expect(second.confirmedCommit).toBe(result.confirmedCommit);
  const commit = await f.git(f.remote, [
    "show",
    "-s",
    "--format=%an|%ae|%cn|%ce|%B",
    result.confirmedCommit,
  ]);
  expect(commit).toBe(
    "agent-badge bot|agent-badge@example.invalid|agent-badge bot|agent-badge@example.invalid|Update agent-badge usage\n\n"
  );
  const publicTree = await f.git(f.remote, [
    "ls-tree",
    "-r",
    "--name-only",
    result.confirmedCommit,
  ]);
  expect(publicTree).not.toContain("synthetic");
});
test("three concurrent clones merge immutable union across initial creation and stale writers", async () => {
  const f = await fixture();
  const third = join(f.root, "clone-c");
  await f.git(f.root, ["clone", f.remote, third]);
  const clients = await Promise.all([
    client(f, f.clones[0], "one"),
    client(f, f.clones[1], "two"),
    client(f, third, "three"),
  ]);
  const results = await Promise.all(
    clients.map((c) =>
      syncUsage({
        ...c,
        initialize: { meta, catalog: defaultCatalog },
        maxRetries: 3,
      })
    )
  );
  expect(results.map((r) => r.status)).toEqual(["synced", "synced", "synced"]);
  const last = await syncUsage(clients[0]);
  expect(last.accepted.ledger.recordedUnits).toBe(3);
  expect(last.accepted.ledger.knownTokens).toBe("420");
  expect(await Promise.all(clients.map((c) => c.store.pending()))).toEqual([
    [],
    [],
    [],
  ]);
});
test("normal sync cannot seed an absent ref; deletion after accepted state survives restart and refuses reseeding", async () => {
  const f = await fixture(),
    c = await client(f);
  expect((await syncUsage(c)).status).toBe("queued");
  const first = await syncUsage({
    ...c,
    initialize: { meta, catalog: defaultCatalog },
  });
  expect(first.status).toBe("synced");
  await f.git(f.remote, ["update-ref", "-d", "refs/heads/agent-badge/data"]);
  const queued = await client(f, f.clones[0], "after-deletion");
  const beforeJournal = await queued.store.journal();
  const store = await openStore(c.repository);
  expect(
    (
      await syncUsage({
        ...c,
        store,
        initialize: { meta, catalog: defaultCatalog },
      })
    ).status
  ).toBe("conflict");
  expect(await store.pending()).toHaveLength(1);
  expect(await store.journal()).toEqual(beforeJournal);
  expect(
    await f.git(f.remote, ["for-each-ref", "refs/heads/agent-badge/data"])
  ).toBe("");
});
test("push destination metadata authorizes split fetch/push routing and wrong UUID never receives records", async () => {
  const f = await fixture(),
    other = await fixture();
  const a = await client(f);
  await syncUsage({ ...a, initialize: { meta, catalog: defaultCatalog } });
  await f.git(f.clones[1], [
    "remote",
    "set-url",
    "--push",
    "origin",
    other.remote,
  ]);
  const b = await client(f, f.clones[1], "two");
  expect((await syncUsage(b)).status).toBe("queued");
  expect(
    await other.git(other.remote, [
      "for-each-ref",
      "refs/heads/agent-badge/data",
    ])
  ).toBe("");
  expect(await b.store.pending()).toHaveLength(1);
  const wrongId = "d9428888-122b-4aab-9bc4-111111111111";
  const wrong = await bindRemote(a.repository, {
    repositoryId: wrongId,
    declaredUrl: f.remote,
  });
  expect((await syncUsage({ ...a, binding: wrong })).status).toBe("conflict");
});
test("partial staging, detached HEAD, in-progress operations and installed hooks are untouched", async () => {
  const f = await fixture(),
    c = await client(f);
  const cwd = c.repository.worktreeRoot;
  await writeFile(join(cwd, "tracked.txt"), "staged\n");
  await f.git(cwd, ["add", "tracked.txt"]);
  await writeFile(join(cwd, "tracked.txt"), "unstaged\n");
  await f.git(cwd, ["checkout", "--detach"]);
  await mkdir(join(c.repository.gitDir, "rebase-merge"));
  await writeFile(
    join(c.repository.gitDir, "MERGE_HEAD"),
    "1".repeat(40) + "\n"
  );
  const marker = join(f.root, "hook-ran");
  const hook = join(c.repository.commonDir, "hooks", "pre-push");
  await writeFile(hook, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`, {
    mode: 0o755,
  });
  await writeFile(
    join(c.repository.gitDir, "FETCH_HEAD"),
    "synthetic fetch head\n"
  );
  const before = await snapshotUserCheckout(cwd);
  expect(
    (await syncUsage({ ...c, initialize: { meta, catalog: defaultCatalog } }))
      .status
  ).toBe("synced");
  expect(await snapshotUserCheckout(cwd)).toEqual(before);
  expect(await readFile(join(c.repository.gitDir, "FETCH_HEAD"), "utf8")).toBe(
    "synthetic fetch head\n"
  );
  await expect(readFile(marker)).rejects.toThrow();
  expect(await readFile(join(c.repository.gitDir, "MERGE_HEAD"), "utf8")).toBe(
    "1".repeat(40) + "\n"
  );
});
test("routing changes and cancellation queue without acknowledgements", async () => {
  const f = await fixture(),
    c = await client(f),
    other = await fixture();
  await f.git(c.repository.worktreeRoot, [
    "remote",
    "set-url",
    "--push",
    "origin",
    other.remote,
  ]);
  expect(
    (await syncUsage({ ...c, initialize: { meta, catalog: defaultCatalog } }))
      .status
  ).toBe("conflict");
  expect(await c.store.pending()).toHaveLength(1);
  const signal = AbortSignal.abort();
  expect((await syncUsage({ ...c, signal })).status).toBe("queued");
});

test("lost successful push response is confirmed from the real remote before acknowledgment", async () => {
  const f = await fixture(),
    c = await client(f);
  const actual = gitProcess.runGit;
  vi.spyOn(gitProcess, "runGit").mockImplementation(async (args, options) => {
    const result = await actual(args, options);
    return args.includes("push")
      ? { ...result, status: "error", exitCode: 1 }
      : result;
  });
  const result = await syncUsage({
    ...c,
    initialize: { meta, catalog: defaultCatalog },
  });
  expect(result.status).toBe("synced");
  expect(result.acknowledgedHashes).toHaveLength(1);
  expect(await c.store.pending()).toEqual([]);
});
test("accepted push followed by local acknowledgment failure survives restart without a duplicate commit", async () => {
  const f = await fixture(),
    c = await client(f);
  vi.spyOn(c.store, "acknowledge").mockRejectedValueOnce(
    new Error("synthetic crash boundary")
  );
  const first = await syncUsage({
    ...c,
    initialize: { meta, catalog: defaultCatalog },
  });
  expect(first.status).toBe("queued");
  expect(await c.store.pending()).toHaveLength(1);
  const recovered = await syncUsage({
    ...c,
    store: await openStore(c.repository),
  });
  expect(recovered.status).toBe("unchanged");
  expect(recovered.confirmedCommit).toBe(first.confirmedCommit);
  expect(recovered.acknowledgedHashes).toHaveLength(1);
});
test("valid-looking remote rewind cannot discard previously acknowledged history", async () => {
  const f = await fixture(),
    a = await client(f),
    b = await client(f, f.clones[1], "second");
  const first = await syncUsage({
    ...a,
    initialize: { meta, catalog: defaultCatalog },
  });
  await syncUsage(b);
  const latest = await syncUsage(a);
  expect(latest.accepted!.ledger.recordedUnits).toBe(2);
  await f.git(f.remote, [
    "update-ref",
    "refs/heads/agent-badge/data",
    first.confirmedCommit!,
  ]);
  const result = await syncUsage({
    ...a,
    store: await openStore(a.repository),
  });
  expect(result.status).toBe("conflict");
  expect(result.acknowledgedHashes).toEqual([]);
  expect(result.confirmedCommit).toBeNull();
  expect(
    (await f.git(f.remote, ["rev-parse", "refs/heads/agent-badge/data"])).trim()
  ).toBe(first.confirmedCommit);
},30000);
test("existing malformed ref leaves durable presence evidence after deletion", async () => {
  const f = await fixture(),
    c = await client(f);
  await f.git(f.remote, [
    "update-ref",
    "refs/heads/agent-badge/data",
    await f
      .git(f.remote, ["rev-parse", "refs/heads/main"])
      .then((s) => s.trim()),
  ]);
  expect((await syncUsage(c)).status).toBe("unsupported");
  await f.git(f.remote, ["update-ref", "-d", "refs/heads/agent-badge/data"]);
  expect(
    (
      await syncUsage({
        ...c,
        store: await openStore(c.repository),
        initialize: { meta, catalog: defaultCatalog },
      })
    ).status
  ).toBe("conflict");
  expect(await c.store.pending()).toHaveLength(1);
});
test("unavailable signing queues and never bypasses required signing policy", async () => {
  const f = await fixture(),
    c = await client(f);
  await f.git(c.repository.worktreeRoot, ["config", "commit.gpgSign", "true"]);
  await f.git(c.repository.worktreeRoot, [
    "config",
    "gpg.program",
    "/usr/bin/false",
  ]);
  expect(
    (await syncUsage({ ...c, initialize: { meta, catalog: defaultCatalog } }))
      .status
  ).toBe("queued");
  expect(await c.store.pending()).toHaveLength(1);
  expect(
    await f.git(f.remote, ["for-each-ref", "refs/heads/agent-badge/data"])
  ).toBe("");
});
test("accepted remote policy/catalog remain authoritative when stale bootstrap configuration is supplied", async () => {
  const f = await fixture(),
    a = await client(f),
    b = await client(f, f.clones[1], "second");
  await syncUsage({ ...a, initialize: { meta, catalog: defaultCatalog } });
  const stale = {
    ...meta,
    policy: {
      ...policy,
      badge: { label: "Stale code label", metric: "tokens" as const },
    },
  };
  const result = await syncUsage({
    ...b,
    initialize: { meta: stale, catalog: { ...defaultCatalog, version: 2 } },
  });
  expect(result.status).toBe("synced");
  expect(result.accepted!.meta.policy.badge.label).toBe("Shared label");
  expect(result.accepted!.catalog.version).toBe(1);
});
test("source-to-data-branch collection uses the accepted repository policy and sanitized native receipts", async () => {
  const f = await fixture(),
    c = await client(f);
  await c.store.acknowledge([recordHash(c.record)]);
  const home = join(f.root, "synthetic-codex");
  await mkdir(join(home, "sessions"), { recursive: true });
  await writeFile(
    join(home, "sessions", "receipt.jsonl"),
    codexRollout({ single: true }).replaceAll(
      "/synthetic/repo",
      c.repository.worktreeRoot
    )
  );
  const result = await syncUsage({
    ...c,
    collect: "incremental",
    initialize: { meta, catalog: defaultCatalog },
    collection: {
      adapters: {
        codex: createCodexAdapter({ environment: {}, defaultHome: home }),
      },
    },
  });
  expect(result.status).toBe("synced");
  expect(
    result.collection!.sourceOutcomes.some((o) => o.outcome === "complete")
  ).toBe(true);
  expect(result.accepted!.ledger.recordedUnits).toBe(1);
  expect(result.accepted!.ledger.knownTokens).toBe("110");
  const tree = await f.git(f.remote, [
    "show",
    `${result.confirmedCommit}:summary.json`,
  ]);
  expect(tree).not.toContain(home);
  expect(await c.store.pending()).toEqual([]);
});
test("explicit cross-clone inclusion can supersede accepted remote exclusion without ordinary sync rebasing intent", async () => {
  const f = await fixture(),
    a = await client(f),
    b = await client(f, f.clones[1], "first");
  await syncUsage({ ...a, initialize: { meta, catalog: defaultCatalog } });
  const journal = (await a.store.journal())[0];
  const exclude = {
    schemaVersion: 2 as const,
    normalizationVersion: 1 as const,
    repositoryId,
    kind: "exclude" as const,
    targetUnitKey: cUnit(a),
    supersedes: [],
  };
  await a.store.commitBatch(
    journal.source,
    {
      source: journal.source,
      observations: [],
      nextCheckpoint: journal.checkpoint,
      outcome: "complete",
      diagnostics: [],
    },
    [exclude]
  );
  await syncUsage(a);
  const context = await syncUsage(b);
  expect(context.accepted!.ledger.excludedUnits).toBe(1);
  const include = {
    ...exclude,
    kind: "include" as const,
    supersedes: context
      .accepted!.records.filter((r) => "kind" in r)
      .map(recordHash),
  };
  const bj = (await b.store.journal())[0];
  await b.store.commitBatch(
    bj.source,
    {
      source: bj.source,
      observations: [],
      nextCheckpoint: bj.checkpoint,
      outcome: "complete",
      diagnostics: [],
    },
    [include]
  );
  const final = await syncUsage(b);
  expect(final.accepted!.ledger.includedUnits).toBe(1);
  expect((await syncUsage(a)).accepted!.ledger.includedUnits).toBe(1);
  // Five manual transactions share existing 20s operation budgets; let their own cancellation report.
}, 30_000);
function cUnit(c: Awaited<ReturnType<typeof client>>) {
  if ("kind" in c.record) throw Error("fixture");
  return c.record.unitKey;
}

test("a distinct fetch repository cannot authorize sending to a foreign-UUID push repository", async () => {
  const f = await fixture(),
    other = await fixture(),
    a = await client(f);
  await syncUsage({ ...a, initialize: { meta, catalog: defaultCatalog } });
  const wrongId = "d9428888-122b-4aab-9bc4-111111111111";
  const foreign = {
    ...meta,
    repositoryId: wrongId,
    policy: { ...policy, repositoryId: wrongId },
  };
  const tree = [
    ...renderArtifacts(reduceLedger([], foreign), foreign, defaultCatalog),
  ].map(([path, bytes]) => ({
    path,
    content: Buffer.from(bytes).toString("utf8"),
  }));
  const commit = await commitFixtureTree(other, other.remote, tree);
  await other.git(other.remote, [
    "update-ref",
    "refs/heads/agent-badge/data",
    commit,
  ]);
  await f.git(f.clones[1], [
    "remote",
    "set-url",
    "--push",
    "origin",
    other.remote,
  ]);
  const b = await client(f, f.clones[1], "two");
  expect((await syncUsage(b)).status).toBe("conflict");
  expect(await b.store.pending()).toHaveLength(1);
  expect(
    (
      await other.git(other.remote, [
        "rev-parse",
        "refs/heads/agent-badge/data",
      ])
    ).trim()
  ).toBe(commit);
});
test("routing mutation after commit construction suspends before any push", async () => {
  const f = await fixture(),
    other = await fixture(),
    c = await client(f);
  const actual = DataTransport.prototype.commit;
  vi.spyOn(DataTransport.prototype, "commit").mockImplementation(
    async function (this: DataTransport, ...args: Parameters<typeof actual>) {
      const commit = await actual.apply(this, args);
      await f.git(c.repository.worktreeRoot, [
        "remote",
        "set-url",
        "--push",
        "origin",
        other.remote,
      ]);
      return commit;
    }
  );
  expect(
    (await syncUsage({ ...c, initialize: { meta, catalog: defaultCatalog } }))
      .status
  ).toBe("conflict");
  expect(await c.store.pending()).toHaveLength(1);
  expect(
    await f.git(f.remote, ["for-each-ref", "refs/heads/agent-badge/data"])
  ).toBe("");
  expect(
    await other.git(other.remote, [
      "for-each-ref",
      "refs/heads/agent-badge/data",
    ])
  ).toBe("");
});
test("stale writer refetches a concurrent accepted commit and preserves union with FF-only server policy", async () => {
  const f = await fixture(),
    a = await client(f),
    b = await client(f, f.clones[1], "second");
  await f.git(f.remote, ["config", "receive.denyNonFastForwards", "true"]);
  await syncUsage({ ...a, initialize: { meta, catalog: defaultCatalog } });
  const c = await client(f, f.clones[0], "third"),
    actual = DataTransport.prototype.commit;
  let intercepted = false;
  vi.spyOn(DataTransport.prototype, "commit").mockImplementation(
    async function (this: DataTransport, ...args: Parameters<typeof actual>) {
      const commit = await actual.apply(this, args);
      if (!intercepted) {
        intercepted = true;
        expect((await syncUsage(b)).status).toBe("synced");
      }
      return commit;
    }
  );
  const result = await syncUsage(c);
  expect(result.status).toBe("synced");
  expect(result.accepted!.ledger.recordedUnits).toBe(3);
  expect(result.accepted!.ledger.knownTokens).toBe("420");
}, 30000);
test("deletion observed immediately before send requires recovery and never recreates the ref", async () => {
  const f = await fixture(),
    a = await client(f);
  await syncUsage({ ...a, initialize: { meta, catalog: defaultCatalog } });
  const c = await client(f, f.clones[0], "second"),
    actual = DataTransport.prototype.commit;
  vi.spyOn(DataTransport.prototype, "commit").mockImplementation(
    async function (this: DataTransport, ...args: Parameters<typeof actual>) {
      const commit = await actual.apply(this, args);
      await f.git(f.remote, [
        "update-ref",
        "-d",
        "refs/heads/agent-badge/data",
      ]);
      return commit;
    }
  );
  const result = await syncUsage(c);
  expect(result.status).toBe("conflict");
  expect(result.acknowledgedHashes).toEqual([]);
  expect(await c.store.pending()).toHaveLength(1);
  expect(
    await f.git(f.remote, ["for-each-ref", "refs/heads/agent-badge/data"])
  ).toBe("");
});

test("deletion after local preflight but before push advertisement never recreates a seen ref", async () => {
  const f = await fixture(),
    a = await client(f);
  await syncUsage({ ...a, initialize: { meta, catalog: defaultCatalog } });
  const c = await client(f, f.clones[0], "second"),
    actual = gitProcess.runGit;
  let deleted = false;
  vi.spyOn(gitProcess, "runGit").mockImplementation(async (args, options) => {
    if (args.includes("push") && !deleted) {
      deleted = true;
      await f.git(f.remote, [
        "update-ref",
        "-d",
        "refs/heads/agent-badge/data",
      ]);
    }
    return actual(args, options);
  });
  const result = await syncUsage(c);
  expect(result.status).toBe("conflict");
  expect(result.acknowledgedHashes).toEqual([]);
  expect(await c.store.pending()).toHaveLength(1);
  expect(
    await f.git(f.remote, ["for-each-ref", "refs/heads/agent-badge/data"])
  ).toBe("");
});

test("deletion after advertisement is rejected by receive-pack old-OID compare rather than resurrecting the ref", async () => {
  const f = await fixture(),
    a = await client(f);
  await syncUsage({ ...a, initialize: { meta, catalog: defaultCatalog } });
  const c = await client(f, f.clones[0], "second"),
    actual = gitProcess.runGit;
  const marker = join(f.root, "advertisement-seen");
  let injected = false;
  vi.spyOn(gitProcess, "runGit").mockImplementation(async (args, options) => {
    if (args.includes("push") && !injected) {
      injected = true;
      const setting = args.find((arg) => arg.startsWith("core.hooksPath="))!;
      const hook = join(setting.slice("core.hooksPath=".length), "pre-push");
      const script = await readFile(hook, "utf8");
      await writeFile(
        hook,
        script.replace(
          /exit 0\n$/,
          `git --git-dir='${f.remote}' update-ref -d refs/heads/agent-badge/data || exit 1\nprintf advertised > '${marker}'\nexit 0\n`
        ),
        { mode: 0o700 }
      );
    }
    return actual(args, options);
  });
  const result = await syncUsage(c);
  expect(await readFile(marker, "utf8")).toBe("advertised");
  expect(result.status).toBe("conflict");
  expect(result.acknowledgedHashes).toEqual([]);
  expect(await c.store.pending()).toHaveLength(1);
  expect(
    await f.git(f.remote, ["for-each-ref", "refs/heads/agent-badge/data"])
  ).toBe("");
});

test("deadline expiring during route discovery queues rather than reporting a routing conflict", async () => {
  const f = await fixture(),
    c = await client(f);
  const result = await syncUsage({
    ...c,
    initialize: { meta, catalog: defaultCatalog },
    deadline: Date.now() + 1,
  });
  expect(result.status).toBe("queued");
  expect(await c.store.pending()).toHaveLength(1);
  expect(result.acknowledgedHashes).toEqual([]);
});
test("real child death after accepted push and before acknowledgment recovers by confirmed inclusion", async () => {
  const f = await fixture(),
    c = await client(f),
    input = join(f.root, "sync-input.json");
  await writeFile(
    input,
    JSON.stringify({
      repository: c.repository,
      binding: c.binding,
      meta,
      catalog: defaultCatalog,
    })
  );
  const moduleUrl = pathToFileURL(
      join(process.cwd(), "packages/core/src/operations/sync.ts")
    ).href,
    storeUrl = pathToFileURL(
      join(process.cwd(), "packages/core/src/storage/store.ts")
    ).href;
  const child = await runStorageFixtureProcess(
    process.cwd(),
    `
 const fs=await import('node:fs/promises');const {repository,binding,meta,catalog}=JSON.parse(await fs.readFile(${JSON.stringify(
   input
 )},'utf8'));
 const {openStore}=await import(${JSON.stringify(
   storeUrl
 )});const {syncUsage}=await import(${JSON.stringify(moduleUrl)});
 await syncUsage({repository,binding,store:await openStore(repository,{processNamespace:async()=> 'synthetic'}),collect:'none',signal:AbortSignal.timeout(8000),deadline:Date.now()+8000,initialize:{meta,catalog}});
 `,
    {
      operation: "rename",
      pathIncludes: "/acknowledgements/",
      action: "exit-before",
    }
  );
  expect(child.signal).toBe("SIGKILL");
  expect(child.stderr).toBe("");
  const accepted = (
      await f.git(f.remote, ["rev-parse", "refs/heads/agent-badge/data"])
    ).trim(),
    store = await openStore(c.repository, {
      processNamespace: async () => "synthetic",
    });
  expect(await store.pending()).toHaveLength(1);
  const recovered = await syncUsage({ ...c, store });
  expect(recovered.status).toBe("unchanged");
  expect(recovered.confirmedCommit).toBe(accepted);
  expect(await store.pending()).toEqual([]);
});

test("a valid descendant cannot erase previously acknowledged immutable records", async () => {
  const f = await fixture(),
    c = await client(f);
  const first = await syncUsage({
    ...c,
    initialize: { meta, catalog: defaultCatalog },
  });
  const empty = [
    ...renderArtifacts(reduceLedger([], meta), meta, defaultCatalog),
  ].map(([path, bytes]) => ({
    path,
    content: Buffer.from(bytes).toString("utf8"),
  }));
  const dropped = await commitFixtureTree(
    f,
    f.remote,
    empty,
    first.confirmedCommit!
  );
  await f.git(f.remote, ["update-ref", "refs/heads/agent-badge/data", dropped]);
  const result = await syncUsage(c);
  expect(result.status).toBe("conflict");
  expect(result.acknowledgedHashes).toEqual([]);
  expect(result.confirmedCommit).toBeNull();
});

test.each(['corrupt', 'future'] as const)('%s remote metadata preserves queued observations and accepted history, including explicit reinitialize', async kind => {
  const f = await fixture(), a = await client(f);
  const first = await syncUsage({ ...a, initialize: { meta, catalog: defaultCatalog } });
  const pending = await client(f, f.clones[0], 'pending');
  const beforeState = await pending.store.transportState(), beforeJournal = await pending.store.journal();
  const bad = await commitFixtureTree(f, f.remote, [{ path: 'meta.json', content: kind === 'corrupt' ? '{broken' : JSON.stringify({ ...meta, schemaVersion: 999 }) }], first.confirmedCommit!);
  await f.git(f.remote, ['update-ref', 'refs/heads/agent-badge/data', bad]);
  const result = await syncUsage({ ...pending, initialize: { meta, catalog: defaultCatalog } });
  expect(result.status).toBe('unsupported'); expect(result.acknowledgedHashes).toEqual([]);
  expect(await pending.store.pending()).toHaveLength(1);
  expect(await pending.store.journal()).toEqual(beforeJournal);
  expect(await pending.store.transportState()).toEqual(beforeState);
  expect((await f.git(f.remote, ['rev-parse', 'refs/heads/agent-badge/data'])).trim()).toBe(bad);
});

test('actual automatic worker captures local usage, refuses local publication, and still acknowledges confirmed history', async () => {
  const f = await fixture(), repository = await resolveRepository(f.clones[0]), store = await openStore(repository);
  const binding = await bindRemote(repository, { repositoryId, declaredUrl: f.remote, target: 'origin' });
  if (binding.status !== 'bound') throw Error('fixture');
  const options = { repository, store, binding, collect: 'none' as const, signal: AbortSignal.timeout(20000), deadline: Date.now() + 20000 };
  expect((await syncUsage({ ...options, initialize: { meta, catalog: defaultCatalog } })).status).toBe('synced');
  const home = join(f.root, 'codex'), source = join(home, 'sessions/source.jsonl'), marker = join(f.root, 'receiver');
  await mkdir(join(home, 'sessions'), { recursive: true });
  await writeFile(source, codexRollout({ single: true }).replaceAll('/synthetic/repo', repository.worktreeRoot));
  await writeFile(join(f.remote, 'hooks/pre-receive'), `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)},'started');\n`, { mode: 0o700 });
  const invoke = async () => {
    const budget = createOperationBudget('automatic');
    try { return await runRepositoryOperation({ budget, request: {
      cwd: repository.worktreeRoot, privateDir: repository.privateDir, binding, collect: 'incremental', capturePolicy: policy,
      collection: { roots: { codex: [home], claude: [], gemini: [], opencode: [] }, target: { provider: 'codex', path: source } },
    } }); } finally { budget.dispose(); }
  };
  const refused = await invoke();
  expect(refused).toMatchObject({ status: 'unsupported', reason: 'automatic-local-transport', queuedCount: 1, acknowledgedCount: 0, exitCode: 0 });
  expect((await readStoreSnapshot(repository)).pending).toHaveLength(1);
  await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  const receipt = vi.spyOn(store, 'acknowledge').mockRejectedValueOnce(Error('synthetic lost receipt'));
  try { expect((await syncUsage(options)).status).toBe('queued'); } finally { receipt.mockRestore(); }
  expect(await readFile(marker, 'utf8')).toBe('started');
  await rm(marker);
  const confirmed = await invoke();
  expect(confirmed).toMatchObject({ status: 'unchanged', queuedCount: 0, acknowledgedCount: 1, exitCode: 0 });
  expect((await readStoreSnapshot(repository)).pending).toHaveLength(0);
  await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
},30000);
