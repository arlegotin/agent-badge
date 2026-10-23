import { existsSync } from 'node:fs';
import { resolveRepository, getStatus } from '@legotin/agent-badge-core';
export async function runStatusCommand(options: {cwd?:string} = {}) {
  const deadline=Date.now()+5000;
  const repository=await resolveRepository(options.cwd??process.cwd(),{deadline,signal:AbortSignal.timeout(5000)});
  return getStatus(repository,{deadline,integrationModule:new URL(existsSync(new URL('../integration/operations.js',import.meta.url))?'../integration/operations.js':'../integration/operations.ts',import.meta.url).href});
}
