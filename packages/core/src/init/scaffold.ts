import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  parseAgentBadgeConfig,
  type AgentBadgeBadgeMode,
  type AgentBadgeConfig,
  type AgentBadgeRefreshMode
} from "../config/config-schema.js";
import {
  parseAgentBadgeState,
  type AgentBadgePublishStatus,
  type AgentBadgeState
} from "../state/state-schema.js";
import { createDefaultAgentBadgeConfig } from "./default-config.js";
import { createDefaultAgentBadgeState } from "./default-state.js";
import type { InitPreflightResult } from "./preflight.js";

export interface ApplyAgentBadgeScaffoldOptions {
  readonly cwd: string;
  readonly preflight: InitPreflightResult;
  readonly now?: () => Date;
}

export interface AgentBadgeScaffoldResult {
  readonly created: string[];
  readonly reused: string[];
  readonly warnings: string[];
}

const scaffoldVersion = 1;
const invalidJsonMarker = Symbol("invalid-json");
const badgeModes: AgentBadgeBadgeMode[] = ["sessions", "tokens", "cost"];
const refreshModes: AgentBadgeRefreshMode[] = ["fail-soft", "strict"];
const publishStatuses: AgentBadgePublishStatus[] = [
  "idle",
  "deferred",
  "pending",
  "published",
  "error"
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  return readString(value);
}

function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? [...value]
    : undefined;
}

function readEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | undefined {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : undefined;
}

function readJsonObject(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function jsonEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function readJsonFile(
  targetPath: string
): Promise<unknown | typeof invalidJsonMarker | undefined> {
  if (!existsSync(targetPath)) {
    return undefined;
  }

  try {
    const content = await readFile(targetPath, "utf8");
    return JSON.parse(content) as unknown;
  } catch {
    return invalidJsonMarker;
  }
}

async function writeJsonFile(targetPath: string, value: unknown): Promise<void> {
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function reconcileConfig(
  rawConfig: unknown | typeof invalidJsonMarker,
  defaults: AgentBadgeConfig
): { value: AgentBadgeConfig; changed: boolean; warning?: string } {
  if (rawConfig === undefined) {
    return {
      value: defaults,
      changed: true
    };
  }

  if (rawConfig === invalidJsonMarker) {
    return {
      value: defaults,
      changed: true,
      warning:
        "Reset .agent-badge/config.json because it contained invalid JSON."
    };
  }

  try {
    return {
      value: parseAgentBadgeConfig(rawConfig),
      changed: false
    };
  } catch {
    if (!isRecord(rawConfig)) {
      return {
        value: defaults,
        changed: true,
        warning:
          "Reset .agent-badge/config.json because it was not a valid JSON object."
      };
    }

    const providers = readJsonObject(rawConfig.providers);
    const repo = readJsonObject(rawConfig.repo);
    const aliases = readJsonObject(repo.aliases);
    const badge = readJsonObject(rawConfig.badge);
    const publish = readJsonObject(rawConfig.publish);
    const refresh = readJsonObject(rawConfig.refresh);
    const prePush = readJsonObject(refresh.prePush);
    const privacy = readJsonObject(rawConfig.privacy);

    return {
      value: parseAgentBadgeConfig({
        version: defaults.version,
        providers: {
          codex: {
            enabled:
              readBoolean(readJsonObject(providers.codex).enabled) ??
              defaults.providers.codex.enabled
          },
          claude: {
            enabled:
              readBoolean(readJsonObject(providers.claude).enabled) ??
              defaults.providers.claude.enabled
          }
        },
        repo: {
          aliases: {
            remotes:
              readStringArray(aliases.remotes) ??
              defaults.repo.aliases.remotes,
            slugs:
              readStringArray(aliases.slugs) ?? defaults.repo.aliases.slugs
          }
        },
        badge: {
          label: readString(badge.label) ?? defaults.badge.label,
          mode:
            readEnumValue(badge.mode, badgeModes) ?? defaults.badge.mode
        },
        publish: {
          provider: defaults.publish.provider,
          gistId:
            readNullableString(publish.gistId) ?? defaults.publish.gistId,
          badgeUrl:
            readNullableString(publish.badgeUrl) ?? defaults.publish.badgeUrl
        },
        refresh: {
          prePush: {
            enabled:
              readBoolean(prePush.enabled) ??
              defaults.refresh.prePush.enabled,
            mode:
              readEnumValue(prePush.mode, refreshModes) ??
              defaults.refresh.prePush.mode
          }
        },
        privacy: {
          aggregateOnly:
            privacy.aggregateOnly === true
              ? true
              : defaults.privacy.aggregateOnly
        }
      }),
      changed: true,
      warning:
        "Reconciled .agent-badge/config.json with schema defaults while preserving valid values."
    };
  }
}

function reconcileAmbiguousSessions(
  rawOverrides: unknown
): AgentBadgeState["overrides"]["ambiguousSessions"] {
  if (!isRecord(rawOverrides)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rawOverrides).filter((entry): entry is [string, "include" | "exclude"] =>
      entry[1] === "include" || entry[1] === "exclude"
    )
  );
}

function reconcileCheckpoint(
  rawCheckpoint: unknown,
  fallback: AgentBadgeState["checkpoints"]["codex"]
): AgentBadgeState["checkpoints"]["codex"] {
  const checkpoint = readJsonObject(rawCheckpoint);

  return {
    cursor: readNullableString(checkpoint.cursor) ?? fallback.cursor,
    lastScannedAt:
      readNullableString(checkpoint.lastScannedAt) ?? fallback.lastScannedAt
  };
}

function reconcileState(
  rawState: unknown | typeof invalidJsonMarker,
  defaults: AgentBadgeState
): { value: AgentBadgeState; changed: boolean; warning?: string } {
  let parsedExisting: AgentBadgeState | null = null;

  if (rawState !== undefined) {
    try {
      parsedExisting = parseAgentBadgeState(rawState);
    } catch {
      parsedExisting = null;
    }
  }

  if (rawState === undefined) {
    return {
      value: defaults,
      changed: true
    };
  }

  if (rawState === invalidJsonMarker) {
    return {
      value: defaults,
      changed: true,
      warning:
        "Reset .agent-badge/state.json because it contained invalid JSON."
    };
  }

  const state = readJsonObject(rawState);
  const init = readJsonObject(state.init);
  const checkpoints = readJsonObject(state.checkpoints);
  const publish = readJsonObject(state.publish);
  const overrides = readJsonObject(state.overrides);

  const value = parseAgentBadgeState({
    version: defaults.version,
    init: {
      initialized: true,
      scaffoldVersion:
        readPositiveInteger(init.scaffoldVersion) ??
        defaults.init.scaffoldVersion,
      lastInitializedAt:
        readNullableString(init.lastInitializedAt) ??
        defaults.init.lastInitializedAt
    },
    checkpoints: {
      codex: reconcileCheckpoint(checkpoints.codex, defaults.checkpoints.codex),
      claude: reconcileCheckpoint(checkpoints.claude, defaults.checkpoints.claude)
    },
    publish: {
      status:
        readEnumValue(publish.status, publishStatuses) ??
        defaults.publish.status,
      gistId: readNullableString(publish.gistId) ?? defaults.publish.gistId,
      lastPublishedHash:
        readNullableString(publish.lastPublishedHash) ??
        defaults.publish.lastPublishedHash
    },
    overrides: {
      ambiguousSessions: reconcileAmbiguousSessions(overrides.ambiguousSessions)
    }
  });

  if (parsedExisting === null) {
    return {
      value,
      changed: true,
      warning:
        "Reconciled .agent-badge/state.json with scaffold defaults while preserving valid values."
    };
  }

  return {
    value,
    changed: !jsonEquals(parsedExisting, value),
    warning: jsonEquals(parsedExisting, value)
      ? undefined
      : "Reconciled .agent-badge/state.json with scaffold defaults while preserving valid values."
  };
}

async function ensureDirectory(
  targetPath: string,
  label: string,
  result: AgentBadgeScaffoldResult
): Promise<void> {
  if (existsSync(targetPath)) {
    result.reused.push(label);
    return;
  }

  await mkdir(targetPath, { recursive: true });
  result.created.push(label);
}

async function ensureConfigFile(
  targetPath: string,
  defaults: AgentBadgeConfig,
  result: AgentBadgeScaffoldResult
): Promise<void> {
  const rawConfig = await readJsonFile(targetPath);
  const reconciled = reconcileConfig(rawConfig, defaults);

  if (rawConfig !== undefined && !reconciled.changed) {
    result.reused.push(".agent-badge/config.json");
    return;
  }

  await writeJsonFile(targetPath, reconciled.value);
  result.created.push(".agent-badge/config.json");

  if (reconciled.warning) {
    result.warnings.push(reconciled.warning);
  }
}

async function ensureStateFile(
  targetPath: string,
  defaults: AgentBadgeState,
  result: AgentBadgeScaffoldResult
): Promise<void> {
  const rawState = await readJsonFile(targetPath);
  const reconciled = reconcileState(rawState, defaults);

  if (rawState !== undefined && !reconciled.changed) {
    result.reused.push(".agent-badge/state.json");
    return;
  }

  await writeJsonFile(targetPath, reconciled.value);
  result.created.push(".agent-badge/state.json");

  if (reconciled.warning) {
    result.warnings.push(reconciled.warning);
  }
}

export async function applyAgentBadgeScaffold(
  options: ApplyAgentBadgeScaffoldOptions
): Promise<AgentBadgeScaffoldResult> {
  const result: AgentBadgeScaffoldResult = {
    created: [],
    reused: [],
    warnings: []
  };
  const scaffoldRoot = join(options.cwd, ".agent-badge");
  const initializedAt = (options.now ?? (() => new Date()))().toISOString();

  await ensureDirectory(scaffoldRoot, ".agent-badge", result);
  await ensureDirectory(join(scaffoldRoot, "cache"), ".agent-badge/cache", result);
  await ensureDirectory(join(scaffoldRoot, "logs"), ".agent-badge/logs", result);

  await ensureConfigFile(
    join(scaffoldRoot, "config.json"),
    createDefaultAgentBadgeConfig({
      providers: options.preflight.providers
    }),
    result
  );
  await ensureStateFile(
    join(scaffoldRoot, "state.json"),
    createDefaultAgentBadgeState({
      initialized: true,
      scaffoldVersion,
      initializedAt
    }),
    result
  );

  return result;
}
