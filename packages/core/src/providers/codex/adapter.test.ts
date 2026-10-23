import { realpath as fixtureRealpath } from 'node:fs/promises';
import { tmpdir as fixtureTmpdir } from 'node:os';
import { join as fixtureJoin } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { appendFile, chmod, copyFile, mkdir, mkdtemp, readFile, rename, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createCodexAdapter } from './adapter.js';
import { codexRollout, codexRequest, codexContext } from '@agent-badge/testkit';
import { readCodexInventory } from './codex-sql.js';
import { checkpointSchema, checkpointScopeSchema, type Checkpoint, type ScanBatch } from '../../domain/capabilities.js';
import { sanitizeObservation } from '../../ledger/sanitize.js';
import { reduceLedger } from '../../ledger/reduce.js';
import { getAccountingContract } from '../registry.js';
const roots: string[] = [];
const scope = { repositoryId: 'd9428888-122b-4aab-9bc4-111111111111', normalizationVersion: 1 as const, attributionPolicyHash: 'a'.repeat(64) };
const policy={schemaVersion:1 as const,repositoryId:scope.repositoryId,normalizationVersion:1 as const,discovery:'auto' as const,disabledProviders:[],badge:{label:'AI usage',metric:'tokens' as const}};
const publicRecords=(observations:ScanBatch['observations'])=>observations.map(o=>sanitizeObservation(o,policy));
const signal = new AbortController().signal;
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, {recursive: true, force: true}))); });
async function home() { const root = await fixtureRealpath(await mkdtemp(fixtureJoin(fixtureTmpdir(), 'codex-contract-'))); roots.push(root); await mkdir(join(root, 'sessions')); return root; }
async function collect(root: string, checkpoint: Checkpoint | null = null) {
  const adapter = createCodexAdapter({ environment: {}, defaultHome: root });
  const sources = await adapter.discover({ repositoryId:scope.repositoryId, enrolledRoots: [root], signal });
  const batches: ScanBatch[] = [];
  for (const source of sources) for await (const batch of adapter.scan(source, checkpoint, signal, scope)) batches.push(batch);
  return { sources, batches, observations: batches.flatMap(batch => batch.observations) };
}
describe('fixture-certified Codex request adapter', () => {
  it('counts request usage only, keeping exact per-turn models through snapshots and compaction', async () => {
    const root = await home(); await writeFile(join(root, 'sessions/a.jsonl'), codexRollout());
    const result = await collect(root);
    expect(result.observations.map(o => [o.nativeUnitId, o.meters[0].total, o.meters[0].model, o.execution.cwd])).toEqual([
      ['["original","response-1"]', 110, 'gpt-5.4-mini', '/synthetic/repo'],
      ['["original","response-2"]', 220, 'gpt-4.1-mini', '/synthetic/repo']]);
    expect(result.batches[0].outcome).toBe('complete');
    expect(getAccountingContract('codex', 1).cumulativeRevision).toBe('uncertified');
  });
  it('requires strict explicit policy scope for first checkpoints', async () => {
    expect(checkpointScopeSchema.safeParse(scope).success).toBe(true);
    expect(checkpointScopeSchema.safeParse({...scope, extra: 'secret'}).success).toBe(false);
    const root = await home(); await writeFile(join(root, 'sessions/a.jsonl'), codexRollout());
    const result = await collect(root); expect(result.batches[0].nextCheckpoint).toMatchObject(scope);
  });
  it('dedupes enrolled roots while preserving original request IDs in copied archives and homes', async () => {
    const first = await home(); const second = await home();
    await writeFile(join(first, 'sessions/a.jsonl'), codexRollout()); await mkdir(join(second, 'archived_sessions'));
    await copyFile(join(first, 'sessions/a.jsonl'), join(second, 'archived_sessions/copy.jsonl'));
    const adapter = createCodexAdapter({environment: {}, defaultHome: first});
    const sources = await adapter.discover({repositoryId: scope.repositoryId, enrolledRoots: [first, first, second], signal});
    expect(sources).toHaveLength(2);
    const units: string[] = []; for (const source of sources) for await (const batch of adapter.scan(source, null, signal, scope)) units.push(...batch.observations.map(o => o.nativeUnitId));
    expect(new Set(units).size).toBe(2); expect(units).toHaveLength(4); expect(sources[0].sourceIdentity).not.toBe(sources[1].sourceIdentity);
  });
  it('detects same-mtime rewrites and rotations; incremental replay equals full native requests', async () => {
    const root = await home(); const path = join(root, 'sessions/a.jsonl'); await writeFile(path, codexRollout()); await utimes(path,new Date(0),new Date(0));
    const initial = await collect(root); const checkpoint = initial.batches[0].nextCheckpoint;
    expect((await collect(root, checkpoint)).observations).toEqual([]);
    await writeFile(path, codexRollout().replace('response-2', 'response-3')); await utimes(path, new Date(0), new Date(0));
    const changed = await collect(root, checkpoint); expect(changed.observations.map(o => o.nativeUnitId)).toContain('["original","response-3"]');
    expect(publicRecords(changed.observations)).toEqual(publicRecords((await collect(root)).observations));
    await rename(path, join(root, 'old')); await writeFile(path, codexRollout().replaceAll('original', 'replacement'));
    expect((await collect(root, checkpoint)).observations[0].nativeUnitId).toBe('["replacement","response-1"]');
  });
  it('holds a partial tail until completed and replays after truncation', async () => {
    const root = await home(); const path = join(root, 'sessions/a.jsonl'); const complete = codexRollout();
    await writeFile(path, complete.slice(0, -12)); const partial = await collect(root);
    expect(partial.batches[0].outcome).toBe('partial'); expect(partial.observations).toHaveLength(1);
    await appendFile(path, complete.slice(-12)); const full = await collect(root, partial.batches[0].nextCheckpoint);
    expect([...partial.observations,...full.observations]).toEqual((await collect(root)).observations);
    await writeFile(path, codexRollout({ single: true })); expect((await collect(root, full.batches[0].nextCheckpoint)).observations).toHaveLength(1);
  });
  it('uses the original matching turn and excludes stable inherited child and fork prefixes', async () => {
    const root = await home();
    await writeFile(join(root, 'sessions/a.jsonl'), codexRollout({ owner: { id: 'child', parent_thread_id: 'original', subagent_history_start_ordinal: 4 }, child: true }));
    const result = await collect(root); expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({nativeUnitId: '["child","response-child"]', lineage: {kind: 'child', inherited: 'isolated'}});
    await writeFile(join(root, 'sessions/a.jsonl'), codexRollout({ owner: {id: 'fork', forked_from_id: 'original', forked_from_ordinal_exclusive: 4}, child: true }));
    expect((await collect(root)).observations.map(o => o.nativeUnitId)).toEqual(['["fork","response-child"]']);
  });
  it('does not guess missing inherited boundaries or mismatched/mutating turn attribution', async () => {
    const root = await home(); const path = join(root, 'sessions/a.jsonl');
    await writeFile(path, codexRollout({owner: {id: 'child', parent_thread_id: 'original'}, child: true}));
    const uncertain = await collect(root); expect(uncertain.batches[0].outcome).toBe('partial'); expect(uncertain.observations).toEqual([]);
    await writeFile(path, codexRollout({ single: true }).replace('"turn_id":"turn-1","cwd"', '"turn_id":"other","cwd"'));
    const missing = await collect(root); expect(missing.observations[0]).toMatchObject({quality: 'partial', execution: {cwd: null}, meters: [{model: null}]});
    await writeFile(path, codexRollout({single: true}) + JSON.stringify(codexContext('turn-1', 'gpt-4.1-mini')) + '\n' + JSON.stringify(codexRequest('original', 'turn-1', 'response-later', 100)) + '\n');
    const ambiguous = await collect(root); expect(ambiguous.observations.at(-1)?.quality).toBe('partial');
  });
  it('reports snapshot-only, compressed and malformed sources without fabricated zero requests', async () => {
    const root = await home(); await writeFile(join(root, 'sessions/snapshot.jsonl'), JSON.stringify({type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{total_tokens:999}}}})+'\n');
    await writeFile(join(root, 'sessions/compressed.jsonl.zst'), 'synthetic'); await writeFile(join(root,'history.jsonl'), 'synthetic discovery only');
    const result = await collect(root); expect(result.observations).toEqual([]); expect(result.batches.every(b => b.outcome === 'unsupported')).toBe(true);
    await writeFile(join(root, 'sessions/bad.jsonl'), '{"secret":"private-canary"}\ninvalid\n');
    expect(JSON.stringify((await collect(root)).batches)).not.toContain('private-canary');
  });
  it('rejects stale generations, over-budget sources and cancellation without committing observations', async () => {
    const root = await home(); const path = join(root,'sessions/a.jsonl'); await writeFile(path,codexRollout());
    const adapter = createCodexAdapter({environment:{},defaultHome:root,maxBytes:100000}); const [source] = await adapter.discover({repositoryId:scope.repositoryId,enrolledRoots:[],signal});
    await rename(path,join(root,'old')); await writeFile(path,codexRollout()); const batches = []; for await(const b of adapter.scan(source,null,signal,scope)) batches.push(b);
    expect(batches[0]).toMatchObject({observations:[],outcome:'unavailable'});
    const small = createCodexAdapter({environment:{},defaultHome:root,maxBytes:100}); const [large] = await small.discover({repositoryId:scope.repositoryId,enrolledRoots:[],signal});
    for await(const b of small.scan(large,null,signal,scope)) expect(b).toMatchObject({observations:[],outcome:'partial'});
    const cancelled = new AbortController(); cancelled.abort();
    for await(const b of adapter.scan(source,null,cancelled.signal,scope)) expect(b).toMatchObject({observations:[],outcome:'unavailable'});
  });
});
describe('Codex read-only WAL inventory', () => {
  it('sees committed WAL 1110 instead of main-file 999 and tolerates missing optional lineage', async () => {
    const root = await home(); const path = join(root,'state_5.sqlite'); const db = new DatabaseSync(path);
    try { db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE threads(id TEXT,rollout_path TEXT,tokens_used INTEGER); INSERT INTO threads VALUES('synthetic','/synthetic/old.jsonl',999); PRAGMA wal_checkpoint(TRUNCATE); UPDATE threads SET tokens_used=1110,rollout_path='/synthetic/rollout.jsonl';");
      const before = await readFile(path); const inventory = await readCodexInventory(path);
      expect(inventory).toEqual({outcome:'complete',rolloutPaths:['/synthetic/rollout.jsonl'],diagnostics:[]}); expect(await readFile(path)).toEqual(before);
      const reader = new DatabaseSync(path,{readOnly:true}); try { expect(reader.prepare('SELECT tokens_used FROM threads').get()).toEqual({tokens_used:1110}); } finally {reader.close();}
    } finally {db.close();}
  });
  it('falls back on unsupported or unavailable inventories and discovers configured sqlite roots', async () => {
    const root = await home(); const sqlHome = await home(); const path = join(sqlHome,'state_5.sqlite'); const rollout = join(root,'external.jsonl'); await writeFile(rollout,codexRollout());
    const db = new DatabaseSync(path); db.exec('CREATE TABLE threads(id TEXT,rollout_path TEXT)'); db.prepare('INSERT INTO threads VALUES(?,?)').run('synthetic',rollout); db.close();
    const adapter = createCodexAdapter({environment:{CODEX_HOME:root,CODEX_SQLITE_HOME:sqlHome},defaultHome:'/synthetic/missing'});
    expect(await adapter.discover({repositoryId:scope.repositoryId,enrolledRoots:[],signal})).toHaveLength(1);
    const bad = join(root,'unsupported.sqlite'); const unsupported = new DatabaseSync(bad); unsupported.exec('CREATE TABLE unrelated(id TEXT)'); unsupported.close();
    expect((await readCodexInventory(bad)).outcome).toBe('unsupported'); expect((await readCodexInventory(join(root,'absent'))).outcome).toBe('unavailable');
  });
});

describe('Codex private continuation', () => {
  it('resumes after process restart with preceding model context and validates continuation', async () => {
    const root = await home(); const path = join(root,'sessions/a.jsonl'); await writeFile(path,codexRollout({single:true}));
    const initial = await collect(root); const checkpoint = initial.batches[0].nextCheckpoint;
    expect(checkpoint.continuation).not.toBeNull();
    expect(JSON.stringify(checkpoint.continuation)).not.toContain('token_usage_record');
    await appendFile(path,JSON.stringify(codexRequest('original','turn-1','response-appended',300,3))+'\n');
    const appended = await collect(root,checkpoint); expect(appended.observations.map(o=>o.nativeUnitId)).toEqual(['["original","response-appended"]']);
    expect(appended.observations[0].meters[0].model).toBe('gpt-5.4-mini');
    expect([...initial.observations,...appended.observations]).toEqual((await collect(root)).observations);
    for (const state of ['{"secret":"canary"}', 'x'.repeat(65537)]) {
      const invalid = {...checkpoint,continuation:{provider:'codex',readerVersion:'1',state}} as Checkpoint;
      expect((await collect(root,invalid)).observations.map(o=>o.nativeUnitId)).toEqual(['["original","response-1"]','["original","response-appended"]']);
    }
  });
});

describe('Codex bounded restart accounting', () => {
  it('backfills a long rollout in bounded chunks then parses only appended requests', async () => {
    const root=await home(); const path=join(root,'sessions/a.jsonl'); await writeFile(path,codexRollout());
    const adapter=createCodexAdapter({environment:{},defaultHome:root,maxBytes:1200});
    const [source]=await adapter.discover({repositoryId:scope.repositoryId,enrolledRoots:[],signal});
    let checkpoint:Checkpoint|null=null; const observed=[]; let complete=false;
    for(let step=0;step<10;step++) {
      const batches:ScanBatch[]=[]; for await(const batch of adapter.scan(source,checkpoint,signal,scope)) batches.push(batch);
      checkpoint=batches[0].nextCheckpoint;observed.push(...batches[0].observations);
      if(batches[0].outcome==='complete') {complete=true;break;}
    }
    expect(complete).toBe(true); expect(observed.map(o=>o.nativeUnitId)).toEqual(['["original","response-1"]','["original","response-2"]']);
    await appendFile(path,JSON.stringify(codexRequest('original','turn-2','response-3',300,5))+'\n');
    for await(const batch of adapter.scan(source,checkpoint,signal,scope)) expect(batch.observations.map(o=>o.nativeUnitId)).toEqual(['["original","response-3"]']);
  });
  it('invalidates preceding context after malformed input and refuses invalid counters', async () => {
    const root=await home();const path=join(root,'sessions/a.jsonl');
    await writeFile(path,codexRollout({single:true})+'invalid\n'+JSON.stringify(codexRequest('original','turn-1','response-3',100,3))+'\n');
    const result=await collect(root);expect(result.observations.at(-1)).toMatchObject({quality:'partial',execution:{cwd:null},meters:[{model:null}]});
    await writeFile(path,codexRollout({single:true}).replaceAll('"cached_input_tokens":20','"cached_input_tokens":200'));
    const invalid=await collect(root);expect(invalid.observations).toEqual([]);expect(invalid.batches[0].outcome).toBe('partial');
  });
});

describe('Codex store generation integration', () => {
  it('commits append, truncation, policy and reader reset without generation rollback', async () => {
    const {openStore}=await import('../../storage/store.js');
    const root=await home();const path=join(root,'sessions/a.jsonl');const common=join(root,'.git');await mkdir(common);
    const ctx={worktreeRoot:root,gitDir:common,commonDir:common,privateDir:join(common,'agent-badge'),hooksPath:join(common,'hooks'),superprojectRoot:null,worktrees:[],head:{kind:'unborn' as const,ref:'refs/heads/main'},shallow:false};
    const store=await openStore(ctx,{processNamespace:async()=> 'synthetic'});
    const adapter=createCodexAdapter({environment:{},defaultHome:root});
    const run=async(currentScope=scope) => {
      const [source]=await adapter.discover({repositoryId:scope.repositoryId,enrolledRoots:[],signal});let checkpoint;
      await store.withLock(signal,async()=> {
        const candidate=await store.checkpointCandidate(source);
        for await(const batch of adapter.scan(source,candidate,signal,currentScope)) {await store.commitBatch(batch.source,batch,[]);checkpoint=batch.nextCheckpoint;}
      });return checkpoint! as Checkpoint;
    };
    await writeFile(path,codexRollout());const first=await run();
    await appendFile(path,JSON.stringify(codexRequest('original','turn-2','response-3',300,5))+'\n');const appended=await run();
    expect(appended.sourceGeneration).toBe(first.sourceGeneration);expect(appended.cursor.offset).toBeGreaterThan(first.cursor.offset);
    await writeFile(path,codexRollout({single:true}));const truncated=await run();expect(truncated.sourceGeneration).not.toBe(first.sourceGeneration);
    const changed=await run({...scope,attributionPolicyHash:'c'.repeat(64)});expect(changed.sourceGeneration).not.toBe(first.sourceGeneration);
    expect(changed.attributionPolicyHash).toBe('c'.repeat(64));
    // A previous reader's checkpoint remains a candidate but is never used to skip bytes.
    const [source]=await adapter.discover({repositoryId:scope.repositoryId,enrolledRoots:[],signal});const candidate=await store.checkpointCandidate(source);
    expect(candidate?.sourceGeneration).toBe(changed.sourceGeneration);
    const oldReader={...candidate!,readerVersion:'old',continuation:{...candidate!.continuation!,readerVersion:'old'}};
    for await(const batch of adapter.scan(source,candidate,signal,{...scope,attributionPolicyHash:'c'.repeat(64)})) expect(batch.observations).toEqual([]);
    for await(const batch of adapter.scan(source,oldReader,signal,{...scope,attributionPolicyHash:'c'.repeat(64)})) {expect(batch.observations).toHaveLength(1);await store.commitBatch(batch.source,batch,[]);}
    expect((await store.journal()).length).toBe(5);
  });
});

describe('Codex public accounting pipeline', () => {
  it('reduces archive copies once and exposes conflicting duplicates rather than choosing a file', async () => {
    const root=await home();await mkdir(join(root,'archived_sessions'));
    await writeFile(join(root,'sessions/a.jsonl'),codexRollout({single:true}));await copyFile(join(root,'sessions/a.jsonl'),join(root,'archived_sessions/a.jsonl'));
    const meta={schemaVersion:2 as const,protocolVersion:1 as const,repositoryId:scope.repositoryId,normalizationVersion:1 as const,catalogVersion:1 as const,catalogHash:'a'.repeat(64),policy};
    const equal=reduceLedger(publicRecords((await collect(root)).observations),meta);expect(equal.knownTokens).toBe('110');expect(equal.includedUnits).toBe(1);
    await writeFile(join(root,'archived_sessions/a.jsonl'),codexRollout({single:true}).replaceAll('"input_tokens":100','"input_tokens":200').replaceAll('"output_tokens":10','"output_tokens":20').replaceAll('"total_tokens":110','"total_tokens":220'));
    const conflict=reduceLedger(publicRecords((await collect(root)).observations),meta);expect(conflict.conflictingUnits).toBe(1);expect(conflict.knownTokens).toBe('0');
  });
  it('discards transcript, prompt and checkpoint text before private continuation or public records', async () => {
    const root=await home();const path=join(root,'sessions/a.jsonl');
    await writeFile(path,codexRollout({single:true})+JSON.stringify({type:'response_item',payload:{type:'message',text:'PRIVATE-PROMPT-CANARY'}})+'\n'+JSON.stringify({type:'compacted',payload:{latest_token_usage_record:codexRequest().payload,text:'PRIVATE-COMPACTION-CANARY'}})+'\n');
    const result=await collect(root);expect(JSON.stringify(result.batches)).not.toMatch(/PRIVATE-PROMPT-CANARY|PRIVATE-COMPACTION-CANARY/);
    expect(JSON.stringify(publicRecords(result.observations))).not.toMatch(/original|response-1|synthetic\/repo|sessions\/a/);
  });
  it('restarts on scope mismatch and ignores copied session metadata', async () => {
    const root=await home();const path=join(root,'sessions/a.jsonl');await writeFile(path,codexRollout({single:true}));
    const first=await collect(root);const checkpoint={...first.batches[0].nextCheckpoint,attributionPolicyHash:'c'.repeat(64)};
    await appendFile(path,JSON.stringify({type:'session_meta',payload:{id:'copied'}})+'\n'+JSON.stringify(codexRequest('original','turn-1','response-3',300,3))+'\n');
    const result=await collect(root,checkpoint);expect(result.observations.map(o=>o.nativeUnitId)).toEqual(['["original","response-1"]','["original","response-3"]']);
  });
});

describe('Codex journal batch bounds',()=> {
  it('limits request batch size and resumes without skipping parsed bytes',async()=> {
    const root=await home();const path=join(root,'sessions/a.jsonl');
    await writeFile(path,codexRollout({single:true})+Array.from({length:1000},(_,i)=>JSON.stringify(codexRequest('original','turn-1',`response-extra-${i}`,100,i+3))).join('\n')+'\n');
    const initial=await collect(root);expect(initial.observations).toHaveLength(1000);expect(initial.batches[0].outcome).toBe('partial');
    const next=await collect(root,initial.batches[0].nextCheckpoint);expect(next.observations).toHaveLength(1);expect(next.observations[0].nativeUnitId).toBe('["original","response-extra-999"]');
  });
});

describe('Codex continuation context bounds',()=> {
  it('marks attribution uncertain when more preceding turn contexts exist than can be retained',async()=> {
    const root=await home();const path=join(root,'sessions/a.jsonl');
    const contexts=Array.from({length:130},(_,i)=>JSON.stringify({...codexContext(`extra-turn-${i}`),ordinal:i+3})).join('\n');
    await writeFile(path,codexRollout({single:true})+contexts+'\n'+JSON.stringify(codexRequest('original','extra-turn-129','response-after-overflow',100,133))+'\n');
    const result=await collect(root);expect(result.observations.at(-1)?.quality).toBe('partial');
    expect(Buffer.byteLength(result.batches[0].nextCheckpoint.continuation!.state)).toBeLessThanOrEqual(65536);
  });
});

describe('Codex continuation byte bound',()=> {
  it('retains bounded uncertainty state when valid context metadata exceeds continuation capacity',async()=> {
    const root=await home();const path=join(root,'sessions/a.jsonl');
    const contexts=Array.from({length:30},(_,i)=>JSON.stringify({...codexContext(`long-turn-${i}`),ordinal:i+3,payload:{turn_id:`long-turn-${i}`,cwd:'/'+('x'.repeat(3000)),model:'gpt-5.4-mini'}})).join('\n');
    await writeFile(path,codexRollout({single:true})+contexts+'\n');
    const result=await collect(root);expect(result.batches[0].nextCheckpoint.continuation).not.toBeNull();expect(result.batches[0].outcome).toBe('partial');
    expect(Buffer.byteLength(result.batches[0].nextCheckpoint.continuation!.state)).toBeLessThanOrEqual(65536);
  });
});

describe('Codex incomplete context coverage',()=> {
  it('keeps skipped large context and previous malformed coverage explicitly uncertain on restart',async()=> {
    const root=await home();const path=join(root,'sessions/a.jsonl');
    await writeFile(path,codexRollout({single:true})+JSON.stringify({...codexContext('turn-1','gpt-4.1-mini'),ordinal:3,payload:{...codexContext('turn-1','gpt-4.1-mini').payload,ignored:'x'.repeat(262144)}})+'\n'+JSON.stringify(codexRequest('original','turn-1','response-3',100,4))+'\n');
    const result=await collect(root);expect(result.observations.at(-1)?.quality).toBe('partial');
    const noop=await collect(root,result.batches[0].nextCheckpoint);expect(noop.observations).toEqual([]);expect(noop.batches[0].outcome).toBe('partial');
  });
});

describe('Codex exact recognized model identities',()=> {
  it.each(['gpt-6.1-sol','gpt-6-sol','gpt-6-luna','gpt-6-astra','gpt-5.4','gpt-5.3-codex'])('preserves %s without inventing a price or vendor alias',async(model)=> {
    const {priceMeters}=await import('../../pricing/price.js');const {defaultCatalog,parsePriceCatalog}=await import('../../pricing/catalog.js');const {meterSegmentSchema}=await import('../../domain/usage.js');
    const root=await home();await writeFile(join(root,'sessions/a.jsonl'),codexRollout({single:true}).replaceAll('gpt-5.4-mini',model));
    const result=await collect(root);const meter=result.observations[0].meters[0];expect(meter).toMatchObject({model,vendor:'openai'});expect(result.observations[0].quality).toBe('exact');
    expect(priceMeters([meter],defaultCatalog)).toMatchObject({pricedUnits:0,unpricedUnits:1,knownMicroUsd:'0'});
    expect(meterSegmentSchema.safeParse({...meter,vendor:'anthropic'}).success).toBe(false);
    expect(()=>parsePriceCatalog({...defaultCatalog,cards:[{...defaultCatalog.cards[0],model,vendor:'anthropic'}]})).toThrow();
  });
});

describe('Codex paginated physical history boundary',()=> {
  it('uses the referenced exclusive ordinal boundary rather than own-file line counts',async()=> {
    const root=await home();const path=join(root,'sessions/page.jsonl');
    await writeFile(path,[{type:'session_meta',ordinal:12,payload:{id:'page',history_mode:'paginated',history_base:{thread_id:'prefix-rollout',end_ordinal_exclusive:12,end_byte_offset:4096}}},
      {...codexContext('own-turn'),ordinal:13},codexRequest('page','own-turn','response-own-page',100,14)].map(o=>JSON.stringify(o)).join('\n')+'\n');
    const result=await collect(root);expect(result.observations.map(o=>o.nativeUnitId)).toEqual(['["page","response-own-page"]']);
    expect(result.observations[0].lineage).toEqual({kind:'root',parentNativeId:null,inherited:'isolated'});expect(result.batches[0].outcome).toBe('complete');
    expect(result.batches[0].nextCheckpoint.continuation!.state).toContain('end_ordinal_exclusive');
  });
});

describe('Codex independent discovery coverage',()=> {
  it('exposes bounded directory discovery gaps without hiding healthy source accounting',async()=> {
    const root=await home();await writeFile(join(root,'sessions/a.jsonl'),codexRollout({single:true}));
    const deep=join(root,'sessions',...Array.from({length:18},(_,i)=>`level-${i}`));await mkdir(deep,{recursive:true});await writeFile(join(deep,'hidden.jsonl'),codexRollout());
    const result=await collect(root);expect(result.observations).toHaveLength(1);expect(result.batches.some(batch=>batch.outcome==='unsupported')).toBe(true);
  });
});


describe('Codex inventory filename races',()=> {
  it('isolates a state database disappearing during filename probing',async()=> {
    const root=await home();await writeFile(join(root,'sessions/a.jsonl'),codexRollout({single:true}));
    await symlink(join(root,'missing-database'),join(root,'state_9.sqlite'));
    const result=await collect(root);expect(result.observations).toHaveLength(1);expect(result.batches.some(b=>b.outcome==='unsupported')).toBe(true);
  });
});


describe('Codex explicit root discovery failures',()=> {
  it('retains a missing enrolled root diagnostic while scanning healthy roots',async()=> {
    const root=await home();await writeFile(join(root,'sessions/a.jsonl'),codexRollout({single:true}));
    const missing=join(root,'missing-home');const adapter=createCodexAdapter({environment:{},defaultHome:root});
    const sources=await adapter.discover({repositoryId:scope.repositoryId,enrolledRoots:[missing,root],signal});
    expect(sources.some(source=>source.root===missing)).toBe(true);
    const batches:ScanBatch[]=[];for(const source of sources) for await(const batch of adapter.scan(source,null,signal,scope)) batches.push(batch);
    expect(batches.flatMap(batch=>batch.observations)).toHaveLength(1);
    expect(batches.find(batch=>batch.source.root===missing)).toMatchObject({outcome:'unavailable',observations:[],diagnostics:[{code:'unavailable-source',severity:'warning'}]});
  });
  it.skipIf(process.platform==='win32' || process.getuid?.()===0)('retains unreadable enrolled root coverage while scanning healthy roots',async()=> {
    const root=await home();await writeFile(join(root,'sessions/a.jsonl'),codexRollout({single:true}));
    const blocked=join(root,'blocked');const unreadable=join(blocked,'home');await mkdir(unreadable,{recursive:true});await chmod(blocked,0);
    try {
      const adapter=createCodexAdapter({environment:{},defaultHome:root});const sources=await adapter.discover({repositoryId:scope.repositoryId,enrolledRoots:[unreadable,root],signal});
      expect(sources.some(source=>source.root===unreadable)).toBe(true);
      const batches:ScanBatch[]=[];for(const source of sources) for await(const batch of adapter.scan(source,null,signal,scope)) batches.push(batch);
      expect(batches.flatMap(batch=>batch.observations)).toHaveLength(1);expect(batches.find(batch=>batch.source.root===unreadable)?.outcome).toBe('unavailable');
    } finally {await chmod(blocked,0o700);}
  });
});

describe('Codex escaped owner continuation overflow',()=> {
  it('commits bounded uncertainty and continues byte progress without trusting later copied metadata',async()=> {
    const {openStore}=await import('../../storage/store.js');const root=await home();const path=join(root,'sessions/a.jsonl');const common=join(root,'.git');await mkdir(common);
    const ctx={worktreeRoot:root,gitDir:common,commonDir:common,privateDir:join(common,'agent-badge'),hooksPath:join(common,'hooks'),superprojectRoot:null,worktrees:[],head:{kind:'unborn' as const,ref:'refs/heads/main'},shallow:false};
    const store=await openStore(ctx,{processNamespace:async()=> 'synthetic'});const adapter=createCodexAdapter({environment:{},defaultHome:root});
    const owner={id:'original',parent_thread_id:'\u0000'.repeat(4096),forked_from_id:'\u0001'.repeat(4096),subagent_history_start_ordinal:0,forked_from_ordinal_exclusive:0,
      history_base:{thread_id:'\u0002'.repeat(4096),end_ordinal_exclusive:0,end_byte_offset:0}};
    await writeFile(path,codexRollout({owner,single:true}));
    const run=async()=> {
      const [source]=await adapter.discover({repositoryId:scope.repositoryId,enrolledRoots:[],signal});let result:ScanBatch|undefined;
      await store.withLock(signal,async()=> {const candidate=await store.checkpointCandidate(source);for await(const batch of adapter.scan(source,candidate,signal,scope)) {
        result=batch;if(checkpointSchema.safeParse(batch.nextCheckpoint).success) await store.commitBatch(batch.source,batch,[]);
      }});expect(checkpointSchema.safeParse(result!.nextCheckpoint).success).toBe(true);
      expect(Buffer.byteLength(JSON.stringify(result!.nextCheckpoint.continuation))).toBeLessThanOrEqual(65536);return result!;
    };
    const first=await run();expect(first.outcome).toBe('partial');expect(first.nextCheckpoint.cursor.offset).toBeGreaterThan(0);
    expect(first.observations).toEqual([]);expect(JSON.parse(first.nextCheckpoint.continuation!.state)).toMatchObject({owner:null,ownerOmitted:true,invalid:true,coveragePartial:true});
    await appendFile(path,JSON.stringify({type:'session_meta',payload:{id:'copied'}})+'\n'+JSON.stringify(codexRequest('copied','turn-1','response-copied',100,3))+'\n');
    const next=await run();expect(next.nextCheckpoint.cursor.offset).toBeGreaterThan(first.nextCheckpoint.cursor.offset);expect(next.observations).toEqual([]);expect(next.outcome).toBe('partial');
    expect(JSON.parse(next.nextCheckpoint.continuation!.state)).toMatchObject({owner:null,ownerOmitted:true,invalid:true,coveragePartial:true});
    expect((await store.journal()).length).toBe(2);
  });
});
