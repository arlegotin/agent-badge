import { afterEach, describe, expect, it } from 'vitest';
import { appendFile, copyFile, mkdir, mkdtemp, readFile, rename, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { certifiedClaudeImport, protocolObservationFixture } from '@agent-badge/testkit';
import { createClaudeAdapter } from './adapter.js';
import { checkpointSchema, type Checkpoint, type ScanBatch } from '../../domain/capabilities.js';
import { parseObservation, parsePublicObservation } from '../../domain/usage.js';
import { sanitizeObservation } from '../../ledger/sanitize.js';
import { reduceLedger } from '../../ledger/reduce.js';
import { defaultCatalog, catalogHash } from '../../pricing/catalog.js';
import { priceMeters } from '../../pricing/price.js';
import { renderArtifacts } from '../../render/summary.js';
import { openStore } from '../../storage/store.js';
import type { RepositoryContext } from '../../git/context.js';
const roots:string[]=[];
const signal=new AbortController().signal;
const scope={repositoryId:'d9428888-122b-4aab-9bc4-111111111111',normalizationVersion:1 as const,attributionPolicyHash:'a'.repeat(64)};
const policy={schemaVersion:1 as const,repositoryId:scope.repositoryId,normalizationVersion:1 as const,discovery:'auto' as const,disabledProviders:[],badge:{label:'AI usage',metric:'tokens' as const}};
const meta={schemaVersion:2 as const,protocolVersion:1 as const,repositoryId:scope.repositoryId,normalizationVersion:1 as const,catalogVersion:1,catalogHash:catalogHash(defaultCatalog),policy};
function row(id='one',input=100,output=3,extra:Record<string,unknown>={}) {
  return {type:'assistant',uuid:`entry-${id}`,sessionId:'shared-parent',requestId:`req-${id}`,cwd:'/synthetic/repo',version:'2.1.307',
    message:{id:`msg-${id}`,model:'claude-sonnet-4-6',stop_reason:'end_turn',content:[{type:'text',text:'PRIVATE_TRANSCRIPT_CANARY'}],
    usage:{input_tokens:input,output_tokens:output,cache_read_input_tokens:10,cache_creation_input_tokens:19,cache_creation:{ephemeral_5m_input_tokens:7,ephemeral_1h_input_tokens:12}}},...extra};
}
const jsonl=(...rows:unknown[])=>rows.map(value=>JSON.stringify(value)+'\n').join('');
async function home(){const root=await mkdtemp('/private/tmp/claude-contract-');roots.push(root);await mkdir(join(root,'projects'));return root;}
async function file(root:string,path:string,contents:string){const target=join(root,'projects',path);await mkdir(dirname(target),{recursive:true});await writeFile(target,contents);return target;}
async function collect(root:string,checkpoint:Checkpoint|null=null,options:Parameters<typeof createClaudeAdapter>[0]={}) {
  const adapter=createClaudeAdapter({environment:{},defaultHome:root,...options});
  const sources=await adapter.discover({repositoryId:scope.repositoryId,enrolledRoots:[root],signal});
  const batches:ScanBatch[]=[];for(const source of sources)for await(const batch of adapter.scan(source,checkpoint,signal,scope))batches.push(batch);
  return {sources,batches,observations:batches.flatMap(batch=>batch.observations)};
}
const pub=(batches:ScanBatch['observations'])=>batches.map(o=>sanitizeObservation(o,policy));
const nullAmounts={total:null,input:null,uncachedInput:null,cachedInput:null,cacheCreation:{fiveMinutes:null,oneHour:null,other:null},output:null,reasoningOutput:null,toolInput:null};
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
describe('Claude native identity coverage; numeric accounting unsupported',()=>{
  it('publishes identical all-null receipts for successful, placeholder and changing-input snapshots',async()=>{
    const root=await home();const path=await file(root,'custom-project/session.jsonl',jsonl(row()));
    const first=await collect(root);expect(first.observations).toHaveLength(1);
    expect(first.observations[0].meters[0]).toMatchObject(nullAmounts);
    expect(first.observations[0].privateEvidence).toMatchObject({kind:'claude-native-uncertified',meters:[{input:100,output:3,cachedInput:10,cacheCreation:{fiveMinutes:7,oneHour:12,other:0}}]});
    expect(first.batches[0]).toMatchObject({outcome:'partial',diagnostics:expect.arrayContaining([{code:'unsupported-contract',severity:'warning'}])});
    const replacement=row('one',140,17);replacement.message.usage.cache_read_input_tokens=20;
    await writeFile(path,jsonl(replacement));const updated=await collect(root,first.batches[0].nextCheckpoint);
    expect(updated.observations[0].privateEvidence?.meters[0]).toMatchObject({input:140,cachedInput:20,output:17});
    expect(pub(first.observations)).toEqual(pub(updated.observations));
    const ledger=reduceLedger([...pub(first.observations),...pub(updated.observations)],meta);
    expect(ledger).toMatchObject({recordedUnits:1,knownTokens:'0',unknownTokenUnits:1,conflictingUnits:0});
    expect(priceMeters(ledger.units[0].observation!.meters,defaultCatalog)).toMatchObject({knownMicroUsd:'0',pricedUnits:0,unpricedUnits:1});
  });
  it('discovers parents, nested subagents, background and team streams; copies/forks/resumes retain response identity',async()=>{
    const root=await home();const first=await file(root,'chosen/parent.jsonl',jsonl(row()));
    await file(root,'chosen/parent/subagents/agent-child.jsonl',jsonl(row('child',40,7,{isSidechain:true,agentId:'child'})));
    await file(root,'long-truncated-slug-hash/background.jsonl',jsonl(row('background')));
    await file(root,'team-custom/teammate.jsonl',jsonl(row('teammate',50,2,{teamName:'synthetic-team'})));
    await file(root,'fork/copy.jsonl',jsonl(row('one',100,3,{uuid:'remapped',sessionId:'fork',forkedFrom:{sessionId:'shared-parent',messageUuid:'entry-one'}}),row('new',50)));
    const result=await collect(root);expect(result.sources).toHaveLength(5);
    const ledger=reduceLedger(pub(result.observations),meta);expect(ledger).toMatchObject({recordedUnits:5,unknownTokenUnits:5,conflictingUnits:0});
    expect(result.observations.find(o=>o.execution.cwd==='/synthetic/repo')?.lineage.kind).toBeTruthy();
    await appendFile(first,jsonl(row('resume')));expect((await collect(root)).observations).toHaveLength(7);
  });
  it('ignores null/arrays, aggregate results, API errors and missing or ambiguous identities without fabricating requests',async()=>{
    const root=await home();await file(root,'project/a.jsonl',jsonl(null,[],{type:'result',usage:{input_tokens:999}},row('error',0,0,{isApiErrorMessage:true}),{type:'assistant',requestId:'request-only',message:{usage:{input_tokens:10}}},{type:'assistant',message:{usage:{input_tokens:10}}},row()));
    const result=await collect(root);expect(result.observations).toHaveLength(1);expect(result.batches[0].outcome).toBe('partial');
    expect(result.batches[0].diagnostics.map(d=>d.code)).toContain('unsupported-identity');
    expect(JSON.stringify(result.batches)).not.toContain('PRIVATE_TRANSCRIPT_CANARY');
  });
  it('preserves each request model/cwd and private cache TTL uncertainty without inferring rates or current env',async()=>{
    const root=await home();const missingTTL=row('ttl');delete (missingTTL.message.usage as Record<string,unknown>).cache_creation;
    await file(root,'chosen/a.jsonl',jsonl(row(),row('other',100,3,{cwd:'/synthetic/worktree',message:{...row().message,id:'msg-other',model:'claude-opus-5-5'}}),missingTTL));
    const result=await collect(root);expect(result.observations.map(o=>[o.privateEvidence?.meters[0].model,o.execution.cwd])).toEqual([['claude-sonnet-4-6','/synthetic/repo'],['claude-opus-5-5','/synthetic/worktree'],['claude-sonnet-4-6','/synthetic/repo']]);
    expect(result.observations[2].privateEvidence?.meters[0].cacheCreation).toEqual({fiveMinutes:null,oneHour:null,other:19});
    for(const model of ['claude-opus-5-5','claude-sonnet-5-5','claude-haiku-5-5']) {
      const meter={...result.observations[0].meters[0],model,vendor:'anthropic'};
      expect(()=>parsePublicObservation({...pub(result.observations)[0],meters:[meter]})).not.toThrow();
      expect(priceMeters([meter as never],defaultCatalog).unpricedUnits).toBe(1);
      expect(()=>parsePublicObservation({...pub(result.observations)[0],meters:[{...meter,vendor:'openai'}]})).toThrow('invalid-record');
    }
  });
  it('finds old-mtime new files and verifies same-mtime rewrites, truncations and rotations',async()=>{
    const root=await home();const path=await file(root,'project/a.jsonl',jsonl(row()));await utimes(path,new Date(0),new Date(0));
    const first=await collect(root);const cp=first.batches[0].nextCheckpoint;
    expect((await collect(root,cp)).observations).toEqual([]);
    await writeFile(path,jsonl(row('replacement')));await utimes(path,new Date(0),new Date(0));
    const changed=await collect(root,cp);expect(changed.observations).toHaveLength(1);expect(changed.batches[0].source.generation).not.toBe(cp.sourceGeneration);
    await writeFile(path,jsonl(row('short')));const truncated=await collect(root,changed.batches[0].nextCheckpoint);expect(truncated.observations).toHaveLength(1);
    await rename(path,join(root,'rotated'));await writeFile(path,jsonl(row('rotation')));
    expect((await collect(root,truncated.batches[0].nextCheckpoint)).observations).toHaveLength(1);
    const old=await file(root,'project/new-old.jsonl',jsonl(row('old-new')));await utimes(old,new Date(0),new Date(0));expect((await collect(root)).sources).toHaveLength(2);
  });
  it('retries partial tails and bounded suffixes after restart with incremental/full public parity',async()=>{
    const root=await home();const firstLine=jsonl(row());const secondLine=jsonl(row('two'));const path=await file(root,'project/a.jsonl',firstLine+secondLine.slice(0,80));
    let first=await collect(root);let cp=first.batches[0].nextCheckpoint;expect(cp.cursor.offset).toBe(Buffer.byteLength(firstLine));expect(cp.cursor.incompleteTail).toBe('');
    expect(JSON.stringify(cp)).not.toContain('PRIVATE_TRANSCRIPT_CANARY');await appendFile(path,secondLine.slice(80));
    const second=await collect(root,cp);expect(second.observations).toHaveLength(1);expect(pub([...first.observations,...second.observations])).toEqual(pub((await collect(root)).observations));
    const bounded=await collect(root,null,{maxBytes:Buffer.byteLength(firstLine)});expect(bounded.observations).toHaveLength(1);
    const suffix=await collect(root,bounded.batches[0].nextCheckpoint,{maxBytes:Buffer.byteLength(secondLine)});expect(suffix.observations).toHaveLength(1);
    expect(checkpointSchema.safeParse(suffix.batches[0].nextCheckpoint).success).toBe(true);
  });
  it('uses explicit roots before config env/default, canonicalizes homes and excludes symlink escapes',async()=>{
    const first=await home(),second=await home();await file(first,'chosen/a.jsonl',jsonl(row()));await file(second,'chosen/b.jsonl',jsonl(row('two')));
    const adapter=createClaudeAdapter({environment:{CLAUDE_CONFIG_DIR:second},defaultHome:first});
    const env=await adapter.discover({repositoryId:scope.repositoryId,enrolledRoots:[],signal});expect(env).toHaveLength(1);expect(env[0].root.startsWith(second)).toBe(true);
    await symlink(join(second,'projects'),join(first,'projects','escape'));const sources=await adapter.discover({repositoryId:scope.repositoryId,enrolledRoots:[first,first,second],signal});expect(sources).toHaveLength(2);
  });
  it('keeps private normalized evidence durable while sanitizer, store and artifacts reject numeric promotion or raw extras',async()=>{
    const root=await home();await file(root,'project/a.jsonl',jsonl(row()));const result=await collect(root);const batch=result.batches[0];const obs=batch.observations[0];
    const commonDir=join(root,'.git');await mkdir(commonDir);const ctx={commonDir,privateDir:join(commonDir,'agent-badge')} as RepositoryContext;
    const store=await openStore(ctx,{processNamespace:async()=>'synthetic-namespace'});const records=pub(result.observations);await store.commitBatch(batch.source,batch,records);
    const restart=await openStore(ctx,{processNamespace:async()=>'synthetic-namespace'});expect((await restart.journal())[0].observations[0].privateEvidence).toEqual(obs.privateEvidence);expect(await restart.pending()).toEqual(records);
    const promoted={...obs,meters:obs.privateEvidence!.meters};expect(()=>parseObservation(promoted)).toThrow('invalid-record');expect(()=>sanitizeObservation(promoted,policy)).toThrow('invalid-record');
    await expect(store.commitBatch(batch.source,{...batch,observations:[promoted]},records)).rejects.toThrow('invalid-batch');
    expect(()=>parseObservation({...obs,privateEvidence:{...obs.privateEvidence,transcript:'PRIVATE_TRANSCRIPT_CANARY'}})).toThrow('invalid-record');
    expect(()=>parsePublicObservation({...records[0],privateEvidence:obs.privateEvidence})).toThrow('invalid-record');
    const artifacts=renderArtifacts(reduceLedger(records,meta),meta);const text=[...artifacts.values()].map(bytes=>Buffer.from(bytes).toString()).join('\n');
    for(const secret of ['privateEvidence','PRIVATE_TRANSCRIPT_CANARY','msg-one','req-one','/synthetic/repo'])expect(text).not.toContain(secret);
    expect(Buffer.from(artifacts.get('badge.svg')!).toString()).toContain('usage unknown');
    const costMeta={...meta,policy:{...policy,badge:{...policy.badge,metric:'estimated-cost' as const}}};
    expect(Buffer.from(renderArtifacts(reduceLedger(records,costMeta),costMeta).get('badge.svg')!).toString()).toContain('cost unknown');
  });
  it('does not require request aliases and never splits a message response on alias disagreement',async()=>{
    const root=await home();await file(root,'project/a.jsonl',jsonl(row('one',100,3,{requestId:undefined}),row('one',140,17,{requestId:'different-alias'})));
    const result=await collect(root);expect(result.observations).toHaveLength(2);
    expect(result.observations[0].privateEvidence?.requestAlias).toBeNull();
    expect(result.batches[0].diagnostics.map(d=>d.code)).toContain('unsupported-identity');
    expect(reduceLedger(pub(result.observations),meta)).toMatchObject({recordedUnits:1,conflictingUnits:0});
  });
  it('does not change public projection when private model identity changes or is newly recognized',async()=>{
    const root=await home();const path=await file(root,'project/a.jsonl',jsonl(row()));const first=await collect(root);
    await writeFile(path,jsonl(row('one',200,17,{message:{...row().message,model:'future-model'}})));
    const second=await collect(root);expect(second.observations[0].privateEvidence?.meters[0].model).toBeNull();
    expect(pub(first.observations)).toEqual(pub(second.observations));
  });
  it('retains bounded private continuation across journal limits and envelope overflow without text',async()=>{
    const root=await home();await file(root,'project/a.jsonl',jsonl(...Array.from({length:1001},(_,i)=>row(String(i)))));
    const first=await collect(root);expect(first.observations).toHaveLength(1000);
    const second=await collect(root,first.batches[0].nextCheckpoint);expect(second.observations).toHaveLength(1);
    expect(second.batches[0].nextCheckpoint.cursor.offset).toBe(second.batches[0].nextCheckpoint.cursor.size);
    expect(Buffer.byteLength(JSON.stringify(first.batches[0].nextCheckpoint.continuation))).toBeLessThanOrEqual(65536);
    const largeId='😀'.repeat(1000);await file(root,'project/b.jsonl',jsonl(...Array.from({length:32},(_,i)=>row(largeId+i))));
    const large=await collect(root);const batch=large.batches.find(b=>b.source.root.endsWith('b.jsonl'))!;
    expect(batch.observations).toHaveLength(32);expect(checkpointSchema.safeParse(batch.nextCheckpoint).success).toBe(true);
    expect(JSON.parse(batch.nextCheckpoint.continuation!.state)).toMatchObject({aliases:[],aliasOverflow:true,coveragePartial:true});
    expect(batch.observations.every(o=>Buffer.byteLength(JSON.stringify(o.privateEvidence))<=8192)).toBe(true);
  });
  it('persists append/truncation/policy/reader resets atomically with latest candidate and batch source',async()=>{
    const root=await home();const path=await file(root,'project/a.jsonl',jsonl(row()));const commonDir=join(root,'.git');await mkdir(commonDir);
    const ctx={commonDir,privateDir:join(commonDir,'agent-badge')} as RepositoryContext;
    const adapter=createClaudeAdapter({environment:{},defaultHome:root});
    const run=async(activeScope=scope,alter?:(cp:Checkpoint)=>Checkpoint)=>{
      const store=await openStore(ctx,{processNamespace:async()=>'synthetic-namespace'});let result:ScanBatch|undefined;
      await store.withLock(signal,async()=>{const [source]=await adapter.discover({repositoryId:scope.repositoryId,enrolledRoots:[],signal});
        let cp=await store.checkpointCandidate(source);if(cp&&alter)cp=alter(cp);
        for await(const batch of adapter.scan(source,cp,signal,activeScope)){result=batch;await store.commitBatch(batch.source,batch,pub(batch.observations));}
      });return result!;
    };
    const first=await run();await appendFile(path,jsonl(row('append')));const second=await run();expect(second.source.generation).toBe(first.source.generation);expect(second.observations).toHaveLength(1);
    await writeFile(path,jsonl(row('truncated')));const third=await run();expect(third.source.generation).not.toBe(second.source.generation);
    const nextScope={...scope,attributionPolicyHash:'b'.repeat(64)};const fourth=await run(nextScope);expect(fourth.observations).toHaveLength(1);expect(fourth.source.generation).not.toBe(third.source.generation);
    const fifth=await run(nextScope,cp=>({...cp,readerVersion:'old-reader'}));expect(fifth.observations).toHaveLength(1);expect(fifth.source.generation).not.toBe(fourth.source.generation);
    expect(pub(fourth.observations)).toEqual(pub(fifth.observations));
    const durable=await (await openStore(ctx,{processNamespace:async()=>'synthetic-namespace'})).journal();expect(durable).toHaveLength(5);
    expect(durable.flatMap(entry=>entry.observations)).toHaveLength(5);
  });
  it('returns finite unavailable/unsupported diagnostics for missing roots, stale discovery, invalid continuation and cancellation',async()=>{
    const root=await home();const path=await file(root,'project/a.jsonl',jsonl(row()));const adapter=createClaudeAdapter({environment:{}});
    const [source]=await adapter.discover({repositoryId:scope.repositoryId,enrolledRoots:[root],signal});const first=await collect(root);
    const corrupted={...first.batches[0].nextCheckpoint,continuation:{provider:'claude' as const,readerVersion:'1',state:'{"prompt":"PRIVATE_TRANSCRIPT_CANARY"}'}};
    const replay=await collect(root,corrupted);expect(replay.observations).toHaveLength(1);expect(JSON.stringify(replay.batches[0].nextCheckpoint)).not.toContain('PRIVATE_TRANSCRIPT_CANARY');
    await rename(path,path+'.old');await writeFile(path,jsonl(row('replacement')));const stale:ScanBatch[]=[];for await(const batch of adapter.scan(source,null,signal,scope))stale.push(batch);expect(stale[0].outcome).toBe('unavailable');
    const absent=await adapter.discover({repositoryId:scope.repositoryId,enrolledRoots:[root+'/absent'],signal});const unavailable:ScanBatch[]=[];for await(const batch of adapter.scan(absent[0],null,signal,scope))unavailable.push(batch);expect(unavailable[0].outcome).toBe('unavailable');
    const cancelled:ScanBatch[]=[];for await(const batch of adapter.scan(source,null,AbortSignal.abort(),scope))cancelled.push(batch);expect(cancelled[0].diagnostics).toEqual([{code:'timeout',severity:'warning'}]);
  });
  it('skips oversized or malformed rows without persisting them and leaves all public amounts unknown',async()=>{
    const root=await home();await file(root,'project/a.jsonl','{bad}\n'+jsonl({...row('large'),text:'PRIVATE_TRANSCRIPT_CANARY'.repeat(15000)},row()));
    const result=await collect(root);expect(result.observations).toHaveLength(1);expect(result.batches[0].diagnostics.map(d=>d.code)).toEqual(expect.arrayContaining(['invalid-record','incomplete-source']));
    expect(JSON.stringify(result.batches)).not.toContain('PRIVATE_TRANSCRIPT_CANARY');
  });

  it('preserves the pinned successful/placeholder persistence counterexample without publishing numbers',async()=>{
    const root=await home();const fixtureRoot=new URL('../../../../testkit/fixtures/claude/native-2.1.307/',import.meta.url);
    const successful=await readFile(new URL('success.jsonl',fixtureRoot),'utf8');const placeholder=await readFile(new URL('placeholder.jsonl',fixtureRoot),'utf8');
    const path=await file(root,'project/a.jsonl',successful);const first=await collect(root);expect(first.observations).toHaveLength(2);
    expect(first.observations[0].privateEvidence?.meters[0].output).toBe(17);
    await writeFile(path,placeholder);const second=await collect(root);expect(second.observations).toHaveLength(2);expect(second.observations[0].privateEvidence?.meters[0].output).toBe(3);
    expect(pub(first.observations)).toEqual(pub(second.observations));
    expect(reduceLedger(pub([...first.observations,...second.observations]),meta)).toMatchObject({recordedUnits:1,conflictingUnits:0,unknownTokenUnits:1});
  });
  it('proves 140/150 and supplied-card 1800 only for explicitly certified normalized imports through dedupe and pricing',()=>{
    const receipts=(...records:ReturnType<typeof certifiedClaudeImport>[])=>records.map(record=>sanitizeObservation(parseObservation(record),policy));
    const original=certifiedClaudeImport('original',100),child=certifiedClaudeImport('child',40),fork=certifiedClaudeImport('fork-new',50);
    const copied={...original,source:{...original.source,sourceIdentity:'synthetic-copy'},lineage:{kind:'fork' as const,parentNativeId:'original-session',inherited:'isolated' as const}};
    expect(reduceLedger(receipts(original,child),meta).knownTokens).toBe('140');
    expect(reduceLedger(receipts(original,copied,fork),meta).knownTokens).toBe('150');
    const supplied={...defaultCatalog,cards:defaultCatalog.cards.map(card=>card.model==='gpt-5.4-mini'?{...card,input:15000000}:card)};
    const ledger=reduceLedger(receipts(original,certifiedClaudeImport('mixed',100,'gpt-5.4-mini')),meta);
    const meters=ledger.units.flatMap(unit=>unit.observation!.meters);expect(priceMeters(meters,supplied)).toMatchObject({knownMicroUsd:'1800',pricedUnits:2,unpricedUnits:0});
  });

  it('never stores unsafe counters or unbounded/private evidence and rejects all numeric promotion shapes',async()=>{
    const root=await home();const invalid=row();invalid.message.usage.input_tokens=-1;invalid.message.usage.output_tokens=Number.MAX_SAFE_INTEGER+1;
    await file(root,'project/a.jsonl',jsonl(invalid));const result=await collect(root);const obs=result.observations[0];
    expect(obs.privateEvidence?.meters[0]).toMatchObject({input:null,output:null});
    for(const [key,value] of Object.entries({input:0,output:0,total:0,uncachedInput:0,cachedInput:0,reasoningOutput:0,toolInput:0,cacheCreation:{fiveMinutes:0,oneHour:null,other:null}})) {
      expect(()=>parseObservation({...obs,meters:[{...obs.meters[0],[key]:value}]})).toThrow('invalid-record');
    }
    expect(()=>parseObservation({...obs,privateEvidence:{...obs.privateEvidence,requestAlias:'😀'.repeat(3000)}})).toThrow('invalid-record');
    expect(()=>parseObservation({...obs,privateEvidence:{...obs.privateEvidence,meters:[obs.privateEvidence!.meters[0],obs.privateEvidence!.meters[0]]}})).toThrow('invalid-record');
    expect(()=>parseObservation({...obs,provider:'codex'})).toThrow('invalid-record');
  });
  it('represents discovery gaps independently without losing healthy sources',async()=>{
    const root=await home();await file(root,'healthy/a.jsonl',jsonl(row()));await file(root,Array.from({length:18},()=> 'deep').join('/')+'/a.jsonl',jsonl(row('too-deep')));
    const result=await collect(root);expect(result.observations).toHaveLength(1);expect(result.sources.some(source=>source.schema==='claude-discovery-partial')).toBe(true);
    expect(result.batches.some(batch=>batch.outcome==='unsupported')).toBe(true);
  });

  it('isolates identities that exceed the normalized framing bound from healthy responses',async()=>{
    const root=await home();await file(root,'project/a.jsonl',jsonl(row('x'.repeat(4090)),row()));
    const result=await collect(root);expect(result.observations).toHaveLength(1);expect(result.batches[0].outcome).toBe('partial');
    expect(result.batches[0].diagnostics.map(d=>d.code)).toContain('unsupported-identity');
  });

  it('keeps certified Codex amounts in a mixed Claude-unknown ledger and marks partial coverage',async()=>{
    const root=await home();await file(root,'project/a.jsonl',jsonl(row()));const claude=await collect(root);
    const known=parseObservation(protocolObservationFixture());known.meters[0].cacheCreation={fiveMinutes:0,oneHour:0,other:0};known.meters[0].semantics.cacheCreation='included-in-input';
    const records=[sanitizeObservation(known,policy),...pub(claude.observations)];const ledger=reduceLedger(records,meta);
    expect(ledger).toMatchObject({recordedUnits:2,knownTokens:'140',unknownTokenUnits:1,partialUnits:1,conflictingUnits:0});
    expect(priceMeters(ledger.units.flatMap(unit=>unit.observation!.meters),defaultCatalog)).toMatchObject({knownMicroUsd:'228',pricedUnits:1,unpricedUnits:1});
    const artifacts=renderArtifacts(ledger,meta);expect(Buffer.from(artifacts.get('badge.svg')!).toString()).toContain('140 known tokens');
    const summary=JSON.parse(Buffer.from(artifacts.get('summary.json')!).toString());expect(summary.price).toMatchObject({knownMicroUsd:'228',pricedUnits:1,unpricedUnits:1});
  });

});
