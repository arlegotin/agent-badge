import { pathToFileURL } from "node:url";

import {
  runInitCommand,
  type InitCommandResult,
  type RunInitCommandOptions
} from "agent-badge";

export interface RunCreateAgentBadgeOptions
  extends Omit<RunInitCommandOptions, "cwd"> {}

export async function runCreateAgentBadge(
  options: RunCreateAgentBadgeOptions = {}
): Promise<InitCommandResult> {
  return runInitCommand({
    ...options,
    cwd: process.cwd()
  });
}

export const main = runCreateAgentBadge;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runCreateAgentBadge();
}
