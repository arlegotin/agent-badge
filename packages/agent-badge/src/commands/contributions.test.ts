import { afterEach, expect, test, vi } from 'vitest';
import { mkdir, writeFile, readFile, symlink, readdir, chmod, rm } from 'node:fs/promises';
import * as files from 'node:fs/promises';
import { join } from 'node:path';
import { createBareRemoteFixture, protocolObservationFixture, snapshotUserCheckout } from '@agent-badge/testkit';
import type { GitFixture } from '@agent-badge/testkit';
import * as core from '@legotin/agent-badge-core';
import { buildProgram } from '../cli/main.js';
import { runContributeCommand } from './contribute.js';
import { readAcceptedContributions, readContributionFile, runImportCommand } from './import.js';
vi.mock('node:fs/promises',async () => { const actual = await vi.importActual<typeof files>('node:fs/promises'); return {...actual,open:vi.fn(actual.open)}; });
const repositoryId = '12345678-1234-4234-8234-123456789abc';
const policy = { schemaVersion: 1 as const, repositoryId, normalizationVersion: 1 as const, discovery: 'auto' as const, disabledProviders: [], badge: { label: 'Usage', metric: 'tokens' as const } };
const meta = { schemaVersion: 2 as const, protocolVersion: 1 as const, repositoryId, normalizationVersion: 1 as const, catalogVersion: 1, catalogHash: core.catalogHash(core.defaultCatalog), policy };
const record = core.sanitizeObservation(protocolObservationFixture(), policy);
const fixtures: GitFixture[] = [];
afterEach(async () => { process.exitCode=undefined; vi.restoreAllMocks(); await Promise.all(fixtures.splice(0).map(f => f.cleanup())); });
async function collect<T>(input:AsyncIterable<T>|Promise<T[]>):Promise<T[]> { const resolved=await input; if(Array.isArray(resolved))return resolved; const values:T[]=[]; for await(const value of resolved) values.push(value); return values; }
async function fixture() { const f = await createBareRemoteFixture(); fixtures.push(f); return f; }

test('contribute writes only immutable managed envelope without staging or committing', async () => {
 const f = await fixture(), cwd = f.clones[0];
 const repository = await core.resolveRepository(cwd), store = await core.openStore(repository, { processNamespace: async () => 'synthetic' });
 const before = await snapshotUserCheckout(cwd);
 const result = await runContributeCommand({ cwd, meta, records: [record] });
 expect(result.path).toMatch(/^\.agent-badge\/contributions\/[a-f0-9]{64}\.json$/);
 expect(await readFile(join(cwd, result.path), 'utf8')).toBe(core.contributionBytes(result.envelope));
 const after = await snapshotUserCheckout(cwd);
 expect(after.head).toBe(before.head); expect(after.index).toEqual(before.index);
 expect(after.refs).toBe(before.refs); expect(after.headRef).toBe(before.headRef);
 expect(Object.keys(after.files).sort()).toEqual([...Object.keys(before.files),result.path].sort());
 for(const [path,contents] of Object.entries(before.files)) expect(after.files[path]).toEqual(contents);
 expect(await readdir(join(cwd, '.agent-badge/contributions'))).toHaveLength(1);
 expect((await runContributeCommand({ cwd, meta, records: [record] })).path).toBe(result.path);
 expect(await store.journal()).toEqual([]);
});

test('reads one validated file snapshot and rejects paths, changed bytes, symlinks and executables', async () => {
 const f = await fixture(), cwd = f.clones[0];
 const result = await runContributeCommand({ cwd, meta, records: [record] });
 const snapshot = await readContributionFile(cwd, result.path);
 await chmod(join(cwd,result.path),0o755);
 await expect(readContributionFile(cwd,result.path)).rejects.toThrow();
 await chmod(join(cwd,result.path),0o644);
 await writeFile(join(cwd, result.path), '{"private":"changed"}');
 expect(snapshot.records).toHaveLength(1);
 await expect(readContributionFile(cwd, result.path)).rejects.toThrow();
 await expect(readContributionFile(cwd, '../escape.json')).rejects.toThrow();
 const link = core.contributionPath(core.exportContribution({meta, records: []}));
 await symlink(join(cwd, result.path), join(cwd, link));
 await expect(readContributionFile(cwd, link)).rejects.toThrow();
});

test('only accepted default branch blobs import; unmerged/closed proposals do not affect upstream', async () => {
 const f = await fixture(), cwd = f.clones[0], repository = await core.resolveRepository(cwd);
 const binding = await core.bindRemote(repository, { repositoryId, declaredUrl: f.remote });
 if (binding.status !== 'bound') throw Error('fixture');
 const base = (await f.git(cwd, ['rev-parse', 'HEAD'])).trim();
 const branch = (await f.git(cwd, ['branch', '--show-current'])).trim();
 await f.git(cwd, ['checkout', '-b', 'proposal']);
 const result = await runContributeCommand({ cwd, meta, records: [record] });
 await f.git(cwd, ['add', result.path]); await f.git(cwd, ['commit', '-m', 'Sanitized contribution']);
 const proposal = (await f.git(cwd, ['rev-parse', 'HEAD'])).trim();
 expect(await collect(readAcceptedContributions(repository, { ref: base, defaultBranch: branch, binding }))).toEqual([]);
 await expect(collect(readAcceptedContributions(repository, { ref: proposal, defaultBranch: branch, binding }))).rejects.toThrow();
 await f.git(cwd,['update-ref',`refs/remotes/origin/${branch}`,proposal]);
 await expect(collect(readAcceptedContributions(repository,{ref:proposal,defaultBranch:branch,binding}))).rejects.toThrow();
 await f.git(cwd, ['checkout', branch]); await f.git(cwd, ['merge', '--ff-only', 'proposal']); await f.git(cwd, ['push', 'origin', branch]);
 await f.git(cwd, ['fetch', 'origin']);
 await writeFile(join(cwd, result.path), '{"changed":"worktree"}');
 const accepted = await collect(readAcceptedContributions(repository, { ref: proposal, defaultBranch: branch, binding }));
 expect(accepted).toHaveLength(1); expect(accepted[0].records).toHaveLength(1);
});


test('interrupted export leaves no partial immutable receipt blocking a retry', async () => {
 const f = await fixture(), cwd = f.clones[0];
 const original = (await vi.importActual<typeof files>('node:fs/promises')).open;
 vi.mocked(files.open).mockImplementation(async (...args: Parameters<typeof files.open>) => {
   const handle = await original(...args);
   const write = handle.writeFile.bind(handle);
   handle.writeFile = async () => { await write('partial'); throw new Error('synthetic disk failure'); };
   return handle;
 });
 await expect(runContributeCommand({cwd,meta,records:[record]})).rejects.toThrow('synthetic disk failure');
 expect(await readdir(join(cwd,'.agent-badge/contributions'))).toEqual([]);
 vi.mocked(files.open).mockImplementation(original);
 const retry = await runContributeCommand({cwd,meta,records:[record]});
 expect((await readContributionFile(cwd,retry.path)).records).toHaveLength(1);
});


test('trusted accepted import performs one shared transaction without running tracked launcher or lifecycle code', async () => {
 const f = await fixture(), cwd = f.clones[0], repository = await core.resolveRepository(cwd);
 const binding = await core.bindRemote(repository,{repositoryId,declaredUrl:f.remote});
 const store = await core.openStore(repository,{processNamespace:async()=> 'synthetic'});
 await core.syncUsage({repository,binding,store,collect:'none',initialize:{meta,catalog:core.defaultCatalog},signal:AbortSignal.timeout(20000),deadline:Date.now()+20000});
 const contribution = await runContributeCommand({cwd,meta,records:[record]});
 await writeFile(join(cwd,'package.json'),'{"scripts":{"postinstall":"touch ROOT_EXECUTED"}}');
 await writeFile(join(cwd,'.agent-badge/run.cjs'),'require("node:fs").writeFileSync("LAUNCHER_EXECUTED","unsafe")');
 await f.git(cwd,['add',contribution.path,'package.json','.agent-badge/run.cjs']); await f.git(cwd,['commit','-m','Accept contribution data']); await f.git(cwd,['push','origin','HEAD']);
 const acceptedRef = (await f.git(cwd,['rev-parse','HEAD'])).trim();
 await f.git(cwd,['commit','--allow-empty','-m','Later accepted default branch work']); await f.git(cwd,['push','origin','HEAD']);
 const before = await snapshotUserCheckout(cwd);
 const result = await runImportCommand({cwd,acceptedRef,defaultBranch:'main',repositoryId,repositoryUrl:f.remote});
 expect(result.status).toBe('synced');
 expect('accepted' in result && result.accepted?.ledger.knownTokens).toBe('140');
 expect(await snapshotUserCheckout(cwd)).toEqual(before);
 expect(await f.git(cwd,['for-each-ref','--format=%(refname)','refs/agent-badge/imports'])).toBe('');
 await expect(readFile(join(cwd,'ROOT_EXECUTED'))).rejects.toThrow(); await expect(readFile(join(cwd,'LAUNCHER_EXECUTED'))).rejects.toThrow();
 expect((await runImportCommand({cwd,acceptedRef,defaultBranch:'main',repositoryId,repositoryUrl:f.remote})).status).toBe('unchanged');
 // Several manual transactions/Git setup retain their own budgets; the framework must allow them to finish.
},30000);


async function acceptedFixture() {
 const f=await fixture(),cwd=f.clones[0],repository=await core.resolveRepository(cwd);
 const binding=await core.bindRemote(repository,{repositoryId,declaredUrl:f.remote}); if(binding.status!=='bound')throw Error('fixture');
 const store=await core.openStore(repository,{processNamespace:async()=> 'synthetic'});
 await core.syncUsage({repository,binding,store,collect:'none',initialize:{meta,catalog:core.defaultCatalog},signal:AbortSignal.timeout(20000),deadline:Date.now()+20000});
 return {f,cwd,repository,binding,store};
}
async function acceptFiles(f:GitFixture,cwd:string,paths:string[]) {
 await f.git(cwd,['add',...paths]); await f.git(cwd,['commit','-m','Accepted sanitized envelopes']); await f.git(cwd,['push','origin','HEAD']); return (await f.git(cwd,['rev-parse','HEAD'])).trim();
}

test('accepted history exceeding one envelope count is streamed without an aggregate historical ceiling',async()=> {
 const f=await fixture(),cwd=f.clones[0],repository=await core.resolveRepository(cwd);
 const binding=await core.bindRemote(repository,{repositoryId,declaredUrl:f.remote}); if(binding.status!=='bound')throw Error('fixture');
 const paths:string[]=[];
 for(const [start,count] of [[0,6000],[6000,4001]]) {
  const records=Array.from({length:count},(_,offset)=>({schemaVersion:2 as const,normalizationVersion:1 as const,repositoryId,kind:'exclude' as const,targetUnitKey:(start+offset).toString(16).padStart(64,'0'),supersedes:[]}));
  paths.push((await runContributeCommand({cwd,meta,records})).path);
 }
 const ref=await acceptFiles(f,cwd,paths); let count=0,files=0;
 for(const envelope of await collect(readAcceptedContributions(repository,{ref,defaultBranch:'main',binding}))) { count+=envelope.records.length; files++; }
 expect(files).toBe(2); expect(count).toBe(10001);
},30000);

test('sequential confirmed batches survive interruption and replay without private source acknowledgements',async()=> {
 const {f,cwd,repository,store}=await acceptedFixture();
 const second=core.sanitizeObservation({...protocolObservationFixture(),nativeUnitId:'second',nativeCoverageId:'second'},policy);
 const one=await runContributeCommand({cwd,meta,records:[record]}),two=await runContributeCommand({cwd,meta,records:[second]});
 const acceptedRef=await acceptFiles(f,cwd,[one.path,two.path]);
 const options={cwd,acceptedRef,defaultBranch:'main',repositoryId,repositoryUrl:f.remote};
 const controller=new AbortController();
 const interrupted=await runImportCommand({...options,signal:controller.signal,onProgress:progress=> {if(progress.confirmedEnvelopes===1)controller.abort();}});
 expect(interrupted).toMatchObject({status:'partial',complete:false,retryRequired:true,confirmedEnvelopes:1,failure:'aborted'});
 expect(interrupted.accepted?.ledger.knownTokens).toBe('140');
 const resumed=await runImportCommand(options);
 expect(resumed).toMatchObject({status:'synced',complete:true,retryRequired:false,confirmedEnvelopes:2});
 expect(resumed.accepted?.ledger.knownTokens).toBe('280');
 const replay=await runImportCommand(options);
 expect(replay).toMatchObject({status:'unchanged',complete:true,confirmedEnvelopes:2,confirmedCommit:resumed.confirmedCommit});
 expect(await store.journal()).toEqual([]);
 expect(await readdir(repository.privateDir)).not.toContain('acknowledgements');
 expect((await core.readStoreSnapshot(repository)).pending).toEqual([]);
 expect(await f.git(cwd,['for-each-ref','--format=%(refname)','refs/agent-badge/imports'])).toBe('');
},30000);

test('fresh CI skips confirmed historical envelopes by validated membership and reaches new data',async()=>{
 const {f,cwd,store}=await acceptedFixture();const paths:string[]=[];
 for(let i=0;i<5;i++)paths.push((await runContributeCommand({cwd,meta,records:[{...record,unitKey:i.toString(16).padStart(64,'0'),coverageKey:i.toString(16).padStart(64,'0')}]})).path);
 let acceptedRef=await acceptFiles(f,cwd,paths);
 const options={cwd,acceptedRef,defaultBranch:'main',repositoryId,repositoryUrl:f.remote};
 expect((await runImportCommand(options)).complete).toBe(true);
 const imports=vi.spyOn(core,'importContribution'),now=Date.now.bind(Date);let expired=false;
 const clock=vi.spyOn(Date,'now').mockImplementation(()=>now()+(expired?120001:0));
 try {
  const interrupted=await runImportCommand({...options,cwd:f.clones[1],onProgress:()=>{expired=true;}});
  expect(interrupted).toMatchObject({status:'partial',complete:false,confirmedEnvelopes:1,failure:'deadline'});
  expect(imports).not.toHaveBeenCalled();
 }finally{clock.mockRestore();}
 // A fresh CI process has no trusted progress cursor or private accepted cache.
 await rm((await core.resolveRepository(f.clones[1])).privateDir,{recursive:true,force:true});
 const added={...record,unitKey:'e'.repeat(64),coverageKey:'e'.repeat(64)};
 const next=await runContributeCommand({cwd,meta,records:[added]});acceptedRef=await acceptFiles(f,cwd,[next.path]);
 const resumed=await runImportCommand({...options,cwd:f.clones[1],acceptedRef});
 expect(resumed).toMatchObject({status:'synced',complete:true,confirmedEnvelopes:6});
 expect(imports).toHaveBeenCalledTimes(1);expect(resumed.accepted!.ledger.recordedUnits).toBe(6);expect(await store.journal()).toEqual([]);
},30000);

test('accepted envelope histories read verified blobs in bounded batches',async()=>{
 const {f,cwd,repository,binding}=await acceptedFixture();const paths:string[]=[];
 for(let i=0;i<3;i++)paths.push((await runContributeCommand({cwd,meta,records:[{...record,unitKey:i.toString(16).padStart(64,'0')}]})).path);
 const ref=await acceptFiles(f,cwd,paths),calls=vi.spyOn(core,'readVerifiedGitBlobs');
 expect(await collect(readAcceptedContributions(repository,{ref,defaultBranch:'main',binding}))).toHaveLength(3);
 expect(calls).toHaveBeenCalledTimes(1);expect(calls.mock.calls[0][1]).toHaveLength(3);
});

test('a malformed later accepted envelope reports already confirmed progress instead of rolling it back',async()=> {
 const {f,cwd}=await acceptedFixture();
 const one=await runContributeCommand({cwd,meta,records:[record]});
 const bad='.agent-badge/contributions/'+ 'f'.repeat(64)+'.json'; await writeFile(join(cwd,bad),'{}');
 const acceptedRef=await acceptFiles(f,cwd,[one.path,bad]);
 const result=await runImportCommand({cwd,acceptedRef,defaultBranch:'main',repositoryId,repositoryUrl:f.remote});
 expect(result).toMatchObject({status:'partial',complete:false,retryRequired:true,confirmedEnvelopes:1,failure:'invalid-contribution'});
 expect(result.accepted?.ledger.knownTokens).toBe('140');
 const output:string[]=[]; vi.spyOn(console,'log').mockImplementation((...args)=>{output.push(args.join(' '));});
 vi.spyOn(process,'cwd').mockReturnValue(cwd);
 await buildProgram().parseAsync(['import','--accepted-ref',acceptedRef,'--default-branch','main','--repository-id',repositoryId,'--repository-url',f.remote],{from:'user'});
 expect(process.exitCode).toBe(1); expect(output.join('\n')).toContain('complete false');
 expect(output.join('\n')).not.toMatch(/unitKey|targetUnitKey|Unsafe|invalid-record/);
},30000);
