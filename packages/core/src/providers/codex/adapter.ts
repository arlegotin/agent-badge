import { createHash } from 'node:crypto';
import { readdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { checkpointContinuationSchema, checkpointSchema, checkpointScopeSchema, parseProtocol, sourceDescriptorSchema } from '../../domain/capabilities.js';
import type { Checkpoint, CheckpointScope, Diagnostic, ProviderAdapter, SourceDescriptor } from '../../domain/capabilities.js';
import { findLatestCodexStateDatabase, readCodexInventory } from './codex-sql.js';
import { CODEX_READER_VERSION, CODEX_SOURCE_SCHEMA, DEFAULT_MAX_BYTES, codexContinuationSchema, emptyHash, parseCodexRollout, readRollout, rolloutEpoch } from './reader.js';

export interface CodexAdapterOptions {
  environment?: Readonly<Record<string,string|undefined>>;
  defaultHome?: string;
  /** Explicit sqlite_home equivalent; CODEX_SQLITE_HOME otherwise. */
  sqliteHome?: string;
  maxBytes?: number;
}
const diagnostic=(code:Diagnostic['code']):Diagnostic=>({code,severity:'warning'});
/** No agent process/server connections; explicit local roots take precedence over environment and default. */
export function createCodexAdapter(options: CodexAdapterOptions = {}): ProviderAdapter {
  const environment=options.environment ?? process.env;
  const maxBytes=options.maxBytes ?? DEFAULT_MAX_BYTES;
  if(!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 64*1024*1024) throw new Error('invalid-record');
  return {
    async discover(ctx) {
      const roots=ctx.enrolledRoots.length ? ctx.enrolledRoots : [environment.CODEX_HOME?.trim() || options.defaultHome || join(homedir(),'.codex')];
      const canonicalRoots=new Set<string>();
      const sources=new Map<string,SourceDescriptor>();
      for(const root of roots) {
        ctx.signal.throwIfAborted();
        try {canonicalRoots.add(await realpath(root));}
        catch {
          if(ctx.enrolledRoots.length || environment.CODEX_HOME?.trim()) {
            const path=resolve(root);
            sources.set(path,{provider:'codex',instanceKey:path,root:path,schema:'codex-unavailable',generation:'unavailable',readerVersion:CODEX_READER_VERSION,sourceIdentity:path});
          }
        }
      }
      for(const root of canonicalRoots) {
        const paths=new Set<string>(); let inventoryUnsupported=false; let discoveryPartial=false;
        const walk=async (directory:string,depth=0):Promise<void>=> {
          ctx.signal.throwIfAborted(); if(depth>16 || paths.size>=10000) {discoveryPartial=true;return;}
          let entries; try {entries=await readdir(directory,{withFileTypes:true});} catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT') discoveryPartial=true;return;}
          for(const entry of entries) {ctx.signal.throwIfAborted(); if(paths.size>=10000) {discoveryPartial=true;break;}
            if(entry.isDirectory()) await walk(join(directory,entry.name),depth+1);
            else if(entry.isFile() && /\.jsonl(?:\.zst)?$/.test(entry.name)) paths.add(join(directory,entry.name));
          }
        };
        await walk(join(root,'sessions'));await walk(join(root,'archived_sessions'));
        const sqliteRoot=options.sqliteHome || environment.CODEX_SQLITE_HOME?.trim() || root;
        let database:string|null=null;
        try {database=await findLatestCodexStateDatabase(sqliteRoot);} catch {discoveryPartial=true;}
        if(database) {
          const inventory=await readCodexInventory(database);inventoryUnsupported=inventory.outcome!=='complete';
          for(const path of inventory.rolloutPaths) if(isAbsolute(path) && /\.jsonl(?:\.zst)?$/.test(path)) paths.add(path);
        }
        for(const path of [...paths].sort()) {
          ctx.signal.throwIfAborted();
          try {
            const epoch=await rolloutEpoch(path);
            if(!sources.has(epoch.identity)) sources.set(epoch.identity,{provider:'codex',instanceKey:root,root:epoch.identity,
              schema:path.endsWith('.zst')?'codex-compressed-unsupported':CODEX_SOURCE_SCHEMA,
              generation:epoch.generation,readerVersion:CODEX_READER_VERSION,sourceIdentity:epoch.identity});
          } catch {
            sources.set(path,{provider:'codex',instanceKey:root,root:path,schema:'codex-unavailable',generation:'unavailable',readerVersion:CODEX_READER_VERSION,sourceIdentity:path});
          }
        }
        if(discoveryPartial) sources.set(root,{provider:'codex',instanceKey:root,root,schema:'codex-discovery-partial',generation:'discovery',readerVersion:CODEX_READER_VERSION,sourceIdentity:root});
        // Inventory failure is represented independently; healthy rollout sources remain usable.
        if(inventoryUnsupported && database) sources.set(database,{provider:'codex',instanceKey:root,root:database,schema:'codex-inventory-unavailable',generation:'inventory',readerVersion:CODEX_READER_VERSION,sourceIdentity:database});
      }
      return [...sources.values()];
    },
    async *scan(input, inputCheckpoint, signal, inputScope) {
      const discoveredSource=parseProtocol(sourceDescriptorSchema,input); let source=discoveredSource; const scope=parseProtocol(checkpointScopeSchema,inputScope);
      const initial=makeCheckpoint(source,scope); let nextCheckpoint=initial;
      if(source.provider!=='codex' || source.schema!==CODEX_SOURCE_SCHEMA || source.readerVersion!==CODEX_READER_VERSION) {
        yield {source,observations:[],nextCheckpoint,outcome:source.schema==='codex-unavailable'?'unavailable':'unsupported',diagnostics:[diagnostic(source.schema==='codex-unavailable'?'unavailable-source':'unsupported-source')]};return;
      }
      try {
        const parsed=checkpointSchema.safeParse(inputCheckpoint); const candidate=parsed.success && parsed.data.provider==='codex' && parsed.data.instanceKey===source.instanceKey && parsed.data.sourceIdentity===source.sourceIdentity?parsed.data:null;
        const checkpoint=candidate && compatible(candidate,source,scope)?candidate:null;
        let state;
        if(checkpoint?.continuation?.provider==='codex' && checkpoint.continuation.readerVersion===CODEX_READER_VERSION) {
          try {const parsed=codexContinuationSchema.safeParse(JSON.parse(checkpoint.continuation.state));if(parsed.success && parsed.data.physicalEpoch===source.generation) state=parsed.data;} catch {/* Replay invalid metadata state. */}
        }
        const read=await readRollout(source.root,maxBytes,signal,source.generation,state && checkpoint?checkpoint.cursor:undefined);
        if(read.identity!==source.sourceIdentity) throw new Error('incomplete-source');
        // Logical generations survive verified appends, and chain on any reset. They have no order.
        const generation=read.resumed && candidate ? candidate.sourceGeneration : candidate ?
          createHash('sha256').update(JSON.stringify([source.generation,candidate.sourceGeneration,read.prefixHash,scope,source.readerVersion,'reset'])).digest('hex') : source.generation;
        source={...source,generation};
        const result=parseCodexRollout(read.bytes,source,read.resumed?state:undefined);
        result.state.physicalEpoch=discoveredSource.generation;
        const envelope=()=>({provider:'codex' as const,readerVersion:CODEX_READER_VERSION,state:JSON.stringify(result.state)});
        let continuation=envelope();
        if(!checkpointContinuationSchema.safeParse(continuation).success) {
          result.state.contexts=[];result.state.invalid=true;result.state.coveragePartial=true;
          continuation=envelope();
          if(!result.diagnostics.some(d=>d.code==='incomplete-source')) result.diagnostics.push(diagnostic('incomplete-source'));
        }
        if(!checkpointContinuationSchema.safeParse(continuation).success) {
          // Do not reinterpret omitted lineage as a safe root or accept later copied metadata as the owner.
          result.state.owner=null;result.state.ownerOmitted=true;result.observations=[];
          continuation=envelope();
        }
        nextCheckpoint=parseProtocol(checkpointSchema,{...makeCheckpoint(source,scope),
          cursor:{offset:read.start+result.offset,size:read.size,prefixHash:read.hashThrough(result.offset),incompleteTail:''},continuation});
        const diagnostics=[...result.diagnostics];
        if(read.bounded && !diagnostics.some(d=>d.code==='incomplete-source')) diagnostics.push(diagnostic('incomplete-source'));
        if(result.observations.some(o=>o.quality==='partial') && !diagnostics.some(d=>d.code==='incomplete-source')) diagnostics.push(diagnostic('incomplete-source'));
        yield {source,observations:result.observations,nextCheckpoint,outcome:diagnostics.length?'partial':result.supported?'complete':'unsupported',
          diagnostics:result.supported || diagnostics.length?diagnostics:[diagnostic('unsupported-contract')]};
      } catch {
        yield {source:discoveredSource,observations:[],nextCheckpoint:initial,outcome:'unavailable',diagnostics:[diagnostic(signal.aborted?'timeout':'incomplete-source')]};
      }
    }
  };
}
function makeCheckpoint(source:SourceDescriptor,scope:CheckpointScope):Checkpoint {
  return {schemaVersion:1,provider:'codex',instanceKey:source.instanceKey,sourceIdentity:source.sourceIdentity,
    sourceGeneration:source.generation,sourceSchema:source.schema,readerVersion:source.readerVersion,...scope,
    continuation:null,cursor:{offset:0,size:0,prefixHash:emptyHash,incompleteTail:''}};
}
function compatible(checkpoint:Checkpoint,source:SourceDescriptor,scope:CheckpointScope):boolean {
  return checkpoint.provider==='codex' && checkpoint.instanceKey===source.instanceKey && checkpoint.sourceIdentity===source.sourceIdentity &&
    checkpoint.sourceSchema===source.schema && checkpoint.readerVersion===source.readerVersion &&
    checkpoint.repositoryId===scope.repositoryId && checkpoint.normalizationVersion===scope.normalizationVersion && checkpoint.attributionPolicyHash===scope.attributionPolicyHash;
}
export const codexAdapter:ProviderAdapter=createCodexAdapter();
export { codexAccountingContract, codexCapabilityManifest } from './identity.js';
