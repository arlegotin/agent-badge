import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { protocolObservationFixture } from '@agent-badge/testkit';
import type { GitFixture } from '@agent-badge/testkit';
import * as core from '@legotin/agent-badge-core';
import { buildProgram } from '../cli/main.js';
import { repositoryIntegrations } from '../integration/operations.js';
import { activatedFixture } from '../../test/operational-fixture.js';
const fixtures: GitFixture[] = [];
// Keep owning checks real while explicitly disabling unrelated native discovery.
beforeEach(()=>{const inspect=repositoryIntegrations.inspect.bind(repositoryIntegrations);vi.spyOn(repositoryIntegrations,'inspect').mockImplementation(async(ctx,signal)=>{const result=await inspect(ctx,signal);return {...result,roots:{codex:[],claude:[],gemini:[],opencode:[],cursor:[],copilot:[],import:[],...result.roots}};});});
afterEach(async () => {vi.restoreAllMocks();process.exitCode=undefined; await Promise.all(fixtures.splice(0).map(f=>f.cleanup()));});
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
  const activation=JSON.parse(await readFile(join(plan.repository.privateDir,'local.json'),'utf8'));activation.roots={...activation.roots,codex:[root]};await writeFile(join(plan.repository.privateDir,'local.json'),JSON.stringify(activation));
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
 const {execFileSync}=await import('node:child_process');
 const realGit=execFileSync('/bin/sh',['-c','command -v git'],{encoding:'utf8'}).trim();
 const quotedGit="'"+realGit.replaceAll("'","'\\''")+"'";
 const root=join(f.root,'source'),bin=join(f.root,'bin'),marker=join(f.root,'remote-invocation');await mkdir(join(root,'sessions'),{recursive:true});await mkdir(bin);
 const {codexRollout}=await import('@agent-badge/testkit');await writeFile(join(root,'sessions','request.jsonl'),codexRollout({single:true}).replaceAll('/synthetic/repo',cwd));
 const activation=JSON.parse(await readFile(join(plan.repository.privateDir,'local.json'),'utf8'));activation.roots={...activation.roots,codex:[root]};await writeFile(join(plan.repository.privateDir,'local.json'),JSON.stringify(activation));
 await writeFile(join(bin,'git'),`#!/bin/sh\nfor arg do\n case "$arg" in ls-remote|fetch|push) printf 'remote\\n' >> '${marker}' ;; esac\ndone\nexec ${quotedGit} "$@"\n`);await chmod(join(bin,'git'),0o755);
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

async function transcript(cwd:string,args:string[]){const output:string[]=[];await buildProgram({cwd,write:line=>output.push(line)}).exitOverride().parseAsync(args,{from:'user'});return output.join('\n');}

test('plaintext explain contribute and status retain redacted explanations staging paths coverage and accepted state',async()=>{
 const {f,cwd,plan}=await activatedFixture();fixtures.push(f);
 const file=join(f.root,'private-source.json');
 await writeFile(file,JSON.stringify({kind:'agent-badge/normalized-source',schemaVersion:1,normalizationVersion:1,repositoryId:plan.declaration.repositoryId,provenance:{kind:'independent-request',producerId:'12345678-1234-4234-8234-123456789abc',sourceId:'22345678-1234-4234-8234-123456789abc',producerVersion:'synthetic',assertion:'original-independent-requests-no-native-agent-usage',identity:'preserved-across-copies-and-reexports'},requests:[{requestId:'private-original-id',meters:protocolObservationFixture().meters}]}));
 await command(cwd,['import','--normalized-source',file,'--json']);
 const store=await core.openStore(plan.repository),observation=(await store.journal())[0].observations[0],id=core.observationEvidenceHash(observation);
 const explained=await command(cwd,['explain',id,'--json']),plain=await transcript(cwd,['explain',id]);
 expect(plain).toContain(`Attribution: ${explained.attribution.status} (${explained.attribution.reason})`);
 expect(plain).toContain(`Provider: import; representation: ${explained.representation}; quality: ${explained.quality}; lineage: ${explained.lineage}`);
 expect(plain).toContain('Historical proof: no');
 const meta={schemaVersion:2 as const,protocolVersion:1 as const,repositoryId:plan.declaration.repositoryId,normalizationVersion:1 as const,catalogVersion:core.defaultCatalog.version,catalogHash:core.catalogHash(core.defaultCatalog),policy:plan.declaration.policy};
 const synced=await core.syncUsage({repository:plan.repository,store,binding:plan.activation.binding,collect:'none',initialize:{meta,catalog:core.defaultCatalog},signal:AbortSignal.timeout(15000),deadline:Date.now()+15000});expect(synced.status).toBe('synced');
 const exported=await command(cwd,['contribute','--json']),contribution=await transcript(cwd,['contribute']);expect(contribution).toContain(exported.path);expect(contribution).toContain('Stage this contribution with your normal PR.');
 const status=await command(cwd,['status','--json']),text=await transcript(cwd,['status']);
 expect(text).toContain(`Last confirmed sync: ${synced.confirmedCommit}`);expect(text).toContain('Configuration: current');expect(text).toContain(`Provider import: ${status.providers.find((p:{provider:string})=>p.provider==='import').outcome}`);
 expect(text).toContain('Coverage import: explicit-only; accounting fixture-certified; coverage request');
 expect(text).toContain('independent-origin-not-automatically-verifiable, coverage-partial');
 expect(status.capabilities.integrations.find((p:{provider:string})=>p.provider==='codex').detection).toBe('not-inspected');
 const config=JSON.parse(await readFile(join(cwd,'.agent-badge/config.json'),'utf8'));config.policy.badge.label='Unaccepted';await writeFile(join(cwd,'.agent-badge/config.json'),JSON.stringify(config));
 expect(await transcript(cwd,['status'])).toContain('Configuration: drift');
 expect([plain,contribution,text].join('')).not.toMatch(/private-original-id|private-source|\/private\/|sourceIdentity|nativeUnitId/);
},15000);

test('plaintext doctor setup and uninstall expose required failures owner repair items and independent deactivation',async()=>{
 const {f,cwd,plan}=await activatedFixture();fixtures.push(f);const hook=join(plan.repository.hooksPath,'pre-push');await writeFile(hook,(await readFile(hook,'utf8'))+'\n# user edit\n');
 const doctor=await transcript(cwd,['doctor']);expect(doctor).toContain('git-hooks: fail (required)');expect(doctor).toContain('Remote: not-requested');
 const setup=await transcript(cwd,['setup','--dry-run']);expect(setup).toContain('Owned hook was modified; reconcile it before setup.');expect(process.exitCode).toBe(1);
 const setupJson=await command(cwd,['setup','--dry-run','--json']);expect(setupJson.actionItems).toContain('Owned hook was modified; reconcile it before setup.');
 const removed=await transcript(cwd,['uninstall']);expect(removed).toContain('Automation deactivated: yes');expect(removed).toContain('Unresolved: git-hook-action-required');expect(removed).toContain('Preserved: private-journal');expect(process.exitCode).toBe(1);
 const json=await command(cwd,['uninstall','--json']);expect(json).toMatchObject({deactivated:true,unresolved:expect.arrayContaining(['git-hook-action-required'])});
 expect([doctor,setup,removed].join('')).not.toContain(f.root);
});
