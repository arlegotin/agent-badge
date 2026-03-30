import { describe, expect, it } from "vitest";

import { scanClaudeSessions } from "./claude-adapter.js";

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
