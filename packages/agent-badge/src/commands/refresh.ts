import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import {
  applyPublishAttemptFailure,
  applyPublishAttemptNotAttempted,
  applyCompletedScanState,
  buildRefreshCacheKey,
  buildSharedOverrideDigest,
  createGitHubGistClient,
  derivePrePushPolicyConsequence,
  derivePrePushPolicyReport,
  derivePublishTrustReport,
  deriveRecoveryPlan,
  formatPrePushPolicyLine,
  formatPublishReadinessStatus,
  formatRecoveryResult,
  formatPublishTrustStatus,
  formatEstimatedCostUsd,
  inspectPublishReadiness,
  isPublishBadgeError,
  parseAgentBadgeConfig,
  parseAgentBadgeState,
  publishBadgeIfChanged,
  runIncrementalRefresh,
  toPublishAttemptChangedBadge,
  writeRefreshCache,
  appendAgentBadgeLog,
  buildLogEntry,
  PublishBadgeError,
  type AgentBadgeRefreshMode,
  type AgentBadgeRefreshPublishDecision,
  type AgentBadgeState,
  type GitHubGistClient,
  type PublishBadgeIfChangedResult,
  type RefreshCache,
  type SharedContributorObservationMap,
  type RunIncrementalRefreshResult
} from "@legotin/agent-badge-core";

interface OutputWriter {
  write(chunk: string): unknown;
}

type ReportedCommandError = Error & {
  alreadyReported?: boolean;
};

export interface RunRefreshCommandOptions {
  readonly cwd?: string;
  readonly homeRoot?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly gistClient?: GitHubGistClient;
  readonly stdout?: OutputWriter;
  readonly hook?: "pre-push";
  readonly hookPolicy?: AgentBadgeRefreshMode;
  readonly failSoft?: boolean;
  readonly forceFull?: boolean;
}

export interface RefreshCommandSuccessResult {
  readonly status: "ok";
  readonly refresh: RunIncrementalRefreshResult;
  readonly state: AgentBadgeState;
  readonly publishDecision: AgentBadgeRefreshPublishDecision;
  readonly publishResult: PublishBadgeIfChangedResult | null;
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
const GITHUB_AUTH_MISSING_ERROR_MESSAGE =
  "GitHub authentication missing or invalid.";

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

function markErrorAsReported<T extends Error>(error: T): T {
  Object.defineProperty(error as ReportedCommandError, "alreadyReported", {
    value: true,
    configurable: true
  });

  return error;
}

function normalizePublishSurfaceError(error: Error): Error {
  if (!isPublishBadgeError(error) || error.failureCode !== "auth-missing") {
    return error;
  }

  if (error.message === GITHUB_AUTH_MISSING_ERROR_MESSAGE) {
    return error;
  }

  return new PublishBadgeError(GITHUB_AUTH_MISSING_ERROR_MESSAGE, {
    cause: error.cause ?? error,
    attemptedAt: error.attemptedAt,
    failureCode: error.failureCode,
    candidateHash: error.candidateHash,
    changedBadge: error.changedBadge
  });
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

function printPublishTrustLines(
  stdout: OutputWriter,
  state: AgentBadgeState,
  options?: {
    readonly includeLastSuccessfulBadgeUpdate?: boolean;
  }
): void {
  const trustReport = derivePublishTrustReport({
    state,
    now: new Date().toISOString()
  });

  writeLine(
    stdout,
    `- Live badge trust: ${formatPublishTrustStatus(trustReport.status)}`
  );

  if (
    options?.includeLastSuccessfulBadgeUpdate !== false &&
    trustReport.lastPublishedAt !== null &&
    trustReport.status !== "not-attempted"
  ) {
    writeLine(
      stdout,
      `- Last successful badge update: ${trustReport.lastPublishedAt}`
    );
  }
}

function printPublishReadinessLine(
  stdout: OutputWriter,
  state: AgentBadgeState,
  config: ReturnType<typeof parseAgentBadgeConfig>
): void {
  const readiness = inspectPublishReadiness({
    config,
    state
  });

  writeLine(
    stdout,
    `- Publish readiness: ${formatPublishReadinessStatus(readiness.status)}`
  );
}

function resolveHookPolicy(
  options: RunRefreshCommandOptions,
  config: ReturnType<typeof parseAgentBadgeConfig>
): AgentBadgeRefreshMode | undefined {
  if (options.hook !== "pre-push") {
    return undefined;
  }

  if (typeof options.hookPolicy !== "undefined") {
    return options.hookPolicy;
  }

  if (options.failSoft) {
    return "fail-soft";
  }

  return config.refresh.prePush.mode;
}

function shouldFailSoftForExecution(
  options: RunRefreshCommandOptions,
  config: ReturnType<typeof parseAgentBadgeConfig>
): boolean {
  const hookPolicy = resolveHookPolicy(options, config);

  return options.failSoft === true || hookPolicy === "fail-soft";
}

function printHookPolicyLines(
  stdout: OutputWriter,
  state: AgentBadgeState,
  config: ReturnType<typeof parseAgentBadgeConfig>,
  hookPolicy: AgentBadgeRefreshMode | undefined
): {
  readonly degraded: boolean;
  readonly blocking: boolean;
} {
  if (hookPolicy === undefined) {
    return {
      degraded: false,
      blocking: false
    };
  }

  const report = derivePrePushPolicyReport({
    config,
    state,
    now: new Date().toISOString()
  });
  const policyReport = {
    ...report,
    policy: hookPolicy
  };
  const consequence = derivePrePushPolicyConsequence(policyReport);

  writeLine(stdout, `- ${formatPrePushPolicyLine(hookPolicy)}`);

  if (consequence.level === "warning" && consequence.message !== null) {
    writeLine(stdout, `- Warning: ${consequence.message}`);
  } else if (consequence.level === "blocking" && consequence.message !== null) {
    writeLine(stdout, `- Blocking: ${consequence.message}`);
  }

  return {
    degraded: policyReport.degraded,
    blocking: consequence.level === "blocking"
  };
}

function printRefreshSummary(
  stdout: OutputWriter,
  result: RefreshCommandSuccessResult,
  config: ReturnType<typeof parseAgentBadgeConfig>,
  hookPolicy: AgentBadgeRefreshMode | undefined,
  recoveryResult: string | null
): {
  readonly degraded: boolean;
  readonly blocking: boolean;
} {
  const concise = hookPolicy !== undefined;

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
  const hookOutcome = printHookPolicyLines(
    stdout,
    result.state,
    config,
    hookPolicy
  );
  printPublishReadinessLine(stdout, result.state, config);
  printPublishTrustLines(stdout, result.state, {
    includeLastSuccessfulBadgeUpdate: !concise
  });
  writeLine(
    stdout,
    `- Last refresh: ${result.state.refresh.lastRefreshedAt ?? "unavailable"}`
  );

  if (result.publishResult !== null) {
    writeLine(
      stdout,
      `- Publish mode: ${result.publishResult.healthAfterPublish.mode}`
    );
    writeLine(
      stdout,
      `- Migration: ${
        result.publishResult.migrationPerformed ? "legacy -> shared" : "none"
      }`
    );
  }

  if (recoveryResult !== null) {
    writeLine(stdout, `- Recovery result: ${recoveryResult}`);
  }

  return hookOutcome;
}

function resolveRefreshRecoveryResult(options: {
  readonly config: ReturnType<typeof parseAgentBadgeConfig>;
  readonly previousState: AgentBadgeState;
  readonly nextState: AgentBadgeState;
  readonly publishResult: PublishBadgeIfChangedResult | null;
}): string | null {
  if (options.publishResult === null) {
    return null;
  }

  const beforeRecoveryPlan = deriveRecoveryPlan({
    readiness: inspectPublishReadiness({
      config: options.config,
      state: options.previousState
    }),
    trust: derivePublishTrustReport({
      state: options.previousState,
      now: new Date().toISOString()
    }),
    sharedHealth: options.publishResult.healthBeforePublish
  });

  if (beforeRecoveryPlan.command !== "agent-badge refresh") {
    return null;
  }

  const afterRecoveryPlan = deriveRecoveryPlan({
    readiness: inspectPublishReadiness({
      config: options.config,
      state: options.nextState
    }),
    trust: derivePublishTrustReport({
      state: options.nextState,
      now: new Date().toISOString()
    }),
    sharedHealth: options.publishResult.healthAfterPublish
  });

  return afterRecoveryPlan.status === "healthy"
    ? formatRecoveryResult("agent-badge refresh")
    : null;
}

function printSoftFailure(
  stdout: OutputWriter,
  error: Error,
  state: AgentBadgeState | null,
  config: ReturnType<typeof parseAgentBadgeConfig> | null,
  hookPolicy?: AgentBadgeRefreshMode,
  failureStatus: "failed-soft" | "failed" = "failed-soft"
): void {
  writeLine(stdout, "agent-badge refresh");
  writeLine(stdout, `- Refresh status: ${failureStatus}`);
  writeLine(stdout, `- Error: ${error.message}`);

  if (state === null || config === null) {
    return;
  }

  printHookPolicyLines(stdout, state, config, hookPolicy);
  printPublishReadinessLine(stdout, state, config);
  printPublishTrustLines(stdout, state);

  writeLine(stdout, `- Last refresh: ${state.refresh.lastRefreshedAt ?? "unavailable"}`);
}

class HookPolicyBlockingError extends Error {
  readonly alreadyReported = true;

  constructor() {
    super("push stopped because pre-push policy is strict.");
  }
}

interface RefreshCommandLogInput {
  readonly summary: RunIncrementalRefreshResult["summary"] | null;
  readonly publishDecision: AgentBadgeRefreshPublishDecision;
}

function toError(error: unknown): Error {
  return normalizePublishSurfaceError(
    error instanceof Error ? error : new Error(String(error))
  );
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
  let config: ReturnType<typeof parseAgentBadgeConfig> | null = null;
  let attemptedPublish = false;

  try {
    config = parseAgentBadgeConfig(await readJsonFile(configPath));
    const hookPolicy = resolveHookPolicy(options, config);
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
    let publishResult: PublishBadgeIfChangedResult | null = null;

    if (config.publish.gistId === null || config.publish.badgeUrl === null) {
      publishDecision =
        previousState.publish.status === "deferred" ? "deferred" : "not-configured";
      persistedState = {
        ...applyPublishAttemptNotAttempted({
          state: persistedState,
          at: now,
          failureCode: publishDecision,
          status: previousState.publish.status,
          gistId: config.publish.gistId
        }),
        refresh: {
          ...persistedState.refresh,
          lastPublishDecision: publishDecision
        }
      };
      await writeStateFile(statePath, persistedState);
    } else {
      attemptedPublish = true;

      publishResult = await publishBadgeIfChanged({
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
      publishDecision,
      publishResult
    };

    const hookOutcome = printRefreshSummary(
      stdout,
      result,
      config,
      hookPolicy,
      resolveRefreshRecoveryResult({
        config,
        previousState,
        nextState: persistedState,
        publishResult
      })
    );
    await appendAgentBadgeLog({
      cwd,
      entry: buildLogEntry({
        operation: "refresh",
        status:
          hookOutcome.blocking
            ? "failure"
            : buildRefreshLogStatus(publishDecision),
        startAtMs,
        counts: buildRefreshLogCounts({
          summary: result.refresh.summary,
          publishDecision
        })
      })
    }).catch(() => {
      // Logging is best-effort and must not block command output.
    });

    if (hookOutcome.blocking) {
      throw new HookPolicyBlockingError();
    }

    return result;
  } catch (error) {
    const refreshError = toError(error);
    const hookPolicy =
      config === null ? undefined : resolveHookPolicy(options, config);
    const failSoft =
      config === null
        ? options.failSoft === true
        : shouldFailSoftForExecution(options, config);

    if (refreshError instanceof HookPolicyBlockingError) {
      throw refreshError;
    }

    if (persistedState !== null) {
      const failedState: AgentBadgeState = {
        ...(
          attemptedPublish && persistedState.publish.gistId !== null
            ? applyPublishAttemptFailure({
                state: persistedState,
                at:
                  isPublishBadgeError(refreshError) &&
                  refreshError.attemptedAt.length > 0
                    ? refreshError.attemptedAt
                    : new Date().toISOString(),
                failureCode: isPublishBadgeError(refreshError)
                  ? refreshError.failureCode
                  : "unknown",
                candidateHash: isPublishBadgeError(refreshError)
                  ? refreshError.candidateHash
                  : null,
                changedBadge: isPublishBadgeError(refreshError)
                  ? toPublishAttemptChangedBadge(refreshError.changedBadge)
                  : "unknown",
                gistId: persistedState.publish.gistId
              })
            : persistedState
        ),
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

    if (!failSoft && persistedState !== null && config !== null) {
      printSoftFailure(
        stdout,
        refreshError,
        persistedState,
        config,
        hookPolicy,
        "failed"
      );
    }

    if (!failSoft) {
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
      throw persistedState !== null && config !== null
        ? markErrorAsReported(refreshError)
        : refreshError;
    }

    printSoftFailure(stdout, refreshError, persistedState, config, hookPolicy);
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
