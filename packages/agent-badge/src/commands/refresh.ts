import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import {
  applyCompletedScanState,
  buildRefreshCacheKey,
  buildSharedOverrideDigest,
  createGitHubGistClient,
  formatEstimatedCostUsd,
  parseAgentBadgeConfig,
  parseAgentBadgeState,
  publishBadgeIfChanged,
  runIncrementalRefresh,
  writeRefreshCache,
  appendAgentBadgeLog,
  buildLogEntry,
  type AgentBadgeRefreshPublishDecision,
  type AgentBadgeState,
  type GitHubGistClient,
  type RefreshCache,
  type SharedContributorObservationMap,
  type RunIncrementalRefreshResult
} from "@legotin/agent-badge-core";

interface OutputWriter {
  write(chunk: string): unknown;
}

export interface RunRefreshCommandOptions {
  readonly cwd?: string;
  readonly homeRoot?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly gistClient?: GitHubGistClient;
  readonly stdout?: OutputWriter;
  readonly hook?: "pre-push";
  readonly failSoft?: boolean;
  readonly forceFull?: boolean;
}

export interface RefreshCommandSuccessResult {
  readonly status: "ok";
  readonly refresh: RunIncrementalRefreshResult;
  readonly state: AgentBadgeState;
  readonly publishDecision: AgentBadgeRefreshPublishDecision;
}

export interface RefreshCommandSoftFailureResult {
  readonly status: "failed-soft";
  readonly error: Error;
  readonly state: AgentBadgeState | null;
}

export type RefreshCommandResult =
  | RefreshCommandSuccessResult
  | RefreshCommandSoftFailureResult;

const CONFIG_PATH = ".agent-badge/config.json";
const STATE_PATH = ".agent-badge/state.json";
const githubTokenEnvVars = ["GH_TOKEN", "GITHUB_TOKEN", "GITHUB_PAT"] as const;

async function readJsonFile(targetPath: string): Promise<unknown> {
  let rawContent: string;

  try {
    rawContent = await readFile(targetPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : ".";

    throw new Error(`Unable to read ${targetPath}${detail}`);
  }

  try {
    return JSON.parse(rawContent) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : ".";

    throw new Error(`Unable to parse ${targetPath}${detail}`);
  }
}

async function writeStateFile(
  targetPath: string,
  state: AgentBadgeState
): Promise<void> {
  await writeFile(targetPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function writeLine(stdout: OutputWriter, line: string): void {
  stdout.write(`${line}\n`);
}

function resolveGitHubAuthToken(
  env: NodeJS.ProcessEnv | undefined
): string | undefined {
  for (const envVar of githubTokenEnvVars) {
    const value = env?.[envVar];

    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function getConfiguredProviders(
  config: ReturnType<typeof parseAgentBadgeConfig>
): Array<keyof AgentBadgeState["checkpoints"]> {
  const providers: Array<keyof AgentBadgeState["checkpoints"]> = [];

  if (config.providers.codex.enabled) {
    providers.push("codex");
  }

  if (config.providers.claude.enabled) {
    providers.push("claude");
  }

  return providers;
}

function formatTotals(summary: RunIncrementalRefreshResult["summary"]): string {
  const estimatedCost =
    summary.includedEstimatedCostUsdMicros === null
      ? ""
      : `, ~${formatEstimatedCostUsd(
          summary.includedEstimatedCostUsdMicros
        )} estimated`;

  return `${summary.includedSessions} sessions, ${summary.includedTokens} tokens${estimatedCost}`;
}

function formatPublishLine(
  decision: AgentBadgeRefreshPublishDecision,
  state: AgentBadgeState,
  concise: boolean
): string {
  if (decision === "not-configured") {
    return "not configured";
  }

  if (decision === "deferred") {
    return "deferred";
  }

  if (decision === "failed") {
    return "failed";
  }

  if (concise || state.publish.lastPublishedAt === null) {
    return decision;
  }

  return `${decision} (last published ${state.publish.lastPublishedAt})`;
}

function printRefreshSummary(
  stdout: OutputWriter,
  result: RefreshCommandSuccessResult,
  hook: RunRefreshCommandOptions["hook"]
): void {
  const concise = hook === "pre-push";

  writeLine(stdout, "agent-badge refresh");
  writeLine(stdout, `- Scan mode: ${result.refresh.scanMode}`);
  writeLine(stdout, `- Totals: ${formatTotals(result.refresh.summary)}`);
  writeLine(
    stdout,
    `- Publish: ${formatPublishLine(
      result.publishDecision,
      result.state,
      concise
    )}`
  );
  writeLine(
    stdout,
    `- Last refresh: ${result.state.refresh.lastRefreshedAt ?? "unavailable"}`
  );
}

function printSoftFailure(stdout: OutputWriter, error: Error): void {
  writeLine(stdout, "agent-badge refresh");
  writeLine(stdout, "- Refresh status: failed-soft");
  writeLine(stdout, `- Error: ${error.message}`);
}

interface RefreshCommandLogInput {
  readonly summary: RunIncrementalRefreshResult["summary"] | null;
  readonly publishDecision: AgentBadgeRefreshPublishDecision;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function buildRefreshLogCounts(input: RefreshCommandLogInput): {
  readonly scannedSessions: number;
  readonly attributedSessions: number;
  readonly ambiguousSessions: number;
  readonly publishedRecords: number;
} {
  const summary = input.summary;

  return {
    scannedSessions: summary
      ? summary.includedSessions + summary.ambiguousSessions + summary.excludedSessions
      : 0,
    attributedSessions: summary ? summary.includedSessions : 0,
    ambiguousSessions: summary ? summary.ambiguousSessions : 0,
    publishedRecords: input.publishDecision === "published" ? 1 : 0
  };
}

function buildRefreshLogStatus(
  publishDecision: AgentBadgeRefreshPublishDecision
): "success" | "failure" | "skipped" {
  if (publishDecision === "failed") {
    return "failure";
  }

  if (publishDecision === "not-configured" || publishDecision === "deferred") {
    return "skipped";
  }

  return "success";
}

function buildPublisherObservationsFromRefreshCache(
  cache: RefreshCache
): SharedContributorObservationMap {
  return Object.fromEntries(
    Object.values(cache.entries).map((entry) => {
      const sessionKey = buildRefreshCacheKey(entry);

      return [
        buildSharedOverrideDigest(sessionKey),
        {
          sessionUpdatedAt: entry.sessionUpdatedAt,
          attributionStatus: entry.status,
          overrideDecision: entry.overrideDecision,
          tokens: entry.tokens,
          estimatedCostUsdMicros: entry.estimatedCostUsdMicros
        }
      ];
    })
  );
}

export async function runRefreshCommand(
  options: RunRefreshCommandOptions = {}
): Promise<RefreshCommandResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const homeRoot = resolve(options.homeRoot ?? homedir());
  const stdout = options.stdout ?? process.stdout;
  const env = options.env ?? process.env;
  const startAtMs = Date.now();
  const configPath = join(cwd, CONFIG_PATH);
  const statePath = join(cwd, STATE_PATH);
  let persistedState: AgentBadgeState | null = null;
  let attemptedPublish = false;

  try {
    const config = parseAgentBadgeConfig(await readJsonFile(configPath));
    const previousState = parseAgentBadgeState(await readJsonFile(statePath));
    const refresh = await runIncrementalRefresh({
      cwd,
      homeRoot,
      config,
      state: previousState,
      forceFull: options.forceFull ?? false
    });
    const now = new Date().toISOString();
    const scanState = applyCompletedScanState({
      previousState,
      scanResult: {
        scannedProviders: getConfiguredProviders(config),
        providerCursors: refresh.providerCursors
      },
      now
    });

    persistedState = {
      ...scanState,
      publish: {
        ...scanState.publish,
        gistId: config.publish.gistId
      },
      refresh: {
        lastRefreshedAt: now,
        lastScanMode: refresh.scanMode,
        lastPublishDecision: null,
        summary: refresh.summary
      }
    };

    // Persist the derived .agent-badge/cache/session-index.json cache before remote work.
    await Promise.all([
      writeRefreshCache({ cwd, cache: refresh.cache }),
      writeStateFile(statePath, persistedState)
    ]);

    let publishDecision: AgentBadgeRefreshPublishDecision = "not-configured";

    if (config.publish.gistId === null || config.publish.badgeUrl === null) {
      persistedState = {
        ...persistedState,
        refresh: {
          ...persistedState.refresh,
          lastPublishDecision: "not-configured"
        }
      };
      await writeStateFile(statePath, persistedState);
    } else {
      attemptedPublish = true;

      const publishResult = await publishBadgeIfChanged({
        config,
        state: persistedState,
        publisherObservations: buildPublisherObservationsFromRefreshCache(
          refresh.cache
        ),
        client:
          options.gistClient ??
          createGitHubGistClient({
            authToken: resolveGitHubAuthToken(env)
          }),
        now,
        skipIfUnchanged: true
      });

      publishDecision = publishResult.decision;
      persistedState = {
        ...publishResult.state,
        refresh: {
          ...persistedState.refresh,
          lastPublishDecision: publishDecision
        }
      };
      await writeStateFile(statePath, persistedState);
    }

    const result: RefreshCommandSuccessResult = {
      status: "ok",
      refresh,
      state: persistedState,
      publishDecision
    };

    printRefreshSummary(stdout, result, options.hook);
    await appendAgentBadgeLog({
      cwd,
      entry: buildLogEntry({
        operation: "refresh",
        status: buildRefreshLogStatus(publishDecision),
        startAtMs,
        counts: buildRefreshLogCounts({
          summary: result.refresh.summary,
          publishDecision
        })
      })
    }).catch(() => {
      // Logging is best-effort and must not block command output.
    });

    return result;
  } catch (error) {
    const refreshError = toError(error);

    if (persistedState !== null) {
      const failedState: AgentBadgeState = {
        ...persistedState,
        publish:
          attemptedPublish && persistedState.publish.gistId !== null
            ? {
                ...persistedState.publish,
                status: "error"
              }
            : persistedState.publish,
        refresh: {
          ...persistedState.refresh,
          lastPublishDecision: "failed"
        }
      };

      persistedState = failedState;

      try {
        await writeStateFile(statePath, failedState);
      } catch {
        // Preserve the original refresh failure for callers.
      }
    }

    if (!options.failSoft) {
      await appendAgentBadgeLog({
        cwd,
        entry: buildLogEntry({
          operation: "refresh",
          status: "failure",
          startAtMs,
          counts: buildRefreshLogCounts({
            summary: persistedState?.refresh.summary ?? null,
            publishDecision: "failed"
          })
        })
      }).catch(() => {
        // Logging is best-effort and must not block command output.
      });
      throw refreshError;
    }

    printSoftFailure(stdout, refreshError);
    await appendAgentBadgeLog({
      cwd,
      entry: buildLogEntry({
        operation: "refresh",
        status: "failure",
        startAtMs,
        counts: buildRefreshLogCounts({
          summary: persistedState?.refresh.summary ?? null,
          publishDecision: "failed"
        })
      })
    }).catch(() => {
      // Logging is best-effort and must not block command output.
    });

    return {
      status: "failed-soft",
      error: refreshError,
      state: persistedState
    };
  }
}
