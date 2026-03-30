import {
  applyAgentBadgeScaffold,
  initializeGitRepository,
  runInitPreflight,
  type AgentBadgeScaffoldResult,
  type DetectGitHubAuthOptions,
  type DetectProviderAvailabilityOptions,
  type InitPreflightResult
} from "@agent-badge/core";

interface OutputWriter {
  write(chunk: string): unknown;
}

export interface RunInitCommandOptions
  extends DetectProviderAvailabilityOptions,
    DetectGitHubAuthOptions {
  readonly cwd?: string;
  readonly allowGitInit?: boolean;
  readonly stdout?: OutputWriter;
}

export interface InitCommandResult {
  readonly preflight: InitPreflightResult;
  readonly scaffold: AgentBadgeScaffoldResult;
}

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

  return {
    preflight,
    scaffold
  };
}
