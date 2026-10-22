import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { parseLedgerMeta, parsePublicRecord } from "../domain/ledger.js";
import type { LedgerMeta, PublicRecord } from "../domain/ledger.js";
import type { AcceptedLedger } from "../git/data-transport.js";
import {
  catalogHash,
  contentHash,
  parsePriceCatalog,
} from "../pricing/catalog.js";
import type { PriceCatalog } from "../pricing/catalog.js";
import { canonicalJson, recordHash } from "../ledger/canonical-json.js";
import { reduceLedger } from "../ledger/reduce.js";
import { extendProjection } from "../ledger/indexed.js";
import {
  renderArtifacts,
  renderDerivedArtifacts,
  summarizeValuation,
} from "../render/summary.js";
import type { LedgerSummary, LedgerValuation } from "../render/summary.js";
import { fingerprint } from "./index-cache.js";
import {
  assertDirectory,
  atomicFile,
  hasCode,
  readPrivateFile,
  StoreError,
  syncDirectory,
} from "./atomic-file.js";
import { parseTransportState } from "./store.js";
import type { RebuildBudget } from "./index-cache.js";
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
export interface AcceptedState {
  version: 2;
  commit: string;
  meta: LedgerMeta;
  catalog: PriceCatalog;
  summary: LedgerSummary;
  valuation: LedgerValuation;
  retainedCommit?: string;
}
type Slot = "accepted.sqlite" | "accepted-next.sqlite";
type Manifest = {
  state: AcceptedState;
  database: string;
  slot?: Slot;
  previousCommit?: string;
  digest: string;
};
const slotOf = (manifest: Manifest): Slot => manifest.slot ?? "accepted.sqlite";
async function readVerifiedManifest(root: string): Promise<Manifest | null> {
  try {
    const manifest = JSON.parse(
      await readPrivateFile(join(root, "cache/accepted.json"), 256 * 1024, true)
    ) as Manifest;
    if (
      manifest.slot !== undefined &&
      manifest.slot !== "accepted.sqlite" &&
      manifest.slot !== "accepted-next.sqlite"
    )
      return null;
    if (
      manifest.previousCommit !== undefined &&
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(manifest.previousCommit)
    )
      return null;
    const database = fingerprint(join(root, "cache", slotOf(manifest)), true),
      { digest: signature, ...body } = manifest;
    if (
      manifest.database !== database ||
      signature !== digest(JSON.stringify(body)) ||
      manifest.state.version !== 2
    )
      return null;
    for (const suffix of ["-journal", "-wal", "-shm"])
      try {
        await fs.lstat(join(root, "cache", slotOf(manifest) + suffix));
        return null;
      } catch (error) {
        if (!hasCode(error, "ENOENT")) throw error;
      }
    manifest.state.meta = parseLedgerMeta(manifest.state.meta);
    manifest.state.catalog = parsePriceCatalog(manifest.state.catalog);
    if (
      contentHash(manifest.state.meta) !== manifest.state.summary.metaHash ||
      catalogHash(manifest.state.catalog) !== manifest.state.meta.catalogHash
    )
      return null;
    return manifest;
  } catch {
    return null;
  }
}
async function prepareInactiveSlot(
  root: string
): Promise<{ slot: Slot; previousCommit?: string }> {
  const current = await readVerifiedManifest(root);
  if (current?.previousCommit) {
    try {
      const transport = parseTransportState(
        JSON.parse(
          await readPrivateFile(join(root, "transport.json"), 16384, true)
        )
      );
      if (transport.commit === current.previousCommit)
        throw new StoreError("store-busy");
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
    }
    try {
      const owner = JSON.parse(
        await readPrivateFile(
          join(root, "cache/accepted-stage-owner.json"),
          4096,
          true
        )
      );
      if (owner.candidateBase === current.previousCommit)
        throw new StoreError("store-busy");
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
    }
  }
  const slot: Slot =
    current && slotOf(current) === "accepted.sqlite"
      ? "accepted-next.sqlite"
      : "accepted.sqlite";
  for (const suffix of ["", "-journal", "-wal", "-shm"])
    try {
      const path = join(root, "cache", slot + suffix),
        info = await fs.lstat(path);
      if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        (process.getuid && info.uid !== process.getuid())
      )
        throw new StoreError("unsafe-store-path");
      await fs.unlink(path);
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
    }
  return { slot, ...(current ? { previousCommit: current.state.commit } : {}) };
}
function requireGenerationBudget(budget?: RebuildBudget) {
  if (budget && (budget.signal.aborted || budget.deadline - Date.now() < 500))
    throw new StoreError("store-busy");
}
export function gitBlobOid(bytes: string, commit: string) {
  return createHash(commit.length === 64 ? "sha256" : "sha1")
    .update(`blob ${Buffer.byteLength(bytes)}\0`)
    .update(bytes)
    .digest("hex");
}
export interface AcceptedExtension extends ReturnType<typeof extendProjection> {
  artifacts: Map<string, Uint8Array>;
  baseCommit: string;
}
function summary(ledger: AcceptedLedger["ledger"]): LedgerSummary {
  const { records, recordHashes, units, ...value } = ledger;
  return value;
}
/** Derived, owned cache of one completely validated immutable Git snapshot.
 * Callers hold the store lease. Read-only status/doctor never open this writer. */
export class AcceptedIndex {
  private changed = false;
  private closed = false;
  /** Ephemeral recovery result, never serialized as acceptance evidence. */
  recoveredCandidate = false;
  private constructor(
    private root: string,
    private db: DatabaseSync,
    private state: AcceptedState,
    private slot: Slot | "accepted-stage.sqlite",
    private previousCommit?: string
  ) {}
  /** Internal path of this verified generation; never supplied by external input. */
  get databasePath(): string {
    return join(this.root, "cache", this.slot);
  }
  get validatedState(): AcceptedState {
    return structuredClone(this.state);
  }
  static async loadCurrent(root: string): Promise<AcceptedIndex | null> {
    try {
      const value = JSON.parse(
        await readPrivateFile(
          join(root, "cache/accepted.json"),
          256 * 1024,
          true
        )
      );
      return await this.load(root, value.state.commit);
    } catch {
      return null;
    }
  }
  static async load(
    root: string,
    commit: string
  ): Promise<AcceptedIndex | null> {
    await assertDirectory(join(root, "cache"));
    try {
      const manifest = await readVerifiedManifest(root);
      if (!manifest || manifest.state.commit !== commit) return null;
      const db = new DatabaseSync(join(root, "cache", slotOf(manifest)), {
        readOnly: true,
      });
      db.exec("PRAGMA trusted_schema=OFF;");
      return new AcceptedIndex(
        root,
        db,
        manifest.state,
        slotOf(manifest),
        manifest.previousCommit
      );
    } catch {
      return null;
    }
  }
  static async create(
    root: string,
    snapshot: AcceptedLedger
  ): Promise<AcceptedIndex> {
    await assertDirectory(join(root, "cache"));
    const { slot, previousCommit } = await prepareInactiveSlot(root),
      path = join(root, "cache", slot),
      file = await fs.open(path, "wx", 0o600);
    await file.close();
    const db = new DatabaseSync(path);
    db.exec(
      "PRAGMA trusted_schema=OFF; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE records(hash TEXT PRIMARY KEY,unit TEXT NOT NULL,coverage TEXT,data TEXT NOT NULL,oid TEXT NOT NULL); CREATE INDEX units ON records(unit); CREATE INDEX coverages ON records(coverage);"
    );
    const index = new AcceptedIndex(
      root,
      db,
      {
        version: 2,
        commit: snapshot.commit,
        meta: snapshot.meta,
        catalog: snapshot.catalog,
        summary: summary(snapshot.ledger),
        valuation: summarizeValuation(snapshot.ledger.units, snapshot.catalog),
      },
      slot,
      previousCommit
    );
    try {
      db.exec("BEGIN");
      index.insert(snapshot.records);
      db.exec("COMMIT");
      index.changed = true;
      return index;
    } catch (error) {
      db.close();
      throw error;
    }
  }
  get commit() {
    return this.state.commit;
  }
  get recordCount() {
    return Number(
      this.db.prepare("SELECT count(*) AS n FROM records").get()!.n
    );
  }
  hasHashes(hashes: readonly string[]): boolean {
    const statement = this.db.prepare("SELECT 1 FROM records WHERE hash=?");
    return hashes.every((hash) => !!statement.get(hash));
  }
  hasPath(path: string): boolean {
    const match =
      /^(observations|controls)\/[a-f0-9]{2}\/([a-f0-9]{64})\.json$/.exec(path);
    if (!match) return false;
    const record = this.read("SELECT hash,data FROM records WHERE hash=?", [
      match[2],
    ])[0];
    return (
      !!record && ("kind" in record ? "controls" : "observations") === match[1]
    );
  }
  private read(sql: string, params: string[] = []): PublicRecord[] {
    return this.db
      .prepare(sql)
      .all(...params)
      .map((row) => {
        const record = parsePublicRecord(JSON.parse(row.data as string));
        if (
          recordHash(record) !== row.hash ||
          canonicalJson(record) !== row.data
        )
          throw new StoreError("invalid-durable-data");
        return record;
      });
  }
  private insert(records: readonly PublicRecord[]) {
    const insert = this.db.prepare(
      "INSERT OR IGNORE INTO records VALUES (?,?,?,?,?)"
    );
    for (const record of records) {
      const bytes = canonicalJson(record);
      insert.run(
        recordHash(record),
        "kind" in record ? record.targetUnitKey : record.unitKey,
        "kind" in record ? null : record.provider + "/" + record.coverageKey,
        bytes,
        gitBlobOid(bytes, this.state.commit)
      );
    }
  }
  /** Only the complete strict stage validator calls this promotion boundary. */
  static readValidatedStage(root: string, state: AcceptedState): AcceptedIndex {
    const path = join(root, "cache/accepted-stage.sqlite");
    fingerprint(path, true);
    const db = new DatabaseSync(path, { readOnly: true });
    db.exec("PRAGMA trusted_schema=OFF;");
    return new AcceptedIndex(root, db, state, "accepted-stage.sqlite");
  }
  static async promote(
    root: string,
    path: string,
    state: AcceptedState,
    budget?: RebuildBudget
  ): Promise<AcceptedIndex> {
    requireGenerationBudget(budget);
    const sourceFingerprint = fingerprint(path, true);
    const { slot, previousCommit } = await prepareInactiveSlot(root),
      target = join(root, "cache", slot);
    await fs.copyFile(path, target, constants.COPYFILE_EXCL);
    if (fingerprint(path, true) !== sourceFingerprint)
      throw new StoreError("invalid-durable-data");
    const db = new DatabaseSync(target);
    db.exec(
      "PRAGMA trusted_schema=OFF; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;"
    );
    const index = new AcceptedIndex(root, db, state, slot, previousCommit);
    index.changed = true;
    await index.close();
    await fs.unlink(path);
    return (await this.load(root, state.commit))!;
  }
  snapshot(): AcceptedLedger {
    const index = this,
      state = this.state;
    let full: ReturnType<typeof reduceLedger> | undefined,
      artifacts: Map<string, Uint8Array> | undefined;
    const materialize = () => {
      if (!full) {
        if (index.commit !== state.commit)
          throw new StoreError("invalid-durable-data");
        full = reduceLedger(
          index.read("SELECT hash,data FROM records ORDER BY hash"),
          state.meta
        );
      }
      return full;
    };
    return {
      commit: state.commit,
      meta: state.meta,
      catalog: state.catalog,
      indexed: this,
      get records() {
        return materialize().records;
      },
      get ledger() {
        return materialize();
      },
      get artifacts() {
        return (artifacts ??= renderArtifacts(
          materialize(),
          state.meta,
          state.catalog
        ));
      },
    };
  }
  extend(records: readonly PublicRecord[]): AcceptedExtension {
    const state = this.state,
      hashes = this.db
        .prepare("SELECT hash FROM records ORDER BY hash")
        .all()
        .map((row) => row.hash as string);
    const extension = extendProjection(
      {
        ...state,
        recordHashes: hashes,
        related: (units, coverages) => {
          const records = new Map<string, PublicRecord>();
          for (const unit of units)
            for (const record of this.read(
              "SELECT hash,data FROM records WHERE unit=?",
              [unit]
            ))
              records.set(recordHash(record), record);
          for (const coverage of coverages)
            for (const record of this.read(
              "SELECT hash,data FROM records WHERE coverage=?",
              [coverage]
            ))
              records.set(recordHash(record), record);
          return [...records.values()];
        },
      },
      records
    );
    const artifacts = renderDerivedArtifacts(
      extension.summary,
      extension.valuation,
      state.meta,
      state.catalog
    );
    for (const record of extension.records) {
      const hash = recordHash(record);
      artifacts.set(
        `${"kind" in record ? "controls" : "observations"}/${hash.slice(
          0,
          2
        )}/${hash}.json`,
        Buffer.from(canonicalJson(record))
      );
    }
    return { ...extension, artifacts, baseCommit: state.commit };
  }
  async install(
    commit: string,
    extension: AcceptedExtension,
    budget?: RebuildBudget
  ): Promise<void> {
    if (extension.baseCommit !== this.state.commit)
      throw new StoreError("invalid-durable-data");
    requireGenerationBudget(budget);
    if (!this.changed) {
      const current = await readVerifiedManifest(this.root);
      if (
        !current ||
        current.state.commit !== this.commit ||
        slotOf(current) !== this.slot
      )
        throw new StoreError("invalid-durable-data");
      const { slot, previousCommit } = await prepareInactiveSlot(this.root),
        target = join(this.root, "cache", slot);
      await fs.copyFile(this.databasePath, target, constants.COPYFILE_EXCL);
      if (fingerprint(this.databasePath, true) !== current.database)
        throw new StoreError("invalid-durable-data");
      if (budget && (budget.signal.aborted || Date.now() >= budget.deadline))
        throw new StoreError("store-busy");
      const db = new DatabaseSync(target);
      db.exec(
        "PRAGMA trusted_schema=OFF; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;"
      );
      this.db.close();
      this.db = db;
      this.slot = slot;
      this.previousCommit = previousCommit;
    }
    this.db.exec("BEGIN");
    try {
      this.insert(extension.records);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    this.state = {
      ...this.state,
      commit,
      summary: extension.summary,
      valuation: extension.valuation,
      retainedCommit: extension.baseCommit,
    };
    this.changed = true;
  }
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
    if (!this.changed) return;
    const file = await fs.open(
      this.databasePath,
      constants.O_RDONLY | constants.O_NOFOLLOW
    );
    try {
      await file.sync();
    } finally {
      await file.close();
    }
    await syncDirectory(join(this.root, "cache"));
    const database = fingerprint(this.databasePath, true),
      body = {
        state: this.state,
        database,
        slot: this.slot,
        ...(this.previousCommit ? { previousCommit: this.previousCommit } : {}),
      };
    await atomicFile(join(this.root, "cache/accepted.json"), {
      ...body,
      digest: digest(JSON.stringify(body)),
    });
  }
}
