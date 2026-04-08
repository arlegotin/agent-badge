#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveGitHubCliToken,
  runInitCommand,
  type InitCommandResult,
  type RunInitCommandOptions
} from "@legotin/agent-badge";

export interface RunCreateAgentBadgeOptions
  extends Omit<RunInitCommandOptions, "cwd"> {}

type PackageManager = InitCommandResult["preflight"]["packageManager"]["name"];

interface PackageJsonRecord {
  readonly devDependencies?: Record<string, unknown>;
}

interface RuntimeInstallCommand {
  readonly command: string;
  readonly args: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function resolveRepoLocalRuntimeSpecifier(cwd: string): Promise<string> {
  const packageJsonPath = join(cwd, "package.json");
  let parsed: unknown;

  try {
    parsed = JSON.parse(await readFile(packageJsonPath, "utf8")) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : ".";

    throw new Error(
      `Unable to read package.json after initialization${detail}`
    );
  }

  if (!isRecord(parsed)) {
    throw new Error(
      "Unable to read package.json after initialization because it does not contain a JSON object."
    );
  }

  const devDependencies = (parsed as PackageJsonRecord).devDependencies;
  const runtimeDependencySpecifier =
    isRecord(devDependencies) &&
    typeof devDependencies["@legotin/agent-badge"] === "string"
      ? devDependencies["@legotin/agent-badge"]
      : null;

  if (runtimeDependencySpecifier === null || runtimeDependencySpecifier.length === 0) {
    throw new Error(
      "The initializer could not find @legotin/agent-badge in package.json after wiring repo-local runtime support."
    );
  }

  return runtimeDependencySpecifier;
}

function createRuntimePackageDescriptor(runtimeDependencySpecifier: string): string {
  return `@legotin/agent-badge@${runtimeDependencySpecifier}`;
}

export function buildRuntimeInstallCommand(
  packageManager: PackageManager,
  runtimeDependencySpecifier: string
): RuntimeInstallCommand {
  const runtimePackageDescriptor = createRuntimePackageDescriptor(
    runtimeDependencySpecifier
  );

  switch (packageManager) {
    case "npm":
      return {
        command: "npm",
        args: ["install", "-D", runtimePackageDescriptor]
      };
    case "pnpm":
      return {
        command: "pnpm",
        args: ["add", "-D", runtimePackageDescriptor]
      };
    case "yarn":
      return {
        command: "yarn",
        args: ["add", "-D", runtimePackageDescriptor]
      };
    case "bun":
      return {
        command: "bun",
        args: ["add", "-d", runtimePackageDescriptor]
      };
  }
}

export async function installRepoLocalRuntime(options: {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly packageManager: PackageManager;
}): Promise<void> {
  const runtimeDependencySpecifier = await resolveRepoLocalRuntimeSpecifier(
    options.cwd
  );
  const installCommand = buildRuntimeInstallCommand(
    options.packageManager,
    runtimeDependencySpecifier
  );
  const result = spawnSync(installCommand.command, installCommand.args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: "pipe",
    windowsHide: true
  });

  if (result.error) {
    throw new Error(
      `Failed to install repo-local @legotin/agent-badge via ${options.packageManager}: ${result.error.message}`
    );
  }

  if (result.status !== 0) {
    const detailSource = typeof result.stderr === "string" && result.stderr.trim().length > 0
      ? result.stderr
      : typeof result.stdout === "string" && result.stdout.trim().length > 0
        ? result.stdout
        : null;
    const detail =
      detailSource === null
        ? ""
        : (detailSource
            .trim()
            .split("\n")
            .find((line) => line.trim().length > 0) ?? "").trim();

    throw new Error(
      `Failed to install repo-local @legotin/agent-badge via ${options.packageManager}.${detail.length > 0 ? ` ${detail}` : ""}`
    );
  }
}

export async function runCreateAgentBadge(
  options: RunCreateAgentBadgeOptions = {}
): Promise<InitCommandResult> {
  const cwd = process.cwd();
  const result = await runInitCommand({
    ...options,
    cwd,
    ghCliTokenResolver: resolveGitHubCliToken
  });

  await installRepoLocalRuntime({
    cwd,
    env: options.env,
    packageManager: result.preflight.packageManager.name
  });

  return result;
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
