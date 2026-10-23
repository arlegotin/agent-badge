import { parseNormalizedImport, normalizedImportOverrides, createNormalizedImportAdapter, collectUsage, readStoreSnapshot, loadLocalAccepted } from '@legotin/agent-badge-core';
import { readExplicitJson } from './configure.js';
import { activeContext } from './context.js';
import { writePrivatePolicy } from '../integration/setup.js';
export async function runNormalizedImportCommand(options:{cwd?:string;file:string;timeoutMs?:number}) {
  const value=parseNormalizedImport(await readExplicitJson(options.file,16*1024*1024)),ctx=await activeContext(options.cwd,options.timeoutMs);
  return ctx.store.withLock(ctx.signal,async()=>{
    const snapshot=await readStoreSnapshot(ctx.repository),accepted=await loadLocalAccepted(ctx.repository,snapshot,ctx.signal,ctx.deadline),policy=accepted?.meta.policy??ctx.policy;
    const overrides=normalizedImportOverrides(value,{privatePolicy:ctx.activation.privatePolicy,policy,records:[...(accepted?.records??[]),...snapshot.entries.flatMap(entry=>entry.records),...snapshot.controls]});
    const activation=await writePrivatePolicy(ctx.repository,ctx.activation,{...ctx.activation.privatePolicy,overrides},ctx.signal);
    const provider=value.provenance.kind==='independent-request'?'import':value.provenance.provider;
    const {resolve}=await import('node:path');
    const result=await collectUsage({repository:ctx.repository,store:ctx.store,policy,privatePolicy:activation.privatePolicy,signal:ctx.signal,adapters:{[provider]:createNormalizedImportAdapter({provider,paths:[resolve(options.file)]})}});
    const failed=result.cancelled||result.diagnostics.length>0||result.sourceOutcomes.some(source=>source.outcome==='unavailable'||source.outcome==='unsupported');
    return {schemaVersion:1 as const,kind:'agent-badge/normalized-source' as const,status:failed?'partial':'recorded',exitCode:failed?1:0,coverage:'partial',queuedRecords:result.queuedHashes.length,pendingReconciliation:result.pendingReconciliation};
  });
}
