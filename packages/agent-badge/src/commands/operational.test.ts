import { afterEach, expect, test, vi } from 'vitest';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { protocolObservationFixture } from '@agent-badge/testkit';
import type { GitFixture } from '@agent-badge/testkit';
import * as core from '@legotin/agent-badge-core';
import { buildProgram } from '../cli/main.js';
import { activatedFixture } from '../../test/operational-fixture.js';
const fixtures: GitFixture[] = [];
afterEach(async () => {process.exitCode=undefined; await Promise.all(fixtures.splice(0).map(f=>f.cleanup()));});
async function command(cwd:string,args:string[]) { const output:string[]=[]; await buildProgram({cwd,write:line=>output.push(line)}).exitOverride().parseAsync(args,{from:'user'}); return JSON.parse(output.join('\n')); }

test('status JSON and doctor preserve explicit setup needs, unavailable sources and required failures', async () => {
  const {f,cwd,plan}=await activatedFixture();fixtures.push(f);
  const status=await command(cwd,['status','--json']);
  expect(status).toMatchObject({schemaVersion:1,command:'status',setup:'approved'});
  expect(JSON.stringify(status)).not.toContain(f.root);
  const doctor=await command(cwd,['doctor','--json']);
  expect(doctor.capabilities.integrations.find((i:{provider:string})=>i.provider==='codex')).toMatchObject({detection:'absent',accounting:'unsupported'});
  expect(doctor.checks.some((c:{code:string})=>c.code==='remote-readable')).toBe(false);
  await writeFile(join(plan.repository.privateDir,'local.json'),'null');
  await expect(command(cwd,['sync','--json'])).rejects.toThrow();
});

test('collect is local-only, sync confirms data, explain redacts, and explicit cross-clone controls use accepted heads',async()=>{
  const {f,cwd,plan}=await activatedFixture();fixtures.push(f);
  // Native fixture is the exact explicit source boundary, never a real agent home.
  const root=join(f.root,'codex');await mkdir(join(root,'sessions'),{recursive:true});
  const {codexRollout}=await import('@agent-badge/testkit');await writeFile(join(root,'sessions','usage.jsonl'),codexRollout({single:true}).replaceAll('/synthetic/repo',cwd));
  const activation=JSON.parse(await readFile(join(plan.repository.privateDir,'local.json'),'utf8'));activation.roots={codex:[root]};await writeFile(join(plan.repository.privateDir,'local.json'),JSON.stringify(activation));
  const captured=await command(cwd,['collect','--full','--json']);expect(captured.command).toBe('collect');
  expect(await f.git(f.remote,['for-each-ref','--format=%(refname)','refs/heads/agent-badge/data'])).toBe('');
  const store=await core.openStore(plan.repository),entries=await store.journal(),observation=entries.flatMap(e=>e.observations)[0];
  expect(observation).toBeDefined();
  const {observationEvidenceHash}=await import('../../../core/src/collection/metadata.js');const id=observationEvidenceHash(observation);
  const explanation=await command(cwd,['explain',id,'--json']);expect(explanation).toMatchObject({command:'explain',localId:id,redacted:true});
  expect(JSON.stringify(explanation)).not.toMatch(/usage\.jsonl|\/private\/|session-test|rollout/);
  // Initialize through existing explicit setup ownership; regular sync may not reseed.
  const initial=await core.syncUsage({repository:plan.repository,binding:activation.binding,store,collect:'none',signal:AbortSignal.timeout(15000),deadline:Date.now()+15000,initialize:{meta:{schemaVersion:2,protocolVersion:1,repositoryId:activation.repositoryId,normalizationVersion:1,catalogVersion:core.defaultCatalog.version,catalogHash:core.catalogHash(core.defaultCatalog),policy:activation.capturePolicy},catalog:core.defaultCatalog}});
  expect(initial.status).toBe('synced');
  const excluded=await command(cwd,['exclude',id,'--json']);expect(excluded.status).toBe('synced');
  const afterExclude=await command(cwd,['status','--json']);expect(afterExclude.totals.excludedUnits).toBe(1);
  const included=await command(cwd,['include',id,'--json']);expect(included.status).toBe('synced');
  const final=await command(cwd,['status','--json']);expect(final.totals.includedUnits).toBe(1);
  const controls=[...(await store.journal()).flatMap(e=>e.records),...await store.controls()].filter((r):r is core.ControlRecord=>'kind'in r);
  const include=controls.find(c=>c.kind==='include')!;expect(include).toBeDefined();expect(include.supersedes.length).toBeGreaterThan(0);expect(controls.filter(c=>c.kind==='exclude').some(c=>include.supersedes.includes(core.recordHash(c)))).toBe(true);
},20000);

test('configure validates revision and writes accepted policy; upgrade requires an exact deliberate runtime',async()=>{
  const {f,cwd,plan}=await activatedFixture();fixtures.push(f);const store=await core.openStore(plan.repository);
  const meta={schemaVersion:2 as const,protocolVersion:1 as const,repositoryId:plan.declaration.repositoryId,normalizationVersion:1 as const,catalogVersion:core.defaultCatalog.version,catalogHash:core.catalogHash(core.defaultCatalog),policy:plan.declaration.policy};
  expect((await core.syncUsage({repository:plan.repository,binding:plan.activation.binding,store,collect:'none',signal:AbortSignal.timeout(15000),deadline:Date.now()+15000,initialize:{meta,catalog:core.defaultCatalog}})).status).toBe('synced');
  const path=join(f.root,'configuration.json');await writeFile(path,JSON.stringify({schemaVersion:1,expectedMetadataRevision:core.metadataRevision(meta),meta:{...meta,policy:{...meta.policy,badge:{...meta.policy.badge,label:'Accepted'}}},catalog:core.defaultCatalog}));
  expect(await command(cwd,['configure','--from-file',path,'--json'])).toMatchObject({command:'configure',status:'configured',exitCode:0});
  expect(JSON.parse(await readFile(join(cwd,'.agent-badge/config.json'),'utf8')).policy.badge.label).toBe('Accepted');
  expect(await command(cwd,['configure','--from-file',path,'--json'])).toMatchObject({status:'conflict',exitCode:2});
  await expect(command(cwd,['upgrade','--runtime-version','latest','--json'])).rejects.toThrow();
});

test('remote-only controls have no source journal, export causal closure, and offline commands never claim intent applied',async()=>{
 const {f,cwd,plan}=await activatedFixture();fixtures.push(f);const store=await core.openStore(plan.repository);
 const observation=protocolObservationFixture(),record=core.sanitizeObservation(observation,plan.declaration.policy);
 const meta={schemaVersion:2 as const,protocolVersion:1 as const,repositoryId:plan.declaration.repositoryId,normalizationVersion:1 as const,catalogVersion:core.defaultCatalog.version,catalogHash:core.catalogHash(core.defaultCatalog),policy:plan.declaration.policy};
 // A remote-only record arrives through the public transaction, not a made-up private source.
 const first=await core.syncUsage({repository:plan.repository,binding:plan.activation.binding,store,collect:'none',initialize:{meta,catalog:core.defaultCatalog},signal:AbortSignal.timeout(15000),deadline:Date.now()+15000});expect(first.status).toBe('synced');
 await core.importContribution(core.exportContribution({meta,records:[record]}),{repository:plan.repository,binding:plan.activation.binding,store,signal:AbortSignal.timeout(15000),deadline:Date.now()+15000});
 expect(await command(cwd,['exclude',record.unitKey,'--json'])).toMatchObject({status:'synced',intent:'fixed-causal-heads'});
 expect(await store.journal()).toEqual([]);expect(await store.controls()).toHaveLength(1);expect(await store.pending()).toEqual([]);
 const contribution=await command(cwd,['contribute','--json']);
 const envelope=core.parseContribution(await readFile(join(cwd,contribution.path),'utf8'));expect(envelope.records).toHaveLength(2);expect(envelope.records.some(e=>'kind'in e.record&&e.record.kind==='exclude')).toBe(true);
 await f.git(cwd,['remote','set-url','origin',join(f.root,'missing.git')]);
 await expect(command(cwd,['include',record.unitKey,'--json'])).rejects.toThrow('current-ledger-required');
 expect(await store.controls()).toHaveLength(1);expect((await core.readStoreSnapshot(plan.repository)).controls).toHaveLength(1);
},15000);

test('status detects local wrong-target routing without any remote request',async()=>{
 const {f,cwd}=await activatedFixture();fixtures.push(f);await f.git(cwd,['remote','set-url','origin','https://github.com/example/changed']);
 expect(await command(cwd,['status','--json'])).toMatchObject({state:'conflicted',exitCode:2});
});

test('supervised collect never invokes remote Git and cancellation preserves captured pending work',async()=>{
 const {f,cwd,plan}=await activatedFixture();fixtures.push(f);const {chmod}=await import('node:fs/promises');
 const root=join(f.root,'source'),bin=join(f.root,'bin'),marker=join(f.root,'remote-invocation');await mkdir(join(root,'sessions'),{recursive:true});await mkdir(bin);
 const {codexRollout}=await import('@agent-badge/testkit');await writeFile(join(root,'sessions','request.jsonl'),codexRollout({single:true}).replaceAll('/synthetic/repo',cwd));
 const activation=JSON.parse(await readFile(join(plan.repository.privateDir,'local.json'),'utf8'));activation.roots={codex:[root]};await writeFile(join(plan.repository.privateDir,'local.json'),JSON.stringify(activation));
 await writeFile(join(bin,'git'),`#!/bin/sh\nfor arg do\n case "$arg" in ls-remote|fetch|push) printf 'remote\\n' >> '${marker}' ;; esac\ndone\nexec /usr/bin/git "$@"\n`);await chmod(join(bin,'git'),0o755);
 const beforePath=process.env.PATH;process.env.PATH=bin+':'+beforePath;
 try{
  expect(await command(cwd,['collect','--json'])).toMatchObject({confirmedCommit:null,queuedRecords:1});
  await expect(readFile(marker,'utf8')).rejects.toMatchObject({code:'ENOENT'});
  const {runCollectCommand}=await import('./collect.js');expect(await runCollectCommand({cwd,timeoutMs:50})).toMatchObject({status:'partial',exitCode:1});
  await expect((await core.openStore(plan.repository)).pending()).resolves.toHaveLength(1);
 }finally{process.env.PATH=beforePath;}
},10000);

test('include reports a concurrent later remote exclusion instead of silently rebasing its fixed intent',async()=>{
 const {f,cwd,plan}=await activatedFixture();fixtures.push(f);const store=await core.openStore(plan.repository),record=core.sanitizeObservation(protocolObservationFixture(),plan.declaration.policy);
 const meta={schemaVersion:2 as const,protocolVersion:1 as const,repositoryId:plan.declaration.repositoryId,normalizationVersion:1 as const,catalogVersion:core.defaultCatalog.version,catalogHash:core.catalogHash(core.defaultCatalog),policy:plan.declaration.policy};
 const options={repository:plan.repository,binding:plan.activation.binding,store,collect:'none' as const,signal:AbortSignal.timeout(20000),deadline:Date.now()+20000};
 await core.syncUsage({...options,initialize:{meta,catalog:core.defaultCatalog}});await core.importContribution(core.exportContribution({meta,records:[record]}),options);
 await command(cwd,['exclude',record.unitKey,'--json']);
 const bRepository=await core.resolveRepository(f.clones[1]),bStore=await core.openStore(bRepository),bBinding=await core.bindRemote(bRepository,{repositoryId:meta.repositoryId,declaredUrl:f.remote});
 const bOptions={repository:bRepository,store:bStore,binding:bBinding,collect:'none' as const,signal:AbortSignal.timeout(20000),deadline:Date.now()+20000};
 const before=await core.syncUsage(bOptions),oldHead=before.accepted!.records.find(r=>'kind'in r&&r.kind==='exclude')!;
 const prototype=Object.getPrototypeOf(store),original=prototype.commitControl;let injected=false;
 const spy=vi.spyOn(prototype,'commitControl').mockImplementation(async function(this:core.LocalStore,control:core.ControlRecord){
  await original.call(this,control);
  if(control.kind==='include'&&!injected){injected=true;await original.call(bStore,{schemaVersion:2,normalizationVersion:1,repositoryId:meta.repositoryId,kind:'exclude',targetUnitKey:record.unitKey,supersedes:[core.recordHash(oldHead)]});expect((await core.syncUsage(bOptions)).status).toBe('synced');}
 });
 try{
  expect(await command(cwd,['include',record.unitKey,'--json'])).toMatchObject({status:'conflict',exitCode:2,recordConfirmed:true});
  const accepted=await core.syncUsage(options);expect(accepted.accepted!.ledger.excludedUnits).toBe(1);
  const include=(await store.controls()).find(c=>c.kind==='include')!;expect(include.supersedes).toEqual([core.recordHash(oldHead)]);
 }finally{spy.mockRestore();}
},20000);
