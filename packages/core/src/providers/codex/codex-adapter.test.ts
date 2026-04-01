import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildCodexIncrementalCursor,
  scanCodexSessions,
  scanCodexSessionsIncremental
} from "./codex-adapter.js";

const testkitModuleName = "@agent-badge/testkit";
const sqliteModuleName = "better-sqlite3";

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

async function withNullTimestampCodexHome<T>(
  threadIds: readonly string[],
  callback: (homeRoot: string, dbPath: string) => Promise<T>
): Promise<T> {
  const homeRoot = await mkdtemp(join(tmpdir(), "agent-badge-codex-null-"));
  const codexRoot = join(homeRoot, ".codex");
  const dbPath = join(codexRoot, "state_9.sqlite");
  const sqliteModule = (await import(sqliteModuleName)) as {
    default: new (path: string) => {
      exec(statement: string): void;
      prepare(statement: string): { run(...params: unknown[]): void };
      close(): void;
    };
  };

  await mkdir(codexRoot, { recursive: true });

  const database = new sqliteModule.default(dbPath);

  try {
    database.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        created_at TEXT,
        updated_at TEXT,
        rollout_path TEXT,
        source TEXT,
        model_provider TEXT,
        cwd TEXT,
        tokens_used INTEGER,
        git_sha TEXT,
        git_branch TEXT,
        git_origin_url TEXT,
        cli_version TEXT,
        agent_nickname TEXT,
        agent_role TEXT,
        model TEXT
      );
      CREATE TABLE thread_spawn_edges (
        parent_thread_id TEXT NOT NULL,
        child_thread_id TEXT NOT NULL
      );
    `);

    const insertThread = database.prepare(`
      INSERT INTO threads (
        id,
        created_at,
        updated_at,
        rollout_path,
        source,
        model_provider,
        cwd,
        tokens_used,
        git_sha,
        git_branch,
        git_origin_url,
        cli_version,
        agent_nickname,
        agent_role,
        model
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const threadId of threadIds) {
      insertThread.run(
        threadId,
        null,
        null,
        null,
        "chat",
        "openai",
        "/tmp/repo",
        10,
        null,
        "main",
        "https://github.com/openai/agent-badge",
        "1.0.0",
        null,
        null,
        "gpt-5"
      );
    }

    return await callback(homeRoot, dbPath);
  } finally {
    database.close();
    await rm(homeRoot, { recursive: true, force: true });
  }
}

async function withIntegerTimestampCodexHome<T>(
  callback: (homeRoot: string, dbPath: string) => Promise<T>
): Promise<T> {
  const homeRoot = await mkdtemp(join(tmpdir(), "agent-badge-codex-int-"));
  const codexRoot = join(homeRoot, ".codex");
  const dbPath = join(codexRoot, "state_9.sqlite");
  const sqliteModule = (await import(sqliteModuleName)) as {
    default: new (path: string) => {
      exec(statement: string): void;
      prepare(statement: string): { run(...params: unknown[]): void };
      close(): void;
    };
  };

  await mkdir(codexRoot, { recursive: true });

  const database = new sqliteModule.default(dbPath);

  try {
    database.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        created_at INTEGER,
        updated_at INTEGER,
        rollout_path TEXT,
        source TEXT,
        model_provider TEXT,
        cwd TEXT,
        tokens_used INTEGER,
        git_sha TEXT,
        git_branch TEXT,
        git_origin_url TEXT,
        cli_version TEXT,
        agent_nickname TEXT,
        agent_role TEXT,
        model TEXT
      );
      CREATE TABLE thread_spawn_edges (
        parent_thread_id TEXT NOT NULL,
        child_thread_id TEXT NOT NULL
      );
    `);

    return await callback(homeRoot, dbPath);
  } finally {
    database.close();
    await rm(homeRoot, { recursive: true, force: true });
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

  it("reads integer sqlite timestamps without falling back to history.jsonl", async () => {
    await withIntegerTimestampCodexHome(async (homeRoot, dbPath) => {
      const sqliteModule = (await import(sqliteModuleName)) as {
        default: new (path: string) => {
          prepare(statement: string): { run(...params: unknown[]): void };
          close(): void;
        };
      };
      const database = new sqliteModule.default(dbPath);

      try {
        database
          .prepare(
            `
              INSERT INTO threads (
                id,
                created_at,
                updated_at,
                rollout_path,
                source,
                model_provider,
                cwd,
                tokens_used,
                git_sha,
                git_branch,
                git_origin_url,
                cli_version,
                agent_nickname,
                agent_role,
                model
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
          )
          .run(
            "thread-int",
            1775037600,
            1775041200,
            null,
            "chat",
            "openai",
            "/Volumes/git/legotin/agent-badge",
            123456,
            null,
            "main",
            "https://github.com/arlegotin/agent-badge.git",
            "1.0.0",
            null,
            null,
            "gpt-5"
          );
      } finally {
        database.close();
      }

      const sessions = await scanCodexSessions({ homeRoot });

      expect(sessions).toEqual([
        expect.objectContaining({
          providerSessionId: "thread-int",
          updatedAt: "2026-04-01T11:00:00.000Z",
          cwd: "/Volumes/git/legotin/agent-badge",
          observedRemoteUrlNormalized: "https://github.com/arlegotin/agent-badge",
          tokenUsage: expect.objectContaining({
            total: 123456
          }),
          metadata: expect.objectContaining({
            sourceKind: "chat"
          })
        })
      ]);
    });
  });
});

describe("scanCodexSessionsIncremental", () => {
  it("keeps null-watermark cursors incremental when unchanged", async () => {
    await withNullTimestampCodexHome(
      ["thread-null-1", "thread-null-2"],
      async (homeRoot) => {
        const cursor = buildCodexIncrementalCursor(
          await scanCodexSessions({ homeRoot })
        );

        expect(cursor).toContain('"watermark":null');
        expect(cursor).toContain('"thread-null-1"');
        expect(cursor).toContain('"thread-null-2"');

        const result = await scanCodexSessionsIncremental({
          homeRoot,
          cursor
        });

        expect(result.mode).toBe("incremental");
        expect(result.sessions).toEqual([]);
        expect(result.cursor).toContain('"thread-null-1"');
        expect(result.cursor).toContain('"thread-null-2"');
      }
    );
  });

  it("detects newly added null-timestamp threads without forcing a full scan", async () => {
    await withNullTimestampCodexHome(["thread-null-1"], async (homeRoot, dbPath) => {
      const cursor = buildCodexIncrementalCursor(
        await scanCodexSessions({ homeRoot })
      );
      const sqliteModule = (await import(sqliteModuleName)) as {
        default: new (path: string) => {
          prepare(statement: string): { run(...params: unknown[]): void };
          close(): void;
        };
      };
      const database = new sqliteModule.default(dbPath);

      try {
        database
          .prepare(
            `
              INSERT INTO threads (
                id,
                created_at,
                updated_at,
                rollout_path,
                source,
                model_provider,
                cwd,
                tokens_used,
                git_sha,
                git_branch,
                git_origin_url,
                cli_version,
                agent_nickname,
                agent_role,
                model
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
          )
          .run(
            "thread-null-2",
            null,
            null,
            null,
            "chat",
            "openai",
            "/tmp/repo",
            20,
            null,
            "main",
            "https://github.com/openai/agent-badge",
            "1.0.0",
            null,
            null,
            "gpt-5"
          );
      } finally {
        database.close();
      }

      const result = await scanCodexSessionsIncremental({
        homeRoot,
        cursor
      });

      expect(result.mode).toBe("incremental");
      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]).toMatchObject({
        providerSessionId: "thread-null-2",
        tokenUsage: {
          total: 20
        }
      });
      expect(result.cursor).toContain('"thread-null-1"');
      expect(result.cursor).toContain('"thread-null-2"');
    });
  });

  it("returns no sessions when the cursor watermark is unchanged", async () => {
    await withCodexFixture(async (fixture) => {
      const cursor = buildCodexIncrementalCursor(
        await scanCodexSessions({ homeRoot: fixture.homeRoot })
      );
      const result = await scanCodexSessionsIncremental({
        homeRoot: fixture.homeRoot,
        cursor
      });

      expect(result.mode).toBe("incremental");
      expect(result.sessions).toEqual([]);
      expect(result.cursor).toBe(cursor);
    });
  });

  it("returns only threads updated after the stored watermark", async () => {
    await withCodexFixture(async (fixture) => {
      if (fixture.codexRoot === null) {
        throw new Error("Codex fixture root missing.");
      }

      const cursor = buildCodexIncrementalCursor(
        await scanCodexSessions({ homeRoot: fixture.homeRoot })
      );
      const dbPath = join(fixture.codexRoot, "state_5.sqlite");
      const sqliteModule = (await import(sqliteModuleName)) as {
        default: new (path: string) => {
          prepare(statement: string): { run(...params: unknown[]): void };
          close(): void;
        };
      };
      const database = new sqliteModule.default(dbPath);

      try {
        database
          .prepare(
            "UPDATE threads SET updated_at = ?, tokens_used = ? WHERE id = ?"
          )
          .run("2026-03-07T12:00:00Z", 999, "thread-child");
      } finally {
        database.close();
      }

      const result = await scanCodexSessionsIncremental({
        homeRoot: fixture.homeRoot,
        cursor
      });

      expect(result.mode).toBe("incremental");
      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]).toMatchObject({
        providerSessionId: "thread-child",
        updatedAt: "2026-03-07T12:00:00.000Z",
        tokenUsage: {
          total: 999
        }
      });
      expect(result.cursor).toContain("codex-thread-watermark-v1");
    });
  });

  it("keeps integer-timestamp sqlite sessions incremental", async () => {
    await withIntegerTimestampCodexHome(async (homeRoot, dbPath) => {
      const sqliteModule = (await import(sqliteModuleName)) as {
        default: new (path: string) => {
          prepare(statement: string): { run(...params: unknown[]): void };
          close(): void;
        };
      };
      const database = new sqliteModule.default(dbPath);

      try {
        database
          .prepare(
            `
              INSERT INTO threads (
                id,
                created_at,
                updated_at,
                rollout_path,
                source,
                model_provider,
                cwd,
                tokens_used,
                git_sha,
                git_branch,
                git_origin_url,
                cli_version,
                agent_nickname,
                agent_role,
                model
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
          )
          .run(
            "thread-int-1",
            1775037600,
            1775041200,
            null,
            "chat",
            "openai",
            "/Volumes/git/legotin/agent-badge",
            100,
            null,
            "main",
            "https://github.com/arlegotin/agent-badge.git",
            "1.0.0",
            null,
            null,
            "gpt-5"
          );
      } finally {
        database.close();
      }

      const cursor = buildCodexIncrementalCursor(
        await scanCodexSessions({ homeRoot })
      );

      const updateDatabase = new sqliteModule.default(dbPath);

      try {
        updateDatabase
          .prepare(
            `
              INSERT INTO threads (
                id,
                created_at,
                updated_at,
                rollout_path,
                source,
                model_provider,
                cwd,
                tokens_used,
                git_sha,
                git_branch,
                git_origin_url,
                cli_version,
                agent_nickname,
                agent_role,
                model
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
          )
          .run(
            "thread-int-2",
            1775041800,
            1775042400,
            null,
            "chat",
            "openai",
            "/Volumes/git/legotin/agent-badge",
            250,
            null,
            "main",
            "https://github.com/arlegotin/agent-badge.git",
            "1.0.0",
            null,
            null,
            "gpt-5"
          );
      } finally {
        updateDatabase.close();
      }

      const result = await scanCodexSessionsIncremental({
        homeRoot,
        cursor
      });

      expect(result.mode).toBe("incremental");
      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]).toMatchObject({
        providerSessionId: "thread-int-2",
        updatedAt: "2026-04-01T11:20:00.000Z",
        tokenUsage: {
          total: 250
        }
      });
    });
  });
});
