import { runInitCommand } from './init.js';
import type { InitCommandOptions } from './init.js';
import { runConfigureCommand } from './configure.js';
import { assertExactVersion } from '../integration/manifest.js';
import { activeContext } from './context.js';
export async function runUpgradeCommand(options:InitCommandOptions & {runtimeVersion:string;fromFile?:string}) {
  assertExactVersion(options.runtimeVersion);await activeContext(options.cwd,options.timeoutMs);
  const runtime=await runInitCommand(options);
  if(options.fromFile&&!options.dryRun&&runtime.exitCode===0)return {...await runConfigureCommand({cwd:options.cwd,fromFile:options.fromFile,timeoutMs:options.timeoutMs}),runtimeVersion:options.runtimeVersion};
  return runtime;
}
