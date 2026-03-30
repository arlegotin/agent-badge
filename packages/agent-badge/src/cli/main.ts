import { Command } from "commander";

import { runInitCommand } from "../commands/init.js";
import { runPublishCommand } from "../commands/publish.js";
import { runScanCommand } from "../commands/scan.js";

function collectOptionValue(value: string, previous: string[] = []): string[] {
  return [...previous, value];
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

  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  await buildProgram().parseAsync(argv);
}
