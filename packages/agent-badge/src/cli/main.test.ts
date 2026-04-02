import { readFile } from "node:fs/promises";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildProgram, isDirectExecution } from "./main.js";

function findCommand(name: string) {
  return buildProgram().commands.find((command) => command.name() === name);
}

describe("buildProgram", () => {
  it("declares a node shebang for the published bin entry", async () => {
    const source = await readFile(new URL("./main.ts", import.meta.url), "utf8");

    expect(source.startsWith("#!/usr/bin/env node\n")).toBe(true);
  });

  it("treats a symlinked bin path as direct execution", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "agent-badge-cli-"));
    const symlinkPath = join(tempRoot, "agent-badge");
    const mainPath = new URL("./main.ts", import.meta.url);

    try {
      await symlink(mainPath, symlinkPath);

      expect(isDirectExecution([process.execPath, symlinkPath])).toBe(true);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

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

  it("registers the doctor command", () => {
    const program = buildProgram();
    const commandNames = program.commands.map((command) => command.name());

    expect(commandNames).toContain("doctor");
  });

  it("registers the refresh, status, uninstall, and config commands", () => {
    const program = buildProgram();
    const commandNames = program.commands.map((command) => command.name());

    expect(commandNames).toContain("refresh");
    expect(commandNames).toContain("status");
    expect(commandNames).toContain("uninstall");
    expect(commandNames).toContain("config");
  });

  it("registers refresh hook and recovery options", () => {
    const refreshCommand = findCommand("refresh");
    const optionFlags = refreshCommand?.options.map((option) => option.flags);

    expect(optionFlags).toContain("--hook <name>");
    expect(optionFlags).toContain("--hook-policy <mode>");
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

  it("registers doctor output and recovery options", () => {
    const doctorCommand = findCommand("doctor");
    const optionFlags = doctorCommand?.options.map((option) => option.flags);

    expect(optionFlags).toContain("--json");
    expect(optionFlags).toContain("--probe-write");
  });

  it("registers uninstall purge options", () => {
    const uninstallCommand = findCommand("uninstall");
    const optionFlags = uninstallCommand?.options.map((option) => option.flags);

    expect(optionFlags).toEqual(
      expect.arrayContaining([
        "--purge-remote",
        "--purge-config",
        "--purge-state",
        "--purge-logs",
        "--purge-cache",
        "--force"
      ])
    );
  });
});
