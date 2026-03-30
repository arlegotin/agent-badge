import { appendFile, utimes } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildClaudeIncrementalCursorFromSource,
  scanClaudeSessions,
  scanClaudeSessionsIncremental
} from "./claude-adapter.js";

const testkitModuleName = "@agent-badge/testkit";

interface ClaudeFixture {
  readonly homeRoot: string;
  cleanup(): Promise<void>;
}

async function createClaudeFixtureHome(): Promise<ClaudeFixture> {
  const testkitModule = (await import(testkitModuleName)) as {
    createClaudeFixtureHome(): Promise<ClaudeFixture>;
  };

  return testkitModule.createClaudeFixtureHome();
}

async function withClaudeFixture<T>(
  callback: (fixture: ClaudeFixture) => Promise<T>
): Promise<T> {
  const fixture = await createClaudeFixtureHome();

  try {
    return await callback(fixture);
  } finally {
    await fixture.cleanup();
  }
}

describe("scanClaudeSessions", () => {
  it("dedupes repeated assistant message.id rows", async () => {
    await withClaudeFixture(async (fixture) => {
      const sessions = await scanClaudeSessions({ homeRoot: fixture.homeRoot });
      const mainSession = sessions.find(
        (session) => session.providerSessionId === "session-main"
      );

      expect(mainSession).toMatchObject({
        provider: "claude",
        tokenUsage: {
          total: 268,
          input: 12,
          output: 26,
          cacheCreation: 150,
          cacheRead: 80
        },
        observedRemoteUrlNormalized: "https://github.com/openai/agent-badge"
      });
    });
  });

  it("ignores sessions-index.json as a canonical source", async () => {
    await withClaudeFixture(async (fixture) => {
      const sessions = await scanClaudeSessions({ homeRoot: fixture.homeRoot });

      expect(sessions.map((session) => session.providerSessionId).sort()).toEqual(
        ["session-main", "session-secondary", "session-tertiary"]
      );
    });
  });

  it("ignores non-assistant rows for totals", async () => {
    await withClaudeFixture(async (fixture) => {
      const sessions = await scanClaudeSessions({ homeRoot: fixture.homeRoot });
      const mainSession = sessions.find(
        (session) => session.providerSessionId === "session-main"
      );
      const tertiarySession = sessions.find(
        (session) => session.providerSessionId === "session-tertiary"
      );

      expect(mainSession?.tokenUsage.total).toBe(268);
      expect(tertiarySession?.tokenUsage.total).toBe(34);
      expect(JSON.stringify(sessions)).not.toContain("Summarize the repo state");
      expect(JSON.stringify(sessions)).not.toContain("ignored raw text");
    });
  });
});

describe("scanClaudeSessionsIncremental", () => {
  it("returns no sessions when no project files changed after the cursor watermark", async () => {
    await withClaudeFixture(async (fixture) => {
      const cursor = await buildClaudeIncrementalCursorFromSource(fixture.homeRoot);
      const result = await scanClaudeSessionsIncremental({
        homeRoot: fixture.homeRoot,
        cursor
      });

      expect(result.mode).toBe("incremental");
      expect(result.sessions).toEqual([]);
      expect(result.cursor).toBe(cursor);
    });
  });

  it("returns only sessions whose project files changed after the cursor watermark", async () => {
    await withClaudeFixture(async (fixture) => {
      const cursor = await buildClaudeIncrementalCursorFromSource(fixture.homeRoot);
      const sessionPath = join(
        fixture.homeRoot,
        ".claude",
        "projects",
        "project-with-dedupe",
        "session-main.jsonl"
      );

      await appendFile(
        sessionPath,
        '\n{"type":"assistant","sessionId":"session-main","timestamp":"2026-03-06T09:04:00Z","cwd":"/repo/main","gitBranch":"main","gitOriginUrl":"https://github.com/openai/agent-badge.git","message":{"role":"assistant","id":"assistant-3","model":"claude-3-7-sonnet","usage":{"input_tokens":2,"output_tokens":3,"cache_creation_input_tokens":0,"cache_read_input_tokens":4}}}\n',
        "utf8"
      );
      await utimes(
        sessionPath,
        new Date("2026-03-31T00:00:00Z"),
        new Date("2026-03-31T00:00:00Z")
      );

      const result = await scanClaudeSessionsIncremental({
        homeRoot: fixture.homeRoot,
        cursor
      });

      expect(result.mode).toBe("incremental");
      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]).toMatchObject({
        providerSessionId: "session-main",
        updatedAt: "2026-03-06T09:04:00Z",
        tokenUsage: {
          total: 277,
          input: 14,
          output: 29,
          cacheCreation: 150,
          cacheRead: 84
        }
      });
      expect(result.cursor).toContain("claude-project-jsonl-watermark-v1");
    });
  });
});
