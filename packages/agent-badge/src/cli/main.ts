import { Command } from "commander";

import { runInitCommand } from "../commands/init.js";

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("agent-badge")
    .description("Track and publish privacy-safe AI usage badges for repositories.");

  program
    .command("init")
    .description("Initialize agent-badge in the current repository.")
    .action(async () => {
      await runInitCommand();
    });

  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  await buildProgram().parseAsync(argv);
}
