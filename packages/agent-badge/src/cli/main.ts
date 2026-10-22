#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";
import type { AgentBadgeRefreshMode } from "@legotin/agent-badge-core";
import { assertSupportedNode } from "../integration/manifest.js";

async function legacy() {
  const { checkActivation } = await import("../integration/runtime.js");
  let approved = false;
  try { approved = (await checkActivation({ cwd: process.cwd() })).status === "approved"; } catch { /* missing or unsafe activation */ }
  if (!approved) throw new Error("agent-badge: needs-setup; run explicit setup to approve this runtime.");
  return import("../commands/index.js");
}
async function resolver() { return (await import("@legotin/agent-badge-core")).resolveGitHubCliToken; }

type ReportedCliError = Error & {
  alreadyReported?: boolean;
};

function collectOptionValue(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

function parseRefreshHook(value: string | undefined): "pre-push" | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (value === "pre-push") {
    return value;
  }

  throw new Error(`Unsupported hook: ${value}`);
}

function parseRefreshHookPolicy(
  value: string | undefined
): AgentBadgeRefreshMode | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (value === "fail-soft" || value === "strict") {
    return value;
  }

  throw new Error(`Unsupported hook policy: ${value}`);
}

function resolveCliVersion(): string {
  const currentFilePath = fileURLToPath(import.meta.url);
  const packageJsonPath = resolve(dirname(currentFilePath), "..", "..", "package.json");

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      readonly version?: unknown;
    };

    if (typeof packageJson.version === "string" && packageJson.version.length > 0) {
      return packageJson.version;
    }
  } catch {
    // Fall back to a stable placeholder when package metadata is unavailable.
  }

  return "0.0.0";
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("agent-badge")
    .description("Track and publish privacy-safe AI usage badges for repositories.")
    .version(resolveCliVersion(), "--version", "print the installed CLI version");

  for (const name of ["init", "setup"]) {
    program.command(name)
      .description("Install and explicitly activate repository-owned agent-badge setup.")
      .option("--new-repository", "Create a standalone fork UUID in a fresh unactivated clone.")
      .option("--target <remote>", "Explicitly approve a Git remote destination.")
      .option("--repository-url <url>", "Public repository URL for the tracked declaration.")
      .option("--runtime-version <version>", "Exact runtime version to install.")
      .option("--dry-run", "Print exact owned file changes without applying setup.")
      .action(async (options: { newRepository?: boolean; target?: string; repositoryUrl?: string; runtimeVersion?: string; dryRun?: boolean }) => {
        const { planSetup, applySetup } = await import("../integration/setup.js");
        const plan = await planSetup({ newRepository: options.newRepository, target: options.target, declaredUrl: options.repositoryUrl, runtimeVersion: options.runtimeVersion ?? resolveCliVersion() });
        console.log(JSON.stringify({ changes: plan.changes, privateChanges: plan.privateChanges, hookActionItems: [...plan.hooks.actionItems, ...plan.hooks.notices, ...plan.agentHooks.actionItems, ...plan.agentHooks.notices] }, null, 2));
        if (!options.dryRun) {
          const result = await applySetup(plan);
          console.log(`agent-badge: runtime ${result.runtimeVersion}; usage ${result.status}; coverage may be partial.`);
          console.log(`agent-badge: Git hooks ${result.hooks.status}; provider hooks ${result.agentHooks.status}.`);
          for (const item of [...result.hooks.actionItems, ...result.agentHooks.actionItems]) console.error(`agent-badge: ${item}`);
          process.exitCode = result.operation.exitCode;
        }
      });
  }

  program.command("contribute")
    .description("Write a sanitized immutable contribution for normal PR staging.")
    .option("--hash <digest>", "Select a public record and required closure.", collectOptionValue, [])
    .action(async (options: { hash: string[] }) => {
      const { runContributeCommand } = await import("../commands/contribute.js");
      const result = await runContributeCommand({ selectedHashes: options.hash.length ? options.hash : undefined });
      console.log(`agent-badge: contribution ${result.path}; stage it with your normal PR.`);
    });
  program.command("import")
    .description("Import sanitized public contributions using the shared ledger transaction.")
    .option("--file <path>", "Managed contribution envelope (explicit local writer).")
    .option("--accepted-ref <oid>", "Accepted default-branch commit (trusted CI).")
    .option("--default-branch <branch>", "Actual trusted default branch.")
    .option("--repository-id <uuid>", "Pinned repository UUID (trusted CI).")
    .option("--repository-url <url>", "Pinned repository destination (trusted CI).")
    .action(async (options: { file?: string; acceptedRef?: string; defaultBranch?: string; repositoryId?: string; repositoryUrl?: string }) => {
      const { runImportCommand } = await import("../commands/import.js");
      const result = await runImportCommand({ ...options, onProgress: progress => console.log(`agent-badge: confirmed ${progress.confirmedEnvelopes} contribution envelope(s).`) });
      console.log(`agent-badge: contribution import ${result.status}; confirmed ${result.confirmedEnvelopes}; complete ${result.complete}; keep envelopes until accepted.`);
      if (!result.complete) process.exitCode = 1;
    });

  program
    .command("scan")
    .description("Scan local agent history and report attributed usage.")
    .option(
      "--include-session <provider:sessionId>",
      "Include an ambiguous session in the current repo totals.",
      collectOptionValue,
      []
    )
    .option(
      "--exclude-session <provider:sessionId>",
      "Exclude an ambiguous session from the current repo totals.",
      collectOptionValue,
      []
    )
    .action(
      async (options: {
        includeSession: string[];
        excludeSession: string[];
      }) => {
        await (await legacy()).runScanCommand({
          includeSession: options.includeSession,
          excludeSession: options.excludeSession
        });
      }
    );

  program
    .command("publish")
    .description("Publish aggregate badge JSON to the configured remote target.")
    .action(async () => {
      await (await legacy()).runPublishCommand({
        ghCliTokenResolver: await resolver()
      });
    });

  program
    .command("refresh")
    .description("Refresh persisted badge state and publish when needed.")
    .option("--hook <name>", "Run the refresh flow for a supported hook mode.")
    .option(
      "--hook-policy <mode>",
      "Set the pre-push hook policy explicitly: fail-soft or strict."
    )
    .option("--fail-soft", "Return a structured soft failure instead of throwing.")
    .option("--force-full", "Rebuild refresh state from a full scan.")
    .action(
      async (options: {
        hook?: string;
        hookPolicy?: string;
        failSoft?: boolean;
        forceFull?: boolean;
      }) => {
        const hookPolicy = parseRefreshHookPolicy(options.hookPolicy);

        if (options.failSoft && hookPolicy === "strict") {
          throw new Error(
            "--fail-soft cannot be combined with --hook-policy strict."
          );
        }

        await (await legacy()).runRefreshCommand({
          hook: parseRefreshHook(options.hook),
          hookPolicy: hookPolicy ?? (options.failSoft ? "fail-soft" : undefined),
          forceFull: options.forceFull ?? false,
          ghCliTokenResolver: await resolver()
        });
      }
    );

  program
    .command("status")
    .description("Print the current persisted badge, provider, and publish state.")
    .action(async () => {
      await (await legacy()).runStatusCommand();
    });

  program
    .command("doctor")
    .description("Inspect repository setup, scan readiness, and publish wiring.")
    .option("--json", "Print a machine-readable result object.")
    .option("--probe-write", "Validate gist write credentials with a no-op update.")
    .action(async (options: { json?: boolean; probeWrite?: boolean }) => {
      await (await legacy()).runDoctorCommand({
        json: options.json ?? false,
        probeWrite: options.probeWrite ?? false,
        ghCliTokenResolver: await resolver()
      });
    });

  program
    .command("uninstall")
    .description("Remove agent-badge runtime wiring and optionally purge local or remote state.")
    .option("--purge-remote", "Delete the configured publish gist and clear local gist association.")
    .option("--purge-config", "Delete .agent-badge/config.json.")
    .option("--purge-state", "Delete .agent-badge/state.json.")
    .option("--purge-logs", "Delete .agent-badge/logs.")
    .option("--purge-cache", "Delete .agent-badge/cache.")
    .option("--force", "Preserve progress by ignoring non-fatal artifact cleanup failures.")
    .action(
      async (options: {
        purgeRemote?: boolean;
        purgeConfig?: boolean;
        purgeState?: boolean;
        purgeLogs?: boolean;
        purgeCache?: boolean;
        force?: boolean;
      }) => {
        await (await legacy()).runUninstallCommand({
          purgeRemote: options.purgeRemote ?? false,
          purgeConfig: options.purgeConfig ?? false,
          purgeState: options.purgeState ?? false,
          purgeLogs: options.purgeLogs ?? true,
          purgeCaches: options.purgeCache ?? true,
          force: options.force ?? false,
          ghCliTokenResolver: await resolver()
        });
      }
    );

  const configCommand = program
    .command("config")
    .description("View or update supported post-init agent-badge settings.")
    .action(async () => {
      await (await legacy()).runConfigCommand({
        action: "get"
      });
    });

  configCommand
    .command("get [key]")
    .description("Print the current value for a supported config key.")
    .action(async (key?: string) => {
      await (await legacy()).runConfigCommand({
        action: "get",
        key
      });
    });

  configCommand
    .command("set <key> <value>")
    .description("Update a supported config key.")
    .action(async (key: string, value: string) => {
      await (await legacy()).runConfigCommand({
        action: "set",
        key,
        value
      });
    });

  return program;
}

export async function run(argv: string[] = process.argv, options: { nodeVersion?: string } = {}): Promise<void> {
  assertSupportedNode(options.nodeVersion);
  await buildProgram().exitOverride().parseAsync(argv);
}

export function handleRunError(
  error: unknown,
  stderr: Pick<typeof console, "error"> = console
): void {
  if ((error as { code?: string })?.code === "commander.helpDisplayed" || (error as { code?: string })?.code === "commander.version") return;
  const message = error instanceof Error ? error.message : String(error);

  if ((error as ReportedCliError | null)?.alreadyReported !== true) {
    stderr.error(message);
  }

  process.exitCode = 1;
}

export function isDirectExecution(
  argv: readonly string[] = process.argv
): boolean {
  const entryPath = argv[1];

  if (typeof entryPath !== "string" || entryPath.length === 0) {
    return false;
  }

  try {
    return fileURLToPath(import.meta.url) === realpathSync(entryPath);
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  void run().catch(handleRunError);
}
