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
import type { AgentBadgeConfig } from "../config/config-schema.js";
import type { PackageManager } from "../runtime/package-manager.js";

export interface ApplyRepoLocalRuntimeWiringOptions {
  readonly cwd: string;
  readonly packageManager: PackageManager;
  readonly runtimeDependencySpecifier: string;
  readonly refresh: AgentBadgeConfig["refresh"];
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
export const agentBadgeGitignoreStartMarker = "# agent-badge:gitignore:start";
export const agentBadgeGitignoreEndMarker = "# agent-badge:gitignore:end";

const packageJsonPathLabel = "package.json";
const gitignorePathLabel = ".gitignore";
const prePushHookPathLabel = ".git/hooks/pre-push";
const runtimePackageName = "@legotin/agent-badge";
const managedGitignoreEntries = [
  ".agent-badge/state.json",
  ".agent-badge/cache/",
  ".agent-badge/logs/"
] as const;

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

function syncManagedStringValue(options: {
  readonly container: JsonObject;
  readonly key: string;
  readonly desiredValue: string;
  readonly label: string;
  readonly overwriteExisting: boolean;
  readonly result: RepoLocalRuntimeWiringResult;
}): boolean {
  const currentValue = options.container[options.key];

  if (currentValue === undefined) {
    options.container[options.key] = options.desiredValue;
    options.result.created.push(options.label);
    return true;
  }

  if (typeof currentValue !== "string") {
    options.container[options.key] = options.desiredValue;
    options.result.updated.push(options.label);
    options.result.warnings.push(
      `Replaced non-string ${options.label} with managed runtime wiring.`
    );
    return true;
  }

  if (currentValue === options.desiredValue) {
    options.result.reused.push(options.label);
    return false;
  }

  if (!options.overwriteExisting) {
    options.result.reused.push(options.label);
    options.result.warnings.push(
      `Preserved existing ${options.label} instead of overwriting it with managed runtime wiring.`
    );
    return false;
  }

  options.container[options.key] = options.desiredValue;
  options.result.updated.push(options.label);
  return true;
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createManagedHookBlock(
  packageManager: PackageManager,
  refresh: AgentBadgeConfig["refresh"]
): string {
  const command = getPrePushRefreshCommand(packageManager);

  return [
    agentBadgeHookStartMarker,
    refresh.prePush.mode === "fail-soft" ? `${command} || true` : command,
    agentBadgeHookEndMarker
  ].join("\n");
}

function stripManagedHookBlock(existingContent: string): {
  baseContent: string;
  hadManagedBlock: boolean;
} {
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
    baseContent: trimmedBase,
    hadManagedBlock
  };
}

function buildHookContent(
  baseContent: string,
  managedBlock?: string
): string {
  if (managedBlock === undefined) {
    return baseContent.length > 0 && baseContent !== "#!/bin/sh"
      ? `${baseContent}\n`
      : "#!/bin/sh\n";
  }

  if (baseContent.length === 0 || baseContent === "#!/bin/sh") {
    return `#!/bin/sh\n\n${managedBlock}\n`;
  }

  return `${baseContent}\n\n${managedBlock}\n`;
}

function stripManagedGitignoreBlock(existingContent: string): {
  baseContent: string;
  hadManagedBlock: boolean;
} {
  const normalizedContent = existingContent.replace(/\r\n/g, "\n");
  const managedBlockPattern = new RegExp(
    `${escapeForRegExp(agentBadgeGitignoreStartMarker)}[\\s\\S]*?${escapeForRegExp(agentBadgeGitignoreEndMarker)}\\n?`,
    "g"
  );
  const hadManagedBlock =
    normalizedContent.includes(agentBadgeGitignoreStartMarker) &&
    normalizedContent.includes(agentBadgeGitignoreEndMarker);
  const baseContent = hadManagedBlock
    ? normalizedContent.replace(managedBlockPattern, "").replace(/\n{3,}/g, "\n\n")
    : normalizedContent;

  return {
    baseContent: baseContent.trimEnd(),
    hadManagedBlock
  };
}

function buildManagedGitignoreBlock(baseContent: string): string | undefined {
  const ignoredEntries = new Set(
    baseContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  );
  const missingEntries = managedGitignoreEntries.filter(
    (entry) => !ignoredEntries.has(entry)
  );

  if (missingEntries.length === 0) {
    return undefined;
  }

  return [
    agentBadgeGitignoreStartMarker,
    ...missingEntries,
    agentBadgeGitignoreEndMarker
  ].join("\n");
}

function buildGitignoreContent(
  baseContent: string,
  managedBlock?: string
): string {
  if (managedBlock === undefined) {
    return baseContent.length > 0 ? `${baseContent}\n` : "";
  }

  if (baseContent.length === 0) {
    return `${managedBlock}\n`;
  }

  return `${baseContent}\n\n${managedBlock}\n`;
}

function isPotentialRuntimeDependency(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (value === "latest" ||
      /^\^?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
        value
      ))
  );
}

function removeManagedStringValue(options: {
  readonly container: JsonObject;
  readonly key: string;
  readonly label: string;
  readonly result: RepoLocalRuntimeWiringResult;
  readonly condition?: (value: unknown) => boolean;
}): boolean {
  const currentValue = options.container[options.key];

  if (currentValue === undefined) {
    options.result.reused.push(options.label);
    return false;
  }

  if (options.condition && !options.condition(currentValue)) {
    options.result.warnings.push(
      `Preserved non-managed ${options.label} so runtime tooling did not remove it.`
    );
    options.result.reused.push(options.label);
    return false;
  }

  delete options.container[options.key];
  options.result.updated.push(options.label);

  return true;
}

async function readOptionalTextFile(targetPath: string): Promise<string | null> {
  try {
    return await readFile(targetPath, "utf8");
  } catch {
    return null;
  }
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
  const gitignorePath = join(options.cwd, gitignorePathLabel);
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
    syncManagedStringValue({
      container: devDependencies,
      key: runtimePackageName,
      desiredValue: options.runtimeDependencySpecifier,
      label: `package.json#devDependencies.${runtimePackageName}`,
      overwriteExisting: false,
      result
    }) || packageJsonChanged;
  packageJsonChanged =
    syncManagedStringValue({
      container: scripts,
      key: agentBadgeInitScriptName,
      desiredValue: getAgentBadgeInitScriptCommand(),
      label: `package.json#scripts.${agentBadgeInitScriptName}`,
      overwriteExisting: true,
      result
    }) || packageJsonChanged;
  packageJsonChanged =
    syncManagedStringValue({
      container: scripts,
      key: agentBadgeRefreshScriptName,
      desiredValue: getAgentBadgeRefreshScriptCommand(options.refresh.prePush.mode),
      label: `package.json#scripts.${agentBadgeRefreshScriptName}`,
      overwriteExisting: true,
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

  const existingGitignoreContent = existsSync(gitignorePath)
    ? await readFile(gitignorePath, "utf8")
    : undefined;
  const strippedGitignore = stripManagedGitignoreBlock(
    existingGitignoreContent ?? ""
  );
  const nextGitignoreContent = buildGitignoreContent(
    strippedGitignore.baseContent,
    buildManagedGitignoreBlock(strippedGitignore.baseContent)
  );

  if (existingGitignoreContent === undefined) {
    await writeFile(gitignorePath, nextGitignoreContent, "utf8");
    result.created.push(gitignorePathLabel);
  } else if (
    nextGitignoreContent !== existingGitignoreContent.replace(/\r\n/g, "\n")
  ) {
    await writeFile(gitignorePath, nextGitignoreContent, "utf8");
    result.updated.push(gitignorePathLabel);
  } else {
    result.reused.push(gitignorePathLabel);
  }

  await mkdir(hooksDir, { recursive: true });

  if (!existsSync(prePushHookPath)) {
    if (!options.refresh.prePush.enabled) {
      result.reused.push(prePushHookPathLabel);
      return result;
    }

    await writeFile(
      prePushHookPath,
      buildHookContent(
        "",
        createManagedHookBlock(options.packageManager, options.refresh)
      ),
      "utf8"
    );
    await chmod(prePushHookPath, 0o755);
    result.created.push(prePushHookPathLabel);
    return result;
  }

  const existingHookContent = await readFile(prePushHookPath, "utf8");
  const strippedHook = stripManagedHookBlock(existingHookContent);
  const nextHookContent = options.refresh.prePush.enabled
    ? buildHookContent(
        strippedHook.baseContent,
        createManagedHookBlock(options.packageManager, options.refresh)
      )
    : buildHookContent(strippedHook.baseContent);
  const hookContentChanged =
    nextHookContent !== existingHookContent.replace(/\r\n/g, "\n");
  const hookModeChanged = await ensureExecutable(prePushHookPath);

  if (hookContentChanged) {
    await writeFile(prePushHookPath, nextHookContent, "utf8");
  }

  if (hookContentChanged || hookModeChanged) {
    result.updated.push(prePushHookPathLabel);
  } else {
    result.reused.push(prePushHookPathLabel);
  }

  return result;
}

export async function removeRepoLocalRuntimeWiring(
  options: Omit<
    ApplyRepoLocalRuntimeWiringOptions,
    "runtimeDependencySpecifier" | "refresh"
  >
): Promise<RepoLocalRuntimeWiringResult> {
  const result: RepoLocalRuntimeWiringResult = {
    created: [],
    updated: [],
    reused: [],
    warnings: []
  };

  const packageJsonPath = join(options.cwd, packageJsonPathLabel);
  const gitignorePath = join(options.cwd, gitignorePathLabel);
  const gitDir = join(options.cwd, ".git");
  const hooksDir = join(gitDir, "hooks");
  const prePushHookPath = join(hooksDir, "pre-push");
  const packageJson = await readPackageJson(packageJsonPath);
  let packageJsonChanged = false;

  if (packageJson !== undefined) {
    const devDependencies = getOrCreateObject(packageJson, "devDependencies");
    const scripts = getOrCreateObject(packageJson, "scripts");

    packageJsonChanged =
      removeManagedStringValue({
        container: scripts,
        key: agentBadgeInitScriptName,
        label: `package.json#scripts.${agentBadgeInitScriptName}`,
        result
      }) || packageJsonChanged;
    packageJsonChanged =
      removeManagedStringValue({
        container: scripts,
        key: agentBadgeRefreshScriptName,
        label: `package.json#scripts.${agentBadgeRefreshScriptName}`,
        result
      }) || packageJsonChanged;
    packageJsonChanged =
      removeManagedStringValue({
        container: devDependencies,
        key: runtimePackageName,
        label: `package.json#devDependencies.${runtimePackageName}`,
        result,
        condition: isPotentialRuntimeDependency
      }) || packageJsonChanged;

    if (packageJsonChanged) {
      await writeJsonFile(packageJsonPath, packageJson);
      result.updated.push(packageJsonPathLabel);
    } else {
      result.reused.push(packageJsonPathLabel);
    }
  } else {
    result.reused.push(packageJsonPathLabel);
  }

  const existingGitignoreContent = await readOptionalTextFile(gitignorePath);

  if (existingGitignoreContent === null) {
    result.reused.push(gitignorePathLabel);
  } else {
    const strippedGitignore = stripManagedGitignoreBlock(existingGitignoreContent);
    const nextGitignoreContent = buildGitignoreContent(strippedGitignore.baseContent);

    if (strippedGitignore.hadManagedBlock) {
      if (nextGitignoreContent !== existingGitignoreContent.replace(/\r\n/g, "\n")) {
        await writeFile(gitignorePath, nextGitignoreContent, "utf8");
        result.updated.push(gitignorePathLabel);
      } else {
        result.reused.push(gitignorePathLabel);
      }
    } else {
      result.reused.push(gitignorePathLabel);
    }
  }

  if (!existsSync(gitDir)) {
    result.warnings.push(
      "No .git directory was found, so pre-push hook removal was skipped."
    );
    result.reused.push(prePushHookPathLabel);
    return result;
  }

  await mkdir(hooksDir, { recursive: true });

  const existingHookContent = await readOptionalTextFile(prePushHookPath);

  if (existingHookContent === null) {
    result.reused.push(prePushHookPathLabel);
    return result;
  }

  const strippedHook = stripManagedHookBlock(existingHookContent);
  if (!strippedHook.hadManagedBlock) {
    result.reused.push(prePushHookPathLabel);
    return result;
  }

  const nextHookContent = buildHookContent(strippedHook.baseContent);
  const hookContentChanged =
    nextHookContent !== existingHookContent.replace(/\r\n/g, "\n");
  const hookModeChanged = await ensureExecutable(prePushHookPath);

  if (hookContentChanged) {
    await writeFile(prePushHookPath, nextHookContent, "utf8");
  }

  if (hookContentChanged || hookModeChanged) {
    result.updated.push(prePushHookPathLabel);
  } else {
    result.reused.push(prePushHookPathLabel);
  }

  return result;
}
