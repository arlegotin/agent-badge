import { existsSync } from 'node:fs';
import { resolveRepository, diagnose } from '@legotin/agent-badge-core';

export async function runDoctorCommand(options: {cwd?:string;remote?:boolean;timeoutMs?:number} = {}) {
  const deadline=Date.now()+(options.timeoutMs??5000);
  return diagnose(await resolveRepository(options.cwd??process.cwd(),{deadline,signal:AbortSignal.timeout(options.timeoutMs??5000)}),{deadline,remote:options.remote,timeoutMs:options.timeoutMs,integrationModule:new URL(existsSync(new URL('../integration/operations.js',import.meta.url))?'../integration/operations.js':'../integration/operations.ts',import.meta.url).href});
}
