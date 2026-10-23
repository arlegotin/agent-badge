import { planSetup, applySetup } from '../integration/setup.js';
import type { SetupOptions } from '../integration/setup.js';
export interface InitCommandOptions extends SetupOptions { dryRun?:boolean }
export async function runInitCommand(options:InitCommandOptions={}) {
  const plan=await planSetup(options);
  const changes=plan.changes.map(change=>({path:change.path,action:change.before===null?'create':'update'}));
  const actionItems=[...plan.hooks.actionItems,...plan.agentHooks.actionItems];
  if(options.dryRun)return {schemaVersion:1 as const,status:'planned',exitCode:actionItems.length?1:0,changes,badge:plan.badge,coverage:'not-collected',actionItems};
  const result=await applySetup(plan);
  const integrationRequired=result.hooks.status==='action-required'||result.agentHooks.status==='action-required';
  return {schemaVersion:1 as const,status:integrationRequired?'action-required':result.status,exitCode:integrationRequired?1:result.operation.exitCode,
    changes,badge:plan.badge,runtimeVersion:result.runtimeVersion,coverage:'partial',queuedRecords:result.operation.queuedCount,pendingReconciliation:result.operation.pendingReconciliation,
    hooks:result.hooks.status,providerHooks:result.agentHooks.status,nativeTrust:'requires-review',actionItems:[...result.hooks.actionItems,...result.agentHooks.actionItems]};
}
