import { resolveRepository, getStatus, reportCapabilities } from '@legotin/agent-badge-core';
import type { IntegrationInspection } from '@legotin/agent-badge-core';
import { repositoryIntegrations } from '../integration/operations.js';
export async function runStatusCommand(options: {cwd?:string} = {}) {
  const repository=await resolveRepository(options.cwd??process.cwd());let inspection:IntegrationInspection;
  try { inspection=await repositoryIntegrations.inspect(repository,AbortSignal.timeout(5000)); }
  catch { inspection={setup:'needs-setup',checks:[{code:'inspection-unavailable',required:true,status:'fail'}]}; }
  const signal=AbortSignal.timeout(5000);
  const capabilities=inspection.repositoryId ? await reportCapabilities({repositoryId:inspection.repositoryId,enrolledRoots:[],signal},{roots:inspection.roots}) : undefined;
  return getStatus(repository,{inspection,capabilities});
}
