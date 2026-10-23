import { canonicalRemoteUrl, resolvePushDestination, runGit, generateContributionWorkflow } from '@legotin/agent-badge-core';
import type { RepositoryContext, RemoteBinding } from '@legotin/agent-badge-core';
import type { Declaration, RuntimePin } from './manifest.js';
/** Existing cross-protocol GitHub mapping, constrained to Markdown/host-safe owner and repo. */
export function githubRepositoryUrl(value:string,cwd?:string):string|null {
  const canonical=canonicalRemoteUrl(value,cwd);
  return canonical&&/^github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(canonical)?'https://'+canonical:null;
}
export type ReadWorkflowRemoteHead=(url:string,signal:AbortSignal)=>Promise<string>;
/** Only opt-in setup performs this read. Identity mapping is the existing GitHub canonical contract. */
export async function planImportWorkflow(repository:RepositoryContext,binding:RemoteBinding,declaration:Declaration,pin:RuntimePin,readHead?:ReadWorkflowRemoteHead):Promise<string> {
  const signal=AbortSignal.timeout(10000),deadline=Date.now()+10000;
  if(binding.status!=='bound'||!githubRepositoryUrl(binding.pushUrl,repository.worktreeRoot)||canonicalRemoteUrl(declaration.declaredUrl)!==binding.canonicalPushUrl)throw new Error('Import workflow requires a verified github.com destination.');
  const route=await resolvePushDestination(repository,binding,{signal,deadline});
  if(route.status!=='valid'||!route.pushUrl)throw new Error('Import workflow destination changed.');
  const expanded=await runGit(['ls-remote','--get-url',route.pushUrl],{cwd:repository.worktreeRoot,signal,timeoutMs:Math.max(1,deadline-Date.now())});
  if(expanded.status!=='ok'||canonicalRemoteUrl(expanded.stdout.trimEnd(),repository.worktreeRoot)!==binding.canonicalPushUrl)throw new Error('Import workflow destination changed.');
  const head=readHead?await readHead(route.pushUrl,signal):await(async()=>{const result=await runGit(['ls-remote','--symref','--exit-code',route.pushUrl!,'HEAD'],{cwd:repository.worktreeRoot,signal,timeoutMs:Math.max(1,deadline-Date.now())});if(result.status!=='ok')throw new Error('Default branch unavailable.');return result.stdout;})();
  signal.throwIfAborted();
  const match=/^ref: refs\/heads\/([A-Za-z0-9][A-Za-z0-9._/-]*)\tHEAD\n(?:[a-f0-9]{40}|[a-f0-9]{64})\tHEAD\n$/.exec(head);
  if(!match)throw new Error('Actual default branch unavailable.');
  const valid=await runGit(['check-ref-format',`refs/heads/${match[1]}`],{cwd:repository.worktreeRoot,signal,timeoutMs:Math.max(1,deadline-Date.now())});
  if(valid.status!=='ok')throw new Error('Actual default branch unavailable.');
  return generateContributionWorkflow({repositoryId:declaration.repositoryId,repositoryUrl:'https://'+binding.canonicalPushUrl,defaultBranch:match[1],runtimeVersion:declaration.runtimeVersion,pin});
}
