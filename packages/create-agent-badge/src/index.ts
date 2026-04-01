#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  runInitCommand,
  type InitCommandResult,
  type RunInitCommandOptions
} from "@legotin/agent-badge";

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

export function isDirectExecution(
  argv: readonly string[] = process.argv
): boolean {
  const entryPath = argv[1];

  if (typeof entryPath !== "string" || entryPath.length === 0) {
    return false;
  }

  try {
    return fileURLToPath(import.meta.url) === realpathSync(entryPath);
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  void runCreateAgentBadge().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);

    console.error(message);
    process.exitCode = 1;
  });
}
