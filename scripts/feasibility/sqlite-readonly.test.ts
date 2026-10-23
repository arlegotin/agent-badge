import { createHash } from "node:crypto";
import { chmod, copyFile, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "agent-badge-sqlite-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "synthetic.sqlite");
  const writer = open(path);
  writer.exec("CREATE TABLE usage (input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL)");
  return { root, path, writer };
}

function open(path: string, readOnly = false) {
  const database = new DatabaseSync(path, { readOnly });
  cleanups.push(() => { if (database.isOpen) database.close(); });
  // This SQL API is common to both tested floors; no newer constructor flags.
  database.exec("PRAGMA busy_timeout = 50");
  return database;
}

async function digest(path: string) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

describe("read-only node:sqlite feasibility", () => {
  it("reads committed WAL rows with a live writer and cannot modify the database", async () => {
    const { root, path, writer } = await fixture();
    writer.exec("PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0");
    writer.exec("INSERT INTO usage VALUES (123, 45)");
    expect((await stat(`${path}-wal`)).size).toBeGreaterThan(0);

    // Prove the row is only in WAL: a main-file-only copy has the table but no row.
    const mainOnlyPath = join(root, "main-only.sqlite");
    await copyFile(path, mainOnlyPath);
    expect(open(mainOnlyPath, true).prepare("SELECT * FROM usage").all()).toEqual([]);
    const before = [await digest(path), await digest(`${path}-wal`)];
    const reader = open(path, true);
    expect(reader.prepare("SELECT * FROM usage").all()).toEqual([{ input_tokens: 123, output_tokens: 45 }]);
    expect(() => reader.exec("INSERT INTO usage VALUES (999, 999)")).toThrow(/readonly|read.only/i);
    reader.close();
    expect([await digest(path), await digest(`${path}-wal`)]).toEqual(before);
    expect(writer.prepare("SELECT COUNT(*) AS count FROM usage").get()).toEqual({ count: 1 });
  });

  it("discovers optional table absence separately from query failure", async () => {
    const { path } = await fixture();
    const reader = open(path, true);
    expect(reader.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get("optional_costs")).toBeUndefined();
    expect(reader.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all()).toEqual([{ name: "usage" }]);
    expect(() => reader.prepare("SELECT * FROM optional_costs")).toThrow(/no such table/);
  });

  it("fails read-only open for a missing database without creating one", async () => {
    const { root } = await fixture();
    const path = join(root, "absent.sqlite");
    expect(() => open(path, true)).toThrow(/unable to open/i);
    await expect(stat(path)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)("reports an actual filesystem read permission failure", async () => {
    const { path, writer } = await fixture();
    writer.close();
    await chmod(path, 0o000);
    try {
      await expect(readFile(path)).rejects.toMatchObject({ code: "EACCES" });
      expect(() => open(path, true)).toThrow(/unable to open|permission/i);
    } finally {
      await chmod(path, 0o600);
    }
  });

  it("bounds a read blocked by a second connection's exclusive lock", async () => {
    const { path, writer } = await fixture();
    const reader = open(path, true);
    writer.exec("BEGIN EXCLUSIVE; INSERT INTO usage VALUES (7, 8)");
    try {
      expect(reader.prepare("PRAGMA busy_timeout").get()).toEqual({ timeout: 50 });
      const started = performance.now();
      expect(() => reader.prepare("SELECT * FROM usage").all()).toThrow(/locked/);
      const elapsed = performance.now() - started;
      expect(elapsed).toBeGreaterThanOrEqual(35);
      expect(elapsed).toBeLessThan(1_000);
    } finally {
      writer.exec("ROLLBACK");
    }
    expect(reader.prepare("SELECT * FROM usage").all()).toEqual([]);
  });
});
