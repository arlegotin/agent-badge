import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { parseAgentBadgeState, type AgentBadgeState } from "@agent-badge/core";

interface OutputWriter {
  write(chunk: string): unknown;
}

type PrivacyOutput = "standard" | "minimal";

interface StatusCommandConfig {
  readonly providers: {
    readonly codex: {
      readonly enabled: boolean;
    };
    readonly claude: {
      readonly enabled: boolean;
    };
  };
  readonly publish: {
    readonly gistId: string | null;
    readonly badgeUrl: string | null;
  };
  readonly privacy: {
    readonly output: PrivacyOutput;
  };
}

export interface RunStatusCommandOptions {
  readonly cwd?: string;
  readonly stdout?: OutputWriter;
}

export interface StatusCommandResult {
  readonly config: StatusCommandConfig;
  readonly state: AgentBadgeState;
  readonly report: string;
}

const CONFIG_PATH = ".agent-badge/config.json";
const STATE_PATH = ".agent-badge/state.json";

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

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${label} in ${CONFIG_PATH}.`);
  }

  return value as Record<string, unknown>;
}

function readBoolean(
  value: unknown,
  label: string,
  fallback?: boolean
): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof fallback === "boolean") {
    return fallback;
  }

  throw new Error(`Invalid ${label} in ${CONFIG_PATH}.`);
}

function readNullableString(
  value: unknown,
  label: string,
  fallback?: string | null
): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (value === null) {
    return null;
  }

  if (typeof fallback !== "undefined") {
    return fallback;
  }

  throw new Error(`Invalid ${label} in ${CONFIG_PATH}.`);
}

function parseStatusCommandConfig(input: unknown): StatusCommandConfig {
  const root = asObject(input, "config");
  const providers = asObject(root.providers, "providers");
  const codex = asObject(providers.codex, "providers.codex");
  const claude = asObject(providers.claude, "providers.claude");
  const publish = asObject(root.publish, "publish");
  const privacy = asObject(root.privacy, "privacy");
  const output =
    privacy.output === "minimal" || privacy.output === "standard"
      ? privacy.output
      : "standard";

  return {
    providers: {
      codex: {
        enabled: readBoolean(codex.enabled, "providers.codex.enabled")
      },
      claude: {
        enabled: readBoolean(claude.enabled, "providers.claude.enabled")
      }
    },
    publish: {
      gistId: readNullableString(publish.gistId, "publish.gistId", null),
      badgeUrl: readNullableString(publish.badgeUrl, "publish.badgeUrl", null)
    },
    privacy: {
      output
    }
  };
}

function formatTotalsLine(state: AgentBadgeState): string {
  if (state.refresh.summary === null) {
    return "unavailable (run `agent-badge refresh`)";
  }

  return `${state.refresh.summary.includedSessions} sessions, ${state.refresh.summary.includedTokens} tokens`;
}

function formatProvidersLine(config: StatusCommandConfig): string {
  return `codex=${config.providers.codex.enabled ? "enabled" : "disabled"}, claude=${config.providers.claude.enabled ? "enabled" : "disabled"}`;
}

function formatPublishLine(
  config: StatusCommandConfig,
  state: AgentBadgeState
): string {
  const details = [
    state.publish.status,
    `gist configured=${config.publish.gistId !== null && config.publish.badgeUrl !== null ? "yes" : "no"}`
  ];

  if (state.publish.lastPublishedAt !== null) {
    details.push(`last published=${state.publish.lastPublishedAt}`);
  }

  if (config.privacy.output === "minimal") {
    return details.join(" | ");
  }

  if (config.publish.gistId !== null) {
    details.push(`gistId=${config.publish.gistId}`);
  }

  if (state.publish.lastPublishedHash !== null) {
    details.push(`lastPublishedHash=${state.publish.lastPublishedHash}`);
  }

  return details.join(" | ");
}

function formatLastRefreshLine(state: AgentBadgeState): string {
  if (state.refresh.lastRefreshedAt === null) {
    return "unavailable";
  }

  if (state.refresh.lastScanMode === null) {
    return state.refresh.lastRefreshedAt;
  }

  return `${state.refresh.lastRefreshedAt} (${state.refresh.lastScanMode})`;
}

function formatCheckpointsLine(state: AgentBadgeState): string {
  return `codex=${state.checkpoints.codex.lastScannedAt ?? "not yet scanned"}, claude=${state.checkpoints.claude.lastScannedAt ?? "not yet scanned"}`;
}

export async function runStatusCommand(
  options: RunStatusCommandOptions = {}
): Promise<StatusCommandResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const stdout = options.stdout ?? process.stdout;
  const config = parseStatusCommandConfig(
    await readJsonFile(join(cwd, CONFIG_PATH))
  );
  const state = parseAgentBadgeState(await readJsonFile(join(cwd, STATE_PATH)));
  const report = [
    "agent-badge status",
    `- Totals: ${formatTotalsLine(state)}`,
    `- Providers: ${formatProvidersLine(config)}`,
    `- Publish: ${formatPublishLine(config, state)}`,
    `- Last refresh: ${formatLastRefreshLine(state)}`,
    `- Checkpoints: ${formatCheckpointsLine(state)}`
  ].join("\n");

  stdout.write(`${report}\n`);

  return {
    config,
    state,
    report
  };
}
