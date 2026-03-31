import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import {
  attributeBackfillSessions,
  createGitHubGistClient,
  parseAgentBadgeConfig,
  parseAgentBadgeState,
  publishBadgeToGist,
  runFullBackfillScan,
  appendAgentBadgeLog,
  buildLogEntry,
  type AgentBadgeState,
  type AttributeBackfillSessionsResult,
  type GitHubGistClient,
  type RunFullBackfillScanResult
} from "@legotin/agent-badge-core";

interface OutputWriter {
  write(chunk: string): unknown;
}

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

export async function runPublishCommand(
  options: RunPublishCommandOptions = {}
): Promise<PublishCommandResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const homeRoot = resolve(options.homeRoot ?? homedir());
  const stdout = options.stdout ?? process.stdout;
  const startAtMs = Date.now();
  const env = options.env ?? process.env;
  const configPath = join(cwd, CONFIG_PATH);
  const statePath = join(cwd, STATE_PATH);
  try {
    const config = parseAgentBadgeConfig(await readJsonFile(configPath));

    if (config.publish.gistId === null || config.publish.badgeUrl === null) {
      throw new Error(PUBLISH_NOT_CONFIGURED_ERROR);
    }

    const previousState = parseAgentBadgeState(await readJsonFile(statePath));
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
    const nextState = await publishBadgeToGist({
      config,
      state: previousState,
      scan,
      attribution,
      client:
        options.gistClient ??
        createGitHubGistClient({
          authToken: resolveGitHubAuthToken(env)
        })
    });

    await writeStateFile(statePath, nextState);
    writeLine(stdout, "agent-badge publish");
    writeLine(stdout, `- Badge URL: ${config.publish.badgeUrl}`);
    writeLine(stdout, `- Publish status: ${nextState.publish.status}`);
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
    const publishError = error instanceof Error ? error : new Error(String(error));

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

    throw publishError;
  }
}
