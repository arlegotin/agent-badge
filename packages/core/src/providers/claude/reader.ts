import { z } from 'zod';
import { knownModelVendors, modelIdSchema, privateStringSchema, safeCounterSchema } from '../../domain/capabilities.js';
import type { Diagnostic, SourceDescriptor } from '../../domain/capabilities.js';
import { parseObservation } from '../../domain/usage.js';
import type { MeterSegment, UsageObservation } from '../../domain/usage.js';
import { claudeResponseIdentity } from './identity.js';
export const CLAUDE_SOURCE_SCHEMA='claude-native-jsonl-identity-v1';
export const CLAUDE_READER_VERSION='1';
const MAX_LINE_BYTES=256*1024;
const MAX_OBSERVATIONS=1000;
export const claudeContinuationSchema=z.object({version:z.literal(1),physicalEpoch:z.string().regex(/^[a-f0-9]{64}$/),
  supported:z.boolean(),coveragePartial:z.boolean(),
  aliases:z.array(z.object({message:privateStringSchema,request:privateStringSchema.nullable()}).strict()).max(128),
  aliasOverflow:z.boolean()
}).strict();
export type ClaudeContinuation=z.infer<typeof claudeContinuationSchema>;
type JsonObject=Record<string,unknown>;
function object(value:unknown):JsonObject|null{return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as JsonObject:null;}
function text(value:unknown):string|null{return typeof value==='string'&&value.length>0&&value.length<=4096?value:null;}
function counter(value:unknown):number|null{const parsed=safeCounterSchema.safeParse(value);return parsed.success?parsed.data:null;}
export function unknownClaudeMeter():MeterSegment {
  return {vendor:null,model:null,total:null,input:null,uncachedInput:null,cachedInput:null,cacheCreation:{fiveMinutes:null,oneHour:null,other:null},output:null,reasoningOutput:null,toolInput:null,
    semantics:{input:'unknown',output:'unknown',cacheCreation:'unknown',total:'unknown',toolInput:'unknown'}};
}
function provisionalMeter(message:JsonObject):MeterSegment {
  const usage=object(message.usage);const modelId=modelIdSchema.safeParse(message.model);
  const model=modelId.success&&knownModelVendors[modelId.data]==='anthropic'?modelId.data:null;
  const input=counter(usage?.input_tokens),output=counter(usage?.output_tokens),cached=counter(usage?.cache_read_input_tokens);
  const creation=counter(usage?.cache_creation_input_tokens),ttl=object(usage?.cache_creation);
  const five=counter(ttl?.ephemeral_5m_input_tokens),hour=counter(ttl?.ephemeral_1h_input_tokens);
  // Cache aggregate includes the TTL split. Never add aggregate and split or assume a missing TTL is 5m.
  const split=five!==null&&hour!==null&&Number.isSafeInteger(five+hour)&&creation!==null&&five+hour===creation;
  return {...unknownClaudeMeter(),vendor:model?'anthropic':null,model,input,uncachedInput:input,cachedInput:cached,output,
    cacheCreation:split?{fiveMinutes:five,oneHour:hour,other:0}:{fiveMinutes:null,oneHour:null,other:creation},
    semantics:{input:'excludes-cached',output:'unknown',cacheCreation:'separate',total:'unknown',toolInput:'unknown'}};
}
/** Discards text and arbitrary metadata. Only stable identity creates an unknown-only coverage receipt. */
export function parseClaudeTranscript(bytes:Buffer,source:SourceDescriptor,continuation?:ClaudeContinuation) {
  const observations:UsageObservation[]=[];const diagnostics:Diagnostic[]=[];
  const aliases=new Map(continuation?.aliases.map(({message,request})=>[message,request]));
  let offset=0,supported=continuation?.supported??false,coveragePartial=continuation?.coveragePartial??false,aliasOverflow=continuation?.aliasOverflow??false;
  const add=(code:Diagnostic['code'])=>{if(!diagnostics.some(d=>d.code===code))diagnostics.push({code,severity:'warning'});};
  for(let end=bytes.indexOf(10,offset);end!==-1&&observations.length<MAX_OBSERVATIONS;end=bytes.indexOf(10,offset)) {
    const line=bytes.subarray(offset,end);offset=end+1;if(!line.length)continue;
    if(line.length>MAX_LINE_BYTES){coveragePartial=true;add('incomplete-source');continue;}
    let record:JsonObject|null;try{record=object(JSON.parse(line.toString('utf8')));}catch{coveragePartial=true;add('invalid-record');continue;}
    if(!record){coveragePartial=true;add('invalid-record');continue;}
    if(record.type!=='assistant')continue;supported=true;
    if(record.isApiErrorMessage===true||record.isSynthetic===true)continue;
    const message=object(record.message),id=text(message?.id);
    // System-generated placeholders/error messages do not have a native model response.
    if(!message||!id||claudeResponseIdentity(id).length>4096||message.model==='<synthetic>'){coveragePartial=true;add('unsupported-identity');continue;}
    const request=text(record.requestId);
    if(aliases.has(id)&&aliases.get(id)!==request){coveragePartial=true;add('unsupported-identity');}
    if(!aliases.has(id)) {
      if(aliases.size<128)aliases.set(id,request);
      else{aliasOverflow=true;coveragePartial=true;add('incomplete-source');}
    }
    const diagnostic:Diagnostic={code:'unsupported-contract',severity:'warning'};
    const fork=object(record.forkedFrom),child=record.isSidechain===true||text(record.agentId)!==null;
    observations.push(parseObservation({schemaVersion:2,normalizationVersion:1,provider:'claude',representation:'request',identity:'provider-native',coverage:'native-request',
      nativeUnitId:claudeResponseIdentity(id),nativeCoverageId:claudeResponseIdentity(id),revision:{kind:'final'},supersedes:[],meters:[unknownClaudeMeter()],quality:'partial',
      execution:{cwd:text(record.cwd),repositoryId:null,remoteUrl:null},
      source:{instanceKey:source.instanceKey,sourceIdentity:source.sourceIdentity,generation:source.generation,sourceSchema:source.schema,readerVersion:source.readerVersion},
      lineage:{kind:fork?'fork':child?'child':'root',parentNativeId:text(fork?.sessionId),inherited:fork?'isolated':'none'},diagnostics:[diagnostic],
      privateEvidence:{kind:'claude-native-uncertified',requestAlias:request&&Buffer.byteLength(request,'utf8')<=4096?request:null,meters:[provisionalMeter(message)]}}));
  }
  if(supported)add('unsupported-contract');if(coveragePartial||aliasOverflow)add('incomplete-source');if(offset<bytes.length)add('incomplete-source');
  const state:ClaudeContinuation={version:1,physicalEpoch:continuation?.physicalEpoch??source.generation,supported,coveragePartial,
    aliases:[...aliases].map(([message,request])=>({message,request})),aliasOverflow};
  return {observations,diagnostics,offset,supported,state};
}
