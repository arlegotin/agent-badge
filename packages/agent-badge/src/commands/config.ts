import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  applyRepoLocalRuntimeWiring,
  detectPackageManager,
  parseAgentBadgeConfig,
  type AgentBadgeBadgeMode,
  type AgentBadgeConfig,
  type AgentBadgePrivacyOutput,
  type AgentBadgeRefreshMode
} from "@legotin/agent-badge-core";

interface OutputWriter {
  write(chunk: string): unknown;
}

type ConfigAction = "get" | "set";

type SupportedConfigKey =
  | "providers.codex.enabled"
  | "providers.claude.enabled"
  | "badge.label"
  | "badge.mode"
  | "refresh.prePush.enabled"
  | "refresh.prePush.mode"
  | "privacy.aggregateOnly"
  | "privacy.output";

export interface RunConfigCommandOptions {
  readonly cwd?: string;
  readonly stdout?: OutputWriter;
  readonly action?: ConfigAction;
  readonly key?: string;
  readonly value?: string;
}

export interface ConfigCommandResult {
  readonly action: ConfigAction;
  readonly key: string | null;
  readonly value: string | null;
  readonly config: AgentBadgeConfig;
  readonly report: string;
}

const CONFIG_PATH = ".agent-badge/config.json";
const PRIVACY_AGGREGATE_ONLY_ERROR =
  "privacy.aggregateOnly must remain true because agent-badge only publishes aggregate data.";
const publishableSemverPattern =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const supportedConfigKeys = [
  "providers.codex.enabled",
  "providers.claude.enabled",
  "badge.label",
  "badge.mode",
  "refresh.prePush.enabled",
  "refresh.prePush.mode",
  "privacy.aggregateOnly",
  "privacy.output"
] as const satisfies readonly SupportedConfigKey[];

interface RuntimePackageManifest {
  readonly version?: unknown;
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

async function writeConfigFile(
  targetPath: string,
  config: AgentBadgeConfig
): Promise<void> {
  await writeFile(targetPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function writeLine(stdout: OutputWriter, line: string): void {
  stdout.write(`${line}\n`);
}

function parseBooleanValue(key: string, value: string): boolean {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`Invalid boolean value for ${key}: ${value}`);
}

function parseBadgeModeValue(value: string): AgentBadgeBadgeMode {
  if (value === "combined" || value === "tokens" || value === "cost") {
    return value;
  }

  throw new Error(`Invalid badge mode: ${value}`);
}

function parseRefreshModeValue(value: string): AgentBadgeRefreshMode {
  if (value === "fail-soft" || value === "strict") {
    return value;
  }

  throw new Error(`Invalid refresh mode: ${value}`);
}

function parsePrivacyOutputValue(value: string): AgentBadgePrivacyOutput {
  if (value === "standard" || value === "minimal") {
    return value;
  }

  throw new Error(`Invalid privacy output: ${value}`);
}

function isSupportedConfigKey(key: string): key is SupportedConfigKey {
  return (supportedConfigKeys as readonly string[]).includes(key);
}

function assertSupportedConfigKey(key: string): asserts key is SupportedConfigKey {
  if (!isSupportedConfigKey(key)) {
    throw new Error(`Unsupported config key: ${key}`);
  }
}

function readConfigValue(config: AgentBadgeConfig, key: SupportedConfigKey): string {
  switch (key) {
    case "providers.codex.enabled":
      return String(config.providers.codex.enabled);
    case "providers.claude.enabled":
      return String(config.providers.claude.enabled);
    case "badge.label":
      return config.badge.label;
    case "badge.mode":
      return config.badge.mode;
    case "refresh.prePush.enabled":
      return String(config.refresh.prePush.enabled);
    case "refresh.prePush.mode":
      return config.refresh.prePush.mode;
    case "privacy.aggregateOnly":
      return String(config.privacy.aggregateOnly);
    case "privacy.output":
      return config.privacy.output;
  }
}

function buildSettingsLines(config: AgentBadgeConfig): string[] {
  return supportedConfigKeys.map((key) => `${key}=${readConfigValue(config, key)}`);
}

function keyRequiresRuntimeWiring(key: SupportedConfigKey): boolean {
  return key === "refresh.prePush.enabled" || key === "refresh.prePush.mode";
}

function applyConfigMutation(
  config: AgentBadgeConfig,
  key: SupportedConfigKey,
  value: string
): AgentBadgeConfig {
  switch (key) {
    case "providers.codex.enabled":
      return parseAgentBadgeConfig({
        ...config,
        providers: {
          ...config.providers,
          codex: {
            enabled: parseBooleanValue(key, value)
          }
        }
      });
    case "providers.claude.enabled":
      return parseAgentBadgeConfig({
        ...config,
        providers: {
          ...config.providers,
          claude: {
            enabled: parseBooleanValue(key, value)
          }
        }
      });
    case "badge.label":
      return parseAgentBadgeConfig({
        ...config,
        badge: {
          ...config.badge,
          label: value
        }
      });
    case "badge.mode":
      return parseAgentBadgeConfig({
        ...config,
        badge: {
          ...config.badge,
          mode: parseBadgeModeValue(value)
        }
      });
    case "refresh.prePush.enabled":
      return parseAgentBadgeConfig({
        ...config,
        refresh: {
          ...config.refresh,
          prePush: {
            ...config.refresh.prePush,
            enabled: parseBooleanValue(key, value)
          }
        }
      });
    case "refresh.prePush.mode":
      return parseAgentBadgeConfig({
        ...config,
        refresh: {
          ...config.refresh,
          prePush: {
            ...config.refresh.prePush,
            mode: parseRefreshModeValue(value)
          }
        }
      });
    case "privacy.aggregateOnly": {
      if (!parseBooleanValue(key, value)) {
        throw new Error(PRIVACY_AGGREGATE_ONLY_ERROR);
      }

      return parseAgentBadgeConfig({
        ...config,
        privacy: {
          ...config.privacy,
          aggregateOnly: true
        }
      });
    }
    case "privacy.output":
      return parseAgentBadgeConfig({
        ...config,
        privacy: {
          ...config.privacy,
          output: parsePrivacyOutputValue(value)
        }
      });
  }
}

function buildReport(
  action: ConfigAction,
  config: AgentBadgeConfig,
  key?: SupportedConfigKey
): string {
  if (action === "get") {
    if (typeof key === "undefined") {
      return ["agent-badge config", ...buildSettingsLines(config).map((line) => `- ${line}`)].join(
        "\n"
      );
    }

    return ["agent-badge config", `- ${key}=${readConfigValue(config, key)}`].join(
      "\n"
    );
  }

  return ["agent-badge config", `- Updated: ${key}=${readConfigValue(config, key!)}`].join(
    "\n"
  );
}

async function readRuntimePackageManifest(): Promise<RuntimePackageManifest> {
  const runtimePackagePath = new URL("../../package.json", import.meta.url);
  let rawManifest: unknown;

  try {
    rawManifest = JSON.parse(
      await readFile(runtimePackagePath, "utf8")
    ) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : ".";

    throw new Error(`Unable to read agent-badge runtime package metadata${detail}`);
  }

  if (
    typeof rawManifest !== "object" ||
    rawManifest === null ||
    Array.isArray(rawManifest)
  ) {
    throw new Error("Unable to read agent-badge runtime package metadata.");
  }

  return rawManifest as RuntimePackageManifest;
}

function normalizeRuntimeDependencySpecifier(version: unknown): string {
  if (
    typeof version !== "string" ||
    version === "0.0.0" ||
    !publishableSemverPattern.test(version)
  ) {
    return "latest";
  }

  return `^${version}`;
}

async function resolveRuntimeDependencySpecifier(): Promise<string> {
  const runtimePackageManifest = await readRuntimePackageManifest();

  return normalizeRuntimeDependencySpecifier(runtimePackageManifest.version);
}

export async function runConfigCommand(
  options: RunConfigCommandOptions = {}
): Promise<ConfigCommandResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const stdout = options.stdout ?? process.stdout;
  const action = options.action ?? "get";
  const configPath = join(cwd, CONFIG_PATH);
  const config = parseAgentBadgeConfig(await readJsonFile(configPath));

  if (action !== "get" && action !== "set") {
    throw new Error(`Unsupported config action: ${action}`);
  }

  if (action === "get") {
    if (typeof options.key !== "undefined") {
      assertSupportedConfigKey(options.key);
    }

    const report = buildReport(action, config, options.key);

    writeLine(stdout, report);

    return {
      action,
      key: options.key ?? null,
      value:
        typeof options.key === "undefined"
          ? null
          : readConfigValue(config, options.key),
      config,
      report
    };
  }

  if (typeof options.key !== "string" || options.key.length === 0) {
    throw new Error("Config key is required for config set.");
  }

  if (typeof options.value !== "string") {
    throw new Error("Config value is required for config set.");
  }

  if (options.key === "privacy.aggregateOnly" && options.value !== "true") {
    throw new Error(PRIVACY_AGGREGATE_ONLY_ERROR);
  }

  assertSupportedConfigKey(options.key);

  const nextConfig = applyConfigMutation(config, options.key, options.value);

  await writeConfigFile(configPath, nextConfig);

  if (keyRequiresRuntimeWiring(options.key)) {
    try {
      await applyRepoLocalRuntimeWiring({
        cwd,
        packageManager: detectPackageManager(cwd),
        runtimeDependencySpecifier: await resolveRuntimeDependencySpecifier(),
        refresh: nextConfig.refresh
      });
    } catch (error) {
      try {
        await writeConfigFile(configPath, config);
      } catch {
        // Preserve the wiring failure for callers.
      }

      throw error;
    }
  }

  const report = buildReport(action, nextConfig, options.key);

  writeLine(stdout, report);

  return {
    action,
    key: options.key,
    value: readConfigValue(nextConfig, options.key),
    config: nextConfig,
    report
  };
}
