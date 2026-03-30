import { Command } from "commander";

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("agent-badge")
    .description("Track and publish privacy-safe AI usage badges for repositories.");

  program
    .command("init")
    .description("Initialize agent-badge in the current repository.")
    .action(() => {
      process.stdout.write("agent-badge init is not implemented yet.\n");
    });

  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  await buildProgram().parseAsync(argv);
}
