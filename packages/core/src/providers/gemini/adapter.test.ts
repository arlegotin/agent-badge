import { realpath as fixtureRealpath } from 'node:fs/promises';
import { tmpdir as fixtureTmpdir } from 'node:os';
import { join as fixtureJoin } from 'node:path';
import { afterEach, expect, it } from "vitest";
import {
  appendFile,
  copyFile,
  mkdir,
  mkdtemp,
  rename,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { createGeminiAdapter } from "./adapter.js";
import type { Checkpoint, ScanBatch } from "../../domain/capabilities.js";
import { sanitizeObservation } from "../../ledger/sanitize.js";
import { reduceLedger } from "../../ledger/reduce.js";
import { catalogHash, defaultCatalog } from "../../pricing/catalog.js";
import { priceMeters } from "../../pricing/price.js";
const roots: string[] = [];
const scope = {
  repositoryId: "12345678-1234-4234-8234-123456789abc",
  normalizationVersion: 1 as const,
  attributionPolicyHash: "a".repeat(64),
};
const policy = {
  schemaVersion: 1 as const,
  repositoryId: scope.repositoryId,
  normalizationVersion: 1 as const,
  discovery: "auto" as const,
  disabledProviders: [],
  badge: { label: "AI usage", metric: "tokens" as const },
};
const meta = {
  schemaVersion: 2 as const,
  protocolVersion: 1 as const,
  repositoryId: scope.repositoryId,
  normalizationVersion: 1 as const,
  catalogVersion: 1,
  catalogHash: catalogHash(defaultCatalog),
  policy,
};
const jsonl = (...v: unknown[]) =>
  v.map((x) => JSON.stringify(x) + "\n").join("");
const header = (cwd = "/synthetic/repo") => ({
  sessionId: "PRIVATE_SESSION",
  projectHash: createHash("sha256").update(cwd).digest("hex"),
  startTime: "2026-10-01T00:00:00Z",
});
const row = (id = "one", extra: Record<string, unknown> = {}) => ({
  id,
  timestamp: "2026-10-01T00:00:01Z",
  type: "gemini",
  content: "PRIVATE_PROMPT_CANARY",
  model: "gemini-3.5-flash",
  tokens: {
    input: 100,
    output: 20,
    cached: 40,
    thoughts: 10,
    tool: 5,
    total: 135,
  },
  ...extra,
});
async function fixture(bytes = jsonl(header(), row())) {
  const root = await fixtureRealpath(await mkdtemp(fixtureJoin(fixtureTmpdir(), 'gemini-contract-')));
  roots.push(root);
  const dir = join(root, "tmp/project-one/chats");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(root, "projects.json"),
    JSON.stringify({ projects: { "/synthetic/repo": "project-one" } })
  );
  const path = join(dir, "session-test.jsonl");
  await writeFile(path, bytes);
  return { root, path, dir };
}
async function scan(
  root: string,
  checkpoint: Checkpoint | null = null,
  maxBytes?: number
) {
  const a = createGeminiAdapter({
    environment: {},
    defaultHome: root,
    maxBytes,
  });
  const sources = await a.discover({
    repositoryId: scope.repositoryId,
    enrolledRoots: [root],
    signal: AbortSignal.timeout(10000),
  });
  const batches: ScanBatch[] = [];
  for (const s of sources)
    for await (const b of a.scan(
      s,
      checkpoint,
      AbortSignal.timeout(10000),
      scope
    ))
      batches.push(b);
  return {
    sources,
    batches,
    observations: batches.flatMap((b) => b.observations),
  };
}
const ledger = (rows: ScanBatch["observations"]) =>
  reduceLedger(
    rows.map((o) => sanitizeObservation(o, policy)),
    meta
  );
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((r) => rm(r, { recursive: true, force: true }))
  );
});
it("normalizes recorded success subsets, exact models and unpriced partial coverage without private text", async () => {
  const f = await fixture();
  const r = await scan(f.root);
  expect(r.observations).toHaveLength(1);
  expect(r.observations[0]).toMatchObject({
    quality: "partial",
    execution: { cwd: "/synthetic/repo" },
    meters: [
      {
        vendor: "google",
        model: "gemini-3.5-flash",
        total: 135,
        input: 100,
        uncachedInput: 60,
        cachedInput: 40,
        output: 20,
        reasoningOutput: 10,
        toolInput: 5,
        semantics: {
          input: "includes-cached",
          output: "excludes-reasoning",
          toolInput: "separate",
          total: "provider-defined",
        },
      },
    ],
  });
  expect(r.batches[0].outcome).toBe("partial");
  expect(
    priceMeters(r.observations[0].meters, defaultCatalog).unpricedUnits
  ).toBe(1);
  expect(ledger(r.observations)).toMatchObject({
    recordedUnits: 1,
    knownTokens: "135",
  });
  expect(JSON.stringify(r)).not.toContain("PRIVATE_PROMPT_CANARY");
  expect(JSON.stringify(r.batches[0].nextCheckpoint)).not.toContain(
    "PRIVATE_SESSION"
  );
});
it("leaves tokenless pending uncounted until usage-bearing same ID arrives", async () => {
  const f = await fixture(jsonl(header(), row("pending", { tokens: null })));
  const first = await scan(f.root);
  expect(first.observations).toEqual([]);
  await appendFile(f.path, jsonl(row("pending")));
  const next = await scan(f.root, first.batches[0].nextCheckpoint);
  expect(ledger([...first.observations, ...next.observations])).toMatchObject({
    recordedUnits: 1,
    conflictingUnits: 0,
    knownTokens: "135",
  });
});
it("deduplicates resumed, rotated and inherited messages; disagreements conflict; rewinds retain incurred usage", async () => {
  const f = await fixture(
    jsonl(
      header(),
      row(),
      { $rewindTo: "one" },
      { $patch: { removeIds: ["one"] } },
      { $set: { messages: [row(), row("two", { model: "gemini-2.5-pro" })] } }
    )
  );
  await copyFile(f.path, join(f.dir, "session-copy.jsonl"));
  const r = await scan(f.root);
  expect(ledger(r.observations)).toMatchObject({
    recordedUnits: 2,
    conflictingUnits: 0,
    knownTokens: "270",
  });
  await appendFile(
    f.path,
    jsonl(
      row("one", {
        tokens: {
          input: 101,
          output: 20,
          cached: 40,
          thoughts: 10,
          tool: 5,
          total: 136,
        },
      })
    )
  );
  expect(ledger((await scan(f.root)).observations).conflictingUnits).toBe(1);
});
it("full and incremental parity survives rewrite, truncation, rotation and an unfinished line", async () => {
  const f = await fixture();
  const first = await scan(f.root);
  expect(
    (await scan(f.root, first.batches[0].nextCheckpoint)).observations
  ).toEqual([]);
  await appendFile(f.path, JSON.stringify(row("two")));
  const tail = await scan(f.root, first.batches[0].nextCheckpoint);
  expect(tail.observations).toEqual([]);
  expect(tail.batches[0].nextCheckpoint.cursor.incompleteTail).toBe("");
  await appendFile(f.path, "\n");
  const next = await scan(f.root, tail.batches[0].nextCheckpoint);
  expect(ledger([...first.observations, ...next.observations])).toEqual(
    ledger((await scan(f.root)).observations)
  );
  await writeFile(f.path, jsonl(header(), row("replacement")));
  const changed = await scan(f.root, next.batches[0].nextCheckpoint);
  expect(changed.observations).toHaveLength(1);
  expect(changed.batches[0].source.generation).not.toBe(
    next.batches[0].source.generation
  );
  await rename(f.path, join(f.root, "retired"));
  await writeFile(f.path, jsonl(header(), row("rotation")));
  expect(
    (await scan(f.root, changed.batches[0].nextCheckpoint)).observations
  ).toHaveLength(1);
});
it("uses exact registry/worktree mapping; refuses mismatch, escaping identifiers and symlinked sources", async () => {
  const f = await fixture();
  await writeFile(
    join(f.root, "projects.json"),
    JSON.stringify({ projects: { "/synthetic/worktree": "project-one" } })
  );
  expect((await scan(f.root)).observations).toEqual([]);
  await writeFile(
    join(f.root, "projects.json"),
    JSON.stringify({ projects: { "/synthetic/repo": "../escape" } })
  );
  expect((await scan(f.root)).observations).toEqual([]);
  await writeFile(
    join(f.root, "projects.json"),
    JSON.stringify({ projects: { "/synthetic/repo": "project-one" } })
  );
  await symlink(f.path, join(f.dir, "session-link.jsonl"));
  expect((await scan(f.root)).sources).toHaveLength(1);
});
it("reads legacy saved JSON and nested subagents; rejects malformed numeric contracts and unresolved models visibly", async () => {
  const f = await fixture(
    jsonl(
      header(),
      row("bad", { tokens: { input: 1, output: 20, cached: 40, total: 21 } }),
      row("selector", { model: "flash" }),
      JSON.parse(
        await readFile(
          new URL(
            "../../../../testkit/fixtures/gemini/after-model.json",
            import.meta.url
          ),
          "utf8"
        )
      )
    )
  );
  expect((await scan(f.root)).observations).toHaveLength(1);
  const r = await scan(f.root);
  expect(r.observations[0].meters[0].model).toBe(null);
  expect(r.batches[0].diagnostics.length).toBeGreaterThan(0);
  await writeFile(
    join(f.dir, "session-old.json"),
    JSON.stringify({
      ...header(),
      lastUpdated: "2026-10-01T00:00:02Z",
      messages: [row("old")],
    })
  );
  await mkdir(join(f.dir, "parent"));
  await writeFile(
    join(f.dir, "parent/child.jsonl"),
    jsonl({ ...header(), kind: "subagent" }, row("child"))
  );
  expect(ledger((await scan(f.root)).observations).recordedUnits).toBe(3);
});
it("bounded continuation contains only accounting metadata and reaches remaining rows", async () => {
  const f = await fixture(
    jsonl(header(), ...Array.from({ length: 8 }, (_, i) => row(String(i))))
  );
  let cp: Checkpoint | null = null;
  const all: ScanBatch["observations"] = [];
  for (let i = 0; i < 12; i++) {
    const r = await scan(f.root, cp, 600);
    all.push(...r.observations);
    cp = r.batches[0].nextCheckpoint;
  }
  expect(ledger(all).recordedUnits).toBe(8);
  expect(JSON.stringify(cp)).not.toContain("PRIVATE_PROMPT_CANARY");
});
it("validates known total lower bounds and leaves absent optional counters unknown", async () => {
  const f = await fixture(
    jsonl(
      header(),
      row("bad-total", {
        tokens: { input: 100, output: 20, cached: 40, total: 119 },
      }),
      row("optional", {
        tokens: { input: 100, output: 20, cached: 40, total: 130 },
      })
    )
  );
  const r = await scan(f.root);
  expect(r.observations).toHaveLength(1);
  expect(r.observations[0].meters[0]).toMatchObject({
    total: 130,
    reasoningOutput: null,
    toolInput: null,
  });
  expect(r.batches[0].diagnostics.map((d) => d.code)).toContain(
    "invalid-record"
  );
});
it("preserves all exact pinned Google model identities without expanding suffix aliases or prices", async () => {
  const models = [
    "gemini-2.5-pro",
    "gemini-3.5-flash",
    "gemini-3.8-flash",
    "gemini-3-pro-preview",
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
    "gemini-3-flash",
  ];
  const f = await fixture(
    jsonl(
      header(),
      ...models.map((model) => row(model, { model })),
      row("suffix", { model: "gemini-3.5-flash-private-deployment" })
    )
  );
  const r = await scan(f.root);
  expect(r.observations.map((o) => o.meters[0].model)).toEqual([
    ...models,
    null,
  ]);
  expect(
    priceMeters(
      r.observations.flatMap((o) => o.meters),
      defaultCatalog
    )
  ).toMatchObject({ pricedUnits: 0, unpricedUnits: 8 });
});
it("scope and registry mapping changes force verified replay rather than reusing stale attribution", async () => {
  const f = await fixture();
  const first = await scan(f.root);
  const checkpoint = {
    ...first.batches[0].nextCheckpoint,
    attributionPolicyHash: "b".repeat(64),
  };
  expect((await scan(f.root, checkpoint)).observations).toHaveLength(1);
  await writeFile(
    join(f.root, "projects.json"),
    JSON.stringify({ projects: { "/synthetic/worktree": "project-one" } })
  );
  await appendFile(f.path, jsonl(row("later")));
  const updated = await scan(f.root, first.batches[0].nextCheckpoint);
  expect(updated.observations).toEqual([]);
  expect(updated.batches[0].diagnostics.map((d) => d.code)).toContain(
    "repository-mismatch"
  );
});
it("detects the configured runtime home and sandbox root without reading sibling credentials", async () => {
  const f = await fixture();
  const outer = await fixtureRealpath(await mkdtemp(fixtureJoin(fixtureTmpdir(), 'gemini-home-')));
  roots.push(outer);
  await mkdir(join(outer, ".cache"), { recursive: true });
  await rename(f.root, join(outer, ".cache", ".gemini"));
  await writeFile(
    join(outer, ".cache", ".gemini", "oauth_creds.json"),
    "PRIVATE_CREDENTIAL_CANARY"
  );
  const adapter = createGeminiAdapter({
    environment: { GEMINI_CLI_HOME: outer, SANDBOX: "sandbox-exec" },
  });
  const sources = await adapter.discover({
    repositoryId: scope.repositoryId,
    enrolledRoots: [],
    signal: AbortSignal.timeout(5000),
  });
  expect(sources).toHaveLength(1);
  const batches: ScanBatch[] = [];
  for await (const batch of adapter.scan(
    sources[0],
    null,
    AbortSignal.timeout(5000),
    scope
  ))
    batches.push(batch);
  expect(batches[0].observations).toHaveLength(1);
  expect(JSON.stringify(batches)).not.toContain("PRIVATE_CREDENTIAL_CANARY");
});
it("withholds indistinguishable all-zero default counters until positive usage arrives on the same ID", async () => {
  const zero = {
    input: 0,
    output: 0,
    cached: 0,
    thoughts: 0,
    tool: 0,
    total: 0,
  };
  const f = await fixture(jsonl(header(), row("zero", { tokens: zero })));
  const first = await scan(f.root);
  expect(first.observations).toEqual([]);
  expect(first.batches[0]).toMatchObject({
    outcome: "partial",
    diagnostics: expect.arrayContaining([
      { code: "incomplete-source", severity: "warning" },
    ]),
  });
  await appendFile(f.path, jsonl(row("zero")));
  const final = await scan(f.root, first.batches[0].nextCheckpoint);
  expect(ledger(final.observations)).toMatchObject({
    recordedUnits: 1,
    conflictingUnits: 0,
    knownTokens: "135",
  });
});
it("does not exceed the observation budget inside legacy history checkpoints or discard unconsumed receipts", async () => {
  const f = await fixture(
    jsonl(
      header(),
      ...Array.from({ length: 600 }, (_, i) => row(`first-${i}`)),
      {
        $set: {
          messages: Array.from({ length: 700 }, (_, i) =>
            row(`next-${i}`, { content: "" })
          ),
        },
      }
    )
  );
  const first = await scan(f.root);
  expect(first.observations.length).toBeLessThanOrEqual(1000);
  const next = await scan(f.root, first.batches[0].nextCheckpoint);
  expect(
    ledger([...first.observations, ...next.observations]).recordedUnits
  ).toBe(1300);
});

it("advances beyond a single history checkpoint larger than an empty batch capacity with explicit unsupported coverage", async () => {
  const history = Array.from({ length: 1001 }, (_, i) => {
    const message = row(`oversized-${i}`, { content: "" });
    delete (message as Record<string, unknown>).timestamp;
    return message;
  });
  const f = await fixture(
    jsonl(header(), { $set: { messages: history } }, row("after-oversized"))
  );
  const first = await scan(f.root);
  expect(first.observations.map((o) => o.nativeUnitId)).toEqual([
    JSON.stringify(["message", "after-oversized"]),
  ]);
  expect(first.batches[0].diagnostics.map((d) => d.code)).toContain(
    "unsupported-source"
  );
  const next = await scan(f.root, first.batches[0].nextCheckpoint);
  expect(next.observations).toEqual([]);
  expect(next.batches[0].nextCheckpoint.cursor.offset).toBe(
    first.batches[0].nextCheckpoint.cursor.offset
  );
});

it("never lets message-shaped or nested history records replace project provenance or bypass the batch boundary", async () => {
  const f = await fixture(
    jsonl(
      { ...header(), projectHash: "f".repeat(64) },
      row("forged", {
        sessionId: "forged-session",
        projectHash: header().projectHash,
      }),
      { $set: { messages: [{ ...header(), messages: [row("nested")] }] } }
    )
  );
  const result = await scan(f.root);
  expect(result.observations).toEqual([]);
  expect(result.batches[0].diagnostics.map((d) => d.code)).toContain(
    "unsupported-source"
  );
});
