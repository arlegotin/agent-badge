import { resolveRepository, openStore, loadCapturePolicy } from '@legotin/agent-badge-core';
import { checkActivation } from '../integration/runtime.js';
export { CommandFailure } from './errors.js';
import { CommandFailure } from './errors.js';
export async function activeContext(cwd = process.cwd(), timeoutMs = 120000) {
  const repository = await resolveRepository(cwd), checked = await checkActivation({cwd});
  if (checked.status !== 'approved') throw new CommandFailure('needs-setup');
  const store = await openStore(repository), deadline = Date.now()+timeoutMs, signal=AbortSignal.timeout(timeoutMs), activation=checked.activation;
  const policy = await loadCapturePolicy(repository,store,activation.capturePolicy,activation.repositoryId,{signal,deadline});
  return {repository,store,activation,policy,signal,deadline};
}
export function publicSync(result: {status:string;confirmedCommit:string|null;acknowledgedHashes:string[]}) {
  return {schemaVersion:1 as const,status:result.status,confirmedCommit:result.confirmedCommit,acknowledgedRecords:result.acknowledgedHashes.length,
    exitCode:result.status==='synced'||result.status==='unchanged'?0:result.status==='conflict'?2:result.status==='unsupported'?3:1};
}
