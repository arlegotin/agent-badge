import { afterEach, expect, test } from "vitest";
import {
  createBareRemoteFixture,
  commitFixtureTree,
} from "@agent-badge/testkit";
import type { GitFixture } from "@agent-badge/testkit";
import { resolveRepository } from "./context.js";
import { bindRemote } from "./remote-binding.js";
import { openStore } from "../storage/store.js";
import { catalogHash, defaultCatalog } from "../pricing/catalog.js";
import { renderArtifacts } from "../render/summary.js";
import { reduceLedger } from "../ledger/reduce.js";
import { DataTransport } from "./data-transport.js";
const repositoryId = "12345678-1234-4234-8234-123456789abc";
const meta = {
  schemaVersion: 2 as const,
  protocolVersion: 1 as const,
  repositoryId,
  normalizationVersion: 1 as const,
  catalogVersion: 1,
  catalogHash: catalogHash(defaultCatalog),
  policy: {
    schemaVersion: 1 as const,
    repositoryId,
    normalizationVersion: 1 as const,
    discovery: "auto" as const,
    disabledProviders: [],
    badge: { label: "AI usage", metric: "tokens" as const },
  },
};
const fixtures: GitFixture[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((f) => f.cleanup()));
});
async function fixture() {
  const f = await createBareRemoteFixture();
  fixtures.push(f);
  return f;
}
async function transport(f: GitFixture) {
  const repository = await resolveRepository(f.clones[0]);
  await openStore(repository);
  const binding = await bindRemote(repository, {
    repositoryId,
    declaredUrl: f.remote,
    target: "origin",
  });
  if (binding.status !== "bound") throw Error("fixture");
  return DataTransport.open({
    repository,
    binding,
    signal: AbortSignal.timeout(10000),
    deadline: Date.now() + 10000,
  });
}
const entries = () =>
  [...renderArtifacts(reduceLedger([], meta), meta, defaultCatalog)].map(
    ([path, bytes]) => ({ path, content: Buffer.from(bytes).toString("utf8") })
  );
test.each([
  [
    "unsafe path",
    () => [...entries(), { path: "private.txt", content: "synthetic" }],
  ],
  [
    "symlink",
    () =>
      entries().map((e) =>
        e.path === "README.md" ? { ...e, mode: "120000" } : e
      ),
  ],
  [
    "oversized blob",
    () =>
      entries().map((e) =>
        e.path === "README.md"
          ? { ...e, content: "x".repeat(256 * 1024 + 1) }
          : e
      ),
  ],
  [
    "future protocol",
    () =>
      entries().map((e) =>
        e.path === "meta.json"
          ? {
              ...e,
              content: e.content.replace(
                '"protocolVersion":1',
                '"protocolVersion":2'
              ),
            }
          : e
      ),
  ],
  [
    "incompatible catalog",
    () =>
      entries().map((e) =>
        e.path === "catalog.json"
          ? { ...e, content: e.content.replace('"version":1', '"version":2') }
          : e
      ),
  ],
] as const)(
  "rejects %s before accepting a remote tree",
  async (_name, build) => {
    const f = await fixture();
    const commit = await commitFixtureTree(f, f.remote, build());
    await f.git(f.remote, [
      "update-ref",
      "refs/heads/agent-badge/data",
      commit,
    ]);
    const t = await transport(f);
    try {
      await expect(t.fetch()).rejects.toThrow();
    } finally {
      await t.close();
    }
  }
);
test("actual fetched tree ignores user replacement refs without deleting them", async () => {
  const f = await fixture();
  const actual = await commitFixtureTree(f, f.remote, [
    ...entries(),
    { path: "unsafe.txt", content: "synthetic" },
  ]);
  await f.git(f.remote, ["update-ref", "refs/heads/agent-badge/data", actual]);
  const safe = await commitFixtureTree(f, f.clones[0], entries());
  await f.git(f.clones[0], [
    "fetch",
    "--no-write-fetch-head",
    f.remote,
    "refs/heads/agent-badge/data",
  ]);
  await f.git(f.clones[0], ["replace", actual, safe]);
  const before = await f.git(f.clones[0], ["for-each-ref", "refs/replace"]);
  const t = await transport(f);
  try {
    await expect(t.fetch()).rejects.toThrow();
  } finally {
    await t.close();
  }
  expect(await f.git(f.clones[0], ["for-each-ref", "refs/replace"])).toBe(
    before
  );
});
test("literal push refuses pushInsteadOf even when named explicit pushurl suppresses it", async () => {
  const f = await fixture(),
    other = await fixture();
  await f.git(f.clones[0], ["remote", "set-url", "--push", "origin", f.remote]);
  await f.git(f.clones[0], [
    "config",
    `url.${other.remote}.pushInsteadOf`,
    f.remote,
  ]);
  expect(
    (await f.git(f.clones[0], ["remote", "get-url", "--push", "origin"])).trim()
  ).toBe(f.remote);
  await expect(transport(f)).rejects.toThrow("routing-changed");
  expect(
    await other.git(other.remote, [
      "for-each-ref",
      "refs/heads/agent-badge/data",
    ])
  ).toBe("");
});
test("literal fetch refuses a second insteadOf expansion", async () => {
  const f = await fixture(),
    other = await fixture();
  const alias = "synthetic-route:";
  await f.git(f.clones[0], ["remote", "set-url", "origin", alias]);
  await f.git(f.clones[0], ["config", `url.${f.remote}.insteadOf`, alias]);
  await f.git(f.clones[0], [
    "config",
    `url.${other.remote}.insteadOf`,
    f.remote,
  ]);
  expect(
    (await f.git(f.clones[0], ["remote", "get-url", "--push", "origin"])).trim()
  ).toBe(f.remote);
  await expect(transport(f)).rejects.toThrow("routing-changed");
});

test("relative local destination is pinned absolutely rather than interpreted as another remote name", async () => {
  const f = await fixture(),
    other = await fixture();
  const local = "local-route";
  await f.git(f.clones[0], ["init", "--bare", local]);
  await f.git(f.clones[0], ["remote", "add", local, other.remote]);
  await f.git(f.clones[0], ["remote", "set-url", "origin", local]);
  const t = await transport(f);
  try {
    const commit = await t.commit(
      renderArtifacts(reduceLedger([], meta), meta, defaultCatalog),
      null
    );
    await t.push(commit, null);
    expect((await t.fetch()).commit).toBe(commit);
  } finally {
    await t.close();
  }
  expect(
    await other.git(other.remote, [
      "for-each-ref",
      "refs/heads/agent-badge/data",
    ])
  ).toBe("");
});

test("duplicate disjoint directories cannot disguise a noncanonical tree", async () => {
  const f = await fixture();
  const controls = [1, 2].map((n) => ({
    schemaVersion: 2 as const,
    normalizationVersion: 1 as const,
    repositoryId,
    kind: "exclude" as const,
    targetUnitKey: String(n).repeat(64),
    supersedes: [],
  }));
  const artifacts = renderArtifacts(
    reduceLedger(controls, meta),
    meta,
    defaultCatalog
  );
  const commit = await commitFixtureTree(
    f,
    f.remote,
    [...artifacts].map(([path, bytes]) => ({
      path,
      content: Buffer.from(bytes).toString("utf8"),
    }))
  );
  const rootLines = (await f.git(f.remote, ["ls-tree", commit]))
    .trim()
    .split("\n");
  const controlLine = rootLines.find((line) => line.endsWith("\tcontrols"))!;
  const controlTree = controlLine.split(" ")[2].split("\t")[0];
  const shards = (await f.git(f.remote, ["ls-tree", controlTree]))
    .trim()
    .split("\n");
  expect(shards).toHaveLength(2);
  const halves = await Promise.all(
    shards.map((line) =>
      f.git(f.remote, ["mktree"], line + "\n").then((s) => s.trim())
    )
  );
  const lines = [
    ...rootLines.filter((line) => !line.endsWith("\tcontrols")),
    ...halves.map((oid) => `040000 tree ${oid}\tcontrols`),
  ];
  const raw = Buffer.concat(
    lines
      .sort((a, b) => a.split("\t")[1].localeCompare(b.split("\t")[1]))
      .map((line) => {
        const [left, name] = line.split("\t");
        const [mode, , oid] = left.split(" ");
        return Buffer.concat([
          Buffer.from(`${mode.replace(/^0/, "")} ${name}\0`),
          Buffer.from(oid, "hex"),
        ]);
      })
  );
  const { runGit } = await import("./process.js");
  const object = await runGit(
    ["hash-object", "-w", "--literally", "-t", "tree", "--stdin"],
    { cwd: f.remote, input: raw }
  );
  expect(object.status).toBe("ok");
  const malformed = (
    await f.git(f.remote, [
      "commit-tree",
      object.stdout.trim(),
      "-m",
      "Synthetic duplicate tree",
    ])
  ).trim();
  await f.git(f.remote, [
    "update-ref",
    "refs/heads/agent-badge/data",
    malformed,
  ]);
  const t = await transport(f);
  try {
    await expect(t.fetch()).rejects.toThrow();
  } finally {
    await t.close();
  }
});
