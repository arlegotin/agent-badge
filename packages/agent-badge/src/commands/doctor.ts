import { resolveRepository, diagnose } from '@legotin/agent-badge-core';
import { repositoryIntegrations } from '../integration/operations.js';
export async function runDoctorCommand(options: {cwd?:string;remote?:boolean;timeoutMs?:number} = {}) {
  return diagnose(await resolveRepository(options.cwd??process.cwd()),{remote:options.remote,timeoutMs:options.timeoutMs,integrations:repositoryIntegrations});
}
