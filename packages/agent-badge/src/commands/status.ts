import { getStatusFromDirectory } from '@legotin/agent-badge-core';
export async function runStatusCommand(options: {cwd?:string} = {}) {
  const deadline=Date.now()+5000;
  return getStatusFromDirectory(options.cwd??process.cwd(),{
    deadline,
    integrationModule:new URL(import.meta.url.endsWith('.ts')?'../integration/operations.ts':'../integration/operations.js',import.meta.url).href,
  });
}
