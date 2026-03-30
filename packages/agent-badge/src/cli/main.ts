import { fileURLToPath } from "node:url";

import { Command } from "commander";

import { runConfigCommand } from "../commands/config.js";
import { runInitCommand } from "../commands/init.js";
import { runPublishCommand } from "../commands/publish.js";
import { runRefreshCommand } from "../commands/refresh.js";
import { runScanCommand } from "../commands/scan.js";
import { runStatusCommand } from "../commands/status.js";

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
        gistId: options.gistId
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
      await runPublishCommand();
    });

  program
    .command("refresh")
    .description("Refresh persisted badge state and publish when needed.")
    .option("--hook <name>", "Run the refresh flow for a supported hook mode.")
    .option("--fail-soft", "Return a structured soft failure instead of throwing.")
    .option("--force-full", "Rebuild refresh state from a full scan.")
    .action(
      async (options: {
        hook?: string;
        failSoft?: boolean;
        forceFull?: boolean;
      }) => {
        await runRefreshCommand({
          hook: parseRefreshHook(options.hook),
          failSoft: options.failSoft ?? false,
          forceFull: options.forceFull ?? false
        });
      }
    );

  program
    .command("status")
    .description("Print the current persisted badge, provider, and publish state.")
    .action(async () => {
      await runStatusCommand();
    });

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

function isDirectExecution(argv: readonly string[] = process.argv): boolean {
  const entryPath = argv[1];

  if (typeof entryPath !== "string" || entryPath.length === 0) {
    return false;
  }

  return fileURLToPath(import.meta.url) === entryPath;
}

if (isDirectExecution()) {
  void run().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);

    console.error(message);
    process.exitCode = 1;
  });
}
