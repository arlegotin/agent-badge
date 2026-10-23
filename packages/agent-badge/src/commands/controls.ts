import { syncUsage, collectUsage, sanitizeObservation, observationEvidenceHash, recordHash, reduceLedger, resolveControls } from '@legotin/agent-badge-core';
import type { PublicRecord, ControlRecord } from '@legotin/agent-badge-core';
import { activeContext, publicSync, CommandFailure } from './context.js';
import { writePrivatePolicy } from '../integration/setup.js';
export async function runControlCommand(options:{cwd?:string;localId:string;kind:'include'|'exclude';timeoutMs?:number}) {
  if(!/^[a-f0-9]{64}$/.test(options.localId))throw new CommandFailure('invalid-input');
  const ctx=await activeContext(options.cwd,options.timeoutMs);
  const output=await ctx.store.withLock(ctx.signal,async()=>{
    const sync={repository:ctx.repository,store:ctx.store,binding:ctx.activation.binding,signal:ctx.signal,deadline:ctx.deadline,collect:'none' as const};
    const current=await syncUsage(sync);
    if(!current.accepted||!['synced','unchanged'].includes(current.status))return {failure:'current-ledger-required' as const};
    const accepted=current.accepted,entries=await ctx.store.journal(),observations=entries.flatMap(entry=>entry.observations);
    const local=observations.find(observation=>observationEvidenceHash(observation)===options.localId);
    const unit=local?sanitizeObservation({...local,execution:{...local.execution,repositoryId:accepted.meta.repositoryId}},accepted.meta.policy).unitKey:options.localId;
    const related=observations.filter(observation=>{try{return sanitizeObservation({...observation,execution:{...observation.execution,repositoryId:accepted.meta.repositoryId}},accepted.meta.policy).unitKey===unit;}catch{return false;}});
    if(!related.length&&!accepted.ledger.units.some(candidate=>candidate.unitKey===unit))return {failure:'unknown-local-id' as const};
    if(related.length){
      const overrides=ctx.activation.privatePolicy.overrides.filter(choice=>!related.some(observation=>choice.provider===observation.provider&&choice.nativeUnitId===observation.nativeUnitId&&choice.representation===observation.representation));
      const unique=new Map(related.map(observation=>[JSON.stringify([observation.provider,observation.nativeUnitId,observation.representation]),{provider:observation.provider,nativeUnitId:observation.nativeUnitId,representation:observation.representation,decision:options.kind==='include'?'attribute' as const:'exclude' as const}]));
      const activation=await writePrivatePolicy(ctx.repository,ctx.activation,{...ctx.activation.privatePolicy,overrides:[...overrides,...unique.values()]},ctx.signal);
      // Reproject all cached copies without reading any native source or inventing cwd evidence.
      await collectUsage({repository:ctx.repository,store:ctx.store,policy:accepted.meta.policy,privatePolicy:activation.privatePolicy,adapters:{},signal:ctx.signal});
    }
    const records:PublicRecord[]=[...accepted.records,...(await ctx.store.journal()).flatMap(entry=>entry.records),...await ctx.store.controls()];
    const indexed=new Map(records.map(record=>[recordHash(record),record]));resolveControls(indexed);
    const controls=[...indexed.entries()].filter((entry):entry is [string,ControlRecord]=>'kind'in entry[1]&&entry[1].targetUnitKey===unit);
    const superseded=new Set(controls.flatMap(([,record])=>record.supersedes));
    const control:ControlRecord={schemaVersion:2,normalizationVersion:1,repositoryId:accepted.meta.repositoryId,kind:options.kind,targetUnitKey:unit,supersedes:controls.filter(([hash])=>!superseded.has(hash)).map(([hash])=>hash).sort()};
    reduceLedger([...records,control],accepted.meta);
    await ctx.store.commitControl(control);
    const result=await syncUsage(sync);
    const confirmed = ['synced','unchanged'].includes(result.status);
    const excluded = result.accepted ? resolveControls(new Map(result.accepted.records.map(record=>[recordHash(record),record]))).excluded.has(unit) : null;
    const concurrent = confirmed && excluded !== (options.kind === 'exclude');
    return {...publicSync(result),...(concurrent?{status:'conflict',exitCode:2}:{}),recordConfirmed:confirmed,unitKey:unit,controlHash:recordHash(control),intent:'fixed-causal-heads'};
  });
  if(output.failure)throw new CommandFailure(output.failure);
  return output;
}
