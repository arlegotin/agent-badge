import { describe, expect, it } from "vitest";

import { buildProgram } from "./main.js";

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
});
