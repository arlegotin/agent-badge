import {afterEach,expect,test} from 'vitest';
import {mkdir,writeFile,readFile,rm,chmod,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {codexRollout,protocolPrivacyCanaries,protocolObservationFixture,snapshotUserCheckout,commitFixtureTree,runStorageFixtureProcess} from '@agent-badge/testkit';
import {pathToFileURL} from 'node:url';
import type {GitFixture} from '@agent-badge/testkit';
import * as core from '@legotin/agent-badge-core';
import {activatedFixture,setupOptions} from '../../test/operational-fixture.js';
import {planSetup,applySetup} from '../integration/setup.js';
import {checkActivation} from '../integration/runtime.js';
import {runContributeCommand} from './contribute.js';
const fixtures:GitFixture[]=[];
afterEach(async()=>{await Promise.all(fixtures.splice(0).map(f=>f.cleanup()));});
async function nativeFixture(){
  const value=await activatedFixture();fixtures.push(value.f);
  const {f,cwd,plan}=value,root=join(f.root,'synthetic-codex');await mkdir(join(root,'sessions'),{recursive:true});
  const path=join(root,'sessions','private-transcript-canary.jsonl');await writeFile(path,codexRollout({single:true}).replaceAll('/synthetic/repo',cwd));
  const store=await core.openStore(plan.repository),policy=plan.declaration.policy;
  const collect=()=>store.withLock(AbortSignal.timeout(20000),()=>core.collectUsage({repository:plan.repository,store,policy,privatePolicy:plan.activation.privatePolicy,roots:{codex:[root],claude:[],gemini:[],opencode:[]},signal:AbortSignal.timeout(20000)}));
  await collect();expect(await store.pendingCount()).toBe(1);
  const meta={schemaVersion:2 as const,protocolVersion:1 as const,repositoryId:policy.repositoryId,normalizationVersion:1 as const,catalogVersion:1,catalogHash:core.catalogHash(core.defaultCatalog),policy};
  const sync=(initialize=false)=>core.syncUsage({repository:plan.repository,store,binding:plan.activation.binding,collect:'none',signal:AbortSignal.timeout(20000),deadline:Date.now()+20000,...(initialize?{initialize:{meta,catalog:core.defaultCatalog}}:{})});
  const accepted=await sync(true);expect(accepted.status).toBe('synced');
  return {...value,root,path,store,meta,collect,sync,accepted};
}

test.each(['rebase','squash','cherry-pick','force-push'])('code %s leaves accepted usage identity and private state independent',async operation=>{
  const {f,cwd,plan,sync,accepted}=await nativeFixture();
  await f.git(cwd,['add','.']);await f.git(cwd,['commit','-m','Synthetic repository activation']);
  const base=(await f.git(cwd,['rev-parse','HEAD'])).trim();
  await f.git(cwd,['checkout','-b','usage-feature']);await writeFile(join(cwd,'feature.txt'),'synthetic feature');await f.git(cwd,['add','feature.txt']);await f.git(cwd,['commit','-m','Synthetic feature']);
  if(operation==='rebase'){await f.git(cwd,['checkout','main']);await f.git(cwd,['commit','--allow-empty','-m','Independent main change']);await f.git(cwd,['checkout','usage-feature']);await f.git(cwd,['rebase','main']);}
  if(operation==='squash'){await f.git(cwd,['checkout','main']);await f.git(cwd,['merge','--squash','usage-feature']);await f.git(cwd,['commit','-m','Squashed synthetic feature']);}
  if(operation==='cherry-pick'){await f.git(cwd,['checkout','main']);await f.git(cwd,['cherry-pick','usage-feature']);}
  if(operation==='force-push'){await f.git(cwd,['-c','core.hooksPath=/dev/null','push','origin','HEAD:main']);await f.git(cwd,['reset','--hard',base]);await f.git(cwd,['-c','core.hooksPath=/dev/null','push','--force','origin','HEAD:main']);}
  const before=await snapshotUserCheckout(cwd),result=await sync();expect(result.status).toBe('unchanged');expect(result.confirmedCommit).toBe(accepted.confirmedCommit);expect(result.accepted!.ledger.recordedUnits).toBe(1);
  expect(await snapshotUserCheckout(cwd)).toEqual(before);
  expect(await f.git(cwd,['ls-files'])).not.toContain(plan.repository.privateDir);
},30000);

test('expired and malformed native sources plus a removed worktree retain accepted evidence and truthful partial coverage',async()=>{
  const {f,cwd,path,store,plan,collect,sync,accepted}=await nativeFixture(),worktree=join(f.root,'removed-worktree');
  await f.git(cwd,['worktree','add','-b','linked',worktree]);
  const linked=await core.resolveRepository(worktree);expect(linked.privateDir).toBe(plan.repository.privateDir);
  expect((await core.readStoreSnapshot(linked)).entries).toEqual(await store.journal());
  await f.git(cwd,['worktree','remove',worktree]);await rm(path);await collect();
  expect((await sync()).confirmedCommit).toBe(accepted.confirmedCommit);
  await writeFile(path,'{"type":"future_schema","secret":"malformed-source-canary"}\n{invalid\n');await collect();
  const result=await sync();expect(result.accepted!.ledger.recordedUnits).toBe(1);expect(result.accepted!.ledger.knownTokens).toBe(accepted.accepted!.ledger.knownTokens);
  expect((await store.journal()).some(entry=>entry.outcome==='partial'||entry.outcome==='unsupported')).toBe(true);
  expect(JSON.stringify(result.accepted!.ledger)).not.toContain('malformed-source-canary');
},30000);

test('protected code pushes and all-branch denial keep durable usage retryable without bypassing server rules',async()=>{
  const {f,cwd,store,plan,meta,sync}=await nativeFixture();
  const hook=join(f.remote,'hooks/pre-receive');await writeFile(hook,'#!/bin/sh\nwhile read old new ref; do [ "$ref" = refs/heads/main ] && exit 1; done\nexit 0\n');await chmod(hook,0o755);
  await f.git(cwd,['commit','--allow-empty','-m','Rejected code change']);await expect(f.git(cwd,['-c','core.hooksPath=/dev/null','push','origin','HEAD:main'])).rejects.toThrow();
  const control={schemaVersion:2 as const,normalizationVersion:1 as const,repositoryId:meta.repositoryId,kind:'exclude' as const,targetUnitKey:'f'.repeat(64),supersedes:[]};await store.commitControl(control);
  expect((await sync()).status).toBe('synced');
  await writeFile(hook,'#!/bin/sh\nexit 1\n');await store.commitControl({...control,targetUnitKey:'e'.repeat(64)});
  const denied=await sync();expect(denied.status).toBe('queued');expect(denied.acknowledgedHashes).toEqual([]);expect(await store.pendingCount()).toBe(1);
  await rm(hook);const reopened=await core.openStore(plan.repository);
  const resumed=await core.syncUsage({repository:plan.repository,store:reopened,binding:plan.activation.binding,collect:'none',signal:AbortSignal.timeout(20000),deadline:Date.now()+20000});
  expect(resumed.status).toBe('synced');expect(await reopened.pendingCount()).toBe(0);
},30000);

test('public artifacts contribution names Git authors and errors exclude all private fixture canaries',async()=>{
  const {f,cwd,plan,meta}=await nativeFixture(),record=core.sanitizeObservation(protocolObservationFixture(),meta.policy);
  const contribution=await runContributeCommand({cwd,meta,records:[record]});
  const artifacts=core.renderArtifacts(core.reduceLedger([record],meta),meta,core.defaultCatalog);
  const publicBytes=[...artifacts].map(([path,bytes])=>path+'\n'+Buffer.from(bytes).toString('utf8')).join('\n')+contribution.path+await readFile(join(cwd,contribution.path),'utf8');
  const state=await (await core.openStore(plan.repository)).transportState();
  const author=await f.git(cwd,['log','-1','--format=%an <%ae> %cn <%ce>',`refs/agent-badge/accepted/${state!.commit}`]);
  expect(author.trim()).toBe('agent-badge bot <agent-badge@example.invalid> agent-badge bot <agent-badge@example.invalid>');
  for(const canary of Object.values(protocolPrivacyCanaries))expect(publicBytes+author).not.toContain(canary);
  expect(publicBytes).not.toContain(f.root);expect(contribution.path).toMatch(/^\.agent-badge\/contributions\/[a-f0-9]{64}\.json$/);
  let error='';try{core.parsePublicRecord({...record,prompt:protocolPrivacyCanaries.prompt});}catch(value){error=String(value);}expect(error).toBeTruthy();for(const canary of Object.values(protocolPrivacyCanaries))expect(error).not.toContain(canary);
},30000);

test('detected v1 Gist configuration is explicitly unsupported and leaves opaque totals and hooks untouched',async()=>{
  const {f,cwd}=await activatedFixture();fixtures.push(f);
  const config=join(cwd,'.agent-badge/config.json'),legacy={version:1,publish:{provider:'github-gist',gistId:'private-gist-canary'},opaqueTotal:999999};await writeFile(config,JSON.stringify(legacy));
  const before=await snapshotUserCheckout(cwd);
  await expect(planSetup({...setupOptions,cwd})).rejects.toThrow(/legacy.*unsupported.*reinitialize/i);
  expect(await snapshotUserCheckout(cwd)).toEqual(before);expect(JSON.parse(await readFile(config,'utf8'))).toEqual(legacy);
});

test.each(['shallow','detached','unborn'])('%s code history reads the explicit accepted data ref without importing local source provenance',async kind=>{
  const {f,cwd,plan,accepted}=await nativeFixture();let directory=cwd;
  if(kind==='detached')await f.git(cwd,['checkout','--detach']);
  else{
    directory=join(f.root,kind);
    if(kind==='shallow')await f.git(f.root,['clone','--depth','1','file://'+f.remote,directory]);
    else{await f.git(f.root,['init','--initial-branch=main',directory]);await f.git(directory,['remote','add','origin',f.remote]);}
  }
  const repository=await core.resolveRepository(directory),store=await core.openStore(repository),binding=await core.bindRemote(repository,{repositoryId:plan.declaration.repositoryId,declaredUrl:f.remote,target:'origin'});
  if(kind==='shallow')expect(repository.shallow).toBe(true);else expect(repository.head.kind).toBe(kind);
  const result=await core.syncUsage({repository,store,binding,collect:'none',signal:AbortSignal.timeout(20000),deadline:Date.now()+20000});
  expect(result.confirmedCommit).toBe(accepted.confirmedCommit);expect(result.accepted!.ledger.recordedUnits).toBe(1);
  if(kind!=='detached'){expect(await store.journal()).toEqual([]);expect(await store.pendingCount()).toBe(0);}
},30000);

test('a new contributor collects its own source boundary and copied native usage deduplicates across machines',async()=>{
  const {f,plan,accepted}=await nativeFixture(),cwd=f.clones[1],root=join(f.root,'copied-native');await mkdir(join(root,'sessions'),{recursive:true});
  await writeFile(join(root,'sessions','copy.jsonl'),codexRollout({single:true}).replaceAll('/synthetic/repo',cwd));
  const repository=await core.resolveRepository(cwd),store=await core.openStore(repository),binding=await core.bindRemote(repository,{repositoryId:plan.declaration.repositoryId,declaredUrl:f.remote,target:'origin'});
  expect(await store.journal()).toEqual([]);await store.withLock(AbortSignal.timeout(20000),()=>core.collectUsage({repository,store,policy:plan.declaration.policy,privatePolicy:plan.activation.privatePolicy,roots:{codex:[root],claude:[],gemini:[],opencode:[]},signal:AbortSignal.timeout(20000)}));
  expect(await store.pendingCount()).toBe(1);
  const result=await core.syncUsage({repository,store,binding,collect:'none',signal:AbortSignal.timeout(20000),deadline:Date.now()+20000});
  expect(result.status).toBe('unchanged');expect(result.confirmedCommit).toBe(accepted.confirmedCommit);expect(result.accepted!.ledger.recordedUnits).toBe(1);expect(await store.pendingCount()).toBe(0);
},30000);

test('submodules have a separate private identity and do not inherit parent activation or usage',async()=>{
  const {f,cwd,plan}=await nativeFixture();await f.git(cwd,['-c','protocol.file.allow=always','submodule','add',f.remote,'nested']);
  const nested=await core.resolveRepository(join(cwd,'nested'));expect(nested.superprojectRoot).toBe(cwd);expect(nested.commonDir).not.toBe(plan.repository.commonDir);expect(nested.privateDir).not.toBe(plan.repository.privateDir);
  expect(await checkActivation({cwd:join(cwd,'nested')})).toMatchObject({status:'inactive'});expect((await core.readStoreSnapshot(nested)).entries).toEqual([]);
  expect((await core.readStoreSnapshot(plan.repository)).entries.length).toBeGreaterThan(0);
},30000);

test('explicit rename rebind retains repository UUID accepted history and pending local intent',async()=>{
  const {f,cwd,plan,store,accepted}=await nativeFixture(),moved=join(f.root,'renamed.git');
  await rename(f.remote,moved);await f.git(cwd,['remote','set-url','origin',moved]);
  const control={schemaVersion:2 as const,normalizationVersion:1 as const,repositoryId:plan.declaration.repositoryId,kind:'exclude' as const,targetUnitKey:accepted.accepted!.records[0].unitKey,supersedes:[]};await store.commitControl(control);
  const rebound=await planSetup({...setupOptions,cwd,target:'origin',declaredUrl:'https://github.com/example/renamed'});expect(rebound.declaration.repositoryId).toBe(plan.declaration.repositoryId);await applySetup(rebound);
  const result=await core.syncUsage({repository:plan.repository,store,binding:rebound.activation.binding,collect:'none',signal:AbortSignal.timeout(20000),deadline:Date.now()+20000});
  expect(result.status).toBe('synced');expect(result.accepted!.ledger.recordedUnits).toBe(1);expect(result.accepted!.ledger.excludedUnits).toBe(1);expect(await store.pendingCount()).toBe(0);
},30000);
test.each(['missing','foreign','divergent','stale-plan'])('explicit rebind refuses %s destination evidence and preserves durable binding',async fault=>{
  const {f,cwd,plan,store,meta}=await nativeFixture(),moved=join(f.root,'renamed.git');await rename(f.remote,moved);await f.git(cwd,['remote','set-url','origin',moved]);
  const rebound=await planSetup({...setupOptions,cwd,target:'origin',declaredUrl:'https://github.com/example/renamed'}),before=await store.transportState();
  if(fault==='missing')await f.git(moved,['update-ref','-d','refs/heads/agent-badge/data']);
  if(fault==='foreign'||fault==='divergent'){
    const repositoryId=fault==='foreign'?'12345678-1234-4234-8234-123456789abc':meta.repositoryId,m={...meta,repositoryId,policy:{...meta.policy,repositoryId}},artifacts=core.renderArtifacts(core.reduceLedger([],m),m,core.defaultCatalog);
    const commit=await commitFixtureTree(f,cwd,[...artifacts].map(([path,bytes])=>({path,mode:'100644',content:Buffer.from(bytes).toString('utf8')})));
    await f.git(cwd,['-c','core.hooksPath=/dev/null','push','--force',moved,`${commit}:refs/heads/agent-badge/data`]);
  }
  if(fault==='stale-plan')await store.recordAcceptedLedger({...before!,commit:'f'.repeat(40)});
  const expected=await store.transportState();await expect(applySetup(rebound)).rejects.toThrow();expect(await store.transportState()).toEqual(expected);
  expect((await core.syncUsage({repository:plan.repository,store,binding:rebound.activation.binding,collect:'none',signal:AbortSignal.timeout(10000),deadline:Date.now()+10000})).status).toBe('conflict');
},30000);
test('explicit rebind interrupted before activation publication completes safely on explicit rerun',async()=>{
  const {f,cwd,store}=await nativeFixture(),moved=join(f.root,'renamed.git');await rename(f.remote,moved);await f.git(cwd,['remote','set-url','origin',moved]);
  const rebound=await planSetup({...setupOptions,cwd,target:'origin',declaredUrl:'https://github.com/example/renamed'}),input=join(f.root,'rebind-plan.json');await writeFile(input,JSON.stringify(rebound));
  const module=pathToFileURL(join(process.cwd(),'packages/agent-badge/src/integration/setup.ts')).href;
  const child=await runStorageFixtureProcess(process.cwd(),`(await import('node:module')).syncBuiltinESMExports();const fs=await import('node:fs/promises');const plan=JSON.parse(await fs.readFile(${JSON.stringify(input)},'utf8'));const {applySetup}=await import(${JSON.stringify(module)});await applySetup(plan);`,{operation:'rename',pathIncludes:'/local.json',action:'exit-before'});
  expect(child.signal,child.stderr).toBe('SIGKILL');expect((await store.transportState())!.canonicalPushUrl).toBe(rebound.activation.binding.status==='bound'?rebound.activation.binding.canonicalPushUrl:'invalid');
  const rerun=await planSetup({...setupOptions,cwd,target:'origin',declaredUrl:'https://github.com/example/renamed'});expect(rerun.rebind).toBeUndefined();await applySetup(rerun);expect((await checkActivation({cwd})).status).toBe('approved');
},30000);
test('a destination with no prior confirmed history cannot use explicit rebind to reseed',async()=>{
  const {f,cwd,plan}=await activatedFixture();fixtures.push(f);const binding=plan.activation.binding;if(binding.status!=='bound')throw Error('synthetic binding required');
  const store=await core.openStore(plan.repository);await store.recordAcceptedLedger({schemaVersion:1,repositoryId:binding.repositoryId,canonicalPushUrl:binding.canonicalPushUrl,dataRef:binding.dataRef,commit:null});
  const moved=join(f.root,'renamed.git');await rename(f.remote,moved);await f.git(cwd,['remote','set-url','origin',moved]);
  const rebound=await planSetup({...setupOptions,cwd,target:'origin',declaredUrl:'https://github.com/example/renamed'}),before=await store.transportState();
  await expect(applySetup(rebound)).rejects.toThrow();expect(await store.transportState()).toEqual(before);
},30000);
