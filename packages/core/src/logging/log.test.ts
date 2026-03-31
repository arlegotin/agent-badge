import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  utimes,
  writeFile,
  mkdir
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AGENT_BADGE_LOG_MAX_FILES,
  appendAgentBadgeLog,
  listAgentBadgeLogFiles,
  rotateLogFiles,
  AGENT_BADGE_LOG_DIR,
  buildLogEntry
} from "./log.js";

interface Fixture {
  readonly root: string;
  cleanup(): Promise<void>;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "agent-badge-log-test-"));

  return {
    root,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    }
  };
}

beforeEach(() => {
  // noop
});

afterEach(() => {
  // noop
});

  describe("buildLogEntry", () => {
  it("rejects non-aggregate fields in validation", () => {
    expect(() =>
      buildLogEntry({
        operation: "scan",
        status: "success",
        startAtMs: Date.now(),
        counts: {
          scannedSessions: 1,
          attributedSessions: 1,
          ambiguousSessions: 0,
          publishedRecords: 0,
          prompt: "/private/path/secret"
        }
      } as unknown)
    ).toThrow();
  });
});

describe("logging utilities", () => {
  it("writes a valid NDJSON line for a single successful append", async () => {
    const fixture = await createFixture();

    try {
      const entry = buildLogEntry({
        operation: "publish",
        status: "success",
        startAtMs: Date.now(),
        counts: {
          scannedSessions: 3,
          attributedSessions: 2,
          ambiguousSessions: 1,
          publishedRecords: 1
        }
      });

      const logPath = await appendAgentBadgeLog({
        cwd: fixture.root,
        entry
      });
      const raw = await readFile(logPath, "utf8");
      const lines = raw.split("\n").filter((line) => line.length > 0);
      const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;

      expect(lines).toHaveLength(1);
      expect(parsed.operation).toBe("publish");
      expect(parsed.status).toBe("success");
      expect(parsed.counts).toMatchObject({
        scannedSessions: 3,
        attributedSessions: 2,
        ambiguousSessions: 1,
        publishedRecords: 1
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("rotates log files and keeps only the configured max by mtime", async () => {
    const fixture = await createFixture();
    const logsRoot = join(fixture.root, AGENT_BADGE_LOG_DIR);

    await mkdir(logsRoot, { recursive: true });

    try {
      for (let i = 0; i < 10; i += 1) {
        const targetPath = join(logsRoot, `agent-badge-test-${i}.jsonl`);

        await writeFile(targetPath, `${JSON.stringify({ index: i })}\n`, "utf8");
        const timestamp = new Date(1_600_000_000_000 + i);

        await utimes(targetPath, timestamp, timestamp);
      }

      await rotateLogFiles({ cwd: fixture.root, maxFiles: AGENT_BADGE_LOG_MAX_FILES - 1 });

      const files = await listAgentBadgeLogFiles({ cwd: fixture.root });

      expect(files).toHaveLength(AGENT_BADGE_LOG_MAX_FILES - 1);
      expect(
        files.some((filePath) => filePath.endsWith("agent-badge-test-0.jsonl"))
      ).toBe(false);
      expect(
        files.some((filePath) => filePath.endsWith("agent-badge-test-1.jsonl"))
      ).toBe(false);
      expect(
        files.some((filePath) => filePath.endsWith("agent-badge-test-2.jsonl"))
      ).toBe(false);
      expect(
        files.some((filePath) => filePath.endsWith("agent-badge-test-3.jsonl"))
      ).toBe(false);
      expect(
        files.some((filePath) => filePath.endsWith("agent-badge-test-4.jsonl"))
      ).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects malformed entries with sensitive fields", async () => {
    const fixture = await createFixture();

    try {
      const invalidEntry = {
        timestamp: new Date().toISOString(),
        operation: "scan",
        status: "success",
        durationMs: 10,
        counts: {
          scannedSessions: 2,
          attributedSessions: 1,
          ambiguousSessions: 0,
          publishedRecords: 0
        },
        rawPath: "/Users/example/.codex/sensitive.jsonl",
        prompt: "do-not-log"
      } as const;

      await expect(
        appendAgentBadgeLog({ cwd: fixture.root, entry: invalidEntry })
      ).rejects.toThrow();

      expect(await listAgentBadgeLogFiles({ cwd: fixture.root })).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });
});
