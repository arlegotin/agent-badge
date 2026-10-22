import { mkdtemp, mkdir, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hostname } from 'node:os';
import { afterEach, describe, expect, test } from 'vitest';
import { certifiedClaudeImport, claudeNativeResponse, protocolObservationFixture, runStorageFixtureProcess, createBareRemoteFixture, snapshotUserCheckout } from '@agent-badge/testkit';
import type { Checkpoint, ScanBatch, SourceDescriptor } from '../domain/capabilities.js';
import type { RepositoryContext } from '../git/context.js';
import { CLAUDE_SOURCE_SCHEMA, parseClaudeTranscript } from '../providers/claude/reader.js';
import { sanitizeObservation } from '../ledger/sanitize.js';
import { recordHash } from '../ledger/canonical-json.js';
import { openStore as openNativeStore } from './store.js';
const openStore = (ctx: RepositoryContext) => openNativeStore(ctx, { processNamespace: async () => 'synthetic-namespace' });
import { resolveRepository } from '../git/context.js';

const repositoryId = '12345678-1234-4234-8234-123456789abc';
const policy = { schemaVersion: 1 as const, repositoryId, normalizationVersion: 1 as const,
  discovery: 'auto' as const, disabledProviders: [], badge: { label: 'AI usage', metric: 'tokens' as const } };
const roots: string[] = [];
async function context(): Promise<RepositoryContext> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'agent-badge-storage-'))); roots.push(root);
  const commonDir = join(root, '.git'); await mkdir(commonDir);
  return { worktreeRoot: root, gitDir: commonDir, commonDir, privateDir: join(commonDir, 'agent-badge'),
    hooksPath: join(commonDir, 'hooks'), superprojectRoot: null, worktrees: [],
    head: { kind: 'unborn', ref: 'refs/heads/main' }, shallow: false };
}
function fixture(generation = 'generation-1', offset = 10) {
  const observation = protocolObservationFixture();
  observation.source = { ...observation.source, instanceKey: 'synthetic-instance', sourceIdentity: '/synthetic/source', generation };
  const source: SourceDescriptor = { provider: 'codex', root: '/synthetic', schema: observation.source.sourceSchema,
    instanceKey: observation.source.instanceKey, sourceIdentity: observation.source.sourceIdentity,
    generation, readerVersion: '1' };
  const checkpoint: Checkpoint = { schemaVersion: 1, provider: 'codex', instanceKey: source.instanceKey,
    sourceIdentity: source.sourceIdentity, sourceGeneration: generation, sourceSchema: source.schema,
    readerVersion: '1', normalizationVersion: 1, repositoryId, attributionPolicyHash: 'a'.repeat(64),
    continuation: null, cursor: { offset, size: offset, prefixHash: 'b'.repeat(64), incompleteTail: '' } };
  const batch: ScanBatch = { source, observations: [observation], nextCheckpoint: checkpoint, outcome: 'complete', diagnostics: [] };
  // Shared policy fixture is validated by sanitizer, independent from storage.
  const record = sanitizeObservation(observation, policy as never);
  return { source, batch, record };
}
function claudeFixture() {
  const base=fixture();
  const source:SourceDescriptor={...base.source,provider:'claude',schema:CLAUDE_SOURCE_SCHEMA};
  const observations=parseClaudeTranscript(Buffer.from(JSON.stringify(claudeNativeResponse())+'\n'),source).observations;
  const batch:ScanBatch={...base.batch,source,observations,outcome:'partial',nextCheckpoint:{...base.batch.nextCheckpoint,provider:'claude',sourceSchema:source.schema}};
  const record=sanitizeObservation(observations[0],policy);
  return {source,batch,record};
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe('durable repository store', () => {
  test('bounded cache rebuild resumes validated source/control/ack stages without exposing partial pending state',async()=>{
    const ctx=await context(),store=await openStore(ctx),first=fixture();
    for(let i=0;i<12;i++){const next=fixture();next.batch.observations[0].nativeUnitId='rebuild-'+i;await store.commitBatch(next.source,next.batch,[sanitizeObservation(next.batch.observations[0],policy)]);}
    const control={schemaVersion:2 as const,normalizationVersion:1 as const,repositoryId,kind:'exclude' as const,targetUnitKey:first.record.unitKey,supersedes:[]};await store.commitControl(control);
    const all=await store.pending();await store.acknowledge([recordHash(all[0])]);const expected=await store.pending();await store.invalidateCache();
    let deferred=0,actual;
    for(let run=0;run<10;run++){
      const resumed=await openNativeStore(ctx,{processNamespace:async()=>'synthetic-namespace',rebuildBudget:{signal:AbortSignal.timeout(2000),deadline:Date.now()+2000,maxEntries:3}});
      try{actual=await resumed.pending();break;}catch(error){expect(String(error)).toContain('store-busy');deferred++;}
    }
    expect(deferred).toBeGreaterThan(1);expect(actual).toEqual(expected);
    expect(await readdir(join(ctx.privateDir,'cache'))).not.toContain('index-stage.sqlite');
  });
  test.each(['corrupt-stage','missing-stage-manifest','interrupted-promotion','changed-authority'])('local rebuild handles %s without accepting a partial generation',async(fault)=>{
    const ctx=await context(),store=await openStore(ctx),first=fixture();
    for(let i=0;i<5;i++)await store.commitBatch(first.source,first.batch,[first.record]);
    const expected=await store.pending();await store.invalidateCache();
    const resume=async()=>openNativeStore(ctx,{processNamespace:async()=>'synthetic-namespace',rebuildBudget:{signal:AbortSignal.timeout(2000),deadline:Date.now()+2000,maxEntries:2}});
    await expect((await resume()).pending()).rejects.toThrow('store-busy');
    if(fault==='corrupt-stage')await writeFile(join(ctx.privateDir,'cache/index-stage.sqlite'),'corrupt');
    if(fault==='missing-stage-manifest')await rm(join(ctx.privateDir,'cache/index-stage.json'));
    if(fault==='interrupted-promotion'){const {rename}=await import('node:fs/promises');await rename(join(ctx.privateDir,'cache/index-stage.sqlite'),join(ctx.privateDir,'cache/index.sqlite'));}
    if(fault==='changed-authority'){await writeFile(join(ctx.privateDir,'journal/0000000000000005.json'),'{}');await expect((await resume()).pending()).rejects.toThrow('invalid-durable-data');return;}
    let actual;for(let i=0;i<5;i++)try{actual=await (await resume()).pending();break;}catch(error){expect(String(error)).toContain('store-busy');}
    expect(actual).toEqual(expected);
  });
  test('bounded pending groups keep controls with their unit and skip oversized groups without losing unrelated progress',async()=>{
    const ctx=await context(),store=await openStore(ctx),first=fixture();
    await store.commitBatch(first.source,first.batch,[first.record]);
    for(let i=0;i<3;i++)await store.commitControl({schemaVersion:2,normalizationVersion:1,repositoryId,kind:'exclude',targetUnitKey:first.record.unitKey,supersedes:i?['a'.repeat(63)+i]:[]});
    const unrelated={schemaVersion:2 as const,normalizationVersion:1 as const,repositoryId,kind:'exclude' as const,targetUnitKey:'f'.repeat(64),supersedes:[]};await store.commitControl(unrelated);
    expect(await store.pendingCount()).toBe(5);
    const small=await store.pendingBatch(2,512*1024);expect(small).toEqual({records:[unrelated],deferredUnitCount:1});
    const all=await store.pendingBatch(128,512*1024);expect(all.records).toHaveLength(5);expect(all.deferredUnitCount).toBe(0);
    await store.acknowledge([recordHash(unrelated)]);expect(await (await openStore(ctx)).pendingCount()).toBe(4);
  });
  test.each(['journal','controls'])('verified inventory rejects missing authoritative %s members',async(kind)=>{
    const ctx=await context(),store=await openStore(ctx),first=fixture();
    await store.commitBatch(first.source,first.batch,[first.record]);
    const control={schemaVersion:2 as const,normalizationVersion:1 as const,repositoryId,kind:'exclude' as const,targetUnitKey:'a'.repeat(64),supersedes:[]};
    await store.commitControl(control);
    const directory=join(ctx.privateDir,kind),names=await readdir(directory);
    await rm(join(directory,names.at(-1)!));
    await expect((await openStore(ctx)).pending()).rejects.toThrow('invalid-durable-data');
  });
  test.each(['delete','corrupt'])('cache-only %s rebuilds complete journal and controls',async(kind)=>{
    const ctx=await context(),store=await openStore(ctx),first=fixture();
    await store.commitBatch(first.source,first.batch,[first.record]);
    const control={schemaVersion:2 as const,normalizationVersion:1 as const,repositoryId,kind:'exclude' as const,targetUnitKey:'a'.repeat(64),supersedes:[]};
    await store.commitControl(control);const expected=await store.pending();
    if(kind==='delete')await rm(join(ctx.privateDir,'cache'),{recursive:true});
    else await writeFile(join(ctx.privateDir,'cache/index.sqlite'),'invalid sqlite');
    expect(await (await openStore(ctx)).pending()).toEqual(expected);
  });
  test('unchanged reconciliation state does not republish durable scheduling bytes',async()=>{
    const ctx=await context(),store=await openStore(ctx);await store.recordReconciliationPending(true);await store.recordAutomaticSourceOffset(7);
    const path=join(ctx.privateDir,'reconciliation.json'),before=await stat(path,{bigint:true});
    await store.recordReconciliationPending(true);await store.recordAutomaticSourceOffset(7);
    const after=await stat(path,{bigint:true});expect(after.ino).toBe(before.ino);expect(after.mtimeNs).toBe(before.mtimeNs);
  });
  test('source index selects exact journal evidence and rebuilds after cache loss or durable replacement', async () => {
    const ctx=await context(),store=await openStore(ctx),first=fixture(),other=fixture();
    other.source={...other.source,sourceIdentity:'/synthetic/other'};
    other.batch={...other.batch,source:other.source,nextCheckpoint:{...other.batch.nextCheckpoint,sourceIdentity:other.source.sourceIdentity},
      observations:other.batch.observations.map(o=>({...o,nativeUnitId:'other',source:{...o.source,sourceIdentity:other.source.sourceIdentity}}))};
    await store.commitBatch(first.source,first.batch,[first.record]);
    await store.commitBatch(other.source,other.batch,[sanitizeObservation(other.batch.observations[0],policy)]);
    expect((await store.sourceJournal(first.source)).map(entry=>entry.sequence)).toEqual([1]);
    await store.invalidateCache();
    expect((await (await openStore(ctx)).sourceJournal(other.source)).map(entry=>entry.sequence)).toEqual([2]);
    await writeFile(join(ctx.privateDir,'journal','0000000000000001.json'),'{}');
    await expect((await openStore(ctx)).checkpointCandidate(first.source)).rejects.toThrow('invalid-durable-data');
  });
  test('acknowledgement batches survive restart without rewriting earlier confirmed evidence', async () => {
    const ctx = await context(), store = await openStore(ctx), first = fixture();
    await store.commitBatch(first.source, first.batch, [first.record]);
    await store.acknowledge([recordHash(first.record)]);
    const dir = join(ctx.privateDir, 'acknowledgements');
    const files = await readdir(dir), original = await readFile(join(dir, files[0]));
    const next = fixture(); next.batch.observations[0].nativeUnitId = 'second';
    const second = sanitizeObservation(next.batch.observations[0], policy);
    await store.commitBatch(next.source, next.batch, [second]);
    await store.acknowledge([recordHash(second)]);
    expect(await readFile(join(dir, files[0]))).toEqual(original);
    expect(await (await openStore(ctx)).pending()).toEqual([]);
    await writeFile(join(dir, files[0]), '{}');
    await expect((await openStore(ctx)).pending()).rejects.toThrow('invalid-durable-data');
  });
  test('restart replays once by public hash and retains private metadata after acknowledgement', async () => {
    const ctx = await context(); const { source, batch, record } = fixture();
    const store = await openStore(ctx);
    await store.commitBatch(source, batch, [record]);
    await store.commitBatch(source, batch, [record]);
    const restarted = await openStore(ctx);
    expect(await restarted.pending()).toEqual([record]);
    expect((await restarted.checkpoint(source, batch.nextCheckpoint))?.cursor.offset).toBe(10);
    await restarted.acknowledge(['f'.repeat(64)]);
    expect(await restarted.pending()).toEqual([record]);
    await restarted.acknowledge([recordHash(record)]);
    expect(await (await openStore(ctx)).pending()).toEqual([]);
    expect((await restarted.journal()).flatMap(entry => entry.observations)).toHaveLength(2);
  });

  test('rejects separate public records promoted from untouched Claude private evidence',async()=>{
    const ctx=await context();const store=await openStore(ctx);const {source,batch,record}=claudeFixture();
    const promoted={...record,meters:batch.observations[0].privateEvidence!.meters};
    const unchanged=structuredClone(batch);
    await expect(store.commitBatch(source,batch,[promoted])).rejects.toThrow('invalid-batch');
    expect(batch).toEqual(unchanged);expect(await store.pending()).toEqual([]);expect(await store.journal()).toEqual([]);
    await store.commitBatch(source,batch,[record]);expect(await (await openStore(ctx)).pending()).toEqual([record]);
  });

  test('enforces the Claude identity-only source contract without privateEvidence or observations',async()=>{
    const ctx=await context();const store=await openStore(ctx);const {source,batch,record}=claudeFixture();
    const meters=batch.observations[0].privateEvidence!.meters;
    const withoutEvidence=batch.observations.map(({privateEvidence:_,...observation})=>observation);
    await expect(store.commitBatch(source,{...batch,observations:withoutEvidence},[{...record,meters}])).rejects.toThrow('invalid-batch');
    await expect(store.commitBatch(source,{...batch,observations:[]},[{...record,meters}])).rejects.toThrow('invalid-batch');
    await expect(store.commitBatch(source,{...batch,observations:withoutEvidence.map(observation=>({...observation,meters}))},[])).rejects.toThrow('invalid-batch');
    const measuredZero={...record,meters:record.meters.map(meter=>({...meter,input:0}))};
    await expect(store.commitBatch(source,{...batch,observations:withoutEvidence},[measuredZero])).rejects.toThrow('invalid-batch');
    expect(await store.pending()).toEqual([]);expect(await store.journal()).toEqual([]);
  });

  test('rejects promoted native Claude records during durable journal recovery',async()=>{
    const ctx=await context();const store=await openStore(ctx);const {source,batch,record}=claudeFixture();
    await store.commitBatch(source,batch,[record]);const journalPath=join(ctx.privateDir,'journal','0000000000000001.json');
    const entry=JSON.parse(await readFile(journalPath,'utf8'));
    const promotedMeters=entry.observations[0].privateEvidence.meters;
    entry.records[0].meters=promotedMeters;
    delete entry.observations[0].privateEvidence;
    await writeFile(journalPath,JSON.stringify(entry));
    const recovered=await openStore(ctx);await expect(recovered.pending()).rejects.toThrow('invalid-durable-data');
    await expect(recovered.journal()).rejects.toThrow('invalid-durable-data');
    entry.records[0]=record;entry.observations[0].meters=promotedMeters;
    await writeFile(journalPath,JSON.stringify(entry));await expect(recovered.pending()).rejects.toThrow('invalid-durable-data');
  });

  test('preserves explicitly certified numeric imports through durable commit and recovery',async()=>{
    const ctx=await context();const store=await openStore(ctx);const base=fixture();const observation=certifiedClaudeImport();
    const source:SourceDescriptor={...base.source,provider:'import',schema:observation.source.sourceSchema};
    observation.source={...observation.source,instanceKey:source.instanceKey,sourceIdentity:source.sourceIdentity,generation:source.generation};
    const record=sanitizeObservation(observation,policy);
    const batch:ScanBatch={...base.batch,source,observations:[observation],nextCheckpoint:{...base.batch.nextCheckpoint,provider:'import',sourceSchema:source.schema}};
    await store.commitBatch(source,batch,[record]);const recovered=await openStore(ctx);
    expect(await recovered.pending()).toEqual([record]);expect((await recovered.journal())[0].records[0]).toHaveProperty('meters.0.total',100);
  });

  test('unknown confirmation hashes cannot pre-acknowledge records collected later', async () => {
    const ctx = await context(); const store = await openStore(ctx); const f = fixture();
    await store.acknowledge([recordHash(f.record)]);
    await store.commitBatch(f.source, f.batch, [f.record]);
    expect(await store.pending()).toEqual([f.record]);
  });

  test('checkpoint reuse requires matching normalization, repository, policy and reader authority', async () => {
    const ctx = await context(); const store = await openStore(ctx); const f = fixture();
    await store.commitBatch(f.source, f.batch, [f.record]);
    expect(await store.checkpoint(f.source, { ...f.batch.nextCheckpoint, normalizationVersion: 2 } as never)).toBeNull();
    expect(await store.checkpoint(f.source, { ...f.batch.nextCheckpoint, attributionPolicyHash: 'c'.repeat(64) })).toBeNull();
    expect(await store.checkpoint(f.source, { ...f.batch.nextCheckpoint, repositoryId: '12345678-1234-4234-8234-123456789abd' })).toBeNull();
    expect(await store.checkpoint({ ...f.source, readerVersion: 'future' }, f.batch.nextCheckpoint)).toBeNull();
    expect((await store.checkpoint(f.source, f.batch.nextCheckpoint))?.cursor.offset).toBe(10);
  });

  test('deleting malformed disposable cache never clears pending durable data', async () => {
    const ctx = await context(); const store = await openStore(ctx); const f = fixture();
    await store.commitBatch(f.source, f.batch, [f.record]);
    await writeFile(join(ctx.privateDir, 'cache', 'broken.json'), '{');
    await store.invalidateCache();
    expect(await readdir(join(ctx.privateDir, 'cache'))).toEqual([]);
    expect(await store.pending()).toEqual([f.record]);
  });

  test('source replacement resets checkpoint without deleting old pending evidence', async () => {
    const ctx = await context(); const store = await openStore(ctx); const old = fixture(); const next = fixture('generation-2', 2);
    await store.commitBatch(old.source, old.batch, [old.record]);
    expect(await store.checkpoint(next.source, next.batch.nextCheckpoint)).toBeNull();
    await store.commitBatch(next.source, next.batch, [next.record]);
    expect((await store.checkpoint(next.source, next.batch.nextCheckpoint))?.cursor.offset).toBe(2);
    expect(await store.pending()).toEqual([old.record]);
    expect(await store.journal()).toHaveLength(2);
  });

  test('rejects stale generations and cursor regression while preserving previous evidence', async () => {
    const ctx = await context(); const store = await openStore(ctx);
    const old = fixture(); const next = fixture('generation-2', 20);
    await store.commitBatch(old.source, old.batch, [old.record]);
    await store.commitBatch(next.source, next.batch, [next.record]);
    await expect(store.commitBatch(old.source, old.batch, [old.record])).rejects.toThrow('invalid-batch');
    const regressed = fixture('generation-2', 3);
    await expect(store.commitBatch(regressed.source, regressed.batch, [regressed.record])).rejects.toThrow('invalid-batch');
    expect((await store.checkpoint(next.source, next.batch.nextCheckpoint))?.cursor.offset).toBe(20);
    expect(await store.journal()).toHaveLength(2);
  });

  test('caller mutations after commit cannot alter durable observations or records', async () => {
    const ctx = await context(); const store = await openStore(ctx); const f = fixture();
    const operation = store.commitBatch(f.source, f.batch, [f.record]);
    f.record.meters[0].total = 999;
    f.batch.observations[0].nativeUnitId = 'changed-after-call';
    await operation;
    expect((await store.pending())[0]).toHaveProperty('meters.0.total', 140);
    expect((await store.journal())[0].observations[0].nativeUnitId).not.toBe('changed-after-call');
  });

  test('missing source preserves last valid observation and checkpoint', async () => {
    const ctx = await context(); const store = await openStore(ctx); const f = fixture();
    await store.commitBatch(f.source, f.batch, [f.record]);
    await store.commitBatch(f.source, { ...f.batch, observations: [], outcome: 'unavailable', nextCheckpoint: { ...f.batch.nextCheckpoint, cursor: { ...f.batch.nextCheckpoint.cursor, offset: 0 } } }, []);
    expect(await store.pending()).toEqual([f.record]);
    expect((await store.checkpoint(f.source, f.batch.nextCheckpoint))?.cursor.offset).toBe(10);
  });

  test('rejects unsafe public fields and mismatched source/checkpoint before persisting', async () => {
    const ctx = await context(); const store = await openStore(ctx); const f = fixture();
    await expect(store.commitBatch(f.source, f.batch, [{ ...f.record, prompt: 'private' } as never])).rejects.toThrow();
    await expect(store.commitBatch(f.source, { ...f.batch, nextCheckpoint: { ...f.batch.nextCheckpoint, sourceGeneration: 'wrong' } }, [f.record])).rejects.toThrow();
    expect(await store.pending()).toEqual([]);
    expect(await store.journal()).toEqual([]);
  });

  test('private directory/file modes and symlink refusal protect discovery metadata', async () => {
    const ctx = await context(); const store = await openStore(ctx); const f = fixture();
    await store.commitBatch(f.source, f.batch, [f.record]);
    if (process.platform !== 'win32') {
      expect((await stat(ctx.privateDir)).mode & 0o777).toBe(0o700);
      const names = await readdir(join(ctx.privateDir, 'journal'));
      expect((await stat(join(ctx.privateDir, 'journal', names[0]))).mode & 0o777).toBe(0o600);
    }
    const other = await context(); await symlink(ctx.privateDir, other.privateDir);
    await expect(openStore(other)).rejects.toThrow();
    await rm(join(ctx.privateDir, 'cache'), { recursive: true });
    await symlink(ctx.worktreeRoot, join(ctx.privateDir, 'cache'));
    await expect(store.invalidateCache()).rejects.toThrow();
    expect(await stat(ctx.worktreeRoot)).toBeDefined();
  });

  test('parallel mutations inside one lock remain serialized', async () => {
    const ctx = await context(); const store = await openStore(ctx); const f = fixture();
    await store.withLock(AbortSignal.timeout(1000), async () => {
      await Promise.all(Array.from({ length: 5 }, () => store.commitBatch(f.source, f.batch, [f.record])));
    });
    expect((await store.journal()).map(entry => entry.sequence)).toEqual([1, 2, 3, 4, 5]);
  });

  test('future or corrupt durable journals fail closed with a path-free diagnostic', async () => {
    const ctx = await context(); const store = await openStore(ctx); const f = fixture();
    await store.commitBatch(f.source, f.batch, [f.record]);
    const path = join(ctx.privateDir, 'journal', (await readdir(join(ctx.privateDir, 'journal')))[0]);
    const original = JSON.parse(await readFile(path, 'utf8'));
    await writeFile(path, JSON.stringify({ ...original, schemaVersion: 999 }));
    await expect((await openStore(ctx)).pending()).rejects.toThrow('unsupported-durable-schema');
    await writeFile(path, '{');
    await expect(store.pending()).rejects.toThrow('invalid-durable-data');
  });

  test('lock release errors remain path-free and leave a conservatively recoverable owner', async () => {
    const ctx = await context(); const prelude = await childFixture(ctx);
    const result = await runStorageFixtureProcess(project, prelude + `
      const unlink = fs.default.unlink.bind(fs.default);
      fs.default.unlink = path => String(path).endsWith('/operation.lock') ? Promise.reject(Object.assign(new Error('private/path/secret.ts'), { code: 'EACCES' })) : unlink(path);
      try { await store.commitBatch(source, batch, [record]); } catch (error) { console.log(error.message); process.exitCode = 4; }
    `);
    expect(result.code).toBe(4); expect(result.stdout.trim()).toBe('store-permission');
    expect(await (await openStore(ctx)).pending()).toHaveLength(1);
  });

  test('queued operations drain before an explicit owner releases the common lock', async () => {
    const ctx = await context(); const prelude = await childFixture(ctx);
    const result = await runStorageFixtureProcess(project, prelude + `
      const rename = fs.default.rename.bind(fs.default);
      fs.default.rename = async (from, to) => { if (String(to).includes('/journal/')) await new Promise(r => setTimeout(r, 200)); return rename(from, to); };
      let queued;
      await store.withLock(AbortSignal.timeout(1000), async () => { queued = store.commitBatch(source, batch, [record]); });
      console.log((await fs.readdir(ctx.privateDir + '/journal')).filter(name => name.endsWith('.json')).length);
      await queued;
    `);
    expect(result.code).toBe(0); expect(result.stdout.trim()).toBe('1'); expect(result.stderr).toBe('');
  });

  test('invalid durable source/checkpoint relationships fail closed on replay', async () => {
    const ctx = await context(); const store = await openStore(ctx); const f = fixture();
    await store.commitBatch(f.source, f.batch, [f.record]);
    const path = join(ctx.privateDir, 'journal', (await readdir(join(ctx.privateDir, 'journal')))[0]);
    const original = JSON.parse(await readFile(path, 'utf8'));
    await writeFile(path, JSON.stringify({ ...original, checkpoint: { ...original.checkpoint, sourceGeneration: 'unrelated' } }));
    await expect(store.pending()).rejects.toThrow('invalid-durable-data');
  });

  test('future durable acknowledgements block new commits without touching journal', async () => {
    const ctx = await context(); const store = await openStore(ctx); const f = fixture();
    await writeFile(join(ctx.privateDir, 'acknowledged.json'), JSON.stringify({ schemaVersion: 9, hashes: [] }));
    await expect(store.commitBatch(f.source, f.batch, [f.record])).rejects.toThrow('unsupported-durable-schema');
    expect(await readdir(join(ctx.privateDir, 'journal'))).toEqual([]);
  });

  test('derived checkpoint corruption cannot put the cursor ahead of the durable journal', async () => {
    const ctx = await context(); const store = await openStore(ctx); const f = fixture();
    await store.commitBatch(f.source, f.batch, [f.record]);
    const path = join(ctx.privateDir, 'checkpoints', (await readdir(join(ctx.privateDir, 'checkpoints')))[0]);
    await writeFile(path, JSON.stringify({ schemaVersion: 999, cursor: 99999999 }));
    expect((await store.checkpoint(f.source, f.batch.nextCheckpoint))?.cursor.offset).toBe(10);
    await rm(join(ctx.privateDir, 'checkpoints'), { recursive: true });
    await mkdir(join(ctx.privateDir, 'checkpoints'));
    expect((await store.checkpoint(f.source, f.batch.nextCheckpoint))?.cursor.offset).toBe(10);
    expect(await store.pending()).toEqual([f.record]);
  });

  test('shared common directory serializes competing stores and supports explicit transaction lock', async () => {
    const ctx = await context(); const first = await openStore(ctx); const linked = await openStore({ ...ctx, worktreeRoot: join(ctx.worktreeRoot, 'linked'), gitDir: join(ctx.commonDir, 'worktrees', 'linked') });
    const a = fixture(); const b = fixture('generation-2', 20);
    await Promise.all([first.commitBatch(a.source, a.batch, [a.record]), linked.commitBatch(b.source, b.batch, [b.record])]);
    expect(await first.journal()).toHaveLength(2);
    await first.withLock(AbortSignal.timeout(1000), async () => {
      expect(await first.pending()).toHaveLength(1);
      await first.acknowledge([recordHash(a.record)]);
      await expect(linked.withLock(AbortSignal.timeout(50), async () => undefined)).rejects.toThrow('store-busy');
    });
    expect(await linked.pending()).toEqual([]);
  });
});


const project = process.cwd();
const moduleUrl = pathToFileURL(join(project, 'packages/core/src/storage/store.ts')).href;
async function childFixture(ctx: RepositoryContext) {
  const f = fixture();
  const input = join(ctx.worktreeRoot, 'synthetic-input.json');
  await writeFile(input, JSON.stringify({ ctx, ...f }));
  return `const fs = await import('node:fs/promises');
    const { ctx, source, batch, record } = JSON.parse(await fs.readFile(${JSON.stringify(input)}, 'utf8'));
    const { openStore } = await import(${JSON.stringify(moduleUrl)});
    const store = await openStore(ctx, { processNamespace: async () => 'synthetic-namespace' });`;
}

describe('real process death and filesystem failures', () => {
  test('publishing collected index under the lease survives death before network work without rebuilding authority',async()=>{
    const ctx=await context(),prelude=await childFixture(ctx),f=fixture();
    const killed=await runStorageFixtureProcess(project,prelude+`
      await store.withLock(AbortSignal.timeout(5000),async()=>{
        await store.commitBatch(source,batch,[record]);await store.flushDerivedIndex();
        await fs.writeFile(${JSON.stringify(join(ctx.worktreeRoot,'flushed.json'))},await fs.readFile(${JSON.stringify(join(ctx.privateDir,'cache/index.json'))}));
        process.kill(process.pid,'SIGKILL');
      });`);
    expect(killed.signal).toBe('SIGKILL');expect(killed.stderr).toBe('');
    const published=await readFile(join(ctx.worktreeRoot,'flushed.json'),'utf8'),info=await stat(join(ctx.privateDir,'cache/index.sqlite'));
    const store=await openStore(ctx);expect(await store.pending()).toEqual([f.record]);
    expect(await readFile(join(ctx.privateDir,'cache/index.json'),'utf8')).toBe(published);expect((await stat(join(ctx.privateDir,'cache/index.sqlite'))).ino).toBe(info.ino);
  });
  test.each([
    ['write', '/journal/.tmp-', 'exit-after', false],
    ['sync', '/journal/.tmp-', 'exit-after', false],
    ['rename', '/journal/', 'exit-after', true],
    ['sync', '/journal', 'exit-after', true],
    ['rename', '/checkpoints/', 'exit-before', true],
    ['rename', '/checkpoints/', 'exit-after', true]
  ] as const)('death at %s %s %s leaves only recoverable cursor (%s)', async (operation, pathIncludes, action, durable) => {
    const ctx = await context(); const prelude = await childFixture(ctx); const f = fixture();
    const killed = await runStorageFixtureProcess(project, prelude + '\nawait store.commitBatch(source, batch, [record]);', { operation, pathIncludes, action, pathEndsWith: pathIncludes === '/journal' });
    expect(killed.signal).toBe('SIGKILL'); expect(killed.stderr).toBe('');
    const store = await openStore(ctx);
    expect((await store.checkpoint(f.source, f.batch.nextCheckpoint))?.cursor.offset ?? null).toBe(durable ? 10 : null);
    expect(await store.pending()).toHaveLength(durable ? 1 : 0);
    await store.commitBatch(f.source, f.batch, [f.record]);
    expect(await store.pending()).toEqual([f.record]);
  });

  test('death before acknowledgement leaves submitted data pending for remote confirmation', async () => {
    const ctx = await context(); const prelude = await childFixture(ctx); const f = fixture();
    const killed = await runStorageFixtureProcess(project, prelude + `
      await store.commitBatch(source, batch, [record]);
      await store.acknowledge([${JSON.stringify(recordHash(f.record))}]);`,
      { operation: 'rename', pathIncludes: '/acknowledgements/', action: 'exit-before' });
    expect(killed.signal).toBe('SIGKILL');
    const store = await openStore(ctx); expect(await store.pending()).toEqual([f.record]);
    await store.acknowledge([recordHash(f.record)]);
    expect(await (await openStore(ctx)).pending()).toEqual([]);
    expect(await store.journal()).toHaveLength(1);
  });

  test.each(['ENOSPC', 'EACCES'] as const)('%s before journal durability cannot advance checkpoint', async action => {
    const ctx = await context(); const prelude = await childFixture(ctx); const f = fixture();
    const failed = await runStorageFixtureProcess(project, prelude + `
      try { await store.commitBatch(source, batch, [record]); } catch (error) { console.log(error.message); process.exitCode = 4; }`,
      { operation: 'write', pathIncludes: '/journal/.tmp-', action });
    expect(failed.code).toBe(4); expect(failed.stdout.trim()).toBe(action === 'ENOSPC' ? 'store-full' : 'store-permission');
    const store = await openStore(ctx); expect(await store.pending()).toEqual([]);
    expect(await store.checkpoint(f.source, f.batch.nextCheckpoint)).toBeNull();
  });

  test('checkpoint write failure retains durable outbox and journal checkpoint', async () => {
    const ctx = await context(); const prelude = await childFixture(ctx); const f = fixture();
    const failed = await runStorageFixtureProcess(project, prelude + `
      try { await store.commitBatch(source, batch, [record]); } catch (error) { console.log(error.message); process.exitCode = 4; }`,
      { operation: 'rename', pathIncludes: '/checkpoints/', action: 'ENOSPC' });
    expect(failed.code).toBe(4); expect(failed.stdout.trim()).toBe('store-full');
    const store = await openStore(ctx); expect(await store.pending()).toEqual([f.record]);
    expect((await store.checkpoint(f.source, f.batch.nextCheckpoint))?.cursor.offset).toBe(10);
  });

  test('competing child processes preserve both batches across a shared common directory', async () => {
    const ctx = await context(); const prelude = await childFixture(ctx);
    const results = await Promise.all(Array.from({ length: 4 }, () => runStorageFixtureProcess(project,
      prelude + '\nawait store.commitBatch(source, batch, [record]);')));
    expect(results.map(result => result.code)).toEqual([0, 0, 0, 0]);
    expect(results.map(result => result.stderr)).toEqual(['', '', '', '']);
    expect((await (await openStore(ctx)).journal()).map(entry => entry.sequence)).toEqual([1, 2, 3, 4]);
    expect(await (await openStore(ctx)).pending()).toHaveLength(1);
  });

  test('live owner remains protected and foreign or malformed owner exposes uncertainty', async () => {
    const ctx = await context(); const store = await openStore(ctx);
    const path = join(ctx.privateDir, 'locks', 'operation.lock');
    const owner = { schemaVersion: 1, host: hostname(), namespace: 'synthetic-namespace', pid: process.pid, token: '11111111-1111-4111-8111-111111111111', startedAt: 0 };
    for (const value of [JSON.stringify(owner), JSON.stringify({ ...owner, host: 'other-host.invalid' }), '{']) {
      await writeFile(path, value);
      const start = Date.now();
      try { await store.withLock(AbortSignal.timeout(60), async () => { throw new Error('must not acquire'); }); throw new Error('must be busy'); }
      catch (error) {
        expect((error as Error).message).toBe('store-busy');
        expect((error as { uncertainty: boolean }).uncertainty).toBe(value !== JSON.stringify(owner));
      }
      expect(Date.now() - start).toBeLessThan(700);
      expect(await readFile(path, 'utf8')).toBe(value);
    }
  });
});


describe('repository and stale recovery boundaries', () => {
  test('real linked worktrees share one durable store without tracked private output', async () => {
    const git = await createBareRemoteFixture();
    try {
      const main = git.clones[0]; const linked = join(git.root, 'linked');
      await git.git(main, ['worktree', 'add', '--detach', linked, 'HEAD']);
      await writeFile(join(main, 'tracked.txt'), 'synthetic staged change');
      await git.git(main, ['add', 'tracked.txt']);
      await writeFile(join(main, 'tracked.txt'), 'synthetic unstaged change');
      await writeFile(join(main, 'untracked.txt'), 'synthetic untracked');
      await writeFile(join(linked, 'tracked.txt'), 'synthetic linked change');
      const before = await Promise.all([snapshotUserCheckout(main), snapshotUserCheckout(linked)]);
      const [a, b] = await Promise.all([resolveRepository(main), resolveRepository(linked)]);
      expect(a.commonDir).toBe(b.commonDir); expect(a.gitDir).not.toBe(b.gitDir);
      const [first, second] = await Promise.all([openStore(a), openStore(b)]); const f = fixture();
      await Promise.all([first.commitBatch(f.source, f.batch, [f.record]), second.commitBatch(f.source, f.batch, [f.record])]);
      expect(await first.pending()).toEqual([f.record]); expect(await second.journal()).toHaveLength(2);
      expect(await Promise.all([snapshotUserCheckout(main), snapshotUserCheckout(linked)])).toEqual(before);
      expect(await git.git(main, ['ls-files'])).toBe('tracked.txt\n');
      expect(JSON.stringify(await second.pending())).not.toContain(f.source.sourceIdentity);
      expect(JSON.stringify(await second.pending())).not.toContain(f.batch.observations[0].nativeUnitId);
    } finally { await git.cleanup(); }
  });

  test('two stale reapers cannot unlink a replacement live owner', async () => {
    const ctx = await context(); await openStore(ctx); const prelude = await childFixture(ctx);
    const exited = await runStorageFixtureProcess(project, 'console.log(process.pid)');
    const lock = join(ctx.privateDir, 'locks', 'operation.lock');
    await writeFile(lock, JSON.stringify({ schemaVersion: 1, host: hostname(), namespace: 'synthetic-namespace', pid: Number(exited.stdout.trim()),
      token: '11111111-1111-4111-8111-111111111111', startedAt: 0 }));
    const reaped = join(ctx.worktreeRoot, 'reaped'); const held = join(ctx.worktreeRoot, 'held');
    const waitFor = (path: string) => `while (true) { try { await fs.stat(${JSON.stringify(path)}); break; } catch {} await new Promise(r => setTimeout(r, 5)); }`;
    const first = runStorageFixtureProcess(project, prelude + `
      const unlink = fs.default.unlink.bind(fs.default); let paused = false;
      fs.default.unlink = async path => {
        await unlink(path);
        if (String(path) === ${JSON.stringify(lock)} && !paused) { paused = true; await fs.writeFile(${JSON.stringify(reaped)}, ''); await new Promise(r => setTimeout(r, 250)); }
      };
      await store.withLock(AbortSignal.timeout(1800), async () => console.log('first-acquired'));
    `);
    const replacement = runStorageFixtureProcess(project, prelude + `
      ${waitFor(reaped)}
      await store.withLock(AbortSignal.timeout(1800), async () => {
        await fs.writeFile(${JSON.stringify(held)}, '');
        await new Promise(r => setTimeout(r, 450));
        const owner = JSON.parse(await fs.readFile(${JSON.stringify(lock)}, 'utf8'));
        if (owner.pid !== process.pid) throw new Error('live lock replaced');
        console.log('replacement-preserved');
      });
    `);
    const second = runStorageFixtureProcess(project, prelude + `
      ${waitFor(held)}
      try { await store.withLock(AbortSignal.timeout(100), async () => { throw new Error('stole-live-lock'); }); }
      catch (error) { if (error.message !== 'store-busy') throw error; console.log('second-busy'); }
    `);
    const results = await Promise.all([first, replacement, second]);
    expect(results.map(result => result.code)).toEqual([0, 0, 0]);
    expect(results.map(result => result.stderr)).toEqual(['', '', '']);
    expect(results.map(result => result.stdout.trim())).toEqual(['first-acquired', 'replacement-preserved', 'second-busy']);
  });

  test.each([null, 'different-process-namespace'])('unknown or different namespace %s cannot reclaim a dead PID', async namespace => {
    const ctx = await context(); const store = await openNativeStore(ctx, { processNamespace: async () => namespace });
    const exited = await runStorageFixtureProcess(project, 'console.log(process.pid)');
    const path = join(ctx.privateDir, 'locks', 'operation.lock');
    const bytes = JSON.stringify({ schemaVersion: 1, host: hostname(), namespace: 'synthetic-namespace', pid: Number(exited.stdout.trim()),
      token: '11111111-1111-4111-8111-111111111111', startedAt: 0 });
    await writeFile(path, bytes);
    await expect(store.withLock(AbortSignal.timeout(70), async () => undefined)).rejects.toMatchObject({ code: 'store-busy', uncertainty: true });
    expect(await readFile(path, 'utf8')).toBe(bytes);
  });

  test('a hanging namespace probe is bounded and does not prevent fresh lock acquisition', async () => {
    const ctx = await context(); const store = await openNativeStore(ctx, { processNamespace: () => new Promise(() => {}) });
    const start = performance.now();
    await store.withLock(AbortSignal.timeout(1000), async () => undefined);
    expect(performance.now() - start).toBeLessThan(800);
  });

  test('orphan recovery guard cannot be bypassed to steal a dead-owner lock', async () => {
    const ctx = await context(); const store = await openStore(ctx);
    const exited = await runStorageFixtureProcess(project, 'console.log(process.pid)');
    const lock = join(ctx.privateDir, 'locks', 'operation.lock');
    await writeFile(lock, JSON.stringify({ schemaVersion: 1, host: hostname(), namespace: 'synthetic-namespace', pid: Number(exited.stdout.trim()),
      token: '11111111-1111-4111-8111-111111111111', startedAt: 0 }));
    await writeFile(join(ctx.privateDir, 'locks', 'recovery.lock'), 'interrupted-recovery');
    await expect(store.withLock(AbortSignal.timeout(70), async () => undefined)).rejects.toMatchObject({ code: 'store-busy', uncertainty: true });
    expect(await readFile(lock, 'utf8')).toContain(exited.stdout.trim());
  });
});

describe('scan-resolved checkpoint candidates', () => {
  test('returns only latest candidate across authority changes and requires exact batch source', async () => {
    const ctx=await context();const store=await openStore(ctx);const first=fixture();const replacement=fixture('generation-2',2);
    await store.commitBatch(first.source,first.batch,[first.record]);await store.commitBatch(replacement.source,replacement.batch,[replacement.record]);
    const changed={...replacement.source,generation:'physical-discovery-epoch',schema:'new-schema',readerVersion:'new-reader'};
    expect((await store.checkpointCandidate(changed))?.sourceGeneration).toBe('generation-2');
    expect(await store.checkpoint(changed,{...replacement.batch.nextCheckpoint,attributionPolicyHash:'c'.repeat(64)})).toBeNull();
    await expect(store.commitBatch({...replacement.source,root:'/different/source'},replacement.batch,[replacement.record])).rejects.toThrow('invalid-batch');
    expect((await store.journal()).length).toBe(2);
  });
});

describe('private accepted ledger evidence',()=>{
 test('presence never erases accepted history and destination changes fail closed',async()=>{
   const ctx=await context(),store=await openStore(ctx);const state={schemaVersion:1 as const,repositoryId,canonicalPushUrl:'github.com/synthetic/repo',dataRef:'refs/heads/agent-badge/data' as const,commit:null};
   expect(await store.transportState()).toBeNull();await store.recordAcceptedLedger(state);await store.recordAcceptedLedger({...state,commit:'a'.repeat(40)});await store.recordAcceptedLedger(state);
   expect((await (await openStore(ctx)).transportState())?.commit).toBe('a'.repeat(40));await expect(store.recordAcceptedLedger({...state,canonicalPushUrl:'github.com/synthetic/other'})).rejects.toThrow('invalid-batch');
   expect((await store.transportState())?.canonicalPushUrl).toBe('github.com/synthetic/repo');
 });
 test('future or corrupt transport evidence cannot become fresh initialization',async()=>{
   const ctx=await context(),store=await openStore(ctx);await writeFile(join(ctx.privateDir,'transport.json'),JSON.stringify({schemaVersion:999}));await expect(store.transportState()).rejects.toThrow('invalid-durable-data');
   await writeFile(join(ctx.privateDir,'transport.json'),'{');await expect(store.transportState()).rejects.toThrow('invalid-durable-data');
 });
});


describe('reentrant accepted ledger transactions', () => {
  test('concurrent different destinations cannot both establish first durable evidence', async () => {
    const ctx = await context(); const store = await openStore(ctx);
    const first = { schemaVersion: 1 as const, repositoryId, canonicalPushUrl: 'github.com/synthetic/first',
      dataRef: 'refs/heads/agent-badge/data' as const, commit: null };
    const results = await store.withLock(AbortSignal.timeout(2000), () => Promise.allSettled([
      store.recordAcceptedLedger(first),
      store.recordAcceptedLedger({ ...first, canonicalPushUrl: 'github.com/synthetic/second' })
    ]));
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
    if (results[1].status !== 'rejected') throw new Error('Expected rejected second destination');
    expect(results[1].reason).toMatchObject({ code: 'invalid-batch' });
    expect(await (await openStore(ctx)).transportState()).toEqual(first);
  });

  test('concurrent presence cannot erase a newly accepted commit under the same owner', async () => {
    const ctx = await context(); const store = await openStore(ctx);
    const state = { schemaVersion: 1 as const, repositoryId, canonicalPushUrl: 'github.com/synthetic/repo',
      dataRef: 'refs/heads/agent-badge/data' as const, commit: 'a'.repeat(40) };
    const results = await store.withLock(AbortSignal.timeout(2000), () => Promise.allSettled([
      store.recordAcceptedLedger(state), store.recordAcceptedLedger({ ...state, commit: null })
    ]));
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(await (await openStore(ctx)).transportState()).toEqual(state);
  });
});

describe('pending configuration repair evidence', () => {
  test('strict private state persists across reopen and reentrant transitions remain ordered', async () => {
    const ctx = await context(), store = await openStore(ctx);
    const first = { schemaVersion: 1 as const, metadataRevision: 'a'.repeat(64) };
    const second = { schemaVersion: 1 as const, metadataRevision: 'b'.repeat(64) };
    expect(await store.pendingConfiguration()).toBeNull();
    await store.withLock(AbortSignal.timeout(2000), () => Promise.all([
      store.recordPendingConfiguration(first), store.recordPendingConfiguration(second),
    ]));
    expect(await (await openStore(ctx)).pendingConfiguration()).toEqual(second);
    await expect(store.recordPendingConfiguration({ ...first, localPath: '/synthetic/private' } as typeof first)).rejects.toThrow('invalid-batch');
    expect(await store.pendingConfiguration()).toEqual(second);
    await store.recordPendingConfiguration(null);
    expect(await (await openStore(ctx)).pendingConfiguration()).toBeNull();
  });
  test('future or corrupt pending evidence fails closed without losing durable observations', async () => {
    const ctx = await context(), store = await openStore(ctx), batch = fixture();
    await store.commitBatch(batch.source, batch.batch, [batch.record]);
    const path = join(ctx.privateDir, 'pending-configuration.json');
    for (const bytes of ['{', JSON.stringify({ schemaVersion: 999, metadataRevision: 'a'.repeat(64) })]) {
      await writeFile(path, bytes);
      await expect(store.pendingConfiguration()).rejects.toThrow('invalid-durable-data');
      expect(await store.pending()).toEqual([batch.record]);
    }
  });
});

test('durable reconciliation signal survives reopen and only explicit complete work clears it', async () => {
  const ctx = await context(), store = await openStore(ctx);
  expect(await store.reconciliationPending()).toBe(false);
  await store.recordReconciliationPending(true);
  expect(await (await openStore(ctx)).reconciliationPending()).toBe(true);
  await store.recordReconciliationPending(false);
  expect(await (await openStore(ctx)).reconciliationPending()).toBe(false);
  await writeFile(join(ctx.privateDir, 'reconciliation.json'), JSON.stringify({ schemaVersion: 999, pending: false }));
  await expect(store.reconciliationPending()).rejects.toThrow('invalid-durable-data');
});

test('automatic cursor covers the combined provider inventory beyond one providers ten-thousand sources', async () => {
  const ctx = await context(), store = await openStore(ctx);
  await store.withLock(AbortSignal.timeout(2000), () => Promise.all([
    store.recordAutomaticSourceOffset(10001), store.recordReconciliationPending(true),
  ]));
  const reopened = await openStore(ctx);
  expect(await reopened.automaticSourceOffset()).toBe(10001); expect(await reopened.reconciliationPending()).toBe(true);
});
