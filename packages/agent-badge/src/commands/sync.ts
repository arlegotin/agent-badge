import { runRepositoryOperation, createOperationBudget } from '@legotin/agent-badge-core';
import { activeContext } from './context.js';
export async function runSyncCommand(options:{cwd?:string;timeoutMs?:number}={}) {
  const {repository,activation,policy}=await activeContext(options.cwd,options.timeoutMs);
  const budget=createOperationBudget('manual',options.timeoutMs??120000);
  try {const result=await runRepositoryOperation({budget,request:{cwd:repository.worktreeRoot,privateDir:repository.privateDir,repositoryId:activation.repositoryId,binding:activation.binding,
    collect:'incremental',capturePolicy:policy,collection:{roots:activation.roots,privatePolicy:activation.privatePolicy}}});
    return {schemaVersion:1 as const,status:result.status,exitCode:result.exitCode,acknowledgedRecords:result.acknowledgedCount,queuedRecords:result.queuedCount,pendingReconciliation:result.pendingReconciliation};
  }finally{budget.dispose();}
}
