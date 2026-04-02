import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import {
  applyPublishAttemptFailure,
  applyPublishAttemptNotAttempted,
  attributeBackfillSessions,
  buildSharedOverrideDigest,
  createGitHubGistClient,
  formatPublishReadinessStatus,
  inspectPublishReadiness,
  estimateSessionCostsUsdMicrosByKey,
  isPublishBadgeError,
  parseAgentBadgeConfig,
  parseAgentBadgeState,
  publishBadgeToGist,
  resolvePricingCatalog,
  toPublishAttemptChangedBadge,
  runFullBackfillScan,
  appendAgentBadgeLog,
  buildLogEntry,
  PublishBadgeError,
  type AgentBadgeState,
  type AttributeBackfillSessionsResult,
  type GitHubGistClient,
  type SharedContributorObservationMap,
  type RunFullBackfillScanResult
} from "@legotin/agent-badge-core";

interface OutputWriter {
  write(chunk: string): unknown;
}

type ReportedCommandError = Error & {
  alreadyReported?: boolean;
};

export interface RunPublishCommandOptions {
  readonly cwd?: string;
  readonly homeRoot?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly gistClient?: GitHubGistClient;
  readonly stdout?: OutputWriter;
}

export interface PublishCommandResult {
  readonly scan: RunFullBackfillScanResult;
  readonly attribution: AttributeBackfillSessionsResult;
  readonly state: AgentBadgeState;
}

const CONFIG_PATH = ".agent-badge/config.json";
const STATE_PATH = ".agent-badge/state.json";
const githubTokenEnvVars = ["GH_TOKEN", "GITHUB_TOKEN", "GITHUB_PAT"] as const;
const PUBLISH_NOT_CONFIGURED_ERROR =
  "Publish is not configured. Run `agent-badge init` or re-run init with `--gist-id <id>` first.";
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

function writeSharedPublishSummary(stdout: OutputWriter, options: {
  readonly mode: "legacy" | "shared";
  readonly migrationPerformed: boolean;
}): void {
  writeLine(stdout, `- Publish mode: ${options.mode}`);
  writeLine(
    stdout,
    `- Migration: ${options.migrationPerformed ? "legacy -> shared" : "none"}`
  );
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

function buildSessionKey(session: {
  readonly provider: string;
  readonly providerSessionId: string;
}): string {
  return `${session.provider}:${session.providerSessionId}`;
}

async function buildPublisherObservations(options: {
  readonly attribution: AttributeBackfillSessionsResult;
  readonly cwd: string;
  readonly homeRoot: string;
  readonly includeEstimatedCost: boolean;
}): Promise<SharedContributorObservationMap> {
  const estimatedCostBySessionKey = new Map<string, number>();

  if (options.includeEstimatedCost && options.attribution.sessions.length > 0) {
    const pricingCatalog = await resolvePricingCatalog({ cwd: options.cwd });
    const estimatedCosts = await estimateSessionCostsUsdMicrosByKey({
      sessions: options.attribution.sessions.map(
        (attributedSession) => attributedSession.session
      ),
      homeRoot: options.homeRoot,
      pricingCatalog
    });

    for (const [sessionKey, estimatedCostUsdMicros] of Object.entries(
      estimatedCosts
    )) {
      estimatedCostBySessionKey.set(sessionKey, estimatedCostUsdMicros);
    }
  }

  return Object.fromEntries(
    options.attribution.sessions.map((attributedSession) => {
      const sessionKey = buildSessionKey(attributedSession.session);

      return [
        buildSharedOverrideDigest(sessionKey),
        {
          sessionUpdatedAt: attributedSession.session.updatedAt,
          attributionStatus: attributedSession.status,
          overrideDecision: attributedSession.overrideApplied,
          tokens: attributedSession.session.tokenUsage.total,
          estimatedCostUsdMicros: options.includeEstimatedCost
            ? (estimatedCostBySessionKey.get(sessionKey) ?? 0)
            : null
        }
      ];
    })
  );
}

export async function runPublishCommand(
  options: RunPublishCommandOptions = {}
): Promise<PublishCommandResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const homeRoot = resolve(options.homeRoot ?? homedir());
  const stdout = options.stdout ?? process.stdout;
  const startAtMs = Date.now();
  const now = new Date().toISOString();
  const env = options.env ?? process.env;
  const configPath = join(cwd, CONFIG_PATH);
  const statePath = join(cwd, STATE_PATH);
  let previousState: AgentBadgeState | null = null;
  let alreadyReported = false;
  try {
    const config = parseAgentBadgeConfig(await readJsonFile(configPath));
    previousState = parseAgentBadgeState(await readJsonFile(statePath));

    if (config.publish.gistId === null || config.publish.badgeUrl === null) {
      await writeStateFile(
        statePath,
        applyPublishAttemptNotAttempted({
          state: previousState,
          at: now,
          failureCode: "not-configured",
          gistId: config.publish.gistId
        })
      );
      throw new Error(PUBLISH_NOT_CONFIGURED_ERROR);
    }

    const scan = await runFullBackfillScan({
      cwd,
      homeRoot,
      config
    });
    const attribution = attributeBackfillSessions({
      repo: scan.repo,
      sessions: scan.sessions,
      overrides: previousState.overrides.ambiguousSessions
    });
    const publisherObservations = await buildPublisherObservations({
      attribution,
      cwd,
      homeRoot,
      includeEstimatedCost:
        config.badge.mode === "combined" || config.badge.mode === "cost"
    });
    const publishResult = await publishBadgeToGist({
      config,
      state: previousState,
      publisherObservations,
      client:
        options.gistClient ??
        createGitHubGistClient({
          authToken: resolveGitHubAuthToken(env)
        })
    });
    const nextState = publishResult.state;

    await writeStateFile(statePath, nextState);
    writeLine(stdout, "agent-badge publish");
    writeLine(stdout, `- Badge URL: ${config.publish.badgeUrl}`);
    writeLine(stdout, `- Publish status: ${nextState.publish.status}`);
    writeLine(
      stdout,
      `- Publish readiness: ${formatPublishReadinessStatus(
        inspectPublishReadiness({
          config,
          state: nextState
        }).status
      )}`
    );
    writeSharedPublishSummary(stdout, {
      mode: publishResult.healthAfterPublish.mode,
      migrationPerformed: publishResult.migrationPerformed
    });
    writeLine(stdout, `- lastPublishedHash: ${nextState.publish.lastPublishedHash}`);
    await appendAgentBadgeLog({
      cwd,
      entry: buildLogEntry({
        operation: "publish",
        status: "success",
        startAtMs,
        counts: {
          scannedSessions: scan.counts.scannedSessions,
          attributedSessions: attribution.counts.included,
          ambiguousSessions: attribution.counts.ambiguous,
          publishedRecords: 1
        }
      })
    }).catch(() => {
      // Logging is best-effort and must not block command output.
    });

    return {
      scan,
      attribution,
      state: nextState
    };
  } catch (error) {
    const publishError = normalizePublishSurfaceError(
      error instanceof Error ? error : new Error(String(error))
    );

    if (
      previousState !== null &&
      publishError.message !== PUBLISH_NOT_CONFIGURED_ERROR
    ) {
      const failedState = applyPublishAttemptFailure({
        state: previousState,
        at:
          isPublishBadgeError(publishError) && publishError.attemptedAt.length > 0
            ? publishError.attemptedAt
            : now,
        failureCode: isPublishBadgeError(publishError)
          ? publishError.failureCode
          : "unknown",
        candidateHash: isPublishBadgeError(publishError)
          ? publishError.candidateHash
          : null,
        changedBadge: isPublishBadgeError(publishError)
          ? toPublishAttemptChangedBadge(publishError.changedBadge)
          : "unknown"
      });

      try {
        await writeStateFile(statePath, failedState);
      } catch {
        // Preserve the original publish failure for callers.
      }
    }

    if (isPublishBadgeError(publishError) && previousState !== null) {
      const failedState = applyPublishAttemptFailure({
        state: previousState,
        at:
          publishError.attemptedAt.length > 0 ? publishError.attemptedAt : now,
        failureCode: publishError.failureCode,
        candidateHash: publishError.candidateHash,
        changedBadge: toPublishAttemptChangedBadge(publishError.changedBadge)
      });

      writeLine(stdout, "agent-badge publish");
      writeLine(
        stdout,
        `- Publish readiness: ${formatPublishReadinessStatus(
          inspectPublishReadiness({
            config: parseAgentBadgeConfig(await readJsonFile(configPath)),
            state: failedState
          }).status
        )}`
      );
      alreadyReported = true;
    }

    await appendAgentBadgeLog({
      cwd,
      entry: buildLogEntry({
        operation: "publish",
        status: "failure",
        startAtMs,
        counts: {
          scannedSessions: 0,
          attributedSessions: 0,
          ambiguousSessions: 0,
          publishedRecords: 0
        }
      })
    }).catch(() => {
      // Logging is best-effort and must not hide command failures.
    });

    throw alreadyReported ? markErrorAsReported(publishError) : publishError;
  }
}
