import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  AGENT_BADGE_GIST_FILE
} from "../publish/badge-url.js";
import { buildEndpointBadgePayload } from "../publish/badge-payload.js";
import {
  derivePrePushPolicyConsequence,
  derivePrePushPolicyReport,
  formatPrePushPolicyLine,
  derivePublishTrustReport,
  formatPublishTrustStatus
} from "../publish/index.js";
import { inspectPublishReadiness } from "../publish/publish-readiness.js";
import {
  AGENT_BADGE_README_END_MARKER,
  AGENT_BADGE_README_START_MARKER
} from "../publish/readme-badge.js";
import {
  createGitHubGistClient,
  type GitHubGistClient
} from "../publish/github-gist-client.js";
import {
  inspectSharedPublishHealth,
  type SharedPublishHealthReport
} from "../publish/shared-health.js";
import { parseAgentBadgeConfig, type AgentBadgeConfig } from "../config/config-schema.js";
import {
  agentBadgeHookEndMarker,
  agentBadgeHookStartMarker
} from "../init/runtime-wiring.js";
import { runInitPreflight, type InitPreflightResult } from "../init/preflight.js";
import { parseAgentBadgeState, type AgentBadgeState } from "../state/state-schema.js";

export type DoctorCheckStatus = "pass" | "warn" | "fail";

export interface DoctorCheck {
  readonly id: string;
  readonly status: DoctorCheckStatus;
  readonly message: string;
  readonly detail: string;
  readonly fix: readonly string[];
}

export interface DoctorCheckResult {
  readonly id: string;
  readonly status: DoctorCheckStatus;
  readonly message: string;
  readonly detail: string;
  readonly fix: readonly string[];
}

export interface RunDoctorChecksResult {
  readonly checks: readonly DoctorCheck[];
  readonly total: number;
  readonly passCount: number;
  readonly warnCount: number;
  readonly failCount: number;
  readonly overallStatus: DoctorCheckStatus;
}

export interface RunDoctorChecksOptions {
  readonly cwd?: string;
  readonly homeRoot?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly gistClient?: GitHubGistClient;
  readonly runProbeWrite?: boolean;
}

type ParseOutcome<T> = {
  readonly value: T | null;
  readonly parseFailed: boolean;
  readonly missing: boolean;
};

const CONFIG_PATH = ".agent-badge/config.json";
const STATE_PATH = ".agent-badge/state.json";
const PRE_PUSH_HOOK_PATH = ".git/hooks/pre-push";
const CHECK_IDS = [
  "git",
  "providers",
  "scan-access",
  "publish-auth",
  "publish-write",
  "publish-shields",
  "publish-trust",
  "shared-mode",
  "shared-health",
  "readme-badge",
  "pre-push-hook"
] as const;
const authEnvVars = ["GH_TOKEN", "GITHUB_TOKEN", "GITHUB_PAT"] as const;

function buildFix(messages: string[]): readonly string[] {
  return [...messages];
}

function countOccurrences(content: string, token: string): number {
  if (token.length === 0) {
    return 0;
  }

  return content.split(token).length - 1;
}

function gistHasFile(
  files: Record<string, unknown> | readonly string[],
  fileName: string
): boolean {
  return Array.isArray(files) ? files.includes(fileName) : fileName in files;
}

function resolveAuthToken(env?: NodeJS.ProcessEnv): string | undefined {
  const activeEnv = env ?? process.env;

  for (const envVar of authEnvVars) {
    const value = activeEnv?.[envVar];

    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function buildMissingPublishTargetFix(): readonly string[] {
  return buildFix(["Run `agent-badge init --gist-id <id>` to reconnect publish targets."]);
}

async function readJsonFile<T>(path: string): Promise<ParseOutcome<T>> {
  try {
    const rawContent = await readFile(path, "utf8");

    return {
      value: JSON.parse(rawContent) as T,
      parseFailed: false,
      missing: false
    };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return {
        value: null,
        parseFailed: false,
        missing: true
      };
    }

    throw error;
  }
}

async function readPersistedConfig(cwd: string): Promise<{
  readonly config: AgentBadgeConfig | null;
  readonly configMissing: boolean;
  readonly configInvalid: boolean;
}> {
  const configPath = join(cwd, CONFIG_PATH);
  const rawConfig = await readJsonFile<unknown>(configPath);
  let parsedConfig: AgentBadgeConfig | null = null;
  let configInvalid = false;

  if (!rawConfig.missing && !rawConfig.parseFailed) {
    try {
      parsedConfig = parseAgentBadgeConfig(rawConfig.value);
    } catch {
      configInvalid = true;
    }
  }

  return {
    config: parsedConfig,
    configMissing: rawConfig.missing,
    configInvalid
  };
}

async function readPersistedState(cwd: string): Promise<{
  readonly state: AgentBadgeState | null;
  readonly stateMissing: boolean;
  readonly stateInvalid: boolean;
}> {
  const statePath = join(cwd, STATE_PATH);
  const rawState = await readJsonFile<unknown>(statePath);
  let parsedState: AgentBadgeState | null = null;
  let stateInvalid = false;

  if (!rawState.missing && !rawState.parseFailed) {
    try {
      parsedState = parseAgentBadgeState(rawState.value);
    } catch {
      stateInvalid = true;
    }
  }

  return {
    state: parsedState,
    stateMissing: rawState.missing,
    stateInvalid
  };
}

async function readTextFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function checkGit(preflight: InitPreflightResult): DoctorCheck {
  if (!preflight.git.isRepo) {
    if (!preflight.git.canInitialize) {
      return {
        id: "git",
        status: "fail",
        message: "Repository bootstrap is blocked",
        detail:
          preflight.git.blockingMessage ??
          "This directory cannot be prepared for repository checks safely.",
        fix: buildFix(["Run `git init` or use `agent-badge init` when initialization is allowed."])
      };
    }

    return {
      id: "git",
      status: "warn",
      message: "Not currently a git repository",
      detail: "Re-run with a git-enabled directory for complete integration checks.",
      fix: buildFix(["Run `git init` or `agent-badge init` to add repository context."])
    };
  }

  return {
    id: "git",
    status: preflight.git.hasOrigin ? "pass" : "warn",
    message: preflight.git.hasOrigin
      ? "Git repository detected"
      : "Git repository detected without remote origin",
    detail: preflight.git.hasOrigin
      ? "Origin was detected and can be used for repo attribution."
      : "No remote origin was detected yet; this is often recoverable.",
    fix: preflight.git.hasOrigin
      ? []
      : buildFix(["Run `git remote add origin <url>` and then rerun doctor if needed."])
  };
}

function checkProviders(preflight: InitPreflightResult): DoctorCheck {
  const { codex, claude } = preflight.providers;

  if (!codex.available && !claude.available) {
    return {
      id: "providers",
      status: "fail",
      message: "No local provider data detected",
      detail: `Detected homes: codex=${codex.available ? "yes" : "no"}, claude=${claude.available ? "yes" : "no"}`,
      fix: buildFix([
        "Enable local usage traces for at least one supported provider under ~/.codex or ~/.claude."
      ])
    };
  }

  if (!codex.available || !claude.available) {
    return {
      id: "providers",
      status: "warn",
      message: "Partial provider data detected",
      detail: `Detected homes: codex=${codex.available ? "yes" : "no"}, claude=${claude.available ? "yes" : "no"}`,
      fix: buildFix(["Enable missing provider data and rerun `agent-badge init` for full coverage."])
    };
  }

  return {
    id: "providers",
    status: "pass",
    message: "Provider directories detected",
    detail: `Detected homes: codex=${codex.available ? "yes" : "no"}, claude=${claude.available ? "yes" : "no"}`,
    fix: []
  };
}

async function checkScanAccess(preflight: InitPreflightResult): Promise<DoctorCheck> {
  if (!preflight.providers.codex.available && !preflight.providers.claude.available) {
    return {
      id: "scan-access",
      status: "warn",
      message: "No provider directories found for scan-readiness",
      detail: "Scan health depends on local provider usage directories under ~/.codex and ~/.claude.",
      fix: buildFix(["Enable provider directories and rerun `agent-badge doctor`."])
    };
  }

  return {
    id: "scan-access",
    status: "pass",
    message: "Scan-ready provider directories available",
    detail: `Provider access check passed for codex=${preflight.providers.codex.available ? "yes" : "no"}, claude=${preflight.providers.claude.available ? "yes" : "no"}`,
    fix: []
  };
}

function checkPublishAuth(preflight: InitPreflightResult): DoctorCheck {
  const readiness = inspectPublishReadiness({
    githubAuth: preflight.githubAuth
  });

  if (readiness.status === "auth-missing") {
    return {
      id: "publish-auth",
      status: "warn",
      message: "GitHub auth was not detected",
      detail: "Publish checks cannot verify write access without an auth token.",
      fix: readiness.fix
    };
  }

  return {
    id: "publish-auth",
    status: "pass",
    message: `GitHub auth detected (${preflight.githubAuth.source})`,
    detail: "GitHub auth token is available for credential checks.",
    fix: []
  };
}

function buildPublishTrustFix(options: {
  readonly config: AgentBadgeConfig | null;
  readonly state: AgentBadgeState;
  readonly status:
    | "current"
    | "failed-but-unchanged"
    | "unchanged"
    | "not-attempted"
    | "stale-failed-publish"
    | "unknown";
}): readonly string[] {
  const fixes = new Set<string>();
  const publishTargetMissing =
    options.config === null ||
    options.config.publish.gistId === null ||
    options.config.publish.badgeUrl === null;

  if (publishTargetMissing || options.status === "not-attempted") {
    fixes.add("Run `agent-badge init --gist-id <id>` to reconnect publish targets.");
  }

  if (
    options.status === "stale-failed-publish" ||
    options.status === "failed-but-unchanged" ||
    options.status === "unknown"
  ) {
    fixes.add(
      "Retry publish from the machine with the latest local state by rerunning `agent-badge refresh`."
    );
  }

  if (options.status === "stale-failed-publish") {
    fixes.add(
      "If publish still fails, reconnect the gist target and rerun `agent-badge refresh`."
    );
  }

  return [...fixes];
}

function checkPublishTrust(options: {
  readonly config: AgentBadgeConfig | null;
  readonly state: AgentBadgeState | null;
  readonly stateMissing: boolean;
  readonly stateInvalid: boolean;
}): DoctorCheck {
  if (options.stateMissing) {
    return {
      id: "publish-trust",
      status: "warn",
      message: "Live badge trust could not be inspected",
      detail: "No valid .agent-badge/state.json was found.",
      fix: buildFix(["Run `agent-badge init` to recreate persisted state."])
    };
  }

  if (options.stateInvalid || options.state === null) {
    return {
      id: "publish-trust",
      status: "warn",
      message: "Live badge trust could not be inspected",
      detail: "Live badge trust requires a valid .agent-badge/state.json file.",
      fix: buildFix(["Run `agent-badge init` to repair persisted state."])
    };
  }

  const report = derivePublishTrustReport({
    state: options.state,
    now: new Date().toISOString()
  });
  const detailParts = [
    `Last refresh=${options.state.refresh.lastRefreshedAt ?? "unavailable"}`,
    `last published=${options.state.publish.lastPublishedAt ?? "unavailable"}`
  ];

  let status: DoctorCheckStatus = "pass";

  if (report.status === "stale-failed-publish") {
    status = "fail";
  } else if (
    report.status === "failed-but-unchanged" ||
    report.status === "not-attempted" ||
    report.status === "unknown"
  ) {
    status = "warn";
  }

  return {
    id: "publish-trust",
    status,
    message: `Live badge trust: ${formatPublishTrustStatus(report.status)}`,
    detail: detailParts.join(" | "),
    fix:
      status === "pass"
        ? []
        : buildPublishTrustFix({
            config: options.config,
            state: options.state,
            status: report.status
          })
  };
}

function normalizeBadgeUrl(badgeUrl: string): string | null {
  try {
    const parsed = new URL(badgeUrl);

    return parsed.searchParams.get("url");
  } catch {
    return null;
  }
}

function defaultEndpointPayload(): string {
  return `${JSON.stringify(
    buildEndpointBadgePayload({
      label: "Vibe budget",
      mode: "combined",
      includedTotals: {
        sessions: 0,
        tokens: 0,
        estimatedCostUsdMicros: 0
      }
    }),
    null,
    2
  )}\n`;
}

async function readPersistedBadgePayload(
  badgeUrl: string | null
): Promise<string> {
  const rawUrl = badgeUrl === null ? null : normalizeBadgeUrl(badgeUrl);

  if (rawUrl === null) {
    return defaultEndpointPayload();
  }

  const response = await fetch(rawUrl);

  if (!response.ok) {
    return defaultEndpointPayload();
  }

  return response.text();
}

async function checkPublishWrite(options: {
  readonly config: AgentBadgeConfig | null;
  readonly gistClient: GitHubGistClient;
  readonly runProbeWrite?: boolean;
}): Promise<DoctorCheck> {
  if (options.config === null) {
    return {
      id: "publish-write",
      status: "fail",
      message: "Publish configuration is missing",
      detail: "No valid .agent-badge/config.json was found.",
      fix: buildFix(["Run `agent-badge init` to create publish configuration."])
    };
  }

  if (options.config.publish.gistId === null || options.config.publish.badgeUrl === null) {
    const readiness = inspectPublishReadiness({
      config: options.config
    });

    return {
      id: "publish-write",
      status: "warn",
      message: "Publish target is not connected",
      detail: "Gist ID and badge endpoint have not both been configured.",
      fix: readiness.fix
    };
  }

  try {
    const gist = await options.gistClient.getGist(options.config.publish.gistId);

    if (!gist.public) {
      const readiness = inspectPublishReadiness({
        target: {
          status: "deferred",
          gistId: null,
          badgeUrl: null,
          reason: "gist-not-public"
        }
      });

      return {
        id: "publish-write",
        status: "fail",
        message: "Configured Gist is private",
        detail: "Shields endpoints and publish recovery require a public gist.",
        fix: readiness.fix
      };
    }

    if (!gistHasFile(gist.files, AGENT_BADGE_GIST_FILE)) {
      const readiness = inspectPublishReadiness({
        target: {
          status: "deferred",
          gistId: null,
          badgeUrl: null,
          reason: "gist-unreachable"
        }
      });

      return {
        id: "publish-write",
        status: "warn",
        message: "Configured gist is missing the expected payload filename",
        detail: `Expected ${AGENT_BADGE_GIST_FILE} in ${options.config.publish.gistId}.`,
        fix: readiness.fix
      };
    }

    if (options.runProbeWrite) {
      const existingPayload = await readPersistedBadgePayload(
        options.config.publish.badgeUrl
      );

      await options.gistClient.updateGistFile({
        gistId: options.config.publish.gistId,
        files: {
          [AGENT_BADGE_GIST_FILE]: {
            content: existingPayload
          }
        }
      });

      return {
        id: "publish-write",
        status: "pass",
        message: "Publish write probe succeeded",
        detail: "Gist credentials allow overwrite of the existing badge payload file.",
        fix: []
      };
    }

    return {
      id: "publish-write",
      status: "pass",
      message: "Publish target is reachable",
      detail: "Configured gist can be read and validated.",
      fix: []
    };
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : ".";
    const readiness = inspectPublishReadiness({
      target: {
        status: "deferred",
        gistId: null,
        badgeUrl: null,
        reason: "gist-unreachable"
      }
    });

    return {
      id: "publish-write",
      status: options.config.publish.gistId === null ? "warn" : "fail",
      message: "Unable to validate configured gist",
      detail: `Readback check failed${detail}`,
      fix: readiness.fix
    };
  }
}

async function checkPublishShields(
  config: AgentBadgeConfig | null,
  runProbeWrite: boolean
): Promise<DoctorCheck> {
  if (config === null || config.publish.badgeUrl === null) {
    return {
      id: "publish-shields",
      status: "warn",
      message: "Shields URL is not configured",
      detail: "Initialize publish settings to generate a stable badge URL.",
      fix: buildFix(["Run `agent-badge init` to configure a publish target."])
    };
  }

  if (runProbeWrite) {
    return {
      id: "publish-shields",
      status: "pass",
      message: "Shields check skipped during probe-write run",
      detail: "Use normal doctor mode to validate endpoint reachability.",
      fix: []
    };
  }

  try {
    const response = await fetch(config.publish.badgeUrl, { method: "GET" });

    if (!response.ok) {
      return {
        id: "publish-shields",
        status: "fail",
        message: "Shields endpoint is not reachable",
        detail: `GET ${config.publish.badgeUrl} returned ${response.status}.`,
        fix: buildFix(["Verify badge URL and network connectivity, then rerun doctor."])
      };
    }

    return {
      id: "publish-shields",
      status: "pass",
      message: "Shields URL is reachable",
      detail: `Checked ${config.publish.badgeUrl}.`,
      fix: []
    };
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : ".";

    return {
      id: "publish-shields",
      status: "warn",
      message: "Unable to validate Shields endpoint",
      detail: `Attempted GET ${config.publish.badgeUrl} without success${detail}`,
      fix: buildFix(["Verify network access and rerun `agent-badge doctor`."])
    };
  }
}

interface SharedPublishInspection {
  readonly report: SharedPublishHealthReport | null;
  readonly detail: string;
  readonly fix: readonly string[];
}

function buildSharedInspectionFixes(report: SharedPublishHealthReport | null): readonly string[] {
  if (report === null) {
    return buildFix([
      "Run `agent-badge init` to reconnect publish state, then rerun `agent-badge doctor`."
    ]);
  }

  const fixes = new Set<string>();

  if (report.mode === "legacy") {
    fixes.add(
      "Run `agent-badge init` on the original publisher machine to migrate existing single-writer repos."
    );
  }

  if (report.issues.includes("missing-shared-overrides")) {
    fixes.add("Run `agent-badge init` to repair shared publish metadata.");
  }

  if (report.issues.includes("missing-local-contributor")) {
    fixes.add("Run `agent-badge refresh` to recreate the local contributor record.");
    fixes.add(
      "If this repo is migrating from legacy publish state, migrate from the original publisher machine by rerunning `agent-badge init`."
    );
  }

  if (report.issues.includes("stale-contributor")) {
    fixes.add(
      "Run `agent-badge refresh` on stale contributor machines to update shared observations."
    );
  }

  if (report.issues.includes("conflicting-session-observations")) {
    fixes.add(
      "Run `agent-badge refresh` on contributors that recently published, then rerun `agent-badge doctor`."
    );
  }

  return [...fixes];
}

async function inspectSharedPublishState(options: {
  readonly config: AgentBadgeConfig | null;
  readonly state: AgentBadgeState | null;
  readonly configMissing: boolean;
  readonly configInvalid: boolean;
  readonly stateMissing: boolean;
  readonly stateInvalid: boolean;
  readonly gistClient: GitHubGistClient;
}): Promise<SharedPublishInspection> {
  if (options.configMissing) {
    return {
      report: null,
      detail: "No valid .agent-badge/config.json was found.",
      fix: buildFix(["Run `agent-badge init` to create publish configuration."])
    };
  }

  if (options.configInvalid || options.config === null) {
    return {
      report: null,
      detail: "Shared publish inspection requires a valid .agent-badge/config.json file.",
      fix: buildFix(["Run `agent-badge init` to repair publish configuration."])
    };
  }

  if (options.stateMissing) {
    return {
      report: null,
      detail: "No valid .agent-badge/state.json was found.",
      fix: buildFix(["Run `agent-badge init` to recreate persisted state."])
    };
  }

  if (options.stateInvalid || options.state === null) {
    return {
      report: null,
      detail: "Shared publish inspection requires a valid .agent-badge/state.json file.",
      fix: buildFix(["Run `agent-badge init` to repair persisted state."])
    };
  }

  if (options.config.publish.gistId === null || options.config.publish.badgeUrl === null) {
    return {
      report: null,
      detail: "Gist ID and badge endpoint have not both been configured.",
      fix: buildFix(["Run `agent-badge init` to connect or create a publish target."])
    };
  }

  try {
    const gist = await options.gistClient.getGist(options.config.publish.gistId);
    const report = inspectSharedPublishHealth({
      gist,
      state: options.state,
      now: new Date().toISOString()
    });

    return {
      report,
      detail: `Shared mode: ${report.mode} | health=${report.status} | contributors=${report.remoteContributorCount}.`,
      fix: buildSharedInspectionFixes(report)
    };
  } catch (error) {
    const detail = error instanceof Error ? `Unable to inspect shared publish state: ${error.message}` : "Unable to inspect shared publish state.";

    return {
      report: null,
      detail,
      fix: buildFix([
        "Verify gist access and rerun `agent-badge doctor` after publish wiring is reachable."
      ])
    };
  }
}

function checkSharedMode(inspection: SharedPublishInspection): DoctorCheck {
  if (inspection.report === null) {
    return {
      id: "shared-mode",
      status: "warn",
      message: "Shared publish mode could not be determined",
      detail: inspection.detail,
      fix: inspection.fix
    };
  }

  if (inspection.report.mode === "legacy") {
    return {
      id: "shared-mode",
      status: "warn",
      message: "Repo is still in legacy publish mode",
      detail: inspection.detail,
      fix: inspection.fix
    };
  }

  return {
    id: "shared-mode",
    status: "pass",
    message: "Repo is using shared publish mode",
    detail: inspection.detail,
    fix: []
  };
}

function checkSharedHealth(inspection: SharedPublishInspection): DoctorCheck {
  if (inspection.report === null) {
    return {
      id: "shared-health",
      status: "warn",
      message: "Shared publish health could not be inspected",
      detail: inspection.detail,
      fix: inspection.fix
    };
  }

  if (inspection.report.mode === "legacy") {
    return {
      id: "shared-health",
      status: "pass",
      message: "Shared contributor health is not active until migration completes",
      detail: inspection.detail,
      fix: []
    };
  }

  if (inspection.report.status === "healthy") {
    return {
      id: "shared-health",
      status: "pass",
      message: "Shared contributor state is healthy",
      detail: inspection.detail,
      fix: []
    };
  }

  if (inspection.report.status === "stale") {
    return {
      id: "shared-health",
      status: "warn",
      message: "Shared mode is stale",
      detail: inspection.detail,
      fix: inspection.fix
    };
  }

  const message =
    inspection.report.status === "conflict"
      ? "Shared mode reports conflicts"
      : inspection.report.status === "partial"
        ? "Shared mode is partially migrated"
        : "Shared mode is orphaned";

  return {
    id: "shared-health",
    status: "fail",
    message,
    detail: inspection.detail,
    fix: inspection.fix
  };
}

async function checkReadme(
  cwd: string,
  preflight: InitPreflightResult
): Promise<DoctorCheck> {
  if (!preflight.readme.exists || preflight.readme.fileName === null) {
    return {
      id: "readme-badge",
      status: "warn",
      message: "README file was not found",
      detail: "Badge marker checks require a README file.",
      fix: buildFix(["Add a README and run `agent-badge init` to insert one managed badge block."])
    };
  }

  try {
    const content = await readTextFile(join(cwd, preflight.readme.fileName));

    if (content === null) {
      return {
        id: "readme-badge",
        status: "warn",
        message: "README file could not be read",
        detail: "The detected README exists but was not readable.",
        fix: buildFix(["Check README permissions and rerun `agent-badge doctor`."])
      };
    }

    const startCount = countOccurrences(content, AGENT_BADGE_README_START_MARKER);
    const endCount = countOccurrences(content, AGENT_BADGE_README_END_MARKER);

    if (startCount === 1 && endCount === 1) {
      return {
        id: "readme-badge",
        status: "pass",
        message: "README badge marker is present exactly once",
        detail: `${preflight.readme.fileName} contains one managed badge block.`,
        fix: []
      };
    }

    if (startCount === 0 && endCount === 0) {
      return {
        id: "readme-badge",
        status: "warn",
        message: "README badge marker is missing",
        detail: `${preflight.readme.fileName} exists but has no managed badge block.`,
        fix: buildFix(["Run `agent-badge init` to insert the managed badge block."])
      };
    }

    return {
      id: "readme-badge",
      status: "fail",
      message: "README badge markers are malformed",
      detail: `Found ${startCount} start marker(s) and ${endCount} end marker(s).`,
      fix: buildFix(["Run `agent-badge init` to repair the managed README marker block."])
    };
  } catch {
    return {
      id: "readme-badge",
      status: "warn",
      message: "Unable to inspect README badge block",
      detail: "Read attempt failed during badge marker inspection.",
      fix: buildFix(["Verify README readability and rerun `agent-badge doctor`."])
    };
  }
}

async function checkHook(
  cwd: string,
  _preflight: InitPreflightResult,
  config: AgentBadgeConfig | null,
  state: AgentBadgeState | null
): Promise<DoctorCheck> {
  const hookPath = join(cwd, PRE_PUSH_HOOK_PATH);
  const hookContent = await readTextFile(hookPath);
  const shouldHaveHook = config?.refresh.prePush.enabled !== false;
  const policyLine =
    config === null
      ? "Pre-push policy: unavailable"
      : formatPrePushPolicyLine(config.refresh.prePush.mode);
  const policyReport =
    config !== null && state !== null
      ? derivePrePushPolicyReport({
          config,
          state,
          now: new Date().toISOString()
        })
      : null;
  const policyConsequence =
    policyReport === null ? null : derivePrePushPolicyConsequence(policyReport);
  const policyDetail =
    policyConsequence?.message === null || typeof policyConsequence?.message !== "string"
      ? policyLine
      : `${policyLine} | ${policyConsequence.message}`;

  if (hookContent === null) {
    return {
      id: "pre-push-hook",
      status: shouldHaveHook ? "warn" : "pass",
      message: shouldHaveHook
        ? "pre-push hook file is missing"
        : "pre-push hook file is intentionally not required",
      detail: shouldHaveHook
        ? `${policyDetail} | Re-run init to install the managed hook block.`
        : `${policyLine} | pre-push hook was intentionally disabled in configuration.`,
      fix: shouldHaveHook
        ? buildFix(["Run `agent-badge init` to install the managed pre-push hook."])
        : []
    };
  }

  const startCount = countOccurrences(hookContent, agentBadgeHookStartMarker);
  const endCount = countOccurrences(hookContent, agentBadgeHookEndMarker);

  if (startCount !== 1 || endCount !== 1) {
    return {
      id: "pre-push-hook",
      status: "fail",
      message: "Managed pre-push hook block is malformed",
      detail: `${policyLine} | Found ${startCount} start marker(s) and ${endCount} end marker(s).`,
      fix: buildFix(["Run `agent-badge init` to repair managed hook state."])
    };
  }

  const managedContent = hookContent
    .split(agentBadgeHookStartMarker)[1]
    .split(agentBadgeHookEndMarker)[0]
    .trim();

  const invokesRefresh =
    managedContent.includes("agent-badge refresh --hook pre-push") ||
    managedContent.includes("agent-badge:refresh");

  if (!invokesRefresh) {
    return {
      id: "pre-push-hook",
      status: "warn",
      message: "Managed pre-push hook exists but is not wired",
      detail: `${policyLine} | Managed block was detected but does not invoke the refresh command.`,
      fix: buildFix(["Run `agent-badge init` to repair managed hook wiring."])
    };
  }

  if (config !== null && managedContent.includes("agent-badge:refresh")) {
    const expectsFailSoftFallback = config.refresh.prePush.mode === "fail-soft";
    const hasFailSoftFallback = managedContent.includes("|| true");

    if (expectsFailSoftFallback !== hasFailSoftFallback) {
      return {
        id: "pre-push-hook",
        status: "warn",
        message: "Managed pre-push hook policy does not match configuration",
        detail: `${policyLine} | Managed hook fallback does not match the configured pre-push policy.`,
        fix: buildFix(["Run `agent-badge init` to repair managed hook wiring."])
      };
    }
  }

  return {
    id: "pre-push-hook",
    status: "pass",
    message: "pre-push hook is wired",
    detail: `${policyDetail} | Managed hook block is present and invokes refresh.`,
    fix: []
  };
}

function summarizeChecks(checks: readonly DoctorCheck[]): {
  readonly total: number;
  readonly passCount: number;
  readonly warnCount: number;
  readonly failCount: number;
  readonly overallStatus: DoctorCheckStatus;
} {
  const total = checks.length;
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  for (const check of checks) {
    if (check.status === "pass") {
      passCount += 1;
    } else if (check.status === "warn") {
      warnCount += 1;
    } else {
      failCount += 1;
    }
  }

  const overallStatus: DoctorCheckStatus =
    failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "pass";

  return {
    total,
    passCount,
    warnCount,
    failCount,
    overallStatus
  };
}

export async function runDoctorChecks(
  options: RunDoctorChecksOptions = {}
): Promise<RunDoctorChecksResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const preflight = await runInitPreflight({
    cwd,
    homeRoot: options.homeRoot,
    env: options.env
  });
  const persisted = await readPersistedConfig(cwd);
  const persistedState = await readPersistedState(cwd);
  const gistClient =
    options.gistClient ??
    createGitHubGistClient({
      authToken: resolveAuthToken(options.env)
    });

  const checks: DoctorCheck[] = [];

  checks.push(checkGit(preflight));
  checks.push(checkProviders(preflight));
  checks.push(await checkScanAccess(preflight));
  checks.push(checkPublishAuth(preflight));
  checks.push(
    await checkPublishWrite({
      config: persisted.config,
      gistClient,
      runProbeWrite: options.runProbeWrite
    })
  );
  checks.push(
    await checkPublishShields(persisted.config, options.runProbeWrite ?? false)
  );
  checks.push(
    checkPublishTrust({
      config: persisted.config,
      state: persistedState.state,
      stateMissing: persistedState.stateMissing,
      stateInvalid: persistedState.stateInvalid
    })
  );
  const sharedInspection = await inspectSharedPublishState({
    config: persisted.config,
    state: persistedState.state,
    configMissing: persisted.configMissing,
    configInvalid: persisted.configInvalid,
    stateMissing: persistedState.stateMissing,
    stateInvalid: persistedState.stateInvalid,
    gistClient
  });
  checks.push(checkSharedMode(sharedInspection));
  checks.push(checkSharedHealth(sharedInspection));
  checks.push(await checkReadme(cwd, preflight));
  checks.push(
    await checkHook(cwd, preflight, persisted.config, persistedState.state)
  );

  for (const [index, check] of checks.entries()) {
    if (check.id !== CHECK_IDS[index]) {
      throw new Error(
        `Doctor check ordering regression: expected ${CHECK_IDS[index]}, found ${check.id}`
      );
    }
  }

  const summary = summarizeChecks(checks);

  return {
    checks,
    ...summary
  };
}
