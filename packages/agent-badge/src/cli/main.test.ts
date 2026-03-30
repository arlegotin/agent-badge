import { describe, expect, it } from "vitest";

import { buildProgram, run } from "./main.js";

function findCommand(name: string) {
  return buildProgram().commands.find((command) => command.name() === name);
}

describe("buildProgram", () => {
  it("sets the CLI name", () => {
    const program = buildProgram();

    expect(program.name()).toBe("agent-badge");
  });

  it("registers the init command", () => {
    const program = buildProgram();
    const commandNames = program.commands.map((command) => command.name());

    expect(commandNames).toContain("init");
  });

  it("registers the publish command", () => {
    const program = buildProgram();
    const commandNames = program.commands.map((command) => command.name());

    expect(commandNames).toContain("publish");
  });

  it("registers the refresh, status, and config commands", () => {
    const program = buildProgram();
    const commandNames = program.commands.map((command) => command.name());

    expect(commandNames).toContain("refresh");
    expect(commandNames).toContain("status");
    expect(commandNames).toContain("config");
  });

  it("registers refresh hook and recovery options", () => {
    const refreshCommand = findCommand("refresh");
    const optionFlags = refreshCommand?.options.map((option) => option.flags);

    expect(optionFlags).toContain("--hook <name>");
    expect(optionFlags).toContain("--fail-soft");
    expect(optionFlags).toContain("--force-full");
  });

  it("registers config get and set subcommands", () => {
    const configCommand = findCommand("config");
    const subcommandNames = configCommand?.commands.map((command) =>
      command.name()
    );

    expect(subcommandNames).toContain("get");
    expect(subcommandNames).toContain("set");
  });

  it("can execute the publish command through the exported run entrypoint", async () => {
    await expect(run(["node", "agent-badge", "publish"])).rejects.toThrow(
      ".agent-badge/config.json"
    );
  });
});
