import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  defaultAgentBadgeConfig,
  defaultAgentBadgeState,
  type AgentBadgeState
} from "@agent-badge/core";

import { runStatusCommand } from "./status.js";

interface OutputCapture {
  readonly writer: {
    write(chunk: string): void;
  };
  read(): string;
}

interface Fixture {
  readonly repoRoot: string;
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
): Promise<void> {
  const targetPath = join(root, relativePath);

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createFixture(options?: {
  readonly config?: unknown;
  readonly state?: AgentBadgeState;
}): Promise<Fixture> {
  const repoRoot = await mkdtemp(join(tmpdir(), "agent-badge-status-repo-"));

  await writeJsonFile(
    repoRoot,
    ".agent-badge/config.json",
    options?.config ?? defaultAgentBadgeConfig
  );
  await writeJsonFile(
    repoRoot,
    ".agent-badge/state.json",
    options?.state ?? defaultAgentBadgeState
  );

  return {
    repoRoot,
    cleanup() {
      return rm(repoRoot, { recursive: true, force: true });
    }
  };
}

function configuredState(): AgentBadgeState {
  return {
    ...defaultAgentBadgeState,
    checkpoints: {
      codex: {
        cursor: "opaque-codex-cursor",
        lastScannedAt: "2026-03-30T19:00:00.000Z"
      },
      claude: {
        cursor: "opaque-claude-cursor",
        lastScannedAt: "2026-03-30T19:05:00.000Z"
      }
    },
    publish: {
      status: "published",
      gistId: "gist_789",
      lastPublishedHash: "hash_789",
      lastPublishedAt: "2026-03-30T19:10:00.000Z"
    },
    refresh: {
      lastRefreshedAt: "2026-03-30T19:12:00.000Z",
      lastScanMode: "incremental",
      lastPublishDecision: "published",
      summary: {
        includedSessions: 5,
        includedTokens: 610,
        ambiguousSessions: 1,
        excludedSessions: 2
      }
    }
  };
}

describe("runStatusCommand", () => {
  it("prints configured publish status and refresh totals", async () => {
    const fixture = await createFixture({
      config: {
        ...defaultAgentBadgeConfig,
        publish: {
          ...defaultAgentBadgeConfig.publish,
          gistId: "gist_789",
          badgeUrl:
            "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_789%2Fraw%2Fagent-badge.json&cacheSeconds=300"
        }
      },
      state: configuredState()
    });
    const output = createOutputCapture();

    try {
      const result = await runStatusCommand({
        cwd: fixture.repoRoot,
        stdout: output.writer
      });
      const lines = result.report.split("\n");

      expect(lines).toEqual([
        "agent-badge status",
        "- Totals: 5 sessions, 610 tokens",
        "- Providers: codex=enabled, claude=enabled",
        "- Publish: published | gist configured=yes | last published=2026-03-30T19:10:00.000Z | gistId=gist_789 | lastPublishedHash=hash_789",
        "- Last refresh: 2026-03-30T19:12:00.000Z (incremental)",
        "- Checkpoints: codex=2026-03-30T19:00:00.000Z, claude=2026-03-30T19:05:00.000Z"
      ]);
      expect(output.read()).not.toContain("opaque-codex-cursor");
      expect(output.read()).not.toContain("opaque-claude-cursor");
    } finally {
      await fixture.cleanup();
    }
  });

  it("prints deferred publish status when badge setup is not configured", async () => {
    const fixture = await createFixture({
      state: {
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          status: "deferred"
        }
      }
    });
    const output = createOutputCapture();

    try {
      await runStatusCommand({
        cwd: fixture.repoRoot,
        stdout: output.writer
      });

      expect(output.read()).toContain(
        "- Publish: deferred | gist configured=no"
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("prints unavailable totals before the first refresh", async () => {
    const fixture = await createFixture();
    const output = createOutputCapture();

    try {
      await runStatusCommand({
        cwd: fixture.repoRoot,
        stdout: output.writer
      });

      expect(output.read()).toContain(
        "- Totals: unavailable (run `agent-badge refresh`)"
      );
      expect(output.read()).toContain("- Last refresh: unavailable");
      expect(output.read()).toContain(
        "- Checkpoints: codex=not yet scanned, claude=not yet scanned"
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("omits optional publish detail in minimal privacy mode", async () => {
    const fixture = await createFixture({
      config: {
        ...defaultAgentBadgeConfig,
        publish: {
          ...defaultAgentBadgeConfig.publish,
          gistId: "gist_minimal",
          badgeUrl:
            "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_minimal%2Fraw%2Fagent-badge.json&cacheSeconds=300"
        },
        privacy: {
          ...defaultAgentBadgeConfig.privacy,
          output: "minimal"
        }
      },
      state: configuredState()
    });
    const output = createOutputCapture();

    try {
      await runStatusCommand({
        cwd: fixture.repoRoot,
        stdout: output.writer
      });

      expect(output.read()).toContain(
        "- Publish: published | gist configured=yes | last published=2026-03-30T19:10:00.000Z"
      );
      expect(output.read()).not.toContain("gistId=");
      expect(output.read()).not.toContain("lastPublishedHash=");
    } finally {
      await fixture.cleanup();
    }
  });
});
