import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { defaultAgentBadgeConfig, parseAgentBadgeConfig } from "@agent-badge/core";

import { runConfigCommand } from "./config.js";

interface OutputCapture {
  readonly writer: {
    write(chunk: string): void;
  };
  read(): string;
}

interface Fixture {
  readonly repoRoot: string;
  readonly configPath: string;
  cleanup(): Promise<void>;
}

function createOutputCapture(): OutputCapture {
  let output = "";

  return {
    writer: {
      write(chunk: string) {
        output += chunk;
      }
    },
    read() {
      return output;
    }
  };
}

async function writeJsonFile(
  root: string,
  relativePath: string,
  value: unknown
): Promise<string> {
  const targetPath = join(root, relativePath);

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");

  return targetPath;
}

async function createFixture(): Promise<Fixture> {
  const repoRoot = await mkdtemp(join(tmpdir(), "agent-badge-config-repo-"));
  const configPath = await writeJsonFile(
    repoRoot,
    ".agent-badge/config.json",
    defaultAgentBadgeConfig
  );

  return {
    repoRoot,
    configPath,
    cleanup() {
      return rm(repoRoot, { recursive: true, force: true });
    }
  };
}

async function readConfigFile(configPath: string) {
  return parseAgentBadgeConfig(JSON.parse(await readFile(configPath, "utf8")));
}

describe("runConfigCommand", () => {
  it("prints the current supported settings when no key is provided", async () => {
    const fixture = await createFixture();
    const output = createOutputCapture();

    try {
      const result = await runConfigCommand({
        cwd: fixture.repoRoot,
        stdout: output.writer
      });

      expect(result.action).toBe("get");
      expect(output.read()).toContain("agent-badge config");
      expect(output.read()).toContain("- providers.codex.enabled=true");
      expect(output.read()).toContain("- providers.claude.enabled=true");
      expect(output.read()).toContain("- badge.label=AI Usage");
      expect(output.read()).toContain("- badge.mode=sessions");
      expect(output.read()).toContain("- refresh.prePush.enabled=true");
      expect(output.read()).toContain("- refresh.prePush.mode=fail-soft");
      expect(output.read()).toContain("- privacy.aggregateOnly=true");
      expect(output.read()).toContain("- privacy.output=standard");
    } finally {
      await fixture.cleanup();
    }
  });

  it("persists supported config mutations", async () => {
    const fixture = await createFixture();
    const output = createOutputCapture();

    try {
      await runConfigCommand({
        cwd: fixture.repoRoot,
        stdout: output.writer,
        action: "set",
        key: "providers.codex.enabled",
        value: "false"
      });
      await runConfigCommand({
        cwd: fixture.repoRoot,
        stdout: output.writer,
        action: "set",
        key: "providers.claude.enabled",
        value: "false"
      });
      await runConfigCommand({
        cwd: fixture.repoRoot,
        stdout: output.writer,
        action: "set",
        key: "badge.label",
        value: "Agent Sessions"
      });
      await runConfigCommand({
        cwd: fixture.repoRoot,
        stdout: output.writer,
        action: "set",
        key: "badge.mode",
        value: "tokens"
      });
      await runConfigCommand({
        cwd: fixture.repoRoot,
        stdout: output.writer,
        action: "set",
        key: "refresh.prePush.enabled",
        value: "false"
      });
      await runConfigCommand({
        cwd: fixture.repoRoot,
        stdout: output.writer,
        action: "set",
        key: "refresh.prePush.mode",
        value: "strict"
      });
      await runConfigCommand({
        cwd: fixture.repoRoot,
        stdout: output.writer,
        action: "set",
        key: "privacy.output",
        value: "minimal"
      });

      const config = await readConfigFile(fixture.configPath);

      expect(config.providers.codex.enabled).toBe(false);
      expect(config.providers.claude.enabled).toBe(false);
      expect(config.badge.label).toBe("Agent Sessions");
      expect(config.badge.mode).toBe("tokens");
      expect(config.refresh.prePush.enabled).toBe(false);
      expect(config.refresh.prePush.mode).toBe("strict");
      expect(config.privacy.aggregateOnly).toBe(true);
      expect(config.privacy.output).toBe("minimal");
      expect(output.read()).toContain("- Updated: privacy.output=minimal");
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects disabling aggregate-only publishing", async () => {
    const fixture = await createFixture();

    try {
      await expect(
        runConfigCommand({
          cwd: fixture.repoRoot,
          action: "set",
          key: "privacy.aggregateOnly",
          value: "false"
        })
      ).rejects.toThrow(
        "privacy.aggregateOnly must remain true because agent-badge only publishes aggregate data."
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects unsupported config keys", async () => {
    const fixture = await createFixture();

    try {
      await expect(
        runConfigCommand({
          cwd: fixture.repoRoot,
          action: "set",
          key: "publish.gistId",
          value: "gist_123"
        })
      ).rejects.toThrow("Unsupported config key: publish.gistId");
    } finally {
      await fixture.cleanup();
    }
  });
});
