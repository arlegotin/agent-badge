import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import {
  attributeBackfillSessions,
  applyPublishTargetResult,
  applyAgentBadgeScaffold,
  applyRepoLocalRuntimeWiring,
  buildSharedOverrideDigest,
  buildReadmeBadgeMarkdown,
  buildReadmeBadgeSnippet,
  createGitHubGistClient,
  derivePublishTrustReport,
  deriveRecoveryPlan,
  estimateSessionCostsUsdMicrosByKey,
  initializeGitRepository,
  ensurePublishTarget,
  formatRecoveryResult,
  inspectPublishReadiness,
  inspectSharedPublishHealth,
  parseAgentBadgeConfig,
  parseAgentBadgeState,
  publishBadgeToGist,
  resolveRepoFingerprint,
  resolveGitHubAuthToken,
  resolvePricingCatalog,
  runInitPreflight,
  runFullBackfillScan,
  upsertReadmeBadge,
  type AgentBadgeScaffoldResult,
  type AgentBadgeConfig,
  type DetectGitHubAuthOptions,
  type DetectProviderAvailabilityOptions,
  type GitHubGistClient,
  type GhCliTokenResolver,
  type InitPreflightResult,
  type PublishTargetResult,
  type PublishBadgeToGistResult,
  type RepoLocalRuntimeWiringResult,
  type SharedPublishHealthReport,
  type SharedContributorObservationMap,
  type AgentBadgeState
} from "@legotin/agent-badge-core";

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
  readonly ghCliTokenResolver?: GhCliTokenResolver;
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
}

function buildDeferredBadgeSetupMessage(
  target: PublishTargetResult
): string {
  switch (target.reason) {
    case "auth-missing":
      return "set GH_TOKEN, GITHUB_TOKEN, or GITHUB_PAT to create a public gist automatically, or rerun `agent-badge init --gist-id <id>` to connect an existing public gist.";
    case "gist-create-failed":
      return "public gist creation failed. Check GitHub auth and rerun `agent-badge init`, or connect an existing public gist with `--gist-id <id>`.";
    case "gist-not-public":
      return "the configured gist is not public. Use a public gist and rerun `agent-badge init --gist-id <id>`.";
    case "gist-missing-owner":
      return "the configured gist did not report an owner. Reconnect a valid public gist with `--gist-id <id>` and rerun init.";
    case "gist-unreachable":
      return "the configured gist could not be reached. Verify the gist id or GitHub access, then rerun `agent-badge init`.";
    default:
      return "rerun `agent-badge init --gist-id <id>` to connect an existing public gist, or set GH_TOKEN, GITHUB_TOKEN, or GITHUB_PAT to create one automatically.";
  }
}

function writeBadgeSetupDeferred(
  stdout: OutputWriter,
  message: string
): void {
  writeLines(stdout, [`- Badge setup deferred: ${message}`]);
}

function writeSharedPublishSummary(
  stdout: OutputWriter,
  publishResult: Pick<
    PublishBadgeToGistResult,
    "healthAfterPublish" | "migrationPerformed"
  >
): void {
  writeLines(stdout, [
    `- Publish mode: ${publishResult.healthAfterPublish.mode}`,
    `- Migration: ${
      publishResult.migrationPerformed ? "legacy -> shared" : "none"
    }`
  ]);
}

async function inspectSharedHealthForRecovery(options: {
  readonly config: AgentBadgeConfig;
  readonly state: AgentBadgeState;
  readonly gistClient: GitHubGistClient;
}): Promise<SharedPublishHealthReport | null> {
  if (
    options.config.publish.gistId === null ||
    options.config.publish.badgeUrl === null
  ) {
    return null;
  }

  try {
    const gist = await options.gistClient.getGist(options.config.publish.gistId);

    return inspectSharedPublishHealth({
      gist,
      state: options.state,
      now: new Date().toISOString()
    });
  } catch {
    return null;
  }
}

function resolveInitRecoveryResult(options: {
  readonly beforeConfig: AgentBadgeConfig;
  readonly beforeState: AgentBadgeState;
  readonly beforeSharedHealth: SharedPublishHealthReport | null;
  readonly afterConfig: AgentBadgeConfig;
  readonly afterState: AgentBadgeState;
  readonly afterSharedHealth: SharedPublishHealthReport;
  readonly command: "agent-badge init" | "agent-badge init --gist-id <id>";
}): string | null {
  const beforeRecoveryPlan = deriveRecoveryPlan({
    readiness: inspectPublishReadiness({
      config: options.beforeConfig,
      state: options.beforeState
    }),
    trust: derivePublishTrustReport({
      state: options.beforeState,
      now: new Date().toISOString()
    }),
    sharedHealth: options.beforeSharedHealth
  });

  if (beforeRecoveryPlan.command !== options.command) {
    return null;
  }

  const afterRecoveryPlan = deriveRecoveryPlan({
    readiness: inspectPublishReadiness({
      config: options.afterConfig,
      state: options.afterState
    }),
    trust: derivePublishTrustReport({
      state: options.afterState,
      now: new Date().toISOString()
    }),
    sharedHealth: options.afterSharedHealth
  });

  return afterRecoveryPlan.status === "healthy"
    ? formatRecoveryResult(options.command)
    : null;
}

function buildPublishFailureMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : "unknown publish error";

  return `first publish failed (${detail}). Set GH_TOKEN, GITHUB_TOKEN, or GITHUB_PAT so init can publish the live badge JSON, then rerun \`agent-badge init\`.`;
}

function getConfiguredBadgeUrl(config: AgentBadgeConfig): string | null {
  return config.publish.gistId !== null && config.publish.badgeUrl !== null
    ? config.publish.badgeUrl
    : null;
}

async function writeReadmeBadgeOutput(options: {
  readonly cwd: string;
  readonly preflight: InitPreflightResult;
  readonly config: AgentBadgeConfig;
  readonly stdout: OutputWriter;
}): Promise<void> {
  const badgeUrl = getConfiguredBadgeUrl(options.config);

  if (badgeUrl === null) {
    return;
  }

  const repoFingerprint = options.preflight.git.isRepo
    ? await resolveRepoFingerprint({
        cwd: options.cwd,
        config: options.config
      })
    : null;
  const linkUrl = repoFingerprint?.originUrlNormalized ?? null;

  if (!options.preflight.readme.exists || options.preflight.readme.fileName === null) {
    writeLines(options.stdout, [
      `- Badge snippet: ${buildReadmeBadgeSnippet({
        label: options.config.badge.label,
        badgeUrl,
        linkUrl
      })}`
    ]);
    return;
  }

  const readmePath = join(options.cwd, options.preflight.readme.fileName);
  const readmeContent = await readFile(readmePath, "utf8");
  const nextReadmeContent = upsertReadmeBadge(
    readmeContent,
    buildReadmeBadgeMarkdown({
      label: options.config.badge.label,
      badgeUrl,
      linkUrl
    })
  );

  await writeFile(readmePath, nextReadmeContent, "utf8");
  writeLines(options.stdout, [
    `- README badge: updated ${options.preflight.readme.fileName}`
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

function buildSessionKey(session: {
  readonly provider: string;
  readonly providerSessionId: string;
}): string {
  return `${session.provider}:${session.providerSessionId}`;
}

async function buildPublisherObservations(options: {
  readonly attribution: ReturnType<typeof attributeBackfillSessions>;
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
  const homeRoot = resolve(options.homeRoot ?? homedir());
  const env = options.env ?? process.env;
  const preflightOptions = {
    cwd: options.cwd,
    allowGitInit: options.allowGitInit,
    homeRoot,
    env,
    checker: options.checker,
    ghCliTokenResolver: options.ghCliTokenResolver
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
  const config = await loadPersistedConfig(preflight.cwd);

  writeScaffoldSummary(stdout, scaffold);

  const runtimeWiring = await applyRepoLocalRuntimeWiring({
    cwd: preflight.cwd,
    packageManager: preflight.packageManager.name,
    runtimeDependencySpecifier: await resolveRuntimeDependencySpecifier(),
    refresh: config.refresh
  });

  writeRuntimeWiringSummary(stdout, runtimeWiring);

  const state = await loadPersistedState(preflight.cwd);
  const gistClient =
    options.gistClient ??
    createGitHubGistClient({
      authToken:
        (
          await resolveGitHubAuthToken({
            env,
            ghCliTokenResolver: options.ghCliTokenResolver
          })
        ).token
    });
  const beforeSharedHealth =
    typeof options.gistId === "undefined" && state.publish.mode === "shared"
      ? await inspectSharedHealthForRecovery({
          config,
          state,
          gistClient
        })
      : null;
  const publishTarget = await ensurePublishTarget({
    config,
    state,
    githubAuth: preflight.githubAuth,
    gistId: options.gistId,
    client: gistClient
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

  if (publishTarget.status === "deferred") {
    writeBadgeSetupDeferred(
      stdout,
      buildDeferredBadgeSetupMessage(publishTarget)
    );

    return {
      preflight,
      scaffold,
      runtimeWiring
    };
  }

  const badgeUrl = getConfiguredBadgeUrl(nextPublishState.config);

  if (badgeUrl === null) {
    writeBadgeSetupDeferred(
      stdout,
      "a stable badge URL was not configured. Rerun `agent-badge init` after reconnecting the publish target."
    );

    return {
      preflight,
      scaffold,
      runtimeWiring
    };
  }

  try {
    const scan = await runFullBackfillScan({
      cwd: preflight.cwd,
      homeRoot,
      config: nextPublishState.config
    });
    const attribution = attributeBackfillSessions({
      repo: scan.repo,
      sessions: scan.sessions,
      overrides: nextPublishState.state.overrides.ambiguousSessions
    });
    const publishResult = await publishBadgeToGist({
      config: nextPublishState.config,
      state: nextPublishState.state,
      publisherObservations: await buildPublisherObservations({
        attribution,
        cwd: preflight.cwd,
        homeRoot,
        includeEstimatedCost:
          nextPublishState.config.badge.mode === "combined" ||
          nextPublishState.config.badge.mode === "cost"
      }),
      client: gistClient
    });
    const publishedState = publishResult.state;

    await writePersistedState(preflight.cwd, nextPublishState.config, publishedState);
    writeSharedPublishSummary(stdout, publishResult);
    const recoveryResult = resolveInitRecoveryResult({
      beforeConfig: config,
      beforeState: state,
      beforeSharedHealth,
      afterConfig: nextPublishState.config,
      afterState: publishedState,
      afterSharedHealth: publishResult.healthAfterPublish,
      command:
        typeof options.gistId === "string"
          ? "agent-badge init --gist-id <id>"
          : "agent-badge init"
    });

    if (recoveryResult !== null) {
      writeLines(stdout, [`- Recovery result: ${recoveryResult}`]);
    }
    await writeReadmeBadgeOutput({
      cwd: preflight.cwd,
      preflight,
      config: nextPublishState.config,
      stdout
    });
  } catch (error) {
    writeBadgeSetupDeferred(stdout, buildPublishFailureMessage(error));
  }

  return {
    preflight,
    scaffold,
    runtimeWiring
  };
}
