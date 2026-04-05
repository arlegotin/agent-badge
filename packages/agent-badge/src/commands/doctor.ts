import { resolve } from "node:path";
import { homedir } from "node:os";

import {
  type GhCliTokenResolver,
  type RunDoctorChecksOptions,
  type RunDoctorChecksResult,
  runDoctorChecks
} from "@legotin/agent-badge-core";
import type { GitHubGistClient } from "@legotin/agent-badge-core";

interface OutputWriter {
  write(chunk: string): unknown;
}

export interface RunDoctorCommandOptions {
  readonly cwd?: string;
  readonly homeRoot?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly ghCliTokenResolver?: GhCliTokenResolver;
  readonly json?: boolean;
  readonly probeWrite?: boolean;
  readonly gistClient?: GitHubGistClient;
  readonly stdout?: OutputWriter;
}

export interface DoctorCommandResult {
  readonly checks: RunDoctorChecksResult;
  readonly report: string;
}

function buildTextReport(checks: RunDoctorChecksResult): string {
  const lines = ["agent-badge doctor"];

  for (const check of checks.checks) {
    lines.push(`- ${check.id}: ${check.status}`);
    lines.push(`- ${check.message}`);
    lines.push(`- ${check.detail}`);
    for (const fix of check.fix) {
      lines.push(`- Fix: ${fix}`);
    }
  }

  lines.push(`- Overall: ${checks.overallStatus}`);
  return lines.join("\n");
}

function asRunDoctorChecksOptions(
  options: RunDoctorCommandOptions
): RunDoctorChecksOptions {
  return {
    cwd: options.cwd,
    homeRoot: options.homeRoot,
    env: options.env,
    ghCliTokenResolver: options.ghCliTokenResolver,
    gistClient: options.gistClient,
    runProbeWrite: options.probeWrite
  };
}

export async function runDoctorCommand(
  options: RunDoctorCommandOptions = {}
): Promise<DoctorCommandResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const homeRoot = resolve(options.homeRoot ?? homedir());
  const stdout = options.stdout ?? process.stdout;
  const result = await runDoctorChecks({
    ...asRunDoctorChecksOptions(options),
    cwd,
    homeRoot
  });
  const report = options.json ? JSON.stringify(result, null, 2) : buildTextReport(result);

  stdout.write(`${report}\n`);

  return {
    checks: result,
    report
  };
}
