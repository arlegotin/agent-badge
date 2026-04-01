import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseNormalizedSessionSummary } from "../providers/session-summary.js";
import {
  estimateIncludedCostUsdMicros,
  type PricingCatalog
} from "./estimate-cost.js";

const sqliteModuleName = "better-sqlite3";

function createPricingCatalog(): PricingCatalog {
  return {
    fetchedAt: null,
    sources: {
      openai: "https://openai.com/api/pricing",
      anthropic: "https://docs.anthropic.com/en/docs/about-claude/pricing"
    },
    providers: {
      openai: {
        "gpt-5.4": {
          inputUsdPerMillion: 2.5,
          cachedInputUsdPerMillion: 0.25,
          cacheWriteUsdPerMillion: null,
          outputUsdPerMillion: 15
        }
      },
      anthropic: {
        "claude-sonnet-3.7": {
          inputUsdPerMillion: 3,
          cachedInputUsdPerMillion: 0.3,
          cacheWriteUsdPerMillion: 3.75,
          outputUsdPerMillion: 15
        }
      }
    }
  };
}

describe("estimateIncludedCostUsdMicros", () => {
  it("estimates Anthropic session cost from explicit usage buckets", async () => {
    const session = parseNormalizedSessionSummary({
      provider: "claude",
      providerSessionId: "claude-session-1",
      startedAt: "2026-03-30T10:00:00Z",
      updatedAt: "2026-03-30T10:05:00Z",
      cwd: "/repo/main",
      gitBranch: "main",
      observedRemoteUrl: "https://github.com/openai/agent-badge.git",
      observedRemoteUrlNormalized: "https://github.com/openai/agent-badge",
      attributionHints: {
        cwdRealPath: "/repo/main",
        transcriptProjectKey: "repo-main"
      },
      tokenUsage: {
        total: 1900,
        input: 1000,
        output: 200,
        cacheCreation: 300,
        cacheRead: 400,
        reasoningOutput: null
      },
      lineage: {
        parentSessionId: null,
        kind: "root"
      },
      metadata: {
        model: "claude-3-7-sonnet",
        modelProvider: "anthropic",
        sourceKind: "project-jsonl",
        cliVersion: null
      }
    });

    const estimated = await estimateIncludedCostUsdMicros({
      sessions: [session],
      homeRoot: "/does/not/matter",
      pricingCatalog: createPricingCatalog()
    });

    expect(estimated).toBe(7_245);
  });

  it("hydrates Codex usage from rollout token_count events", async () => {
    const homeRoot = await mkdtemp(join(tmpdir(), "agent-badge-cost-home-"));
    const codexRoot = join(homeRoot, ".codex");
    const rolloutPath = join(codexRoot, "rollout-test.jsonl");
    const dbPath = join(codexRoot, "state_9.sqlite");
    const sqliteModule = (await import(sqliteModuleName)) as {
      default: new (path: string) => {
        exec(statement: string): void;
        prepare(statement: string): { run(...params: unknown[]): void };
        close(): void;
      };
    };

    await mkdir(codexRoot, { recursive: true });
    await writeFile(
      rolloutPath,
      [
        JSON.stringify({
          timestamp: "2026-04-01T10:17:22.832Z",
          type: "event_msg",
          payload: {
            type: "token_count",
            info: {
              total_token_usage: {
                input_tokens: 1000,
                cached_input_tokens: 200,
                output_tokens: 300,
                reasoning_output_tokens: 50,
                total_tokens: 1100
              }
            }
          }
        })
      ].join("\n"),
      "utf8"
    );

    const database = new sqliteModule.default(dbPath);

    try {
      database.exec(`
        CREATE TABLE threads (
          id TEXT PRIMARY KEY,
          rollout_path TEXT
        );
      `);
      database
        .prepare(
          `
            INSERT INTO threads (id, rollout_path) VALUES (?, ?)
          `
        )
        .run("codex-session-1", rolloutPath);
    } finally {
      database.close();
    }

    const session = parseNormalizedSessionSummary({
      provider: "codex",
      providerSessionId: "codex-session-1",
      startedAt: "2026-04-01T10:17:18Z",
      updatedAt: "2026-04-01T10:17:30Z",
      cwd: "/repo/main",
      gitBranch: "main",
      observedRemoteUrl: "https://github.com/openai/agent-badge.git",
      observedRemoteUrlNormalized: "https://github.com/openai/agent-badge",
      attributionHints: {
        cwdRealPath: "/repo/main",
        transcriptProjectKey: null
      },
      tokenUsage: {
        total: 1100,
        input: null,
        output: null,
        cacheCreation: null,
        cacheRead: null,
        reasoningOutput: null
      },
      lineage: {
        parentSessionId: null,
        kind: "root"
      },
      metadata: {
        model: "gpt-5.4",
        modelProvider: "openai",
        sourceKind: "cli",
        cliVersion: "0.118.0"
      }
    });

    try {
      const estimated = await estimateIncludedCostUsdMicros({
        sessions: [session],
        homeRoot,
        pricingCatalog: createPricingCatalog()
      });

      expect(estimated).toBe(6_550);
    } finally {
      await rm(homeRoot, { recursive: true, force: true });
    }
  });
});
