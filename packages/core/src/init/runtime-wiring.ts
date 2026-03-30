import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  agentBadgeInitScriptName,
  agentBadgeRefreshScriptName,
  getAgentBadgeInitScriptCommand,
  getAgentBadgeRefreshScriptCommand,
  getPrePushRefreshCommand
} from "../runtime/local-cli.js";
import type { PackageManager } from "../runtime/package-manager.js";

export interface ApplyRepoLocalRuntimeWiringOptions {
  readonly cwd: string;
  readonly packageManager: PackageManager;
  readonly runtimeDependencySpecifier: string;
}

export interface RepoLocalRuntimeWiringResult {
  readonly created: string[];
  readonly updated: string[];
  readonly reused: string[];
  readonly warnings: string[];
}

type JsonObject = Record<string, unknown>;

export const agentBadgeHookStartMarker = "# agent-badge:start";
export const agentBadgeHookEndMarker = "# agent-badge:end";

const packageJsonPathLabel = "package.json";
const prePushHookPathLabel = ".git/hooks/pre-push";

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function writeJsonFile(targetPath: string, value: unknown): Promise<void> {
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readPackageJson(targetPath: string): Promise<JsonObject | undefined> {
  if (!existsSync(targetPath)) {
    return undefined;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(await readFile(targetPath, "utf8")) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : ".";
    throw new Error(`Cannot read package.json for runtime wiring${detail}`);
  }

  if (!isRecord(parsed)) {
    throw new Error(
      "Cannot apply repo-local runtime wiring because package.json does not contain a JSON object."
    );
  }

  return parsed;
}

function getOrCreateObject(parent: JsonObject, field: string): JsonObject {
  const currentValue = parent[field];

  if (currentValue === undefined) {
    const createdObject: JsonObject = {};
    parent[field] = createdObject;
    return createdObject;
  }

  if (!isRecord(currentValue)) {
    throw new Error(
      `Cannot apply repo-local runtime wiring because package.json ${field} must be an object.`
    );
  }

  return currentValue;
}

function upsertManagedStringValue(options: {
  readonly container: JsonObject;
  readonly key: string;
  readonly desiredValue: string;
  readonly createdLabel: string;
  readonly result: {
    created: string[];
    reused: string[];
    warnings: string[];
  };
}): boolean {
  const currentValue = options.container[options.key];

  if (currentValue === undefined) {
    options.container[options.key] = options.desiredValue;
    options.result.created.push(options.createdLabel);
    return true;
  }

  if (typeof currentValue !== "string") {
    options.container[options.key] = options.desiredValue;
    options.result.created.push(options.createdLabel);
    options.result.warnings.push(
      `Replaced non-string ${options.createdLabel} with managed runtime wiring.`
    );
    return true;
  }

  if (currentValue === options.desiredValue) {
    options.result.reused.push(options.createdLabel);
    return false;
  }

  options.result.reused.push(options.createdLabel);
  options.result.warnings.push(
    `Preserved existing ${options.createdLabel} instead of overwriting it with managed runtime wiring.`
  );
  return false;
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createManagedHookBlock(packageManager: PackageManager): string {
  return [
    agentBadgeHookStartMarker,
    `${getPrePushRefreshCommand(packageManager)} || true`,
    agentBadgeHookEndMarker
  ].join("\n");
}

function upsertManagedHookBlock(
  existingContent: string,
  managedBlock: string
): { content: string; hadManagedBlock: boolean } {
  const normalizedContent = existingContent.replace(/\r\n/g, "\n");
  const managedBlockPattern = new RegExp(
    `${escapeForRegExp(agentBadgeHookStartMarker)}[\\s\\S]*?${escapeForRegExp(agentBadgeHookEndMarker)}\\n?`,
    "g"
  );
  const hadManagedBlock =
    normalizedContent.includes(agentBadgeHookStartMarker) &&
    normalizedContent.includes(agentBadgeHookEndMarker);
  const baseContent = hadManagedBlock
    ? normalizedContent.replace(managedBlockPattern, "").replace(/\n{3,}/g, "\n\n")
    : normalizedContent;
  const trimmedBase = baseContent.trimEnd();

  return {
    content:
      trimmedBase.length > 0
        ? `${trimmedBase}\n\n${managedBlock}\n`
        : `${managedBlock}\n`,
    hadManagedBlock
  };
}

async function ensureExecutable(targetPath: string): Promise<boolean> {
  const fileStat = await stat(targetPath);

  if ((fileStat.mode & 0o111) === 0o111) {
    return false;
  }

  await chmod(targetPath, fileStat.mode | 0o755);
  return true;
}

export async function applyRepoLocalRuntimeWiring(
  options: ApplyRepoLocalRuntimeWiringOptions
): Promise<RepoLocalRuntimeWiringResult> {
  const result: RepoLocalRuntimeWiringResult = {
    created: [],
    updated: [],
    reused: [],
    warnings: []
  };
  const packageJsonPath = join(options.cwd, packageJsonPathLabel);
  const gitDir = join(options.cwd, ".git");
  const hooksDir = join(gitDir, "hooks");
  const prePushHookPath = join(hooksDir, "pre-push");
  const existingPackageJson = await readPackageJson(packageJsonPath);
  let packageJsonChanged = false;
  let packageJson = existingPackageJson;

  if (!existsSync(gitDir)) {
    throw new Error(
      "Cannot apply repo-local runtime wiring because the repository does not contain a .git directory."
    );
  }

  if (packageJson === undefined) {
    packageJson = {};
    packageJsonChanged = true;
  }

  const devDependencies = getOrCreateObject(packageJson, "devDependencies");
  const scripts = getOrCreateObject(packageJson, "scripts");

  packageJsonChanged =
    upsertManagedStringValue({
      container: devDependencies,
      key: "agent-badge",
      desiredValue: options.runtimeDependencySpecifier,
      createdLabel: "package.json#devDependencies.agent-badge",
      result
    }) || packageJsonChanged;
  packageJsonChanged =
    upsertManagedStringValue({
      container: scripts,
      key: agentBadgeInitScriptName,
      desiredValue: getAgentBadgeInitScriptCommand(),
      createdLabel: `package.json#scripts.${agentBadgeInitScriptName}`,
      result
    }) || packageJsonChanged;
  packageJsonChanged =
    upsertManagedStringValue({
      container: scripts,
      key: agentBadgeRefreshScriptName,
      desiredValue: getAgentBadgeRefreshScriptCommand(),
      createdLabel: `package.json#scripts.${agentBadgeRefreshScriptName}`,
      result
    }) || packageJsonChanged;

  if (packageJsonChanged) {
    await writeJsonFile(packageJsonPath, packageJson);

    if (existingPackageJson === undefined) {
      result.created.push(packageJsonPathLabel);
    } else {
      result.updated.push(packageJsonPathLabel);
    }
  } else {
    result.reused.push(packageJsonPathLabel);
  }

  await mkdir(hooksDir, { recursive: true });

  const managedHookBlock = createManagedHookBlock(options.packageManager);

  if (!existsSync(prePushHookPath)) {
    await writeFile(
      prePushHookPath,
      `#!/bin/sh\n\n${managedHookBlock}\n`,
      "utf8"
    );
    await chmod(prePushHookPath, 0o755);
    result.created.push(prePushHookPathLabel);
    return result;
  }

  const existingHookContent = await readFile(prePushHookPath, "utf8");
  const nextHook = upsertManagedHookBlock(existingHookContent, managedHookBlock);
  const hookContentChanged = nextHook.content !== existingHookContent.replace(/\r\n/g, "\n");
  const hookModeChanged = await ensureExecutable(prePushHookPath);

  if (hookContentChanged) {
    await writeFile(prePushHookPath, nextHook.content, "utf8");
  }

  if (hookContentChanged || hookModeChanged) {
    result.updated.push(prePushHookPathLabel);
  } else {
    result.reused.push(prePushHookPathLabel);
  }

  return result;
}
