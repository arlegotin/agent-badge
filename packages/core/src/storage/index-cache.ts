import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { lstatSync, readdirSync } from "node:fs";
import fs from "node:fs/promises";
import { join } from "node:path";
import type { SourceDescriptor } from "../domain/capabilities.js";
import type { UsageObservation } from "../domain/usage.js";
import { parsePublicRecord } from "../domain/ledger.js";
import type { PublicRecord, ControlRecord } from "../domain/ledger.js";
import { recordHash } from "../ledger/canonical-json.js";
import { observationEvidenceHash } from "../collection/metadata.js";
import { validateEntry, validateAttributionAssociations } from "./journal.js";
import type { JournalEntry } from "./journal.js";
import { readControlFile } from "./controls.js";
import { readAcknowledgementFile } from "./acknowledgements.js";
import {
  assertDirectory,
  atomicFile,
  hasCode,
  readPrivateFile,
  StoreError,
  syncDirectory,
} from "./atomic-file.js";
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const sourceKey = (source: SourceDescriptor) =>
  JSON.stringify([source.provider, source.instanceKey, source.sourceIdentity]);
const unitIdentity = (observation: UsageObservation) =>
  JSON.stringify([
    observation.provider,
    observation.representation,
    observation.nativeUnitId,
  ]);
export function fingerprint(path: string, privateOnly = false): string {
  const s = lstatSync(path, { bigint: true });
  if (
    !s.isFile() ||
    s.isSymbolicLink() ||
    (process.getuid && s.uid !== BigInt(process.getuid())) ||
    (privateOnly && (s.mode & 0o077n) !== 0n)
  )
    throw new StoreError("unsafe-store-path");
  return [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs, s.mode, s.uid].join(":");
}
/** Inventory membership and every immutable file's metadata are checked under the store lease. */
function inventory(root: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const directory of ["journal", "controls", "acknowledgements"]) {
    let names: string[];
    try {
      const s = lstatSync(join(root, directory));
      if (
        !s.isDirectory() ||
        s.isSymbolicLink() ||
        (process.getuid && s.uid !== process.getuid())
      )
        throw new StoreError("unsafe-store-path");
      names = readdirSync(join(root, directory));
    } catch (error) {
      if (hasCode(error, "ENOENT") && directory !== "journal") continue;
      throw error;
    }
    for (const name of names.sort()) {
      if (/^\.tmp-[a-f0-9-]{36}$/.test(name)) continue;
      if (
        !(
          directory === "journal" ? /^[0-9]{16}\.json$/ : /^[a-f0-9]{64}\.json$/
        ).test(name)
      )
        throw new StoreError("invalid-durable-data");
      const path = directory + "/" + name;
      result.set(path, fingerprint(join(root, path)));
    }
  }
  try {
    result.set(
      "acknowledged.json",
      fingerprint(join(root, "acknowledged.json"))
    );
  } catch (error) {
    if (!hasCode(error, "ENOENT")) throw error;
  }
  return new Map([...result].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
type Row = { data: string; hash: string };
export interface RebuildBudget {
  signal: AbortSignal;
  deadline: number;
  maxEntries?: number;
}
/** Disposable query index. Immutable journal/control/confirmation files remain the sole authority. */
export class StoreIndex {
  get needsPublication(): boolean {
    return this.changed;
  }
  private changed = false;
  private failed = false;
  private constructor(
    private root: string,
    private db: DatabaseSync,
    private files: Map<string, string>
  ) {}
  static async open(root: string, budget?: RebuildBudget): Promise<StoreIndex> {
    const directory = join(root, "cache");
    await assertDirectory(directory);
    const files = inventory(root),
      path = join(directory, "index.sqlite");
    let valid = false;
    let previous: Map<string, string> | undefined;
    try {
      const raw = await readPrivateFile(
          join(directory, "index.json"),
          32 * 1024 * 1024,
          true
        ),
        manifest = JSON.parse(raw);
      const body = {
        version: 4,
        files: [...files],
        database: fingerprint(path, true),
      };
      valid =
        manifest.version === 4 &&
        manifest.digest === digest(JSON.stringify(body)) &&
        manifest.database === body.database;
      if (
        !valid &&
        manifest.version === 4 &&
        manifest.database === body.database
      ) {
        const prior = new DatabaseSync(path, { readOnly: true });
        try {
          const entries = prior
            .prepare("SELECT path,fingerprint FROM files ORDER BY path")
            .all()
            .map((row) => [row.path, row.fingerprint] as [string, string]);
          // A changed/corrupt DB is never evidence that authority disappeared.
          if (
            manifest.digest ===
            digest(JSON.stringify({ ...body, files: entries }))
          )
            previous = new Map(entries);
        } finally {
          prior.close();
        }
      }
    } catch {
      /* A missing, changed or corrupt derived generation must be rebuilt from authority. */
    }
    if (previous) {
      const prior = new DatabaseSync(path, { readOnly: true });
      try {
        for (const [name, stamp] of previous) {
          if (!files.has(name)) throw new StoreError("invalid-durable-data");
          if (files.get(name) !== stamp && name.startsWith("journal/")) {
            const value = validateEntry(
              JSON.parse(
                await readPrivateFile(join(root, name), 32 * 1024 * 1024, true)
              )
            );
            const row = prior
              .prepare("SELECT hash FROM journal WHERE sequence=?")
              .get(value.sequence);
            if (!row || row.hash !== digest(JSON.stringify(value)))
              throw new StoreError("invalid-durable-data");
          }
        }
      } catch (error) {
        if (error instanceof StoreError) throw error;
        throw new StoreError("invalid-durable-data");
      } finally {
        prior.close();
      }
    }
    if (!valid) {
      for (const name of [
        "index.sqlite",
        "index.sqlite-journal",
        "index.sqlite-wal",
        "index.sqlite-shm",
        "index.json",
      ]) {
        try {
          const s = await fs.lstat(join(directory, name));
          if (
            !s.isFile() ||
            s.isSymbolicLink() ||
            (process.getuid && s.uid !== process.getuid())
          )
            throw new StoreError("unsafe-store-path");
          await fs.unlink(join(directory, name));
        } catch (error) {
          if (!hasCode(error, "ENOENT")) throw error;
        }
      }
      return this.rebuild(root, files, budget);
    } else {
      for (const suffix of ["-journal", "-wal", "-shm"])
        try {
          fingerprint(path + suffix);
          throw new StoreError("invalid-durable-data");
        } catch (error) {
          if (!hasCode(error, "ENOENT")) throw error;
        }
    }
    let db: DatabaseSync;
    try {
      db = new DatabaseSync(path);
      db.exec(
        "PRAGMA trusted_schema=OFF; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;"
      );
    } catch {
      throw new StoreError("invalid-durable-data");
    }
    if (db.prepare("PRAGMA user_version").get()?.user_version !== 0) {
      db.close();
      throw new StoreError("invalid-durable-data");
    }
    return new StoreIndex(root, db, files);
  }
  private static schema(db: DatabaseSync) {
    db.exec(`CREATE TABLE journal(sequence INTEGER PRIMARY KEY,source TEXT NOT NULL,data TEXT NOT NULL,hash TEXT NOT NULL);
          CREATE INDEX journal_source ON journal(source,sequence);
          CREATE TABLE identities(identity TEXT NOT NULL,source TEXT NOT NULL,PRIMARY KEY(identity,source));
          CREATE TABLE evidence(hash TEXT PRIMARY KEY,source TEXT NOT NULL,policy TEXT);
          CREATE INDEX evidence_policy ON evidence(policy,source);
          CREATE TABLE records(hash TEXT PRIMARY KEY,data TEXT NOT NULL,control INTEGER NOT NULL,pending INTEGER NOT NULL,unit TEXT NOT NULL);
          CREATE INDEX records_pending ON records(pending,hash);
          CREATE INDEX records_control ON records(control,hash);
          CREATE INDEX records_unit ON records(unit,pending);
          CREATE TABLE pending_units(unit TEXT PRIMARY KEY,count INTEGER NOT NULL,bytes INTEGER NOT NULL);
          CREATE TABLE acknowledgements(hash TEXT PRIMARY KEY);
          CREATE TABLE files(path TEXT PRIMARY KEY,fingerprint TEXT NOT NULL);
          CREATE TABLE rebuild_progress(path TEXT PRIMARY KEY);`);
  }
  private static async rebuild(
    root: string,
    files: Map<string, string>,
    budget?: RebuildBudget
  ): Promise<StoreIndex> {
    const directory = join(root, "cache"),
      path = join(directory, "index-stage.sqlite"),
      manifestPath = join(directory, "index-stage.json");
    let valid = false,
      previous: Map<string, string> | undefined;
    try {
      const manifest = JSON.parse(
          await readPrivateFile(manifestPath, 4096, true)
        ),
        database = fingerprint(path, true);
      valid =
        manifest.version === 4 &&
        manifest.database === database &&
        manifest.digest ===
          digest(JSON.stringify({ version: 4, files: [...files], database }));
      if (!valid && manifest.version === 4 && manifest.database === database) {
        const prior = new DatabaseSync(path, { readOnly: true });
        try {
          const entries = prior
            .prepare("SELECT path,fingerprint FROM files ORDER BY path")
            .all()
            .map((row) => [row.path, row.fingerprint] as [string, string]);
          if (
            manifest.digest ===
            digest(JSON.stringify({ version: 4, files: entries, database }))
          )
            previous = new Map(entries);
        } finally {
          prior.close();
        }
      }
      for (const suffix of ["-journal", "-wal", "-shm"])
        try {
          await fs.lstat(path + suffix);
          valid = false;
        } catch (error) {
          if (!hasCode(error, "ENOENT")) throw error;
        }
    } catch {
      valid = false;
    }
    if (
      previous &&
      [...previous].some(([name, stamp]) => files.get(name) !== stamp)
    )
      throw new StoreError("invalid-durable-data");
    if (!valid) {
      for (const name of [
        "index-stage.sqlite",
        "index-stage.sqlite-journal",
        "index-stage.sqlite-wal",
        "index-stage.sqlite-shm",
        "index-stage.json",
      ])
        try {
          const target = join(directory, name),
            s = await fs.lstat(target);
          if (
            !s.isFile() ||
            s.isSymbolicLink() ||
            (process.getuid && s.uid !== process.getuid())
          )
            throw new StoreError("unsafe-store-path");
          await fs.unlink(target);
        } catch (error) {
          if (!hasCode(error, "ENOENT")) throw error;
        }
      const handle = await fs.open(path, "wx", 0o600);
      await handle.close();
    }
    const db = new DatabaseSync(path);
    db.exec(
      "PRAGMA trusted_schema=OFF; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;"
    );
    const index = new StoreIndex(root, db, files);
    let complete = false,
      closed = false;
    try {
      if (!valid) {
        this.schema(db);
        db.exec("BEGIN");
        index.persistInventory(files, true);
        db.exec("COMMIT");
      }
      const done = db.prepare("SELECT 1 FROM rebuild_progress WHERE path=?"),
        mark = db.prepare("INSERT INTO rebuild_progress VALUES (?)");
      // Source evidence precedes controls and confirmations even though inventory is lexical.
      const names = [...files.keys()].sort((a, b) => {
        const rank = (s: string) =>
          s.startsWith("journal/") ? 0 : s.startsWith("controls/") ? 1 : 2;
        return rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0);
      });
      const end = budget
          ? Math.min(Date.now() + 500, budget.deadline - 500)
          : Infinity,
        max = budget?.maxEntries ?? (budget ? 256 : Infinity);
      let processed = 0;
      db.exec("BEGIN");
      for (const name of names) {
        if (done.get(name)) continue;
        if (
          budget &&
          (budget.signal.aborted || Date.now() >= end || processed >= max)
        )
          break;
        if (name.startsWith("journal/")) {
          const entry = validateEntry(
            JSON.parse(await readPrivateFile(join(root, name), undefined, true))
          );
          if (
            entry.sequence !== index.count() + 1 ||
            name !==
              "journal/" + String(entry.sequence).padStart(16, "0") + ".json"
          )
            throw new StoreError("invalid-durable-data");
          validateAttributionAssociations(entry, index.source(entry.source));
          index.addEntry(entry, false);
        } else if (name.startsWith("controls/"))
          index.addControl(await readControlFile(root, name), false);
        else {
          const hashes = await readAcknowledgementFile(root, name);
          if (hashes.some((hash) => !index.known(hash)))
            throw new StoreError("invalid-durable-data");
          index.addAcknowledgements(hashes, false);
        }
        mark.run(name);
        processed++;
      }
      db.exec("COMMIT");
      complete =
        Number(
          db.prepare("SELECT count(*) AS n FROM rebuild_progress").get()!.n
        ) === files.size;
      db.close();
      closed = true;
      const database = fingerprint(path, true);
      await atomicFile(manifestPath, {
        version: 4,
        database,
        digest: digest(
          JSON.stringify({ version: 4, files: [...files], database })
        ),
      });
      if (!complete) throw new StoreError("store-busy");
      await fs.rename(path, join(directory, "index.sqlite"));
      await syncDirectory(directory);
      const promoted = fingerprint(join(directory, "index.sqlite"), true);
      await atomicFile(join(directory, "index.json"), {
        version: 4,
        database: promoted,
        digest: digest(
          JSON.stringify({ version: 4, files: [...files], database: promoted })
        ),
      });
      await fs.rm(manifestPath, { force: true });
      return this.open(root, budget);
    } catch (error) {
      if (!closed) {
        try {
          db.exec("ROLLBACK");
        } catch {}
        db.close();
        await fs.rm(manifestPath, { force: true });
      }
      throw error;
    }
  }
  private entries(sql: string, params: string[] = []): JournalEntry[] {
    return (this.db.prepare(sql).all(...params) as unknown as Row[]).map(
      (row) => {
        if (typeof row.data !== "string" || digest(row.data) !== row.hash)
          throw new StoreError("invalid-durable-data");
        try {
          return validateEntry(JSON.parse(row.data));
        } catch {
          throw new StoreError("invalid-durable-data");
        }
      }
    );
  }
  journal(): JournalEntry[] {
    return this.entries("SELECT data,hash FROM journal ORDER BY sequence");
  }
  source(source: SourceDescriptor): JournalEntry[] {
    return this.entries(
      "SELECT data,hash FROM journal WHERE source=? ORDER BY sequence",
      [sourceKey(source)]
    );
  }
  related(observations: readonly UsageObservation[]): JournalEntry[] {
    const sources = new Set<string>();
    const select = this.db.prepare(
      "SELECT source FROM identities WHERE identity=?"
    );
    for (const identity of new Set(observations.map(unitIdentity)))
      for (const row of select.all(identity)) sources.add(row.source as string);
    const result: JournalEntry[] = [];
    for (const source of sources)
      result.push(
        ...this.entries(
          "SELECT data,hash FROM journal WHERE source=? ORDER BY sequence",
          [source]
        )
      );
    return result.sort((a, b) => a.sequence - b.sequence);
  }
  dirtySources(policy: string): SourceDescriptor[] {
    return this.entries(
      `SELECT j.data,j.hash FROM journal j JOIN (SELECT source,max(sequence) AS last FROM journal
      WHERE source IN (SELECT source FROM evidence WHERE policy IS NULL UNION SELECT source FROM evidence WHERE policy<? UNION SELECT source FROM evidence WHERE policy>?) GROUP BY source) s ON j.sequence=s.last`,
      [policy, policy]
    ).map((entry) => entry.source);
  }
  count(): number {
    return Number(
      this.db.prepare("SELECT count(*) AS n FROM journal").get()!.n
    );
  }
  private records(sql: string, params: string[] = []): PublicRecord[] {
    return (this.db.prepare(sql).all(...params) as unknown as Row[]).map(
      (row) => {
        let record: PublicRecord;
        try {
          record = parsePublicRecord(JSON.parse(row.data));
        } catch {
          throw new StoreError("invalid-durable-data");
        }
        if (recordHash(record) !== row.hash)
          throw new StoreError("invalid-durable-data");
        return record;
      }
    );
  }
  pending(): PublicRecord[] {
    return this.records(
      "SELECT data,hash FROM records WHERE pending=1 ORDER BY hash"
    );
  }
  pendingCount(): number {
    return Number(
      this.db
        .prepare("SELECT count(*) AS n FROM records WHERE pending=1")
        .get()!.n
    );
  }
  pendingHashes(): string[] {
    return this.db
      .prepare("SELECT hash FROM records WHERE pending=1 ORDER BY hash")
      .all()
      .map((row) => {
        if (typeof row.hash !== "string" || !/^[a-f0-9]{64}$/.test(row.hash))
          throw new StoreError("invalid-durable-data");
        return row.hash;
      });
  }
  pendingBatch(
    maxRecords: number,
    maxBytes: number
  ): { records: PublicRecord[]; deferredUnitCount: number } {
    if (
      !Number.isSafeInteger(maxRecords) ||
      maxRecords < 1 ||
      !Number.isSafeInteger(maxBytes) ||
      maxBytes < 1
    )
      throw new StoreError("invalid-batch");
    const candidates = this.db
      .prepare(
        "SELECT unit,count,bytes FROM pending_units WHERE count<=? AND bytes<=? ORDER BY unit LIMIT ?"
      )
      .all(maxRecords, maxBytes, maxRecords);
    const records: PublicRecord[] = [];
    let bytes = 0;
    for (const row of candidates) {
      if (
        records.length + Number(row.count) > maxRecords ||
        bytes + Number(row.bytes) > maxBytes
      )
        continue;
      // Without this hint SQLite can prefer pending/hash to satisfy ORDER BY,
      // scanning the entire offline outbox once for every selected unit.
      const group = this.records(
        "SELECT data,hash FROM records INDEXED BY records_unit WHERE unit=? AND pending=1 ORDER BY hash",
        [String(row.unit)]
      );
      if (
        group.length !== Number(row.count) ||
        group.some(
          (record) =>
            ("kind" in record ? record.targetUnitKey : record.unitKey) !==
            row.unit
        )
      )
        throw new StoreError("invalid-durable-data");
      records.push(...group);
      bytes += Number(row.bytes);
    }
    return {
      records,
      deferredUnitCount: Number(
        this.db
          .prepare(
            "SELECT count(*) AS n FROM pending_units WHERE count>? OR bytes>?"
          )
          .get(maxRecords, maxBytes)!.n
      ),
    };
  }
  controls(): ControlRecord[] {
    return this.records(
      "SELECT data,hash FROM records WHERE control=1 ORDER BY hash"
    ) as ControlRecord[];
  }
  known(hash: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM records WHERE hash=?").get(hash);
  }
  acknowledged(hash: string): boolean {
    return !!this.db
      .prepare("SELECT 1 FROM acknowledgements WHERE hash=?")
      .get(hash);
  }
  addEntry(entry: JournalEntry, track = true): void {
    if (track) {
      this.write(() => {
        this.addEntry(entry, false);
        this.track(
          "journal/" + String(entry.sequence).padStart(16, "0") + ".json"
        );
      });
      return;
    }
    const key = sourceKey(entry.source),
      data = JSON.stringify(entry);
    this.db
      .prepare("INSERT INTO journal VALUES (?,?,?,?)")
      .run(entry.sequence, key, data, digest(data));
    const identity = this.db.prepare(
        "INSERT OR IGNORE INTO identities VALUES (?,?)"
      ),
      evidence = this.db.prepare(
        "INSERT OR IGNORE INTO evidence VALUES (?,?,NULL)"
      ),
      association = this.db.prepare(
        "UPDATE evidence SET policy=? WHERE hash=? AND source=?"
      );
    for (const observation of entry.observations) {
      identity.run(unitIdentity(observation), key);
      evidence.run(observationEvidenceHash(observation), key);
    }
    if (entry.attribution)
      for (const decision of entry.attribution.decisions)
        association.run(
          entry.attribution.policyHash,
          decision.observationHash,
          key
        );
    for (const record of entry.records) this.insertRecord(record, false);
    if (track)
      this.track(
        "journal/" + String(entry.sequence).padStart(16, "0") + ".json"
      );
  }
  addControl(control: ControlRecord, track = true): void {
    if (track) {
      this.write(() => {
        this.addControl(control, false);
        this.track("controls/" + recordHash(control) + ".json");
      });
      return;
    }
    const hash = recordHash(control);
    this.insertRecord(control, true);
    if (track) this.track("controls/" + hash + ".json");
  }
  addAcknowledgements(hashes: readonly string[], track = true): void {
    if (track) {
      this.write(() => {
        this.addAcknowledgements(hashes, false);
        this.persistInventory(inventory(this.root));
      });
      this.changed = true;
      return;
    }
    const statement = this.db.prepare(
        "INSERT OR IGNORE INTO acknowledgements VALUES (?)"
      ),
      pending = this.db.prepare("UPDATE records SET pending=0 WHERE hash=?"),
      find = this.db.prepare(
        "SELECT unit,length(CAST(data AS BLOB)) AS bytes FROM records WHERE hash=? AND pending=1"
      ),
      update = this.db.prepare(
        "UPDATE pending_units SET count=count-1,bytes=bytes-? WHERE unit=?"
      ),
      remove = this.db.prepare(
        "DELETE FROM pending_units WHERE unit=? AND count=0"
      );
    for (const hash of hashes) {
      statement.run(hash);
      const row = find.get(hash);
      if (row) {
        update.run(row.bytes!, row.unit!);
        remove.run(row.unit!);
      }
      pending.run(hash);
    }
    if (track) {
      this.files = inventory(this.root);
      this.changed = true;
    }
  }
  private write(task: () => void) {
    this.db.exec("BEGIN");
    try {
      task();
      this.db.exec("COMMIT");
    } catch (error) {
      this.failed = true;
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      throw error;
    }
  }
  private insertRecord(record: PublicRecord, control: boolean) {
    const hash = recordHash(record),
      data = JSON.stringify(record),
      unit = "kind" in record ? record.targetUnitKey : record.unitKey;
    const added = this.db
      .prepare("INSERT OR IGNORE INTO records VALUES (?,?,?,1,?)")
      .run(hash, data, control ? 1 : 0, unit);
    if (added.changes)
      this.db
        .prepare(
          "INSERT INTO pending_units VALUES (?,1,?) ON CONFLICT(unit) DO UPDATE SET count=count+1,bytes=bytes+excluded.bytes"
        )
        .run(unit, Buffer.byteLength(data));
    else if (control)
      this.db.prepare("UPDATE records SET control=1 WHERE hash=?").run(hash);
  }
  private persistInventory(files: Map<string, string>, initial = false) {
    const insert = this.db.prepare("INSERT OR REPLACE INTO files VALUES (?,?)");
    for (const [path, stamp] of files)
      if (initial || this.files.get(path) !== stamp) insert.run(path, stamp);
    this.files = files;
  }
  private track(path: string) {
    const stamp = fingerprint(join(this.root, path));
    this.db
      .prepare("INSERT OR REPLACE INTO files VALUES (?,?)")
      .run(path, stamp);
    this.files.set(path, stamp);
    this.changed = true;
  }
  async close(): Promise<void> {
    this.db.close();
    if (this.failed) {
      await fs.rm(join(this.root, "cache/index.json"), { force: true });
      return;
    }
    if (!this.changed) return;
    // Publish only after SQLite closes; rollback journals/WAL can never masquerade as a complete generation.
    const database = fingerprint(join(this.root, "cache/index.sqlite"), true);
    const files = [...this.files].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    );
    const body = { version: 4, files, database };
    // inventory() uses the same lexicographic order regardless of append/control publication order.
    await atomicFile(join(this.root, "cache/index.json"), {
      version: 4,
      database,
      digest: digest(JSON.stringify(body)),
    });
  }
}
