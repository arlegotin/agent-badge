import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  buildSharedRuntimeRemediation,
  createGitHubGistClient,
  derivePrePushPolicyConsequence,
  derivePrePushPolicyReport,
  derivePublishTrustReport,
  deriveRecoveryPlan,
  formatPrePushPolicyLine,
  formatPublishTrustStatus,
  formatEstimatedCostUsd,
  inspectSharedRuntime,
  inspectSharedPublishHealth,
  inspectPublishReadiness,
  parseAgentBadgeState,
  type AgentBadgeState,
  type GitHubGistClient,
  type SharedRuntimeInspection,
  type SharedPublishHealthReport
} from "@legotin/agent-badge-core";

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
    readonly provider: "github-gist";
    readonly gistId: string | null;
    readonly badgeUrl: string | null;
  };
  readonly refresh: {
    readonly prePush: {
      readonly enabled: boolean;
      readonly mode: "fail-soft" | "strict";
    };
  };
  readonly privacy: {
    readonly output: PrivacyOutput;
  };
}

export interface RunStatusCommandOptions {
  readonly cwd?: string;
  readonly gistClient?: GitHubGistClient;
  readonly runtimeEnv?: NodeJS.ProcessEnv;
  readonly stdout?: OutputWriter;
}

export interface StatusCommandResult {
  readonly config: StatusCommandConfig;
  readonly state: AgentBadgeState;
  readonly report: string;
}

const CONFIG_PATH = ".agent-badge/config.json";
const STATE_PATH = ".agent-badge/state.json";

function buildSharedIssueCounts(
  sharedHealth: SharedPublishHealthReport
): Array<[string, number]> {
  const counts: Array<[string, number]> = [];

  if (sharedHealth.issues.includes("legacy-no-contributors")) {
    counts.push(["legacy-no-contributors", 1]);
  }

  if (sharedHealth.issues.includes("missing-shared-overrides")) {
    counts.push(["missing-shared-overrides", 1]);
  }

  if (sharedHealth.issues.includes("missing-local-contributor")) {
    counts.push(["missing-local-contributor", 1]);
  }

  if (sharedHealth.issues.includes("stale-contributor")) {
    counts.push(["stale-contributor", sharedHealth.stalePublisherIds.length]);
  }

  if (sharedHealth.issues.includes("conflicting-session-observations")) {
    counts.push([
      "conflicting-session-observations",
      sharedHealth.conflictingSessionCount
    ]);
  }

  return counts.filter(([, count]) => count > 0);
}

async function inspectSharedMode(options: {
  readonly config: StatusCommandConfig;
  readonly state: AgentBadgeState;
  readonly gistClient: GitHubGistClient;
}): Promise<{
  readonly lines: readonly string[];
  readonly report: SharedPublishHealthReport | null;
}> {
  if (options.config.publish.gistId === null) {
    return {
      lines: ["- Shared mode: unavailable (gist not configured)"],
      report: null
    };
  }

  try {
    const gist = await options.gistClient.getGist(options.config.publish.gistId);
    const sharedHealth = inspectSharedPublishHealth({
      gist,
      state: options.state,
      now: new Date().toISOString()
    });
    const lines = [
      `- Shared mode: ${sharedHealth.mode} | health=${sharedHealth.status} | contributors=${sharedHealth.remoteContributorCount}`
    ];
    const issueCounts = buildSharedIssueCounts(sharedHealth);

    if (issueCounts.length > 0) {
      lines.push(
        `- Shared issues: ${issueCounts
          .map(([issueId, count]) => `${issueId}=${count}`)
          .join(", ")}`
      );
    }

    return {
      lines,
      report: sharedHealth
    };
  } catch {
    return {
      lines: ["- Shared mode: unavailable (unable to inspect shared publish state)"],
      report: null
    };
  }
}

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
  const refresh = asObject(root.refresh, "refresh");
  const prePush = asObject(refresh.prePush, "refresh.prePush");
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
      provider: publish.provider === "github-gist" ? "github-gist" : "github-gist",
      gistId: readNullableString(publish.gistId, "publish.gistId", null),
      badgeUrl: readNullableString(publish.badgeUrl, "publish.badgeUrl", null)
    },
    refresh: {
      prePush: {
        enabled: readBoolean(
          prePush.enabled,
          "refresh.prePush.enabled",
          true
        ),
        mode: prePush.mode === "strict" ? "strict" : "fail-soft"
      }
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

  const estimatedCost =
    state.refresh.summary.includedEstimatedCostUsdMicros === null
      ? ""
      : `, ~${formatEstimatedCostUsd(
          state.refresh.summary.includedEstimatedCostUsdMicros
        )} estimated`;

  return `${state.refresh.summary.includedSessions} sessions, ${state.refresh.summary.includedTokens} tokens${estimatedCost}`;
}

function formatProvidersLine(config: StatusCommandConfig): string {
  return `codex=${config.providers.codex.enabled ? "enabled" : "disabled"}, claude=${config.providers.claude.enabled ? "enabled" : "disabled"}`;
}

function formatSharedRuntimeLine(
  inspection: SharedRuntimeInspection
): string {
  const remediation = buildSharedRuntimeRemediation().split("\n").join(" | ");

  switch (inspection.status) {
    case "available":
      return `- Shared runtime: available (${inspection.version})`;
    case "missing":
      return `- Shared runtime: missing. ${remediation}`;
    case "broken":
      return `- Shared runtime: unavailable. ${remediation}`;
  }
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

function buildPublishTrustLines(state: AgentBadgeState): string[] {
  const trustReport = derivePublishTrustReport({
    state,
    now: new Date().toISOString()
  });
  const lines = [
    `- Live badge trust: ${formatPublishTrustStatus(trustReport.status)}`
  ];

  if (
    trustReport.lastPublishedAt !== null &&
    trustReport.status !== "not-attempted"
  ) {
    lines.push(
      `- Last successful badge update: ${trustReport.lastPublishedAt}`
    );
  }

  return lines;
}

function buildPrePushPolicyLines(
  config: StatusCommandConfig,
  state: AgentBadgeState
): string[] {
  const report = derivePrePushPolicyReport({
    config,
    state,
    now: new Date().toISOString()
  });
  const consequence = derivePrePushPolicyConsequence(report);
  const lines = [`- ${formatPrePushPolicyLine(report.policy)}`];

  if (consequence.level === "warning" && consequence.message !== null) {
    lines.push(`- Warning: ${consequence.message}`);
  } else if (consequence.level === "blocking" && consequence.message !== null) {
    lines.push(`- Blocking: ${consequence.message}`);
  }

  return lines;
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
  const gistClient = options.gistClient ?? createGitHubGistClient();
  const config = parseStatusCommandConfig(
    await readJsonFile(join(cwd, CONFIG_PATH))
  );
  const state = parseAgentBadgeState(await readJsonFile(join(cwd, STATE_PATH)));
  const runtime = inspectSharedRuntime(options.runtimeEnv ?? process.env);
  const trustReport = derivePublishTrustReport({
    state,
    now: new Date().toISOString()
  });
  const sharedMode = await inspectSharedMode({
    config,
    state,
    gistClient
  });
  const recoveryPlan = deriveRecoveryPlan({
    readiness: inspectPublishReadiness({
      config,
      state
    }),
    trust: trustReport,
    sharedHealth: sharedMode.report
  });
  const hideLegacyMigrationRecoveryLine =
    recoveryPlan.reasonCodes.includes("legacy-no-contributors") &&
    recoveryPlan.reasonCodes.includes("ready") &&
    (recoveryPlan.reasonCodes.includes("current") ||
      recoveryPlan.reasonCodes.includes("unchanged"));
  const report = [
    "agent-badge status",
    `- Totals: ${formatTotalsLine(state)}`,
    `- Providers: ${formatProvidersLine(config)}`,
    formatSharedRuntimeLine(runtime),
    `- Publish: ${formatPublishLine(config, state)}`,
    ...buildPrePushPolicyLines(config, state),
    ...buildPublishTrustLines(state),
    ...sharedMode.lines,
    ...(recoveryPlan.status === "healthy" ||
    recoveryPlan.primaryAction === null ||
    hideLegacyMigrationRecoveryLine
      ? []
      : [`- Recovery: ${recoveryPlan.primaryAction}`]),
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
