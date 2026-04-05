#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Command } from "commander";
import {
  resolveGitHubCliToken,
  type AgentBadgeRefreshMode
} from "@legotin/agent-badge-core";

import { runConfigCommand } from "../commands/config.js";
import { runInitCommand } from "../commands/init.js";
import { runDoctorCommand } from "../commands/doctor.js";
import { runPublishCommand } from "../commands/publish.js";
import { runRefreshCommand } from "../commands/refresh.js";
import { runScanCommand } from "../commands/scan.js";
import { runStatusCommand } from "../commands/status.js";
import { runUninstallCommand } from "../commands/uninstall.js";

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

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("agent-badge")
    .description("Track and publish privacy-safe AI usage badges for repositories.");

  program
    .command("init")
    .description("Initialize agent-badge in the current repository.")
    .option("--gist-id <id>", "Connect an existing public GitHub Gist id.")
    .action(async (options: { gistId?: string }) => {
      await runInitCommand({
        gistId: options.gistId,
        ghCliTokenResolver: resolveGitHubCliToken
      });
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
        await runScanCommand({
          includeSession: options.includeSession,
          excludeSession: options.excludeSession
        });
      }
    );

  program
    .command("publish")
    .description("Publish aggregate badge JSON to the configured remote target.")
    .action(async () => {
      await runPublishCommand({
        ghCliTokenResolver: resolveGitHubCliToken
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

        await runRefreshCommand({
          hook: parseRefreshHook(options.hook),
          hookPolicy: hookPolicy ?? (options.failSoft ? "fail-soft" : undefined),
          forceFull: options.forceFull ?? false,
          ghCliTokenResolver: resolveGitHubCliToken
        });
      }
    );

  program
    .command("status")
    .description("Print the current persisted badge, provider, and publish state.")
    .action(async () => {
      await runStatusCommand();
    });

  program
    .command("doctor")
    .description("Inspect repository setup, scan readiness, and publish wiring.")
    .option("--json", "Print a machine-readable result object.")
    .option("--probe-write", "Validate gist write credentials with a no-op update.")
    .action(async (options: { json?: boolean; probeWrite?: boolean }) => {
      await runDoctorCommand({
        json: options.json ?? false,
        probeWrite: options.probeWrite ?? false,
        ghCliTokenResolver: resolveGitHubCliToken
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
        await runUninstallCommand({
          purgeRemote: options.purgeRemote ?? false,
          purgeConfig: options.purgeConfig ?? false,
          purgeState: options.purgeState ?? false,
          purgeLogs: options.purgeLogs ?? true,
          purgeCaches: options.purgeCache ?? true,
          force: options.force ?? false,
          ghCliTokenResolver: resolveGitHubCliToken
        });
      }
    );

  const configCommand = program
    .command("config")
    .description("View or update supported post-init agent-badge settings.")
    .action(async () => {
      await runConfigCommand({
        action: "get"
      });
    });

  configCommand
    .command("get [key]")
    .description("Print the current value for a supported config key.")
    .action(async (key?: string) => {
      await runConfigCommand({
        action: "get",
        key
      });
    });

  configCommand
    .command("set <key> <value>")
    .description("Update a supported config key.")
    .action(async (key: string, value: string) => {
      await runConfigCommand({
        action: "set",
        key,
        value
      });
    });

  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  await buildProgram().parseAsync(argv);
}

export function handleRunError(
  error: unknown,
  stderr: Pick<typeof console, "error"> = console
): void {
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
