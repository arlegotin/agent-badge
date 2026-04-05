import { readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  createGitHubGistClient,
  deletePublishTarget,
  parseAgentBadgeConfig,
  parseAgentBadgeState,
  removeRepoLocalRuntimeWiring,
  resolveGitHubAuthToken,
  type GhCliTokenResolver,
  type AgentBadgeConfig,
  type AgentBadgeState,
  type DeletePublishTargetResult,
  type GitHubGistClient,
  type RepoLocalRuntimeWiringResult
} from "@legotin/agent-badge-core";

interface OutputWriter {
  write(chunk: string): unknown;
}

export interface RunUninstallCommandOptions {
  readonly cwd?: string;
  readonly purgeRemote?: boolean;
  readonly purgeConfig?: boolean;
  readonly purgeState?: boolean;
  readonly purgeLogs?: boolean;
  readonly purgeCaches?: boolean;
  readonly force?: boolean;
  readonly env?: NodeJS.ProcessEnv;
  readonly ghCliTokenResolver?: GhCliTokenResolver;
  readonly gistClient?: GitHubGistClient;
  readonly stdout?: OutputWriter;
}

export interface UninstallCommandResult {
  readonly removed: string[];
  readonly kept: string[];
  readonly runtimeWiring: RepoLocalRuntimeWiringResult;
  readonly remote: DeletePublishTargetResult | null;
}

const CONFIG_PATH = ".agent-badge/config.json";
const STATE_PATH = ".agent-badge/state.json";
const CACHE_PATH = ".agent-badge/cache";
const LOGS_PATH = ".agent-badge/logs";

function writeLine(stdout: OutputWriter, line: string): void {
  stdout.write(`${line}\n`);
}

function markRemoved(removed: string[], reportLines: string[], item: string): void {
  removed.push(item);
  reportLines.push(`- remove: ${item}`);
}

function markKept(kept: string[], reportLines: string[], item: string): void {
  kept.push(item);
  reportLines.push(`- keep-local: ${item}`);
}

async function readJsonFile(targetPath: string): Promise<unknown> {
  return JSON.parse(await readFile(targetPath, "utf8")) as unknown;
}

async function readOptionalConfig(configPath: string): Promise<AgentBadgeConfig | null> {
  try {
    return parseAgentBadgeConfig(await readJsonFile(configPath));
  } catch {
    return null;
  }
}

async function readOptionalState(statePath: string): Promise<AgentBadgeState | null> {
  try {
    return parseAgentBadgeState(await readJsonFile(statePath));
  } catch {
    return null;
  }
}

function stripPublishConfig(config: AgentBadgeConfig): AgentBadgeConfig {
  return {
    ...config,
    publish: {
      ...config.publish,
      gistId: null,
      badgeUrl: null
    }
  };
}

function stripPublishState(state: AgentBadgeState): AgentBadgeState {
  return {
    ...state,
    publish: {
      ...state.publish,
      gistId: null
    }
  };
}

async function removePath(options: {
  readonly targetPath: string;
  readonly label: string;
  readonly shouldRemove: boolean;
  readonly force: boolean;
  readonly removed: string[];
  readonly kept: string[];
  readonly reportLines: string[];
}): Promise<void> {
  if (!options.shouldRemove) {
    markKept(options.kept, options.reportLines, options.label);
    return;
  }

  try {
    await rm(options.targetPath, { recursive: true, force: true });
    markRemoved(options.removed, options.reportLines, options.label);
  } catch (error) {
    if (!options.force) {
      throw error;
    }

    markKept(
      options.kept,
      options.reportLines,
      `${options.label} (force-preserved on failure)`
    );
  }
}

function addRuntimeWiringReport(options: {
  readonly runtimeWiring: RepoLocalRuntimeWiringResult;
  readonly removed: string[];
  readonly kept: string[];
  readonly reportLines: string[];
}): void {
  for (const item of [...options.runtimeWiring.created, ...options.runtimeWiring.updated]) {
    markRemoved(options.removed, options.reportLines, item);
  }

  for (const item of options.runtimeWiring.reused) {
    markKept(options.kept, options.reportLines, item);
  }

  for (const warning of options.runtimeWiring.warnings) {
    markKept(options.kept, options.reportLines, `warning: ${warning}`);
  }
}

export async function runUninstallCommand(
  options: RunUninstallCommandOptions = {}
): Promise<UninstallCommandResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const stdout = options.stdout ?? process.stdout;
  const purgeRemote = options.purgeRemote ?? false;
  const purgeConfig = options.purgeConfig ?? false;
  const purgeState = options.purgeState ?? false;
  const purgeLogs = options.purgeLogs ?? true;
  const purgeCaches = options.purgeCaches ?? true;
  const force = options.force ?? false;
  const removed: string[] = [];
  const kept: string[] = [];
  const reportLines: string[] = [];
  let remoteResult: DeletePublishTargetResult | null = null;

  writeLine(stdout, "- uninstall: start");
  writeLine(
    stdout,
    "- default: preserve config/state/remote unless purge flags are set"
  );

  const runtimeWiring = await removeRepoLocalRuntimeWiring({
    cwd,
    packageManager: "npm"
  });
  addRuntimeWiringReport({
    runtimeWiring,
    removed,
    kept,
    reportLines
  });

  const configPath = join(cwd, CONFIG_PATH);
  const statePath = join(cwd, STATE_PATH);
  const cachePath = join(cwd, CACHE_PATH);
  const logsPath = join(cwd, LOGS_PATH);
  const persistedConfig = await readOptionalConfig(configPath);
  const persistedState = await readOptionalState(statePath);
  let configForWrite = persistedConfig;
  let stateForWrite = persistedState;

  await removePath({
    targetPath: configPath,
    label: "config",
    shouldRemove: purgeConfig,
    force,
    removed,
    kept,
    reportLines
  });

  await removePath({
    targetPath: statePath,
    label: "state",
    shouldRemove: purgeState,
    force,
    removed,
    kept,
    reportLines
  });

  await removePath({
    targetPath: cachePath,
    label: "cache",
    shouldRemove: purgeCaches,
    force,
    removed,
    kept,
    reportLines
  });

  await removePath({
    targetPath: logsPath,
    label: "logs",
    shouldRemove: purgeLogs,
    force,
    removed,
    kept,
    reportLines
  });

  if (!purgeRemote) {
    writeLine(stdout, "- remote: preserved");
    markKept(kept, reportLines, "remote");
  } else {
    const remoteGistId = persistedConfig?.publish.gistId ?? persistedState?.publish.gistId ?? null;

    if (remoteGistId === null) {
      markKept(kept, reportLines, "remote");
    } else {
      remoteResult = await deletePublishTarget({
        gistId: remoteGistId,
        client:
          options.gistClient ??
          createGitHubGistClient({
            authToken:
              (
                await resolveGitHubAuthToken({
                  env,
                  ghCliTokenResolver: options.ghCliTokenResolver
                })
              ).token
          })
      });

      if (remoteResult.deleted) {
        markRemoved(removed, reportLines, `remote:${remoteResult.gistId}`);

        if (!purgeConfig && configForWrite !== null) {
          configForWrite = stripPublishConfig(configForWrite);
        }

        if (!purgeState && stateForWrite !== null) {
          stateForWrite = stripPublishState(stateForWrite);
        }
      } else {
        markKept(kept, reportLines, `remote:${remoteResult.gistId}`);
      }
    }
  }

  if (!purgeConfig && configForWrite !== null && remoteResult?.deleted) {
    try {
      await writeFile(configPath, `${JSON.stringify(configForWrite, null, 2)}\n`, "utf8");
    } catch (error) {
      if (!force) {
        throw error;
      }

      markKept(kept, reportLines, "config (write preserved)");
    }
  }

  if (!purgeState && stateForWrite !== null && remoteResult?.deleted) {
    try {
      await writeFile(statePath, `${JSON.stringify(stateForWrite, null, 2)}\n`, "utf8");
    } catch (error) {
      if (!force) {
        throw error;
      }

      markKept(kept, reportLines, "state (write preserved)");
    }
  }

  for (const line of reportLines) {
    writeLine(stdout, line);
  }

  return {
    removed,
    kept,
    runtimeWiring,
    remote: purgeRemote ? remoteResult : null
  };
}
