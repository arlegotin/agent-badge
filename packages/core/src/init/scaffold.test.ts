import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { parseAgentBadgeConfig } from "../config/config-schema.js";
import { parseAgentBadgeState } from "../state/state-schema.js";
import { runInitPreflight } from "./preflight.js";
import { applyAgentBadgeScaffold } from "./scaffold.js";

const execFileAsync = promisify(execFile);
const initializedAt = "2026-03-30T00:00:00.000Z";

interface Fixture {
  readonly root: string;
  cleanup(): Promise<void>;
}

async function createRepoFixture(options: {
  readonly git?: boolean;
  readonly readme?: boolean;
  readonly files?: Record<string, string>;
} = {}): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "agent-badge-scaffold-"));

  if (options.git ?? true) {
    await execFileAsync("git", ["init", "--quiet"], { cwd: root });
  }

  if (options.readme ?? true) {
    await writeFile(join(root, "README.md"), "# Fixture Repo\n", "utf8");
  }

  for (const [relativePath, content] of Object.entries(options.files ?? {})) {
    const targetPath = join(root, relativePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content, "utf8");
  }

  return {
    root,
    cleanup() {
      return rm(root, { recursive: true, force: true });
    }
  };
}

async function createProviderHome(options: {
  readonly codex?: boolean;
  readonly claude?: boolean;
} = {}): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "agent-badge-home-"));

  if (options.codex ?? true) {
    await mkdir(join(root, ".codex"), { recursive: true });
  }

  if (options.claude ?? true) {
    await mkdir(join(root, ".claude"), { recursive: true });
  }

  return {
    root,
    cleanup() {
      return rm(root, { recursive: true, force: true });
    }
  };
}

async function readJson(targetPath: string): Promise<unknown> {
  return JSON.parse(await readFile(targetPath, "utf8")) as unknown;
}

describe("applyAgentBadgeScaffold", () => {
  it("creates .agent-badge/config.json, .agent-badge/state.json, .agent-badge/cache, and .agent-badge/logs on first run", async () => {
    const repo = await createRepoFixture();
    const providers = await createProviderHome({
      claude: false
    });

    try {
      const preflight = await runInitPreflight({
        cwd: repo.root,
        homeRoot: providers.root
      });
      const result = await applyAgentBadgeScaffold({
        cwd: repo.root,
        preflight,
        now: () => new Date(initializedAt)
      });

      expect(result.created).toEqual(
        expect.arrayContaining([
          ".agent-badge",
          ".agent-badge/cache",
          ".agent-badge/logs",
          ".agent-badge/config.json",
          ".agent-badge/state.json"
        ])
      );
      expect(result.warnings).toEqual([]);
      expect(existsSync(join(repo.root, ".agent-badge/cache"))).toBe(true);
      expect(existsSync(join(repo.root, ".agent-badge/logs"))).toBe(true);

      const config = parseAgentBadgeConfig(
        await readJson(join(repo.root, ".agent-badge/config.json"))
      );
      const state = parseAgentBadgeState(
        await readJson(join(repo.root, ".agent-badge/state.json"))
      );

      expect(config.providers.codex.enabled).toBe(true);
      expect(config.providers.claude.enabled).toBe(false);
      expect(config.badge.mode).toBe("combined");
      expect(state.init.initialized).toBe(true);
      expect(state.init.lastInitializedAt).toBe(initializedAt);
    } finally {
      await Promise.all([repo.cleanup(), providers.cleanup()]);
    }
  });

  it("re-running init reuses existing artifacts instead of duplicating content", async () => {
    const repo = await createRepoFixture();
    const providers = await createProviderHome();

    try {
      const preflight = await runInitPreflight({
        cwd: repo.root,
        homeRoot: providers.root
      });

      await applyAgentBadgeScaffold({
        cwd: repo.root,
        preflight,
        now: () => new Date(initializedAt)
      });

      const configBefore = await readFile(
        join(repo.root, ".agent-badge/config.json"),
        "utf8"
      );
      const stateBefore = await readFile(
        join(repo.root, ".agent-badge/state.json"),
        "utf8"
      );

      const secondRun = await applyAgentBadgeScaffold({
        cwd: repo.root,
        preflight,
        now: () => new Date("2026-04-01T00:00:00.000Z")
      });

      expect(secondRun.created).toEqual([]);
      expect(secondRun.reused).toEqual(
        expect.arrayContaining([
          ".agent-badge",
          ".agent-badge/cache",
          ".agent-badge/logs",
          ".agent-badge/config.json",
          ".agent-badge/state.json"
        ])
      );
      expect(
        await readFile(join(repo.root, ".agent-badge/config.json"), "utf8")
      ).toBe(configBefore);
      expect(
        await readFile(join(repo.root, ".agent-badge/state.json"), "utf8")
      ).toBe(stateBefore);
    } finally {
      await Promise.all([repo.cleanup(), providers.cleanup()]);
    }
  });

  it("preserves valid existing values while filling incomplete scaffold files", async () => {
    const repo = await createRepoFixture();
    const providers = await createProviderHome({
      claude: false
    });
    const scaffoldRoot = join(repo.root, ".agent-badge");

    try {
      await mkdir(scaffoldRoot, { recursive: true });
      await writeFile(
        join(scaffoldRoot, "config.json"),
        JSON.stringify(
          {
            version: 1,
            badge: {
              label: "Custom Label"
            },
            privacy: {
              output: "minimal"
            }
          },
          null,
          2
        ),
        "utf8"
      );
      await writeFile(
        join(scaffoldRoot, "state.json"),
        JSON.stringify(
          {
            version: 1,
            publish: {
              lastPublishedHash: "abc123",
              lastPublishedAt: "2026-03-30T01:00:00.000Z"
            },
            refresh: {
              lastRefreshedAt: "2026-03-30T02:00:00.000Z",
              lastScanMode: "incremental",
              lastPublishDecision: "skipped",
              summary: {
                includedSessions: 2,
                includedTokens: 120,
                ambiguousSessions: 1,
                excludedSessions: 0
              }
            }
          },
          null,
          2
        ),
        "utf8"
      );

      const preflight = await runInitPreflight({
        cwd: repo.root,
        homeRoot: providers.root
      });
      const result = await applyAgentBadgeScaffold({
        cwd: repo.root,
        preflight,
        now: () => new Date(initializedAt)
      });

      const config = parseAgentBadgeConfig(
        await readJson(join(repo.root, ".agent-badge/config.json"))
      );
      const state = parseAgentBadgeState(
        await readJson(join(repo.root, ".agent-badge/state.json"))
      );

      expect(result.warnings).toHaveLength(2);
      expect(config.badge.label).toBe("Custom Label");
      expect(config.providers.claude.enabled).toBe(false);
      expect(config.privacy.output).toBe("minimal");
      expect(config.repo.aliases).toEqual({
        remotes: [],
        slugs: []
      });
      expect(state.publish.lastPublishedHash).toBe("abc123");
      expect(state.publish.lastPublishedAt).toBe("2026-03-30T01:00:00.000Z");
      expect(state.refresh).toEqual({
        lastRefreshedAt: "2026-03-30T02:00:00.000Z",
        lastScanMode: "incremental",
        lastPublishDecision: "skipped",
        summary: {
          includedSessions: 2,
          includedTokens: 120,
          includedEstimatedCostUsdMicros: null,
          ambiguousSessions: 1,
          excludedSessions: 0
        }
      });
      expect(state.init.initialized).toBe(true);
    } finally {
      await Promise.all([repo.cleanup(), providers.cleanup()]);
    }
  });
});
