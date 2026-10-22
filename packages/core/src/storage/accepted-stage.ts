import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { join } from "node:path";
import type { RepositoryContext } from "../git/context.js";
import type { AcceptedLedger } from "../git/data-transport.js";
import { runGit, streamGitRecords } from "../git/process.js";
import { readVerifiedGitBlobs, readGitBlobSizes } from "../git/objects.js";
import {
  parseLedgerMeta,
  parsePublicRecord,
  validatePublicBlob,
} from "../domain/ledger.js";
import type { PublicRecord } from "../domain/ledger.js";
import {
  ProtocolError,
  PUBLIC_OBJECT_MAX_BYTES,
} from "../domain/capabilities.js";
import { canonicalJson, recordHash } from "../ledger/canonical-json.js";
import { reduceLedger } from "../ledger/reduce.js";
import { contentHash, parsePriceCatalog } from "../pricing/catalog.js";
import {
  renderDerivedArtifacts,
  summarizeValuation,
} from "../render/summary.js";
import { AcceptedIndex, gitBlobOid } from "./accepted-index.js";
import type { AcceptedState, AcceptedExtension } from "./accepted-index.js";
import { fingerprint } from "./index-cache.js";
import type { RebuildBudget } from "./index-cache.js";
import {
  assertDirectory,
  atomicFile,
  hasCode,
  readPrivateFile,
  StoreError,
} from "./atomic-file.js";
type Progress = {
  version: 1;
  phase: "tree" | "blobs" | "reduce" | "finish" | "retention";
  lastPath: string;
  copied: boolean;
  state?: AcceptedState;
  retentionCursor?: string;
  retentionAnchor?: string;
};
type Owner = {
  version: 1;
  commit: string;
  ref: string;
  binding: string;
  candidateBase?: string;
};
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const oid = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const stageNames = [
  "accepted-stage.sqlite",
  "accepted-stage.sqlite-journal",
  "accepted-stage.sqlite-wal",
  "accepted-stage.sqlite-shm",
  "accepted-stage.json",
];
async function removeStageFiles(directory: string) {
  for (const name of stageNames)
    try {
      const path = join(directory, name),
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
}
/** Unconfirmed bytes only; subsequent calls still select current pending groups. */
export async function prepareAcceptedCandidate(
  repository: RepositoryContext,
  commit: string,
  extension: AcceptedExtension,
  options: RebuildBudget & { binding: string }
): Promise<void> {
  if (
    !oid.test(commit) ||
    !oid.test(extension.baseCommit) ||
    extension.records.length > 128 ||
    extension.records.reduce(
      (bytes, record) => bytes + Buffer.byteLength(canonicalJson(record)),
      0
    ) >
      512 * 1024
  )
    throw new StoreError("invalid-batch");
  const directory = join(repository.privateDir, "cache"),
    ownerPath = join(directory, "accepted-stage-owner.json");
  await assertDirectory(directory);
  const git = async (args: string[]) => {
    const result = await runGit(
      ["--no-replace-objects", "-c", "core.hooksPath=/dev/null", ...args],
      {
        cwd: repository.worktreeRoot,
        signal: options.signal,
        timeoutMs: Math.max(1, options.deadline - Date.now()),
      }
    );
    if (result.status !== "ok") throw new StoreError("store-busy");
  };
  try {
    const old = JSON.parse(
      await readPrivateFile(ownerPath, 4096, true)
    ) as Owner;
    if (
      old.version !== 1 ||
      !oid.test(old.commit) ||
      !/^refs\/agent-badge\/staging\/[a-f0-9-]{36}$/.test(old.ref) ||
      typeof old.binding !== "string"
    )
      throw new StoreError("invalid-durable-data");
    await git(["update-ref", "-d", old.ref, old.commit]);
    await fs.unlink(ownerPath);
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error instanceof StoreError && error.code === "invalid-durable-data")
    ) {
      const info = await fs.lstat(ownerPath);
      if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        (process.getuid && info.uid !== process.getuid())
      )
        throw new StoreError("unsafe-store-path");
      await fs.unlink(ownerPath);
    } else if (!hasCode(error, "ENOENT")) throw error;
  }
  await removeStageFiles(directory);
  const owner: Owner = {
    version: 1,
    commit,
    ref: "refs/agent-badge/staging/" + randomUUID(),
    binding: options.binding,
    candidateBase: extension.baseCommit,
  };
  await atomicFile(ownerPath, owner);
  await git(["update-ref", owner.ref, commit, "0".repeat(commit.length)]);
  const path = join(directory, "accepted-stage.sqlite"),
    file = await fs.open(path, "wx", 0o600);
  await file.close();
  const db = new DatabaseSync(path);
  try {
    db.exec(
      "PRAGMA trusted_schema=OFF; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE records(hash TEXT PRIMARY KEY,data TEXT NOT NULL); BEGIN"
    );
    const insert = db.prepare("INSERT INTO records VALUES (?,?)");
    for (const record of extension.records) {
      options.signal.throwIfAborted();
      insert.run(recordHash(record), canonicalJson(record));
    }
    db.exec("COMMIT");
  } finally {
    db.close();
  }
  const progress = {
      version: 1,
      phase: "candidate",
      baseCommit: extension.baseCommit,
    },
    database = fingerprint(path, true);
  await atomicFile(join(directory, "accepted-stage.json"), {
    progress,
    database,
    digest: digest({ owner, progress, database }),
  });
}
/** Disposable progress only. No caller may query partial membership or summaries. */
export async function rebuildAcceptedIndex(
  repository: RepositoryContext,
  requested: string,
  options: RebuildBudget & {
    binding?: string;
    priorCommit?: string;
    recoverCommit?: (commit: string) => Promise<boolean>;
    onValidatedStage?: (snapshot: AcceptedLedger) => Promise<void>;
  }
): Promise<AcceptedIndex | null> {
  if (!oid.test(requested)) throw new ProtocolError("invalid-record");
  const root = repository.privateDir,
    directory = join(root, "cache"),
    path = join(directory, "accepted-stage.sqlite"),
    manifestPath = join(directory, "accepted-stage.json"),
    ownerPath = join(directory, "accepted-stage-owner.json");
  await assertDirectory(directory);
  const git = async (args: string[]) => {
    const result = await runGit(
      ["--no-replace-objects", "-c", "core.hooksPath=/dev/null", ...args],
      {
        cwd: repository.worktreeRoot,
        signal: options.signal,
        timeoutMs: Math.max(1, options.deadline - Date.now()),
        env: { GIT_NO_REPLACE_OBJECTS: "1" },
      }
    );
    if (result.status !== "ok") throw new StoreError("store-busy");
    return result.stdout.trim();
  };
  let owner: Owner | undefined,
    discardedOwner = false;
  try {
    const value = JSON.parse(await readPrivateFile(ownerPath, 4096, true));
    if (
      value.version !== 1 ||
      !oid.test(value.commit) ||
      !/^refs\/agent-badge\/staging\/[a-f0-9-]{36}$/.test(value.ref) ||
      typeof value.binding !== "string"
    )
      throw new StoreError("invalid-durable-data");
    owner = value;
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error instanceof StoreError && error.code === "invalid-durable-data")
    ) {
      // An unreadable receipt cannot prove ownership of any ref. Leave such refs
      // untouched and discard only the owned private derived files.
      const info = await fs.lstat(ownerPath);
      if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        (process.getuid && info.uid !== process.getuid())
      )
        throw new StoreError("unsafe-store-path");
      await fs.unlink(ownerPath);
      discardedOwner = true;
    } else if (!hasCode(error, "ENOENT")) throw error;
  }
  const binding = options.binding ?? "";
  async function removeStage() {
    for (const name of [
      "accepted-stage.sqlite",
      "accepted-stage.sqlite-journal",
      "accepted-stage.sqlite-wal",
      "accepted-stage.sqlite-shm",
      "accepted-stage.json",
    ])
      try {
        const target = join(directory, name),
          info = await fs.lstat(target);
        if (
          !info.isFile() ||
          info.isSymbolicLink() ||
          (process.getuid && info.uid !== process.getuid())
        )
          throw new StoreError("unsafe-store-path");
        await fs.unlink(target);
      } catch (error) {
        if (!hasCode(error, "ENOENT")) throw error;
      }
  }
  if (discardedOwner) await removeStage();
  if (owner && owner.binding !== binding) {
    await git(["update-ref", "-d", owner.ref, owner.commit]);
    await fs.rm(ownerPath);
    await removeStage();
    owner = undefined;
  }
  if (owner?.candidateBase) {
    let base: AcceptedIndex | null = null,
      recovered = false;
    try {
      const manifest = JSON.parse(
          await readPrivateFile(manifestPath, 256 * 1024, true)
        ),
        database = fingerprint(path, true);
      if (
        !oid.test(owner.candidateBase) ||
        manifest.database !== database ||
        manifest.digest !==
          digest({ owner, progress: manifest.progress, database }) ||
        manifest.progress.phase !== "candidate" ||
        manifest.progress.baseCommit !== owner.candidateBase
      )
        throw new StoreError("invalid-durable-data");
      for (const suffix of ["-journal", "-wal", "-shm"])
        try {
          await fs.lstat(path + suffix);
          throw new StoreError("invalid-durable-data");
        } catch (error) {
          if (!hasCode(error, "ENOENT")) throw error;
        }
      if (requested !== owner.commit)
        await git(["merge-base", "--is-ancestor", owner.commit, requested]);
      if (
        (await git([
          "rev-parse",
          "--verify",
          `refs/agent-badge/accepted/${owner.candidateBase}`,
        ])) !== owner.candidateBase
      )
        throw new StoreError("invalid-durable-data");
      if ((await git(["rev-parse", "--verify", owner.ref])) !== owner.commit)
        throw new StoreError("invalid-durable-data");
      if (
        (await git(["show", "-s", "--format=%P", owner.commit])) !==
        owner.candidateBase
      )
        throw new StoreError("invalid-durable-data");
      base = await AcceptedIndex.load(root, owner.candidateBase);
      if (!base) throw new StoreError("invalid-durable-data");
      const db = new DatabaseSync(path, { readOnly: true });
      let records: PublicRecord[];
      try {
        const rows = db
          .prepare("SELECT hash,data FROM records ORDER BY hash LIMIT 129")
          .all();
        if (rows.length > 128) throw new StoreError("invalid-durable-data");
        let bytes = 0;
        records = rows.map((row) => {
          bytes += Buffer.byteLength(String(row.data));
          const record = parsePublicRecord(JSON.parse(String(row.data)));
          if (
            bytes > 512 * 1024 ||
            recordHash(record) !== row.hash ||
            canonicalJson(record) !== row.data
          )
            throw new StoreError("invalid-durable-data");
          return record;
        });
      } finally {
        db.close();
      }
      const extension = base.extend(records),
        expected = new Map<string, string>();
      for (const [name, bytes] of extension.artifacts)
        expected.set(
          name,
          gitBlobOid(Buffer.from(bytes).toString("utf8"), owner.commit)
        );
      // Verify the complete raw tree delta; unchanged derived files need not occur.
      const delta = (
        await git([
          "diff-tree",
          "--no-commit-id",
          "--no-renames",
          "--raw",
          "-r",
          "-z",
          owner.candidateBase,
          owner.commit,
        ])
      ).split("\0");
      const changed = new Set<string>();
      for (let i = 0; i < delta.length && delta[i]; i += 2) {
        const match =
            /^:(100644|000000) 100644 [a-f0-9]+ ([a-f0-9]+) ([AM])$/.exec(
              delta[i]
            ),
          name = delta[i + 1];
        if (
          !match ||
          !name ||
          changed.has(name) ||
          expected.get(name) !== match[2]
        )
          throw new StoreError("invalid-durable-data");
        changed.add(name);
      }
      for (const [name, object] of expected)
        if (
          !changed.has(name) &&
          (await git([
            "rev-parse",
            "--verify",
            `${owner.candidateBase}:${name}`,
          ])) !== object
        )
          throw new StoreError("invalid-durable-data");
      if (requested !== owner.commit) {
        const retained = (
          await git([
            "diff-tree",
            "--no-commit-id",
            "--no-renames",
            "--raw",
            "-r",
            "-z",
            owner.commit,
            requested,
            "--",
            "observations",
            "controls",
          ])
        ).split("\0");
        for (let i = 0; i < retained.length && retained[i]; i += 2)
          if (!/^:000000 100644 [a-f0-9]+ [a-f0-9]+ A$/.test(retained[i]))
            throw new ProtocolError("invalid-record");
      }
      if (options.deadline - Date.now() < 500) return null;
      await base.install(owner.commit, extension, options);
      await base.close();
      base = null;
      recovered = true;
    } catch (error) {
      if (
        error instanceof ProtocolError ||
        options.signal.aborted ||
        Date.now() >= options.deadline
      )
        throw error;
    } finally {
      await base?.close();
    }
    await git(["update-ref", "-d", owner.ref, owner.commit]);
    await fs.rm(ownerPath);
    await removeStage();
    if (recovered && owner.commit === requested) {
      const index = await AcceptedIndex.load(root, requested);
      if (!index) throw new StoreError("invalid-durable-data");
      index.recoveredCandidate = true;
      return index;
    }
    // A confirmed candidate ancestor is only a validated base. All intervening
    // remote changes still pass the ordinary complete staged validator below.
    return rebuildAcceptedIndex(repository, requested, options);
  }
  if (!owner) {
    owner = {
      version: 1,
      commit: requested,
      ref: "refs/agent-badge/staging/" + randomUUID(),
      binding,
    };
    await atomicFile(ownerPath, owner);
    await git([
      "update-ref",
      owner.ref,
      owner.commit,
      "0".repeat(owner.commit.length),
    ]);
  } else {
    const result = await runGit(
      ["--no-replace-objects", "rev-parse", "--verify", owner.ref],
      {
        cwd: repository.worktreeRoot,
        signal: options.signal,
        timeoutMs: Math.max(1, options.deadline - Date.now()),
      }
    );
    if (result.status === "ok") {
      if (result.stdout.trim() !== owner.commit)
        throw new StoreError("invalid-durable-data");
    } else {
      let type: string | undefined;
      try {
        type = await git(["cat-file", "-t", owner.commit]);
      } catch (error) {
        if (!options.recoverCommit) throw error;
        if (!(await options.recoverCommit(owner.commit))) {
          if (owner.commit === requested) throw error;
          // The proven stage ref is absent and its object cannot be recovered.
          // Discard its incomplete derived generation, then validate the newly
          // fetched tip from scratch; never pass old membership to the caller.
          await removeStage();
          await fs.unlink(ownerPath);
          return rebuildAcceptedIndex(repository, requested, options);
        }
        type = await git(["cat-file", "-t", owner.commit]);
      }
      if (type !== "commit") throw new ProtocolError("invalid-object-type");
      await git([
        "update-ref",
        owner.ref,
        owner.commit,
        "0".repeat(owner.commit.length),
      ]);
    }
  }
  let progress: Progress = {
      version: 1,
      phase: "tree",
      lastPath: "",
      copied: false,
    },
    valid = false;
  try {
    const manifest = JSON.parse(
        await readPrivateFile(manifestPath, 256 * 1024, true)
      ),
      database = fingerprint(path, true);
    if (
      manifest.database === database &&
      manifest.digest ===
        digest({ owner, progress: manifest.progress, database }) &&
      manifest.progress.version === 1
    ) {
      progress = manifest.progress;
      valid = true;
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
  if (!valid) {
    await removeStage();
    const file = await fs.open(path, "wx", 0o600);
    await file.close();
    progress = { version: 1, phase: "tree", lastPath: "", copied: false };
  }
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA trusted_schema=OFF; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;"
  );
  if (!valid)
    db.exec(`CREATE TABLE inventory(path TEXT PRIMARY KEY,oid TEXT NOT NULL,size INTEGER NOT NULL,hash TEXT,verified INTEGER NOT NULL DEFAULT 0,body BLOB);
    CREATE INDEX unverified ON inventory(verified,path);CREATE INDEX object_identity ON inventory(hash,oid);
    CREATE TABLE directories(path TEXT PRIMARY KEY);
    CREATE TABLE records(hash TEXT PRIMARY KEY,unit TEXT NOT NULL,coverage TEXT,data TEXT NOT NULL,oid TEXT NOT NULL);
    CREATE INDEX units ON records(unit);CREATE INDEX coverages ON records(coverage);
    CREATE TABLE todo(unit TEXT PRIMARY KEY,deferred INTEGER NOT NULL DEFAULT 0);`);
  let closed = false,
    base: AcceptedIndex | null = null;
  const end = Math.min(Date.now() + 700, options.deadline - 500),
    max = options.maxEntries ?? 1024;
  const available = () => !options.signal.aborted && Date.now() < end;
  async function save() {
    db.close();
    closed = true;
    const database = fingerprint(path, true);
    await atomicFile(manifestPath, {
      progress,
      database,
      digest: digest({ owner, progress, database }),
    });
  }
  try {
    if (progress.phase === "tree") {
      if ((await git(["cat-file", "-t", owner.commit])) !== "commit")
        throw new ProtocolError("invalid-object-type");
      let seen = 0,
        finished = true,
        lastSeen = "";
      const resumePath = progress.lastPath;
      db.exec("BEGIN");
      const put = db.prepare(
          "INSERT INTO inventory(path,oid,size,hash) VALUES (?,?,?,?)"
        ),
        directory = db.prepare("INSERT INTO directories VALUES (?)");
      for await (const line of streamGitRecords(
        [
          "--no-replace-objects",
          "-c",
          "core.hooksPath=/dev/null",
          "ls-tree",
          "-r",
          "-t",
          "-z",
          "--full-tree",
          owner.commit,
        ],
        {
          cwd: repository.worktreeRoot,
          signal: options.signal,
          timeoutMs: Math.max(1, options.deadline - Date.now()),
          maxRecordBytes: 1024,
        }
      )) {
        const match = /^(\d{6}) (\w+) ([a-f0-9]+)\t(.+)$/.exec(line);
        if (!match) throw new ProtocolError("invalid-path");
        const [, mode, type, object, name] = match;
        if (!oid.test(object)) throw new ProtocolError("invalid-record");
        if (name <= lastSeen) throw new ProtocolError("invalid-path");
        lastSeen = name;
        if (name <= resumePath) continue;
        if (!available() || seen >= max) {
          finished = false;
          break;
        }
        if (
          mode === "040000" &&
          type === "tree" &&
          /^(?:observations|controls)(?:\/[a-f0-9]{2})?$/.test(name)
        )
          directory.run(name);
        else {
          validatePublicBlob(name, mode, new Uint8Array(), type);
          put.run(
            name,
            object,
            -1,
            /^(?:observations|controls)\//.test(name)
              ? name.slice(-69, -5)
              : null
          );
        }
        progress.lastPath = name;
        seen++;
      }
      db.exec("COMMIT");
      if (finished) progress.phase = "blobs";
    }
    if (progress.phase === "blobs" && available()) {
      base = await AcceptedIndex.loadCurrent(root);
      if (!progress.copied) {
        if (base) {
          // The complete base generation was validated before this read-only join.
          db.prepare("ATTACH DATABASE ? AS prior").run(base.databasePath);
          try {
            db.exec(
              `BEGIN;
              INSERT INTO records SELECT r.* FROM prior.records r JOIN inventory i
                ON i.hash=r.hash AND i.oid=r.oid
                AND i.path=(CASE WHEN r.coverage IS NULL THEN 'controls/' ELSE 'observations/' END)
                  || substr(r.hash,1,2) || '/' || r.hash || '.json';
              UPDATE inventory SET verified=1,
                size=(SELECT length(CAST(data AS BLOB)) FROM records WHERE records.hash=inventory.hash)
                WHERE path=(SELECT (CASE WHEN r.coverage IS NULL THEN 'controls/' ELSE 'observations/' END)
                  || substr(r.hash,1,2) || '/' || r.hash || '.json' FROM records r WHERE r.hash=inventory.hash);
              COMMIT;`
            );
          } finally {
            db.exec("DETACH DATABASE prior");
          }
          if (
            options.priorCommit === base.commit &&
            Number(db.prepare("SELECT count(*) AS n FROM records").get()!.n) !==
              base.recordCount
          )
            throw new ProtocolError("invalid-record");
        }
        progress.copied = true;
      }
      let read = 0;
      while (available() && read < max) {
        const rows = db
          .prepare(
            "SELECT path,oid,size FROM inventory WHERE verified=0 ORDER BY path LIMIT ?"
          )
          .all(Math.min(256, max - read)) as unknown as {
          path: string;
          oid: string;
          size: number;
        }[];
        if (!rows.length) {
          progress.phase = "reduce";
          break;
        }
        const sizes = await readGitBlobSizes(
          repository.worktreeRoot,
          rows.map((row) => row.oid),
          options
        );
        rows.forEach((row, i) => {
          row.size = sizes[i];
        });
        let bytes = 0;
        const batch = rows.filter((row) => {
          if (bytes + row.size + 128 > 8 * 1024 * 1024) return false;
          bytes += row.size + 128;
          return true;
        });
        const bodies = await readVerifiedGitBlobs(
          repository.worktreeRoot,
          batch,
          options
        );
        db.exec("BEGIN");
        for (let i = 0; i < batch.length; i++) {
          const row = batch[i],
            body = bodies[i],
            value = new TextDecoder("utf-8", { fatal: true }).decode(body);
          if (/^(observations|controls)\//.test(row.path)) {
            const record = parsePublicRecord(JSON.parse(value)),
              hash = recordHash(record);
            if (
              row.path !==
                `${"kind" in record ? "controls" : "observations"}/${hash.slice(
                  0,
                  2
                )}/${hash}.json` ||
              canonicalJson(record) !== value
            )
              throw new ProtocolError("invalid-record");
            db.prepare("INSERT INTO records VALUES (?,?,?,?,?)").run(
              hash,
              "kind" in record ? record.targetUnitKey : record.unitKey,
              "kind" in record
                ? null
                : record.provider + "/" + record.coverageKey,
              value,
              row.oid
            );
            db.prepare(
              "UPDATE inventory SET verified=1,size=? WHERE path=?"
            ).run(row.size, row.path);
          } else
            db.prepare(
              "UPDATE inventory SET verified=1,size=?,body=? WHERE path=?"
            ).run(row.size, body, row.path);
        }
        db.exec("COMMIT");
        read += batch.length;
      }
    }
    const body = (name: string) => {
      const row = db
        .prepare("SELECT body FROM inventory WHERE path=? AND verified=1")
        .get(name);
      if (!row?.body) throw new ProtocolError("invalid-path");
      return Buffer.from(row.body as Uint8Array);
    };
    if (progress.phase === "reduce" && available()) {
      if (!progress.state) {
        base ??= await AcceptedIndex.loadCurrent(root);
        const meta = parseLedgerMeta(
            JSON.parse(body("meta.json").toString("utf8"))
          ),
          catalog = parsePriceCatalog(
            JSON.parse(body("catalog.json").toString("utf8"))
          );
        const {
          records: _,
          recordHashes: __,
          units: ___,
          ...summary
        } = reduceLedger([], meta);
        progress.state = {
          version: 2,
          commit: owner.commit,
          meta,
          catalog,
          summary,
          valuation: summarizeValuation([], catalog),
        };
        db.exec("INSERT INTO todo(unit) SELECT DISTINCT unit FROM records");
        if (
          base &&
          contentHash(base.validatedState.meta) === contentHash(meta)
        ) {
          const old = base.validatedState;
          db.prepare("ATTACH DATABASE ? AS prior").run(base.databasePath);
          let retained = false,
            added: PublicRecord[] = [];
          try {
            retained = !db
              .prepare(
                "SELECT 1 FROM prior.records p LEFT JOIN records r ON p.hash=r.hash WHERE r.hash IS NULL LIMIT 1"
              )
              .get();
            const rows = db
              .prepare(
                "SELECT r.data FROM records r LEFT JOIN prior.records p ON r.hash=p.hash WHERE p.hash IS NULL LIMIT 513"
              )
              .all();
            if (rows.length <= 512)
              added = rows.map((row) =>
                parsePublicRecord(JSON.parse(row.data as string))
              );
            else retained = false;
          } finally {
            db.exec("DETACH DATABASE prior");
          }
          if (retained) {
            const extension = base.extend(added);
            progress.state = {
              ...old,
              commit: owner.commit,
              summary: extension.summary,
              valuation: extension.valuation,
              retainedCommit: base.commit,
            };
            db.exec("DELETE FROM todo");
          }
        }
      }
      let processed = 0;
      db.exec("BEGIN");
      while (available() && processed < max) {
        const first = db
          .prepare(
            "SELECT unit FROM todo WHERE deferred=0 ORDER BY unit LIMIT 1"
          )
          .get();
        if (!first) break;
        const units = new Set<string>([String(first.unit)]),
          coverages = new Set<string>(),
          records = new Map<string, PublicRecord>();
        let size = -1,
          oversized = false;
        const visit = (sql: string, key: string) => {
          const rows = db.prepare(sql).all(key);
          if (rows.length > 10000) {
            oversized = true;
            return;
          }
          for (const row of rows) {
            const record = parsePublicRecord(JSON.parse(row.data as string));
            if (recordHash(record) !== row.hash)
              throw new ProtocolError("invalid-record");
            records.set(String(row.hash), record);
            units.add("kind" in record ? record.targetUnitKey : record.unitKey);
            if (!("kind" in record))
              coverages.add(record.provider + "/" + record.coverageKey);
            if (records.size > 10000) {
              oversized = true;
              return;
            }
          }
        };
        while (!oversized && size !== units.size + coverages.size) {
          size = units.size + coverages.size;
          for (const unit of units)
            visit(
              "SELECT hash,data FROM records WHERE unit=? LIMIT 10001",
              unit
            );
          for (const coverage of coverages)
            visit(
              "SELECT hash,data FROM records WHERE coverage=? LIMIT 10001",
              coverage
            );
        }
        if (oversized) {
          for (const unit of units)
            db.prepare("UPDATE todo SET deferred=1 WHERE unit=?").run(unit);
          processed++;
          continue;
        }
        const reduced = reduceLedger(
            [...records.values()],
            progress.state.meta
          ),
          valuation = summarizeValuation(reduced.units, progress.state.catalog),
          summary = progress.state.summary,
          total = progress.state.valuation;
        summary.knownTokens = (
          BigInt(summary.knownTokens) + BigInt(reduced.knownTokens)
        ).toString();
        for (const key of [
          "recordedUnits",
          "includedUnits",
          "excludedUnits",
          "conflictingUnits",
          "partialUnits",
          "unknownTokenUnits",
        ] as const)
          summary[key] += reduced[key];
        total.numerator = (
          BigInt(total.numerator) + BigInt(valuation.numerator)
        ).toString();
        for (const key of [
          "pricedSegments",
          "unpricedSegments",
          "pricedUnits",
          "unknownTokenOnlyUnits",
        ] as const)
          total[key] += valuation[key];
        for (const unit of units)
          db.prepare("DELETE FROM todo WHERE unit=?").run(unit);
        processed += records.size;
      }
      db.exec("COMMIT");
      if (!db.prepare("SELECT 1 FROM todo LIMIT 1").get())
        progress.phase = "finish";
    }
    if (progress.phase === "finish" && available()) {
      if (
        db
          .prepare(
            "SELECT 1 FROM inventory WHERE verified<>1 OR size<0 OR size>? LIMIT 1"
          )
          .get(PUBLIC_OBJECT_MAX_BYTES)
      )
        throw new ProtocolError("invalid-record");
      const state = progress.state!,
        hashes = db
          .prepare("SELECT hash FROM records ORDER BY hash")
          .all()
          .map((row) => row.hash as string);
      state.summary.inputSetHash = contentHash({
        metaHash: state.summary.metaHash,
        recordHashes: hashes,
      });
      const expected = renderDerivedArtifacts(
        state.summary,
        state.valuation,
        state.meta,
        state.catalog
      );
      if (
        Number(db.prepare("SELECT count(*) AS n FROM inventory").get()!.n) !==
        hashes.length + expected.size
      )
        throw new ProtocolError("invalid-record");
      for (const [name, bytes] of expected)
        if (!body(name).equals(Buffer.from(bytes)))
          throw new ProtocolError("invalid-record");
      for (const row of db.prepare("SELECT path FROM directories").all()) {
        const prefix = String(row.path);
        if (
          !db
            .prepare("SELECT 1 FROM inventory WHERE path>=? AND path<? LIMIT 1")
            .get(prefix + "/", prefix + "0")
        )
          throw new ProtocolError("invalid-path");
      }
      progress.phase = "retention";
    }
    if (progress.phase === "retention" && available()) {
      const state = progress.state!;
      if (options.priorCommit && options.priorCommit !== owner.commit) {
        const anchor = options.priorCommit;
        if (progress.retentionAnchor !== anchor) {
          if (
            (await git([
              "rev-parse",
              "--verify",
              `refs/agent-badge/accepted/${anchor}`,
            ])) !== anchor
          )
            throw new ProtocolError("invalid-record");
          await git(["merge-base", "--is-ancestor", anchor, owner.commit]);
          progress.retentionAnchor = anchor;
          progress.retentionCursor = "";
        }
        if (state.retainedCommit !== anchor) {
          const resume = progress.retentionCursor ?? "";
          let seen = 0,
            finished = true;
          for await (const name of streamGitRecords(
            [
              "--no-replace-objects",
              "-c",
              "core.hooksPath=/dev/null",
              "ls-tree",
              "-r",
              "-z",
              "--name-only",
              anchor,
              "--",
              "observations",
              "controls",
            ],
            {
              cwd: repository.worktreeRoot,
              signal: options.signal,
              timeoutMs: Math.max(1, options.deadline - Date.now()),
              maxRecordBytes: 1024,
            }
          )) {
            if (name <= resume) continue;
            if (!available() || seen >= max) {
              finished = false;
              break;
            }
            if (!db.prepare("SELECT 1 FROM inventory WHERE path=?").get(name))
              throw new ProtocolError("invalid-record");
            progress.retentionCursor = name;
            seen++;
          }
          if (!finished) {
            await save();
            return null;
          }
          state.retainedCommit = anchor;
        }
      }
      await base?.close();
      base = null;
      await save();
      // Only a durably sealed, completely validated current fetched snapshot can
      // release an older accepted slot. The ordinary owning acceptance routine
      // advances authority; this stage never acknowledges pending local records.
      if (owner.commit === requested && options.onValidatedStage) {
        const sealed = AcceptedIndex.readValidatedStage(root, state);
        try {
          await options.onValidatedStage(sealed.snapshot());
        } finally {
          await sealed.close();
        }
      }
      const accepted = await AcceptedIndex.promote(root, path, state, options);
      await git(["update-ref", "-d", owner.ref, owner.commit]);
      await fs.rm(ownerPath);
      await fs.rm(manifestPath, { force: true });
      if (owner.commit !== requested) {
        await accepted.close();
        return null;
      }
      return accepted;
    }
    await save();
    return null;
  } catch (error) {
    if (!closed) {
      try {
        db.exec("ROLLBACK");
      } catch {}
      db.close();
      closed = true;
      await fs.rm(manifestPath, { force: true });
    }
    throw error;
  } finally {
    await base?.close();
    if (!closed) db.close();
  }
}
