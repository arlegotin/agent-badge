import { createHash } from 'node:crypto';
import { readdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { checkpointContinuationSchema, checkpointSchema, checkpointScopeSchema, parseProtocol, sourceDescriptorSchema } from '../../domain/capabilities.js';
import type { Checkpoint, CheckpointScope, Diagnostic, ProviderAdapter, SourceDescriptor } from '../../domain/capabilities.js';
import { DEFAULT_MAX_BYTES, emptyHash, readSourceFile, sourceFileEpoch } from '../source-file.js';
import { CLAUDE_READER_VERSION, CLAUDE_SOURCE_SCHEMA, claudeContinuationSchema, parseClaudeTranscript } from './reader.js';
export interface ClaudeAdapterOptions {
  environment?:Readonly<Record<string,string|undefined>>;
  /** Config root, equivalent to ~/.claude, not the enclosing OS home. */
  defaultHome?:string;
  maxBytes?:number;
}
const diagnostic=(code:Diagnostic['code']):Diagnostic=>({code,severity:'warning'});
/** Enumerate project names, never invert slugs or inspect settings/history/credentials. */
export function createClaudeAdapter(options:ClaudeAdapterOptions={}):ProviderAdapter {
  const environment=options.environment??process.env,maxBytes=options.maxBytes??DEFAULT_MAX_BYTES;
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>64*1024*1024)throw new Error('invalid-record');
  return {
    async discover(ctx) {
      const roots=ctx.enrolledRoots.length?ctx.enrolledRoots:[environment.CLAUDE_CONFIG_DIR?.trim()||options.defaultHome||join(homedir(),'.claude')];
      const canonical=new Set<string>(),sources=new Map<string,SourceDescriptor>();
      const descriptor=(root:string,path:string,schema:string,generation:string):SourceDescriptor=>({provider:'claude',instanceKey:root,root:path,schema,generation,readerVersion:CLAUDE_READER_VERSION,sourceIdentity:path});
      for(const root of roots) {
        ctx.signal.throwIfAborted();
        try{canonical.add(await realpath(root));}catch{
          if(ctx.enrolledRoots.length||environment.CLAUDE_CONFIG_DIR?.trim())sources.set(resolve(root),descriptor(resolve(root),resolve(root),'claude-unavailable','unavailable'));
        }
      }
      for(const root of canonical) {
        const paths=new Set<string>();let partial=false,entriesVisited=0;
        const walk=async(directory:string,depth=0):Promise<void>=>{
          ctx.signal.throwIfAborted();if(depth>16||entriesVisited>=20000||paths.size>=10000){partial=true;return;}
          let entries;try{entries=await readdir(directory,{withFileTypes:true});}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')partial=true;return;}
          for(const entry of entries){ctx.signal.throwIfAborted();if(++entriesVisited>20000||paths.size>=10000){partial=true;break;}
            if(entry.isDirectory())await walk(join(directory,entry.name),depth+1);
            else if(entry.isFile()&&entry.name.endsWith('.jsonl'))paths.add(join(directory,entry.name));
          }
        };
        await walk(join(root,'projects'));
        for(const path of [...paths].sort()) {
          ctx.signal.throwIfAborted();
          try{const epoch=await sourceFileEpoch(path);
            const localPath=relative(root,epoch.identity);
            if(localPath==='..'||localPath.startsWith('..'+sep)||isAbsolute(localPath)){partial=true;continue;}
            if(!sources.has(epoch.identity))sources.set(epoch.identity,descriptor(root,epoch.identity,CLAUDE_SOURCE_SCHEMA,epoch.generation));
          }catch{sources.set(path,descriptor(root,path,'claude-unavailable','unavailable'));}
        }
        if(partial)sources.set(root,descriptor(root,root,'claude-discovery-partial','discovery'));
      }
      return [...sources.values()];
    },
    async *scan(input,inputCheckpoint,signal,inputScope) {
      const discovered=parseProtocol(sourceDescriptorSchema,input),scope=parseProtocol(checkpointScopeSchema,inputScope);let source=discovered;
      const initial=makeCheckpoint(source,scope);
      if(source.provider!=='claude'||source.schema!==CLAUDE_SOURCE_SCHEMA||source.readerVersion!==CLAUDE_READER_VERSION) {
        const unavailable=source.schema==='claude-unavailable';yield{source,observations:[],nextCheckpoint:initial,outcome:unavailable?'unavailable':'unsupported',diagnostics:[diagnostic(unavailable?'unavailable-source':'unsupported-source')]};return;
      }
      try {
        signal.throwIfAborted();
        const parsed=checkpointSchema.safeParse(inputCheckpoint);
        const candidate=parsed.success&&parsed.data.provider==='claude'&&parsed.data.instanceKey===source.instanceKey&&parsed.data.sourceIdentity===source.sourceIdentity?parsed.data:null;
        const checkpoint=candidate&&compatible(candidate,source,scope)?candidate:null;
        let state;
        if(checkpoint?.continuation?.provider==='claude'&&checkpoint.continuation.readerVersion===CLAUDE_READER_VERSION) {
          try{const parsed=claudeContinuationSchema.safeParse(JSON.parse(checkpoint.continuation.state));if(parsed.success&&parsed.data.physicalEpoch===source.generation)state=parsed.data;}catch{/* Replay invalid metadata. */}
        }
        const read=await readSourceFile(source.root,maxBytes,signal,source.generation,state&&checkpoint?checkpoint.cursor:undefined);
        if(read.identity!==source.sourceIdentity)throw new Error('incomplete-source');
        const generation=read.resumed&&candidate?candidate.sourceGeneration:candidate?
          createHash('sha256').update(JSON.stringify([source.generation,candidate.sourceGeneration,read.prefixHash,scope,source.readerVersion,'reset'])).digest('hex'):source.generation;
        source={...source,generation};const result=parseClaudeTranscript(read.bytes,source,read.resumed?state:undefined);
        result.state.physicalEpoch=discovered.generation;
        const envelope=()=>({provider:'claude' as const,readerVersion:CLAUDE_READER_VERSION,state:JSON.stringify(result.state)});
        let continuation=envelope();
        if(!checkpointContinuationSchema.safeParse(continuation).success){result.state.aliases=[];result.state.aliasOverflow=true;result.state.coveragePartial=true;continuation=envelope();result.diagnostics.push(diagnostic('incomplete-source'));}
        const nextCheckpoint=parseProtocol(checkpointSchema,{...makeCheckpoint(source,scope),continuation,
          cursor:{offset:read.start+result.offset,size:read.size,prefixHash:read.hashThrough(result.offset),incompleteTail:''}});
        if(read.bounded&&!result.diagnostics.some(d=>d.code==='incomplete-source'))result.diagnostics.push(diagnostic('incomplete-source'));
        yield{source,observations:result.observations,nextCheckpoint,outcome:result.supported||result.diagnostics.length?'partial':'unsupported',
          diagnostics:result.supported||result.diagnostics.length?result.diagnostics:[diagnostic('unsupported-contract')]};
      }catch{yield{source:discovered,observations:[],nextCheckpoint:initial,outcome:'unavailable',diagnostics:[diagnostic(signal.aborted?'timeout':'incomplete-source')]};}
    }
  };
}
function makeCheckpoint(source:SourceDescriptor,scope:CheckpointScope):Checkpoint {
  return {schemaVersion:1,provider:'claude',instanceKey:source.instanceKey,sourceIdentity:source.sourceIdentity,sourceGeneration:source.generation,
    sourceSchema:source.schema,readerVersion:source.readerVersion,...scope,continuation:null,cursor:{offset:0,size:0,prefixHash:emptyHash,incompleteTail:''}};
}
function compatible(checkpoint:Checkpoint,source:SourceDescriptor,scope:CheckpointScope):boolean {
  return checkpoint.sourceSchema===source.schema&&checkpoint.readerVersion===source.readerVersion&&checkpoint.repositoryId===scope.repositoryId&&
    checkpoint.normalizationVersion===scope.normalizationVersion&&checkpoint.attributionPolicyHash===scope.attributionPolicyHash;
}
export const claudeAdapter=createClaudeAdapter();
export { claudeAccountingContract, claudeCapabilityManifest } from './identity.js';
