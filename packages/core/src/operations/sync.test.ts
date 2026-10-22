import { afterEach, expect, test, vi } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runStorageFixtureProcess } from "@agent-badge/testkit";
import {
  createBareRemoteFixture,
  protocolObservationFixture,
  snapshotUserCheckout,
} from "@agent-badge/testkit";
import type { GitFixture } from "@agent-badge/testkit";
import { resolveRepository } from "../git/context.js";
import { bindRemote } from "../git/remote-binding.js";
import { openStore } from "../storage/store.js";
import { sanitizeObservation } from "../ledger/sanitize.js";
import { recordHash } from "../ledger/canonical-json.js";
import { catalogHash, defaultCatalog } from "../pricing/catalog.js";
import * as gitProcess from "../git/process.js";
import { codexRollout } from "@agent-badge/testkit";
import { createCodexAdapter } from "../providers/codex/adapter.js";
import { DataTransport } from "../git/data-transport.js";
import { renderArtifacts } from "../render/summary.js";
import { reduceLedger } from "../ledger/reduce.js";
import { commitFixtureTree } from "@agent-badge/testkit";
import { syncUsage } from "./sync.js";

const repositoryId = "12345678-1234-4234-8234-123456789abc";
const policy = {
  schemaVersion: 1 as const,
  repositoryId,
  normalizationVersion: 1 as const,
  discovery: "auto" as const,
  disabledProviders: [],
  badge: { label: "Shared label", metric: "tokens" as const },
};
const meta = {
  schemaVersion: 2 as const,
  protocolVersion: 1 as const,
  repositoryId,
  normalizationVersion: 1 as const,
  catalogVersion: 1,
  catalogHash: catalogHash(defaultCatalog),
  policy,
};
const fixtures: GitFixture[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(fixtures.splice(0).map((f) => f.cleanup()));
});
async function fixture() {
  const f = await createBareRemoteFixture();
  fixtures.push(f);
  return f;
}
async function client(f: GitFixture, cwd = f.clones[0], key = "first") {
  const repository = await resolveRepository(cwd);
  const store = await openStore(repository, {
    processNamespace: async () => "synthetic",
  });
  const binding = await bindRemote(repository, {
    repositoryId,
    declaredUrl: f.remote,
    target: "origin",
  });
  if (binding.status !== "bound") throw Error("fixture");
  const observation = protocolObservationFixture();
  observation.nativeUnitId = key;
  observation.nativeCoverageId = key;
  const source = {
    provider: "codex" as const,
    root: "/synthetic",
    schema: observation.source.sourceSchema,
    instanceKey: observation.source.instanceKey,
    sourceIdentity: observation.source.sourceIdentity,
    generation: observation.source.generation,
    readerVersion: "1",
  };
  const record = sanitizeObservation(observation, policy);
  await store.commitBatch(
    source,
    {
      source,
      observations: [observation],
      outcome: "complete",
      diagnostics: [],
      nextCheckpoint: {
        schemaVersion: 1,
        provider: "codex",
        instanceKey: source.instanceKey,
        sourceIdentity: source.sourceIdentity,
        sourceGeneration: source.generation,
        sourceSchema: source.schema,
        readerVersion: "1",
        normalizationVersion: 1,
        repositoryId,
        attributionPolicyHash: "a".repeat(64),
        continuation: null,
        cursor: {
          offset: 1,
          size: 1,
          prefixHash: "b".repeat(64),
          incompleteTail: "",
        },
      },
    },
    [record]
  );
  return {
    repository,
    store,
    binding,
    record,
    signal: AbortSignal.timeout(20000),
    deadline: Date.now() + 20000,
    collect: "none" as const,
  };
}
test("explicit initialization syncs only public records, confirms inclusion, and replays without a new commit", async () => {
  const f = await fixture(),
    c = await client(f);
  const before = await snapshotUserCheckout(c.repository.worktreeRoot);
  const result = await syncUsage({
    ...c,
    initialize: { meta, catalog: defaultCatalog },
  });
  expect(result.status).toBe("synced");
  expect(result.acknowledgedHashes).toEqual([recordHash(c.record)]);
  expect(await c.store.pending()).toEqual([]);
  expect(result.accepted.meta.policy.badge.label).toBe("Shared label");
  expect(await snapshotUserCheckout(c.repository.worktreeRoot)).toEqual(before);
  const second = await syncUsage(c);
  expect(second.status).toBe("unchanged");
  expect(second.confirmedCommit).toBe(result.confirmedCommit);
  const commit = await f.git(f.remote, [
    "show",
    "-s",
    "--format=%an|%ae|%cn|%ce|%B",
    result.confirmedCommit,
  ]);
  expect(commit).toBe(
    "agent-badge bot|agent-badge@example.invalid|agent-badge bot|agent-badge@example.invalid|Update agent-badge usage\n\n"
  );
  const publicTree = await f.git(f.remote, [
    "ls-tree",
    "-r",
    "--name-only",
    result.confirmedCommit,
  ]);
  expect(publicTree).not.toContain("synthetic");
});
test("three concurrent clones merge immutable union across initial creation and stale writers", async () => {
  const f = await fixture();
  const third = join(f.root, "clone-c");
  await f.git(f.root, ["clone", f.remote, third]);
  const clients = await Promise.all([
    client(f, f.clones[0], "one"),
    client(f, f.clones[1], "two"),
    client(f, third, "three"),
  ]);
  const results = await Promise.all(
    clients.map((c) =>
      syncUsage({
        ...c,
        initialize: { meta, catalog: defaultCatalog },
        maxRetries: 3,
      })
    )
  );
  expect(results.map((r) => r.status)).toEqual(["synced", "synced", "synced"]);
  const last = await syncUsage(clients[0]);
  expect(last.accepted.ledger.recordedUnits).toBe(3);
  expect(last.accepted.ledger.knownTokens).toBe("420");
  expect(await Promise.all(clients.map((c) => c.store.pending()))).toEqual([
    [],
    [],
    [],
  ]);
});
test("normal sync cannot seed an absent ref; deletion after accepted state survives restart and refuses reseeding", async () => {
  const f = await fixture(),
    c = await client(f);
  expect((await syncUsage(c)).status).toBe("queued");
  const first = await syncUsage({
    ...c,
    initialize: { meta, catalog: defaultCatalog },
  });
  expect(first.status).toBe("synced");
  await f.git(f.remote, ["update-ref", "-d", "refs/heads/agent-badge/data"]);
  const store = await openStore(c.repository);
  expect(
    (
      await syncUsage({
        ...c,
        store,
        initialize: { meta, catalog: defaultCatalog },
      })
    ).status
  ).toBe("conflict");
  expect(
    await f.git(f.remote, ["for-each-ref", "refs/heads/agent-badge/data"])
  ).toBe("");
});
test("push destination metadata authorizes split fetch/push routing and wrong UUID never receives records", async () => {
  const f = await fixture(),
    other = await fixture();
  const a = await client(f);
  await syncUsage({ ...a, initialize: { meta, catalog: defaultCatalog } });
  await f.git(f.clones[1], [
    "remote",
    "set-url",
    "--push",
    "origin",
    other.remote,
  ]);
  const b = await client(f, f.clones[1], "two");
  expect((await syncUsage(b)).status).toBe("queued");
  expect(
    await other.git(other.remote, [
      "for-each-ref",
      "refs/heads/agent-badge/data",
    ])
  ).toBe("");
  expect(await b.store.pending()).toHaveLength(1);
  const wrongId = "d9428888-122b-4aab-9bc4-111111111111";
  const wrong = await bindRemote(a.repository, {
    repositoryId: wrongId,
    declaredUrl: f.remote,
  });
  expect((await syncUsage({ ...a, binding: wrong })).status).toBe("conflict");
});
test("partial staging, detached HEAD, in-progress operations and installed hooks are untouched", async () => {
  const f = await fixture(),
    c = await client(f);
  const cwd = c.repository.worktreeRoot;
  await writeFile(join(cwd, "tracked.txt"), "staged\n");
  await f.git(cwd, ["add", "tracked.txt"]);
  await writeFile(join(cwd, "tracked.txt"), "unstaged\n");
  await f.git(cwd, ["checkout", "--detach"]);
  await mkdir(join(c.repository.gitDir, "rebase-merge"));
  await writeFile(
    join(c.repository.gitDir, "MERGE_HEAD"),
    "1".repeat(40) + "\n"
  );
  const marker = join(f.root, "hook-ran");
  const hook = join(c.repository.commonDir, "hooks", "pre-push");
  await writeFile(hook, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`, {
    mode: 0o755,
  });
  await writeFile(
    join(c.repository.gitDir, "FETCH_HEAD"),
    "synthetic fetch head\n"
  );
  const before = await snapshotUserCheckout(cwd);
  expect(
    (await syncUsage({ ...c, initialize: { meta, catalog: defaultCatalog } }))
      .status
  ).toBe("synced");
  expect(await snapshotUserCheckout(cwd)).toEqual(before);
  expect(await readFile(join(c.repository.gitDir, "FETCH_HEAD"), "utf8")).toBe(
    "synthetic fetch head\n"
  );
  await expect(readFile(marker)).rejects.toThrow();
  expect(await readFile(join(c.repository.gitDir, "MERGE_HEAD"), "utf8")).toBe(
    "1".repeat(40) + "\n"
  );
});
test("routing changes and cancellation queue without acknowledgements", async () => {
  const f = await fixture(),
    c = await client(f),
    other = await fixture();
  await f.git(c.repository.worktreeRoot, [
    "remote",
    "set-url",
    "--push",
    "origin",
    other.remote,
  ]);
  expect(
    (await syncUsage({ ...c, initialize: { meta, catalog: defaultCatalog } }))
      .status
  ).toBe("conflict");
  expect(await c.store.pending()).toHaveLength(1);
  const signal = AbortSignal.abort();
  expect((await syncUsage({ ...c, signal })).status).toBe("queued");
});

test("lost successful push response is confirmed from the real remote before acknowledgment", async () => {
  const f = await fixture(),
    c = await client(f);
  const actual = gitProcess.runGit;
  vi.spyOn(gitProcess, "runGit").mockImplementation(async (args, options) => {
    const result = await actual(args, options);
    return args.includes("push")
      ? { ...result, status: "error", exitCode: 1 }
      : result;
  });
  const result = await syncUsage({
    ...c,
    initialize: { meta, catalog: defaultCatalog },
  });
  expect(result.status).toBe("synced");
  expect(result.acknowledgedHashes).toHaveLength(1);
  expect(await c.store.pending()).toEqual([]);
});
test("accepted push followed by local acknowledgment failure survives restart without a duplicate commit", async () => {
  const f = await fixture(),
    c = await client(f);
  vi.spyOn(c.store, "acknowledge").mockRejectedValueOnce(
    new Error("synthetic crash boundary")
  );
  const first = await syncUsage({
    ...c,
    initialize: { meta, catalog: defaultCatalog },
  });
  expect(first.status).toBe("queued");
  expect(await c.store.pending()).toHaveLength(1);
  const recovered = await syncUsage({
    ...c,
    store: await openStore(c.repository),
  });
  expect(recovered.status).toBe("unchanged");
  expect(recovered.confirmedCommit).toBe(first.confirmedCommit);
  expect(recovered.acknowledgedHashes).toHaveLength(1);
});
test("valid-looking remote rewind cannot discard previously acknowledged history", async () => {
  const f = await fixture(),
    a = await client(f),
    b = await client(f, f.clones[1], "second");
  const first = await syncUsage({
    ...a,
    initialize: { meta, catalog: defaultCatalog },
  });
  await syncUsage(b);
  const latest = await syncUsage(a);
  expect(latest.accepted!.ledger.recordedUnits).toBe(2);
  await f.git(f.remote, [
    "update-ref",
    "refs/heads/agent-badge/data",
    first.confirmedCommit!,
  ]);
  const result = await syncUsage({
    ...a,
    store: await openStore(a.repository),
  });
  expect(result.status).toBe("conflict");
  expect(result.acknowledgedHashes).toEqual([]);
  expect(result.confirmedCommit).toBeNull();
  expect(
    (await f.git(f.remote, ["rev-parse", "refs/heads/agent-badge/data"])).trim()
  ).toBe(first.confirmedCommit);
});
test("existing malformed ref leaves durable presence evidence after deletion", async () => {
  const f = await fixture(),
    c = await client(f);
  await f.git(f.remote, [
    "update-ref",
    "refs/heads/agent-badge/data",
    await f
      .git(f.remote, ["rev-parse", "refs/heads/main"])
      .then((s) => s.trim()),
  ]);
  expect((await syncUsage(c)).status).toBe("unsupported");
  await f.git(f.remote, ["update-ref", "-d", "refs/heads/agent-badge/data"]);
  expect(
    (
      await syncUsage({
        ...c,
        store: await openStore(c.repository),
        initialize: { meta, catalog: defaultCatalog },
      })
    ).status
  ).toBe("conflict");
  expect(await c.store.pending()).toHaveLength(1);
});
test("unavailable signing queues and never bypasses required signing policy", async () => {
  const f = await fixture(),
    c = await client(f);
  await f.git(c.repository.worktreeRoot, ["config", "commit.gpgSign", "true"]);
  await f.git(c.repository.worktreeRoot, [
    "config",
    "gpg.program",
    "/usr/bin/false",
  ]);
  expect(
    (await syncUsage({ ...c, initialize: { meta, catalog: defaultCatalog } }))
      .status
  ).toBe("queued");
  expect(await c.store.pending()).toHaveLength(1);
  expect(
    await f.git(f.remote, ["for-each-ref", "refs/heads/agent-badge/data"])
  ).toBe("");
});
test("accepted remote policy/catalog remain authoritative when stale bootstrap configuration is supplied", async () => {
  const f = await fixture(),
    a = await client(f),
    b = await client(f, f.clones[1], "second");
  await syncUsage({ ...a, initialize: { meta, catalog: defaultCatalog } });
  const stale = {
    ...meta,
    policy: {
      ...policy,
      badge: { label: "Stale code label", metric: "tokens" as const },
    },
  };
  const result = await syncUsage({
    ...b,
    initialize: { meta: stale, catalog: { ...defaultCatalog, version: 2 } },
  });
  expect(result.status).toBe("synced");
  expect(result.accepted!.meta.policy.badge.label).toBe("Shared label");
  expect(result.accepted!.catalog.version).toBe(1);
});
test("source-to-data-branch collection uses the accepted repository policy and sanitized native receipts", async () => {
  const f = await fixture(),
    c = await client(f);
  await c.store.acknowledge([recordHash(c.record)]);
  const home = join(f.root, "synthetic-codex");
  await mkdir(join(home, "sessions"), { recursive: true });
  await writeFile(
    join(home, "sessions", "receipt.jsonl"),
    codexRollout({ single: true }).replaceAll(
      "/synthetic/repo",
      c.repository.worktreeRoot
    )
  );
  const result = await syncUsage({
    ...c,
    collect: "incremental",
    initialize: { meta, catalog: defaultCatalog },
    collection: {
      adapters: {
        codex: createCodexAdapter({ environment: {}, defaultHome: home }),
      },
    },
  });
  expect(result.status).toBe("synced");
  expect(
    result.collection!.sourceOutcomes.some((o) => o.outcome === "complete")
  ).toBe(true);
  expect(result.accepted!.ledger.recordedUnits).toBe(1);
  expect(result.accepted!.ledger.knownTokens).toBe("110");
  const tree = await f.git(f.remote, [
    "show",
    `${result.confirmedCommit}:summary.json`,
  ]);
  expect(tree).not.toContain(home);
  expect(await c.store.pending()).toEqual([]);
});
test("explicit cross-clone inclusion can supersede accepted remote exclusion without ordinary sync rebasing intent", async () => {
  const f = await fixture(),
    a = await client(f),
    b = await client(f, f.clones[1], "first");
  await syncUsage({ ...a, initialize: { meta, catalog: defaultCatalog } });
  const journal = (await a.store.journal())[0];
  const exclude = {
    schemaVersion: 2 as const,
    normalizationVersion: 1 as const,
    repositoryId,
    kind: "exclude" as const,
    targetUnitKey: cUnit(a),
    supersedes: [],
  };
  await a.store.commitBatch(
    journal.source,
    {
      source: journal.source,
      observations: [],
      nextCheckpoint: journal.checkpoint,
      outcome: "complete",
      diagnostics: [],
    },
    [exclude]
  );
  await syncUsage(a);
  const context = await syncUsage(b);
  expect(context.accepted!.ledger.excludedUnits).toBe(1);
  const include = {
    ...exclude,
    kind: "include" as const,
    supersedes: context
      .accepted!.records.filter((r) => "kind" in r)
      .map(recordHash),
  };
  const bj = (await b.store.journal())[0];
  await b.store.commitBatch(
    bj.source,
    {
      source: bj.source,
      observations: [],
      nextCheckpoint: bj.checkpoint,
      outcome: "complete",
      diagnostics: [],
    },
    [include]
  );
  const final = await syncUsage(b);
  expect(final.accepted!.ledger.includedUnits).toBe(1);
  expect((await syncUsage(a)).accepted!.ledger.includedUnits).toBe(1);
});
function cUnit(c: Awaited<ReturnType<typeof client>>) {
  if ("kind" in c.record) throw Error("fixture");
  return c.record.unitKey;
}

test("a distinct fetch repository cannot authorize sending to a foreign-UUID push repository", async () => {
  const f = await fixture(),
    other = await fixture(),
    a = await client(f);
  await syncUsage({ ...a, initialize: { meta, catalog: defaultCatalog } });
  const wrongId = "d9428888-122b-4aab-9bc4-111111111111";
  const foreign = {
    ...meta,
    repositoryId: wrongId,
    policy: { ...policy, repositoryId: wrongId },
  };
  const tree = [
    ...renderArtifacts(reduceLedger([], foreign), foreign, defaultCatalog),
  ].map(([path, bytes]) => ({
    path,
    content: Buffer.from(bytes).toString("utf8"),
  }));
  const commit = await commitFixtureTree(other, other.remote, tree);
  await other.git(other.remote, [
    "update-ref",
    "refs/heads/agent-badge/data",
    commit,
  ]);
  await f.git(f.clones[1], [
    "remote",
    "set-url",
    "--push",
    "origin",
    other.remote,
  ]);
  const b = await client(f, f.clones[1], "two");
  expect((await syncUsage(b)).status).toBe("conflict");
  expect(await b.store.pending()).toHaveLength(1);
  expect(
    (
      await other.git(other.remote, [
        "rev-parse",
        "refs/heads/agent-badge/data",
      ])
    ).trim()
  ).toBe(commit);
});
test("routing mutation after commit construction suspends before any push", async () => {
  const f = await fixture(),
    other = await fixture(),
    c = await client(f);
  const actual = DataTransport.prototype.commit;
  vi.spyOn(DataTransport.prototype, "commit").mockImplementation(
    async function (this: DataTransport, ...args: Parameters<typeof actual>) {
      const commit = await actual.apply(this, args);
      await f.git(c.repository.worktreeRoot, [
        "remote",
        "set-url",
        "--push",
        "origin",
        other.remote,
      ]);
      return commit;
    }
  );
  expect(
    (await syncUsage({ ...c, initialize: { meta, catalog: defaultCatalog } }))
      .status
  ).toBe("conflict");
  expect(await c.store.pending()).toHaveLength(1);
  expect(
    await f.git(f.remote, ["for-each-ref", "refs/heads/agent-badge/data"])
  ).toBe("");
  expect(
    await other.git(other.remote, [
      "for-each-ref",
      "refs/heads/agent-badge/data",
    ])
  ).toBe("");
});
test("stale writer refetches a concurrent accepted commit and preserves union with FF-only server policy", async () => {
  const f = await fixture(),
    a = await client(f),
    b = await client(f, f.clones[1], "second");
  await f.git(f.remote, ["config", "receive.denyNonFastForwards", "true"]);
  await syncUsage({ ...a, initialize: { meta, catalog: defaultCatalog } });
  const c = await client(f, f.clones[0], "third"),
    actual = DataTransport.prototype.commit;
  let intercepted = false;
  vi.spyOn(DataTransport.prototype, "commit").mockImplementation(
    async function (this: DataTransport, ...args: Parameters<typeof actual>) {
      const commit = await actual.apply(this, args);
      if (!intercepted) {
        intercepted = true;
        expect((await syncUsage(b)).status).toBe("synced");
      }
      return commit;
    }
  );
  const result = await syncUsage(c);
  expect(result.status).toBe("synced");
  expect(result.accepted!.ledger.recordedUnits).toBe(3);
  expect(result.accepted!.ledger.knownTokens).toBe("420");
});
test("deletion observed immediately before send requires recovery and never recreates the ref", async () => {
  const f = await fixture(),
    a = await client(f);
  await syncUsage({ ...a, initialize: { meta, catalog: defaultCatalog } });
  const c = await client(f, f.clones[0], "second"),
    actual = DataTransport.prototype.commit;
  vi.spyOn(DataTransport.prototype, "commit").mockImplementation(
    async function (this: DataTransport, ...args: Parameters<typeof actual>) {
      const commit = await actual.apply(this, args);
      await f.git(f.remote, [
        "update-ref",
        "-d",
        "refs/heads/agent-badge/data",
      ]);
      return commit;
    }
  );
  const result = await syncUsage(c);
  expect(result.status).toBe("conflict");
  expect(result.acknowledgedHashes).toEqual([]);
  expect(await c.store.pending()).toHaveLength(1);
  expect(
    await f.git(f.remote, ["for-each-ref", "refs/heads/agent-badge/data"])
  ).toBe("");
});

test("deletion after local preflight but before push advertisement never recreates a seen ref", async () => {
  const f = await fixture(),
    a = await client(f);
  await syncUsage({ ...a, initialize: { meta, catalog: defaultCatalog } });
  const c = await client(f, f.clones[0], "second"),
    actual = gitProcess.runGit;
  let deleted = false;
  vi.spyOn(gitProcess, "runGit").mockImplementation(async (args, options) => {
    if (args.includes("push") && !deleted) {
      deleted = true;
      await f.git(f.remote, [
        "update-ref",
        "-d",
        "refs/heads/agent-badge/data",
      ]);
    }
    return actual(args, options);
  });
  const result = await syncUsage(c);
  expect(result.status).toBe("conflict");
  expect(result.acknowledgedHashes).toEqual([]);
  expect(await c.store.pending()).toHaveLength(1);
  expect(
    await f.git(f.remote, ["for-each-ref", "refs/heads/agent-badge/data"])
  ).toBe("");
});

test("deletion after advertisement is rejected by receive-pack old-OID compare rather than resurrecting the ref", async () => {
  const f = await fixture(),
    a = await client(f);
  await syncUsage({ ...a, initialize: { meta, catalog: defaultCatalog } });
  const c = await client(f, f.clones[0], "second"),
    actual = gitProcess.runGit;
  const marker = join(f.root, "advertisement-seen");
  let injected = false;
  vi.spyOn(gitProcess, "runGit").mockImplementation(async (args, options) => {
    if (args.includes("push") && !injected) {
      injected = true;
      const setting = args.find((arg) => arg.startsWith("core.hooksPath="))!;
      const hook = join(setting.slice("core.hooksPath=".length), "pre-push");
      const script = await readFile(hook, "utf8");
      await writeFile(
        hook,
        script.replace(
          /exit 0\n$/,
          `git --git-dir='${f.remote}' update-ref -d refs/heads/agent-badge/data || exit 1\nprintf advertised > '${marker}'\nexit 0\n`
        ),
        { mode: 0o700 }
      );
    }
    return actual(args, options);
  });
  const result = await syncUsage(c);
  expect(await readFile(marker, "utf8")).toBe("advertised");
  expect(result.status).toBe("conflict");
  expect(result.acknowledgedHashes).toEqual([]);
  expect(await c.store.pending()).toHaveLength(1);
  expect(
    await f.git(f.remote, ["for-each-ref", "refs/heads/agent-badge/data"])
  ).toBe("");
});

test("deadline expiring during route discovery queues rather than reporting a routing conflict", async () => {
  const f = await fixture(),
    c = await client(f);
  const result = await syncUsage({
    ...c,
    initialize: { meta, catalog: defaultCatalog },
    deadline: Date.now() + 1,
  });
  expect(result.status).toBe("queued");
  expect(await c.store.pending()).toHaveLength(1);
  expect(result.acknowledgedHashes).toEqual([]);
});
test("real child death after accepted push and before acknowledgment recovers by confirmed inclusion", async () => {
  const f = await fixture(),
    c = await client(f),
    input = join(f.root, "sync-input.json");
  await writeFile(
    input,
    JSON.stringify({
      repository: c.repository,
      binding: c.binding,
      meta,
      catalog: defaultCatalog,
    })
  );
  const moduleUrl = pathToFileURL(
      join(process.cwd(), "packages/core/src/operations/sync.ts")
    ).href,
    storeUrl = pathToFileURL(
      join(process.cwd(), "packages/core/src/storage/store.ts")
    ).href;
  const child = await runStorageFixtureProcess(
    process.cwd(),
    `
 const fs=await import('node:fs/promises');const {repository,binding,meta,catalog}=JSON.parse(await fs.readFile(${JSON.stringify(
   input
 )},'utf8'));
 const {openStore}=await import(${JSON.stringify(
   storeUrl
 )});const {syncUsage}=await import(${JSON.stringify(moduleUrl)});
 await syncUsage({repository,binding,store:await openStore(repository,{processNamespace:async()=> 'synthetic'}),collect:'none',signal:AbortSignal.timeout(8000),deadline:Date.now()+8000,initialize:{meta,catalog}});
 `,
    {
      operation: "rename",
      pathIncludes: "/acknowledged.json",
      action: "exit-before",
    }
  );
  expect(child.signal).toBe("SIGKILL");
  expect(child.stderr).toBe("");
  const accepted = (
      await f.git(f.remote, ["rev-parse", "refs/heads/agent-badge/data"])
    ).trim(),
    store = await openStore(c.repository, {
      processNamespace: async () => "synthetic",
    });
  expect(await store.pending()).toHaveLength(1);
  const recovered = await syncUsage({ ...c, store });
  expect(recovered.status).toBe("unchanged");
  expect(recovered.confirmedCommit).toBe(accepted);
  expect(await store.pending()).toEqual([]);
});

test("a valid descendant cannot erase previously acknowledged immutable records", async () => {
  const f = await fixture(),
    c = await client(f);
  const first = await syncUsage({
    ...c,
    initialize: { meta, catalog: defaultCatalog },
  });
  const empty = [
    ...renderArtifacts(reduceLedger([], meta), meta, defaultCatalog),
  ].map(([path, bytes]) => ({
    path,
    content: Buffer.from(bytes).toString("utf8"),
  }));
  const dropped = await commitFixtureTree(
    f,
    f.remote,
    empty,
    first.confirmedCommit!
  );
  await f.git(f.remote, ["update-ref", "refs/heads/agent-badge/data", dropped]);
  const result = await syncUsage(c);
  expect(result.status).toBe("conflict");
  expect(result.acknowledgedHashes).toEqual([]);
  expect(result.confirmedCommit).toBeNull();
});
