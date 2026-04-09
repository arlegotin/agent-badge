import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  defaultAgentBadgeConfig,
  parseAgentBadgeConfig
} from "@legotin/agent-badge-core";

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
  readonly packageJsonPath: string;
  readonly prePushHookPath: string;
  cleanup(): Promise<void>;
}

const execFileAsync = promisify(execFile);

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
  const packageJsonPath = join(repoRoot, "package.json");
  const prePushHookPath = join(repoRoot, ".git/hooks/pre-push");

  await execFileAsync("git", ["init", "--quiet"], { cwd: repoRoot });
  const configPath = await writeJsonFile(
    repoRoot,
    ".agent-badge/config.json",
    defaultAgentBadgeConfig
  );
  await writeJsonFile(repoRoot, "package-lock.json", {});

  return {
    repoRoot,
    configPath,
    packageJsonPath,
    prePushHookPath,
    cleanup() {
      return rm(repoRoot, { recursive: true, force: true });
    }
  };
}

async function readConfigFile(configPath: string) {
  return parseAgentBadgeConfig(JSON.parse(await readFile(configPath, "utf8")));
}

function buildLegacyManagedHookBlock(mode: "fail-soft" | "strict" = "fail-soft"): string {
  const fallback = mode === "fail-soft" ? " || true" : "";

  return [
    "#!/bin/sh",
    "",
    "echo custom-check",
    "",
    "# agent-badge:start",
    `npm run --silent agent-badge:refresh${fallback}`,
    "# agent-badge:end",
    ""
  ].join("\n");
}

async function writeLegacyRuntimeManifest(repoRoot: string): Promise<void> {
  await writeJsonFile(repoRoot, "package.json", {
    name: "fixture-repo",
    private: true,
    scripts: {
      test: "vitest --run",
      "agent-badge:init": "agent-badge init",
      "agent-badge:refresh":
        "agent-badge refresh --hook pre-push --hook-policy fail-soft"
    },
    devDependencies: {
      "@legotin/agent-badge": "^1.2.3",
      typescript: "^5.0.0"
    }
  });
}

describe("runConfigCommand", () => {
  it("prints the current supported settings when no key is provided", async () => {
    const fixture = await createFixture();
    const output = createOutputCapture();

    try {
      const result = await runConfigCommand({
        cwd: fixture.repoRoot,
        runtimeEnv: {
          PATH: ""
        },
        stdout: output.writer
      });

      expect(result.action).toBe("get");
      expect(output.read()).toContain("agent-badge config");
      expect(output.read()).toContain("- providers.codex.enabled=true");
      expect(output.read()).toContain("- providers.claude.enabled=true");
      expect(output.read()).toContain("- badge.label=AI burn");
      expect(output.read()).toContain("- badge.mode=combined");
      expect(output.read()).toContain("- badge.style=flat");
      expect(output.read()).toContain("- badge.color=#E8A515");
      expect(output.read()).toContain("- badge.colorZero=lightgrey");
      expect(output.read()).toContain("- badge.cacheSeconds=300");
      expect(output.read()).toContain("- refresh.prePush.enabled=true");
      expect(output.read()).toContain("- refresh.prePush.mode=fail-soft");
      expect(output.read()).toContain("- Shared runtime: missing.");
      expect(output.read()).toContain("npm install -g @legotin/agent-badge");
      expect(output.read()).toContain("pnpm add -g @legotin/agent-badge");
      expect(output.read()).toContain("bun add -g @legotin/agent-badge");
      expect(output.read()).toContain("- Pre-push policy: fail-soft");
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
        key: "badge.style",
        value: "for-the-badge"
      });
      await runConfigCommand({
        cwd: fixture.repoRoot,
        stdout: output.writer,
        action: "set",
        key: "badge.color",
        value: "orange"
      });
      await runConfigCommand({
        cwd: fixture.repoRoot,
        stdout: output.writer,
        action: "set",
        key: "badge.colorZero",
        value: "silver"
      });
      await runConfigCommand({
        cwd: fixture.repoRoot,
        stdout: output.writer,
        action: "set",
        key: "badge.cacheSeconds",
        value: "900"
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
      expect(config.badge.style).toBe("for-the-badge");
      expect(config.badge.color).toBe("orange");
      expect(config.badge.colorZero).toBe("silver");
      expect(config.badge.cacheSeconds).toBe(900);
      expect(config.refresh.prePush.enabled).toBe(false);
      expect(config.refresh.prePush.mode).toBe("strict");
      expect(config.privacy.aggregateOnly).toBe(true);
      expect(config.privacy.output).toBe("minimal");
      expect(output.read()).toContain("- Updated: privacy.output=minimal");
      expect(output.read()).toContain("- Pre-push policy: strict");
    } finally {
      await fixture.cleanup();
    }
  }, 10_000);

  it("updates the managed hook to strict mode without creating repo-local runtime manifest ownership", async () => {
    const fixture = await createFixture();
    const output = createOutputCapture();

    try {
      await runConfigCommand({
        cwd: fixture.repoRoot,
        runtimeEnv: {
          PATH: ""
        },
        stdout: output.writer,
        action: "set",
        key: "refresh.prePush.mode",
        value: "strict"
      });

      const config = await readConfigFile(fixture.configPath);
      const hookContent = await readFile(fixture.prePushHookPath, "utf8");

      expect(config.refresh.prePush.mode).toBe("strict");
      expect(existsSync(fixture.packageJsonPath)).toBe(false);
      expect(output.read()).toContain("- Shared runtime: missing.");
      expect(output.read()).toContain("npm install -g @legotin/agent-badge");
      expect(hookContent).toContain("command -v agent-badge >/dev/null 2>&1");
      expect(hookContent).toContain(
        "agent-badge refresh --hook pre-push --hook-policy strict"
      );
      expect(hookContent).not.toContain("|| true");
    } finally {
      await fixture.cleanup();
    }
  });

  it("removes managed runtime manifest ownership when refresh settings rewrite a legacy repo hook", async () => {
    const fixture = await createFixture();

    try {
      await writeLegacyRuntimeManifest(fixture.repoRoot);
      await writeFile(
        fixture.prePushHookPath,
        buildLegacyManagedHookBlock(),
        "utf8"
      );

      await runConfigCommand({
        cwd: fixture.repoRoot,
        action: "set",
        key: "refresh.prePush.mode",
        value: "strict"
      });

      const packageJson = JSON.parse(
        await readFile(fixture.packageJsonPath, "utf8")
      ) as {
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const hookContent = await readFile(fixture.prePushHookPath, "utf8");

      expect(packageJson.scripts?.test).toBe("vitest --run");
      expect(packageJson.scripts?.["agent-badge:init"]).toBeUndefined();
      expect(packageJson.scripts?.["agent-badge:refresh"]).toBeUndefined();
      expect(packageJson.devDependencies?.typescript).toBe("^5.0.0");
      expect(packageJson.devDependencies?.["@legotin/agent-badge"]).toBeUndefined();
      expect(hookContent).toContain("echo custom-check");
      expect(hookContent).toContain("command -v agent-badge >/dev/null 2>&1");
      expect(hookContent).toContain(
        "agent-badge refresh --hook pre-push --hook-policy strict"
      );
      expect(hookContent).not.toContain("npm run --silent agent-badge:refresh");
      expect(hookContent).not.toContain("|| true");
    } finally {
      await fixture.cleanup();
    }
  });

  it("removes only the managed block when pre-push is disabled", async () => {
    const fixture = await createFixture();

    try {
      await writeFile(
        fixture.prePushHookPath,
        buildLegacyManagedHookBlock(),
        "utf8"
      );

      await runConfigCommand({
        cwd: fixture.repoRoot,
        action: "set",
        key: "refresh.prePush.enabled",
        value: "false"
      });

      const config = await readConfigFile(fixture.configPath);
      const hookContent = await readFile(fixture.prePushHookPath, "utf8");

      expect(config.refresh.prePush.enabled).toBe(false);
      expect(hookContent).toBe("#!/bin/sh\n\necho custom-check\n");
      expect(hookContent).not.toContain("# agent-badge:start");
      expect(hookContent).not.toContain("# agent-badge:end");
      expect(existsSync(fixture.packageJsonPath)).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it("restores one managed block when pre-push is re-enabled", async () => {
    const fixture = await createFixture();

    try {
      await writeFile(
        fixture.prePushHookPath,
        buildLegacyManagedHookBlock(),
        "utf8"
      );

      await runConfigCommand({
        cwd: fixture.repoRoot,
        action: "set",
        key: "refresh.prePush.enabled",
        value: "false"
      });
      await runConfigCommand({
        cwd: fixture.repoRoot,
        action: "set",
        key: "refresh.prePush.enabled",
        value: "true"
      });

      const hookContent = await readFile(fixture.prePushHookPath, "utf8");

      expect(hookContent).toContain("echo custom-check");
      expect(hookContent.match(/# agent-badge:start/gm)).toHaveLength(1);
      expect(hookContent.match(/# agent-badge:end/gm)).toHaveLength(1);
      expect(hookContent).toContain("command -v agent-badge >/dev/null 2>&1");
      expect(hookContent).toContain(
        "agent-badge refresh --hook pre-push --hook-policy fail-soft || true"
      );
      expect(existsSync(fixture.packageJsonPath)).toBe(false);
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

  it("rewrites the stored badge URL when cacheSeconds changes", async () => {
    const fixture = await createFixture();

    try {
      await writeJsonFile(fixture.repoRoot, ".agent-badge/config.json", {
        ...defaultAgentBadgeConfig,
        publish: {
          ...defaultAgentBadgeConfig.publish,
          gistId: "gist_123",
          badgeUrl:
            "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_123%2Fraw%2Fagent-badge.json&cacheSeconds=300"
        }
      });

      await runConfigCommand({
        cwd: fixture.repoRoot,
        action: "set",
        key: "badge.cacheSeconds",
        value: "900"
      });

      const config = await readConfigFile(fixture.configPath);

      expect(config.badge.cacheSeconds).toBe(900);
      expect(config.publish.badgeUrl).toBe(
        "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_123%2Fraw%2Fagent-badge.json&cacheSeconds=900"
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("rewrites the stored badge URL when style changes", async () => {
    const fixture = await createFixture();

    try {
      await writeJsonFile(fixture.repoRoot, ".agent-badge/config.json", {
        ...defaultAgentBadgeConfig,
        publish: {
          ...defaultAgentBadgeConfig.publish,
          gistId: "gist_123",
          badgeUrl:
            "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_123%2Fraw%2Fagent-badge.json&cacheSeconds=300"
        }
      });

      await runConfigCommand({
        cwd: fixture.repoRoot,
        action: "set",
        key: "badge.style",
        value: "flat-square"
      });

      const config = await readConfigFile(fixture.configPath);

      expect(config.badge.style).toBe("flat-square");
      expect(config.publish.badgeUrl).toBe(
        "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_123%2Fraw%2Fagent-badge.json&cacheSeconds=300&style=flat-square"
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("removes the style query when returning to flat", async () => {
    const fixture = await createFixture();

    try {
      await writeJsonFile(fixture.repoRoot, ".agent-badge/config.json", {
        ...defaultAgentBadgeConfig,
        badge: {
          ...defaultAgentBadgeConfig.badge,
          style: "plastic"
        },
        publish: {
          ...defaultAgentBadgeConfig.publish,
          gistId: "gist_123",
          badgeUrl:
            "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_123%2Fraw%2Fagent-badge.json&cacheSeconds=300&style=plastic"
        }
      });

      await runConfigCommand({
        cwd: fixture.repoRoot,
        action: "set",
        key: "badge.style",
        value: "flat"
      });

      const config = await readConfigFile(fixture.configPath);

      expect(config.badge.style).toBe("flat");
      expect(config.publish.badgeUrl).toBe(
        "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_123%2Fraw%2Fagent-badge.json&cacheSeconds=300"
      );
    } finally {
      await fixture.cleanup();
    }
  });
});
