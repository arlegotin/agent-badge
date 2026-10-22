import { runRepositoryOperation, createOperationBudget } from '@legotin/agent-badge-core';
import { activeContext } from './context.js';
import { runStatusCommand } from './status.js';
export async function runCollectCommand(options:{cwd?:string;full?:boolean;timeoutMs?:number}={}) {
  const {repository,activation,policy}=await activeContext(options.cwd,options.timeoutMs);
  const budget=createOperationBudget('manual',options.timeoutMs??120000);
  try {
    const result=await runRepositoryOperation({budget,request:{cwd:repository.worktreeRoot,privateDir:repository.privateDir,repositoryId:activation.repositoryId,binding:activation.binding,
      synchronize:false,collect:options.full?'full':'incremental',capturePolicy:policy,collection:{roots:activation.roots,privatePolicy:activation.privatePolicy}}});
    const local=await runStatusCommand({cwd:repository.worktreeRoot});
    return {...local,status:result.status==='unchanged'?local.state:'partial',exitCode:result.exitCode,confirmedCommit:null};
  } finally {budget.dispose();}
}
