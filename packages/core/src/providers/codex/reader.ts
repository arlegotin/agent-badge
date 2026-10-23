import { z } from 'zod';
import { knownModelVendors, modelIdSchema, safeCounterSchema } from '../../domain/capabilities.js';
import type { Diagnostic, SourceDescriptor } from '../../domain/capabilities.js';
import { parseObservation } from '../../domain/usage.js';
import type { UsageObservation } from '../../domain/usage.js';
import { codexRequestIdentity } from './identity.js';

export const CODEX_SOURCE_SCHEMA = 'codex-token-usage-record-source-pin-86e17e9';
export const CODEX_READER_VERSION = '1';
export type { ReadResult } from '../source-file.js';
export { DEFAULT_MAX_BYTES, emptyHash, readSourceFile as readRollout, sourceFileEpoch as rolloutEpoch } from '../source-file.js';
const MAX_LINE_BYTES = 256 * 1024;

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null; }
function text(value: unknown): string | null { return typeof value === 'string' && value.length > 0 && value.length <= 4096 ? value : null; }
function counter(value: unknown): number | null { const parsed = safeCounterSchema.safeParse(value); return parsed.success ? parsed.data : null; }
const warning = (code: Diagnostic['code']): Diagnostic => ({code,severity:'warning'});
const metadataText=z.string().min(1).max(4096);
export const codexContinuationSchema=z.object({version:z.literal(1),physicalEpoch:z.string().regex(/^[a-f0-9]{64}$/),ownerOmitted:z.boolean(),
  owner:z.object({id:metadataText,parent_thread_id:metadataText.nullable(),forked_from_id:metadataText.nullable(),
    subagent_history_start_ordinal:safeCounterSchema.nullable(),forked_from_ordinal_exclusive:safeCounterSchema.nullable(),
    history_base:z.object({thread_id:metadataText.nullable(),end_ordinal_exclusive:safeCounterSchema.nullable(),end_byte_offset:safeCounterSchema.nullable()}).strict().nullable()}).strict().nullable(),
  contexts:z.array(z.object({turn:metadataText,cwd:metadataText.nullable(),model:metadataText.nullable(),ambiguous:z.boolean()}).strict()).max(128),
  lastOrdinal:safeCounterSchema.nullable(),invalid:z.boolean(),coveragePartial:z.boolean(),supported:z.boolean()
}).strict();
export type CodexContinuation=z.infer<typeof codexContinuationSchema>;
export interface ParsedRollout { observations: UsageObservation[]; diagnostics: Diagnostic[]; offset: number; supported: boolean; state:CodexContinuation; }
/** Only allowlisted accounting/context fields are retained. Other payloads are discarded per line. */
export function parseCodexRollout(bytes: Buffer, source: SourceDescriptor, continuation?:CodexContinuation): ParsedRollout {
  const observations: UsageObservation[] = []; const diagnostics: Diagnostic[] = [];
  const contexts = new Map<string,{cwd:string|null;model:string|null;ambiguous:boolean}>(continuation?.contexts.map(({turn,...context})=>[turn,context]));
  let owner: JsonObject | null = continuation?.owner ?? null; let offset = 0; let supported = continuation?.supported ?? false; let invalid = continuation?.invalid ?? false;
  let lastOrdinal: number | null = continuation?.lastOrdinal ?? null;
  const add = (code: Diagnostic['code']) => { if (!diagnostics.some(d => d.code === code)) diagnostics.push(warning(code)); };
  for (let end = bytes.indexOf(10,offset); end !== -1 && observations.length < 1000; end = bytes.indexOf(10,offset)) {
    const line = bytes.subarray(offset,end); offset = end+1;
    if (line.length > MAX_LINE_BYTES) { invalid=true; add('incomplete-source'); continue; }
    if (line.length === 0) continue;
    let record: JsonObject | null; try { record = object(JSON.parse(line.toString('utf8'))); } catch {add('invalid-record'); invalid = true; continue;}
    if (!record) {add('invalid-record'); invalid = true; continue;}
    const payload = object(record.payload); if (!payload) {if(record.type==='turn_context' || record.type==='token_usage_record') {invalid=true;add('invalid-record');} continue;}
    const ordinal = counter(record.ordinal);
    if (ordinal !== null) { if(lastOrdinal !== null && ordinal <= lastOrdinal) {add('uncertain-lineage'); invalid=true;} lastOrdinal = ordinal; }
    if (record.type === 'session_meta') {
      if(!owner && !continuation?.ownerOmitted) owner={id:text(payload.id),parent_thread_id:text(payload.parent_thread_id),forked_from_id:text(payload.forked_from_id),
        subagent_history_start_ordinal:counter(payload.subagent_history_start_ordinal),forked_from_ordinal_exclusive:counter(payload.forked_from_ordinal_exclusive),
        history_base:object(payload.history_base) ? {thread_id:text(object(payload.history_base)!.thread_id),end_ordinal_exclusive:counter(object(payload.history_base)!.end_ordinal_exclusive),end_byte_offset:counter(object(payload.history_base)!.end_byte_offset)} : null};
      continue;
    }
    if (record.type === 'turn_context') {
      const turn = text(payload.turn_id); if (!turn) {invalid=true;add('invalid-record');continue;}
      const context = {cwd:text(payload.cwd),model:text(payload.model),ambiguous:invalid};
      const previous=contexts.get(turn);
      if(previous && (previous.cwd !== context.cwd || previous.model !== context.model || previous.ambiguous)) context.ambiguous=true;
      contexts.set(turn,context);
      if(contexts.size>128) {invalid=true;contexts.delete(contexts.keys().next().value!);add('incomplete-source');}
      continue;
    }
    if (record.type !== 'token_usage_record') continue;
    supported=true;
    const thread=text(payload.thread_id); const response=text(payload.response_id); const turn=text(payload.turn_id); const usage=object(payload.usage);
    if (!thread || !response || !usage || !text(owner?.id)) {add('invalid-record');continue;}
    const parent=text(owner?.parent_thread_id); const fork=text(owner?.forked_from_id); const base=object(owner?.history_base);
    const childBoundary=counter(owner?.subagent_history_start_ordinal);
    const forkBoundary=counter(owner?.forked_from_ordinal_exclusive);
    const baseBoundary=counter(base?.end_ordinal_exclusive);
    const inherited = !!(parent || fork || base);
    const boundary=parent ? childBoundary : fork ? forkBoundary : baseBoundary;
    if(inherited && boundary === null) {add('uncertain-lineage');continue;}
    if(inherited && (ordinal === null || invalid)) {add('uncertain-lineage');continue;}
    if(inherited && ordinal! < boundary!) continue;
    // Physical/logical inherited requests retain their original thread identity; own work must match owner.
    if (thread !== owner!.id) {add('uncertain-lineage');continue;}
    const context = turn ? contexts.get(turn) : undefined;
    const exactContext = context && !context.ambiguous && !invalid;
    const parsedModel = modelIdSchema.safeParse(exactContext ? context.model : null);
    const model = parsedModel.success ? parsedModel.data : null;
    const modelKnown = model !== null && knownModelVendors[model] === 'openai';
    const requestDiagnostics: Diagnostic[]=[];
    if(!exactContext) requestDiagnostics.push(warning('incomplete-source'));
    if(!modelKnown) requestDiagnostics.push(warning('unknown-model'));
    const input=counter(usage.input_tokens); const cached=counter(usage.cached_input_tokens);
    const output=counter(usage.output_tokens); const total=counter(usage.total_tokens); const reasoning=counter(usage.reasoning_output_tokens);
    const creation=usage.cache_write_input_tokens === undefined ? 0 : counter(usage.cache_write_input_tokens);
    if ([input,cached,output,total,reasoning,creation].some(value=>value===null)) {add('invalid-record');continue;}
    try {
      observations.push(parseObservation({schemaVersion:2,normalizationVersion:1,provider:'codex',representation:'request',identity:'provider-native',coverage:'native-request',
        nativeUnitId:codexRequestIdentity(thread,response),nativeCoverageId:codexRequestIdentity(thread,response),revision:{kind:'final'},supersedes:[],
        meters:[{vendor:modelKnown?'openai':null,model:modelKnown?model:null,total,input,uncachedInput:input!-cached!,cachedInput:cached,
          cacheCreation:{fiveMinutes:null,oneHour:null,other:creation},output,reasoningOutput:reasoning,toolInput:null,
          semantics:{input:'includes-cached',output:'includes-reasoning',cacheCreation:'unknown',total:'input-plus-output',toolInput:'unknown'}}],
        quality:requestDiagnostics.length?'partial':'exact',execution:{cwd:exactContext?context.cwd:null,repositoryId:null,remoteUrl:null},
        source:{instanceKey:source.instanceKey,sourceIdentity:source.sourceIdentity,generation:source.generation,sourceSchema:source.schema,readerVersion:source.readerVersion},
        lineage:{kind:parent?'child':fork?'fork':'root',parentNativeId:parent ?? fork,inherited:inherited?'isolated':'none'},diagnostics:requestDiagnostics}));
    } catch {add('invalid-record');}
  }
  const coveragePartial=!!continuation?.coveragePartial || invalid || diagnostics.some(d=>d.code==='uncertain-lineage' || d.code==='invalid-record') || observations.some(o=>o.quality==='partial');
  if(coveragePartial && !diagnostics.length) add('incomplete-source');
  // Never persist arbitrary trailing payload (may contain prompts); replay it on the next bounded scan.
  if(offset < bytes.length) add('incomplete-source');
  const state=codexContinuationSchema.parse({version:1,physicalEpoch:continuation?.physicalEpoch ?? source.generation,ownerOmitted:continuation?.ownerOmitted ?? false,owner,contexts:[...contexts].map(([turn,context])=>({turn,...context})),lastOrdinal,invalid,coveragePartial,supported});
  return {observations,diagnostics,offset,supported,state};
}
