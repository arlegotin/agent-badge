import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  applyPublishTargetResult,
  applyAgentBadgeScaffold,
  applyRepoLocalRuntimeWiring,
  createGitHubGistClient,
  initializeGitRepository,
  ensurePublishTarget,
  parseAgentBadgeConfig,
  parseAgentBadgeState,
  runInitPreflight,
  type AgentBadgeScaffoldResult,
  type AgentBadgeConfig,
  type DetectGitHubAuthOptions,
  type DetectProviderAvailabilityOptions,
  type GitHubGistClient,
  type InitPreflightResult,
  type PublishTargetResult,
  type RepoLocalRuntimeWiringResult,
  type AgentBadgeState
} from "@agent-badge/core";

interface OutputWriter {
  write(chunk: string): unknown;
}

interface RuntimePackageManifest {
  readonly version?: unknown;
}

export interface RunInitCommandOptions
  extends DetectProviderAvailabilityOptions,
    DetectGitHubAuthOptions {
  readonly cwd?: string;
  readonly allowGitInit?: boolean;
  readonly gistId?: string;
  readonly gistClient?: GitHubGistClient;
  readonly stdout?: OutputWriter;
}

export interface InitCommandResult {
  readonly preflight: InitPreflightResult;
  readonly scaffold: AgentBadgeScaffoldResult;
  readonly runtimeWiring: RepoLocalRuntimeWiringResult;
}

const publishableSemverPattern =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const githubTokenEnvVars = ["GH_TOKEN", "GITHUB_TOKEN", "GITHUB_PAT"] as const;
const CONFIG_PATH = ".agent-badge/config.json";
const STATE_PATH = ".agent-badge/state.json";

function getBlockedMessage(preflight: InitPreflightResult): string {
  return (
    preflight.git.blockingMessage ??
    "Init is blocked because this directory cannot be prepared safely yet."
  );
}

function writeLines(stdout: OutputWriter, lines: string[]): void {
  for (const line of lines) {
    stdout.write(`${line}\n`);
  }
}

function summarizeExistingScaffold(preflight: InitPreflightResult): string {
  const artifacts = [
    preflight.existingScaffold.config && "config.json",
    preflight.existingScaffold.state && "state.json",
    preflight.existingScaffold.cache && "cache/",
    preflight.existingScaffold.logs && "logs/"
  ].filter(Boolean);

  return artifacts.length > 0 ? artifacts.join(", ") : "none";
}

function writePreflightSummary(
  stdout: OutputWriter,
  preflight: InitPreflightResult
): void {
  writeLines(stdout, [
    "agent-badge init preflight",
    `- Git: ${
      preflight.git.isRepo ? "existing repository" : "non-git directory"
    }${preflight.git.hasOrigin ? ", origin configured" : ", no origin configured"}`,
    `- README: ${preflight.readme.exists ? preflight.readme.fileName : "missing"}`,
    `- Package manager: ${preflight.packageManager.name}`,
    `- Providers: codex=${
      preflight.providers.codex.available ? "yes" : "no"
    } (${preflight.providers.codex.homeLabel}), claude=${
      preflight.providers.claude.available ? "yes" : "no"
    } (${preflight.providers.claude.homeLabel})`,
    `- GitHub auth: ${
      preflight.githubAuth.available ? preflight.githubAuth.source : "not detected"
    }`,
    `- Existing scaffold: ${summarizeExistingScaffold(preflight)}`
  ]);
}

function writeScaffoldSummary(
  stdout: OutputWriter,
  scaffold: AgentBadgeScaffoldResult
): void {
  writeLines(stdout, [
    "agent-badge init scaffold",
    `- Created: ${scaffold.created.length > 0 ? scaffold.created.join(", ") : "none"}`,
    `- Reused: ${scaffold.reused.length > 0 ? scaffold.reused.join(", ") : "none"}`
  ]);

  if (scaffold.warnings.length > 0) {
    writeLines(
      stdout,
      scaffold.warnings.map((warning: string) => `- Warning: ${warning}`)
    );
  }
}

function writeRuntimeWiringSummary(
  stdout: OutputWriter,
  runtimeWiring: RepoLocalRuntimeWiringResult
): void {
  writeLines(stdout, [
    "agent-badge init runtime wiring",
    `- Created: ${runtimeWiring.created.length > 0 ? runtimeWiring.created.join(", ") : "none"}`,
    `- Updated: ${runtimeWiring.updated.length > 0 ? runtimeWiring.updated.join(", ") : "none"}`,
    `- Reused: ${runtimeWiring.reused.length > 0 ? runtimeWiring.reused.join(", ") : "none"}`
  ]);

  if (runtimeWiring.warnings.length > 0) {
    writeLines(
      stdout,
      runtimeWiring.warnings.map(
        (warning: string) => `- Warning: ${warning}`
      )
    );
  }
}

function summarizePublishTarget(target: PublishTargetResult): string {
  switch (target.status) {
    case "created":
      return "created public gist";
    case "connected":
      return "connected existing gist";
    case "reused":
      return "reused existing gist";
    case "deferred":
      return "deferred";
  }
}

function writePublishTargetSummary(
  stdout: OutputWriter,
  target: PublishTargetResult
): void {
  writeLines(stdout, [`- Publish target: ${summarizePublishTarget(target)}`]);

  if (target.status !== "deferred") {
    return;
  }

  writeLines(stdout, [
    "- Next step: rerun `agent-badge init --gist-id <id>` to connect an existing public gist, or set GH_TOKEN, GITHUB_TOKEN, or GITHUB_PAT to create one automatically."
  ]);
}

async function readAgentBadgeJson(targetPath: string): Promise<unknown> {
  return JSON.parse(await readFile(targetPath, "utf8")) as unknown;
}

async function loadPersistedConfig(cwd: string): Promise<AgentBadgeConfig> {
  return parseAgentBadgeConfig(await readAgentBadgeJson(join(cwd, CONFIG_PATH)));
}

async function loadPersistedState(cwd: string): Promise<AgentBadgeState> {
  return parseAgentBadgeState(await readAgentBadgeJson(join(cwd, STATE_PATH)));
}

async function writePersistedState(
  cwd: string,
  config: AgentBadgeConfig,
  state: AgentBadgeState
): Promise<void> {
  await writeFile(
    join(cwd, CONFIG_PATH),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(cwd, STATE_PATH),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8"
  );
}

function resolveGitHubAuthToken(env: NodeJS.ProcessEnv | undefined): string | undefined {
  for (const envVar of githubTokenEnvVars) {
    const value = env?.[envVar];

    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
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

export async function runInitCommand(
  options: RunInitCommandOptions = {}
): Promise<InitCommandResult> {
  const stdout = options.stdout ?? process.stdout;
  const preflightOptions = {
    cwd: options.cwd,
    allowGitInit: options.allowGitInit,
    homeRoot: options.homeRoot,
    env: options.env,
    checker: options.checker
  };
  const initialPreflight = await runInitPreflight(preflightOptions);

  writePreflightSummary(stdout, initialPreflight);

  if (!initialPreflight.git.canInitialize) {
    const message = getBlockedMessage(initialPreflight);
    writeLines(stdout, ["- Git bootstrap: blocked"]);
    writeLines(stdout, [`- Blocked: ${message}`]);
    throw new Error(message);
  }

  let preflight = initialPreflight;

  if (!initialPreflight.git.isRepo) {
    writeLines(stdout, ["- Git bootstrap: running `git init --quiet`"]);

    try {
      await initializeGitRepository({
        cwd: initialPreflight.cwd,
        context: initialPreflight.git
      });
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : "";
      const message = `Git bootstrap failed, so init stopped before writing .agent-badge.${detail}`;

      writeLines(stdout, [`- Blocked: ${message}`]);
      throw new Error(message);
    }

    preflight = await runInitPreflight(preflightOptions);

    if (!preflight.git.isRepo) {
      const message =
        "Git bootstrap did not produce a repository, so init stopped before writing .agent-badge.";

      writeLines(stdout, [`- Blocked: ${message}`]);
      throw new Error(message);
    }

    writeLines(stdout, [
      "- Git bootstrap: repository initialized and preflight refreshed"
    ]);
  } else {
    writeLines(stdout, ["- Git bootstrap: not needed"]);
  }

  const scaffold = await applyAgentBadgeScaffold({
    cwd: preflight.cwd,
    preflight
  });

  writeScaffoldSummary(stdout, scaffold);

  const runtimeWiring = await applyRepoLocalRuntimeWiring({
    cwd: preflight.cwd,
    packageManager: preflight.packageManager.name,
    runtimeDependencySpecifier: await resolveRuntimeDependencySpecifier()
  });

  writeRuntimeWiringSummary(stdout, runtimeWiring);

  const config = await loadPersistedConfig(preflight.cwd);
  const state = await loadPersistedState(preflight.cwd);
  const publishTarget = await ensurePublishTarget({
    config,
    state,
    githubAuth: preflight.githubAuth,
    gistId: options.gistId,
    client:
      options.gistClient ??
      createGitHubGistClient({
        authToken: resolveGitHubAuthToken(options.env)
      })
  });
  const nextPublishState = applyPublishTargetResult({
    config,
    state,
    target: publishTarget
  });

  await writePersistedState(
    preflight.cwd,
    nextPublishState.config,
    nextPublishState.state
  );
  writePublishTargetSummary(stdout, publishTarget);

  return {
    preflight,
    scaffold,
    runtimeWiring
  };
}
