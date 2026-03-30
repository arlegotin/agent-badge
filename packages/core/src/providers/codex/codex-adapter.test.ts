import { rename } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { scanCodexSessions } from "./codex-adapter.js";

const testkitModuleName = "@agent-badge/testkit";

interface CodexFixture {
  readonly homeRoot: string;
  readonly codexRoot: string | null;
  cleanup(): Promise<void>;
}

async function createCodexFixtureHome(): Promise<CodexFixture> {
  const testkitModule = (await import(testkitModuleName)) as {
    createCodexFixtureHome(): Promise<CodexFixture>;
  };

  return testkitModule.createCodexFixtureHome();
}

async function withCodexFixture<T>(
  callback: (fixture: CodexFixture) => Promise<T>
): Promise<T> {
  const fixture = await createCodexFixtureHome();

  try {
    return await callback(fixture);
  } finally {
    await fixture.cleanup();
  }
}

describe("scanCodexSessions", () => {
  it("dedupes by threads.id", async () => {
    await withCodexFixture(async (fixture) => {
      const sessions = await scanCodexSessions({ homeRoot: fixture.homeRoot });
      const sessionIds = sessions.map((session) => session.providerSessionId);

      expect(sessions).toHaveLength(4);
      expect(new Set(sessionIds).size).toBe(4);
      expect(sessionIds).not.toContain("thread-history-only");
      expect(
        sessions.find((session) => session.providerSessionId === "thread-root")
      ).toMatchObject({
        provider: "codex",
        observedRemoteUrlNormalized: "https://github.com/openai/agent-badge",
        tokenUsage: {
          total: 1200
        }
      });
    });
  });

  it("preserves thread_spawn_edges lineage", async () => {
    await withCodexFixture(async (fixture) => {
      const sessions = await scanCodexSessions({ homeRoot: fixture.homeRoot });
      const parentSession = sessions.find(
        (session) => session.providerSessionId === "thread-parent"
      );
      const childSession = sessions.find(
        (session) => session.providerSessionId === "thread-child"
      );

      expect(parentSession?.lineage).toEqual({
        parentSessionId: null,
        kind: "root"
      });
      expect(childSession?.lineage).toEqual({
        parentSessionId: "thread-parent",
        kind: "child"
      });
    });
  });

  it("does not emit first_user_message", async () => {
    await withCodexFixture(async (fixture) => {
      const sessions = await scanCodexSessions({ homeRoot: fixture.homeRoot });
      const serialized = JSON.stringify(sessions);

      expect(sessions[0]).not.toHaveProperty("first_user_message");
      expect(sessions[0]).not.toHaveProperty("title");
      expect(serialized).not.toContain("Summarize the repo status");
      expect(serialized).not.toContain("Plan the adapter");
    });
  });

  it("falls back to history.jsonl only when sqlite is unreadable", async () => {
    await withCodexFixture(async (fixture) => {
      if (fixture.codexRoot === null) {
        throw new Error("Codex fixture root missing.");
      }

      const dbPath = join(fixture.codexRoot, "state_5.sqlite");
      await rename(dbPath, `${dbPath}.bak`);

      const sessions = await scanCodexSessions({ homeRoot: fixture.homeRoot });

      expect(sessions).toEqual([
        expect.objectContaining({
          provider: "codex",
          providerSessionId: "thread-fallback",
          tokenUsage: expect.objectContaining({
            total: 0
          }),
          metadata: expect.objectContaining({
            sourceKind: "history.jsonl"
          }),
          lineage: {
            parentSessionId: null,
            kind: "unknown"
          }
        }),
        expect.objectContaining({
          providerSessionId: "thread-history-only",
          tokenUsage: expect.objectContaining({
            total: 0
          })
        })
      ]);
    });
  });
});
