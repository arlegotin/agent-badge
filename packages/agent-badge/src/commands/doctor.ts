import { diagnoseFromDirectory } from '@legotin/agent-badge-core';

export async function runDoctorCommand(options: {cwd?:string;remote?:boolean;timeoutMs?:number} = {}) {
  const deadline=Date.now()+(options.timeoutMs??5000);
  return diagnoseFromDirectory(options.cwd??process.cwd(),{
    deadline,remote:options.remote,timeoutMs:options.timeoutMs,
    integrationModule:new URL(import.meta.url.endsWith('.ts')?'../integration/operations.ts':'../integration/operations.js',import.meta.url).href,
  });
}
