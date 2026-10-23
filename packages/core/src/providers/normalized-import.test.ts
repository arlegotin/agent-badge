import { realpath as fixtureRealpath } from 'node:fs/promises';
import { tmpdir as fixtureTmpdir } from 'node:os';
import { join as fixtureJoin } from 'node:path';
import { afterEach, expect, it } from "vitest";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import {
  createNormalizedImportAdapter,
  parseNormalizedImport,
  normalizedImportOverrides,
} from "./normalized-import.js";
import {
  codexRollout,
  createBareRemoteFixture,
  protocolObservationFixture,
} from "@agent-badge/testkit";
import { createCodexAdapter } from "./codex/adapter.js";
import { codexRequestIdentity } from "./codex/identity.js";
import { geminiRequestIdentity } from "./gemini/identity.js";
import { collectUsage } from "../collection/collect.js";
import { resolveRepository } from "../git/context.js";
import { openStore } from "../storage/store.js";
import { sanitizeObservation } from "../ledger/sanitize.js";
import { reduceLedger } from "../ledger/reduce.js";
import { defaultCatalog, catalogHash } from "../pricing/catalog.js";
import { priceMeters } from "../pricing/price.js";
import type { ScanBatch, ProviderId } from "../domain/capabilities.js";
const roots: string[] = [];
const repositoryId = "12345678-1234-4234-8234-123456789abc";
const signal = () => new AbortController().signal;
const scope = {
  repositoryId,
  normalizationVersion: 1 as const,
  attributionPolicyHash: "a".repeat(64),
};
const policy = {
  schemaVersion: 1 as const,
  repositoryId,
  normalizationVersion: 1 as const,
  discovery: "auto" as const,
  disabledProviders: [],
  badge: { label: "AI usage", metric: "tokens" as const },
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
const pricedMeter = () => ({
  ...protocolObservationFixture().meters[0],
  cacheCreation: { fiveMinutes: 0, oneHour: 0, other: 0 },
  semantics: {
    ...protocolObservationFixture().meters[0].semantics,
    cacheCreation: "separate" as const,
  },
});
const envelope = () => ({
  kind: "agent-badge/normalized-source",
  schemaVersion: 1,
  normalizationVersion: 1,
  repositoryId,
  provenance: {
    kind: "independent-request",
    producerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    sourceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    producerVersion: "synthetic-1",
    assertion: "original-independent-requests-no-native-agent-usage",
    identity: "preserved-across-copies-and-reexports",
  },
  requests: [
    {
      requestId: "synthetic-original-request",
      meters: [pricedMeter()],
      providerReportedCostUsd: 999999,
    },
  ],
});
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function fixture(
  value: unknown = envelope(),
  provider: ProviderId = "import",
  maxBytes?: number
) {
  const root = await fixtureRealpath(await mkdtemp(fixtureJoin(fixtureTmpdir(), 'normalized-import-')));
  roots.push(root);
  const path = join(root, "source.json");
  await writeFile(path, JSON.stringify(value));
  const adapter = createNormalizedImportAdapter({
    provider,
    paths: [path],
    maxBytes,
  });
  const [source] = await adapter.discover({
    ...scope,
    enrolledRoots: [],
    signal: signal(),
  });
  const batches: ScanBatch[] = [];
  for await (const b of adapter.scan(source, null, signal(), scope))
    batches.push(b);
  return { root, path, adapter, source, batch: batches[0] };
}
it("requires an explicit versioned envelope, bounded stable provenance, final request identity and native-exclusion assertion", () => {
  expect(() => parseNormalizedImport(envelope())).not.toThrow();
  for (const value of [
    { ...envelope(), kind: "agent-badge/contribution" },
    { ...envelope(), schemaVersion: 2 },
    { ...envelope(), provenance: {} },
    { info: { id: "native" }, messages: [] },
    {
      ...envelope(),
      provenance: { ...envelope().provenance, nativeProvider: "opencode" },
    },
    { ...envelope(), requests: [{ ...envelope().requests[0], requestId: "" }] },
    { ...envelope(), requests: [{ ...envelope().requests[0], final: false }] },
  ])
    expect(() => parseNormalizedImport(value)).toThrow();
});
it("keeps asserted imports visibly partial and ignores provider billing costs for selected catalog pricing", async () => {
  const { batch } = await fixture();
  expect(batch.outcome).toBe("partial");
  expect(batch.observations).toHaveLength(1);
  const publicValue = sanitizeObservation(batch.observations[0], policy);
  expect(publicValue.provider).toBe("import");
  expect(publicValue.quality).toBe("partial");
  expect(JSON.stringify(publicValue)).not.toContain("999999");
  expect(priceMeters(publicValue.meters, defaultCatalog).knownMicroUsd).toBe(
    "228"
  );
});
it("deduplicates original identity across renamed files and producer versions, and leaves disagreements conflicting", async () => {
  const first = await fixture();
  const copy = join(first.root, "copy.json");
  await copyFile(first.path, copy);
  const v = envelope();
  v.provenance.producerVersion = "synthetic-2";
  await writeFile(copy, JSON.stringify(v));
  const copiedAdapter = createNormalizedImportAdapter({
    provider: "import",
    paths: [copy],
  });
  const [copiedSource] = await copiedAdapter.discover({
    ...scope,
    enrolledRoots: [],
    signal: signal(),
  });
  const copiedBatches: ScanBatch[] = [];
  for await (const b of copiedAdapter.scan(copiedSource, null, signal(), scope))
    copiedBatches.push(b);
  const values = [
    first.batch.observations[0],
    copiedBatches[0].observations[0],
  ].map((x) => sanitizeObservation(x, policy));
  expect(values[0].unitKey).toBe(values[1].unitKey);
  expect(reduceLedger(values, meta).includedUnits).toBe(1);
  const conflicting = structuredClone(values[1]);
  conflicting.meters[0].output = 99;
  conflicting.meters[0].total = null;
  expect(reduceLedger([...values, conflicting], meta).conflictingUnits).toBe(1);
});
it("counts identical meters under distinct original request identities independently", async () => {
  const value = envelope();
  value.requests.push({ ...value.requests[0], requestId: "second-request" });
  const { batch } = await fixture(value);
  const result = reduceLedger(
    batch.observations.map((observation) =>
      sanitizeObservation(observation, policy)
    ),
    meta
  );
  expect(result.includedUnits).toBe(2);
  expect(result.knownTokens).toBe("280");
});
it.each(["claude", "opencode", "cursor", "copilot"])(
  "rejects uncertified native %s mapping instead of minting another producer identity",
  async (provider) => {
    const v = {
      ...envelope(),
      provenance: {
        kind: "certified-native",
        provider,
        contract: "unsupported",
      },
    };
    expect(() => parseNormalizedImport(v)).toThrow();
    const { batch } = await fixture(v);
    expect(batch.observations).toEqual([]);
    expect(batch.outcome).toBe("unsupported");
  }
);
it.each([
  [
    "codex",
    "codex-token-usage-record-source-pin-86e17e9",
    { threadId: "original", responseId: "response-1" },
    '["original","response-1"]',
  ],
  [
    "gemini",
    "gemini-saved-jsonl-pin-09d81bf",
    { messageId: "gemini-original" },
    '["message","gemini-original"]',
  ],
] as const)(
  "preserves certified %s native identity for overlap protection",
  async (provider, contract, identity, want) => {
    const v = {
      ...envelope(),
      provenance: { kind: "certified-native", provider, contract },
      requests: [{ identity, meters: envelope().requests[0].meters }],
    };
    const { batch } = await fixture(v, provider);
    expect(batch.observations[0].provider).toBe(provider);
    expect(batch.observations[0].nativeUnitId).toBe(want);
    const native = {
      ...protocolObservationFixture(),
      provider,
      meters: [pricedMeter()],
    };
    native.nativeUnitId =
      provider === "codex"
        ? codexRequestIdentity("original", "response-1")
        : geminiRequestIdentity("gemini-original");
    native.nativeCoverageId = native.nativeUnitId;
    const values = [native, batch.observations[0]].map((x) =>
      sanitizeObservation(x, policy)
    );
    expect(new Set(values.map((x) => x.unitKey)).size).toBe(1);
    expect(reduceLedger(values, meta).includedUnits).toBe(1);
  }
);
it("rejects repository/provider mismatches and bounded or malformed inputs without receipts", async () => {
  const mismatched = {
    ...envelope(),
    repositoryId: "99999999-9999-4999-8999-999999999999",
  };
  expect((await fixture(mismatched)).batch.observations).toEqual([]);
  expect((await fixture(envelope(), "codex")).batch.outcome).toBe(
    "unsupported"
  );
  expect((await fixture(envelope(), "import", 20)).batch.outcome).toBe(
    "partial"
  );
});
it("persists explicit imports through collection with per-unit approval and deduplicates after reopen", async () => {
  const git = await createBareRemoteFixture();
  try {
    const repository = await resolveRepository(git.clones[0]);
    const f = await fixture();
    const store = await openStore(repository, {
      processNamespace: async () => "synthetic",
    });
    const privatePolicy = {
      overrides: normalizedImportOverrides(parseNormalizedImport(envelope()), {
        privatePolicy: {},
        records: [],
        policy,
      }),
    };
    const options = {
      repository,
      store,
      policy,
      privatePolicy,
      signal: signal(),
      adapters: { import: f.adapter },
    };
    await collectUsage({ ...options, privatePolicy: {} });
    expect(await store.pending()).toEqual([]);
    await collectUsage(options);
    expect(await store.pending()).toHaveLength(1);
    const reopened = await openStore(repository, {
      processNamespace: async () => "synthetic",
    });
    await collectUsage({ ...options, store: reopened });
    expect(await reopened.pending()).toHaveLength(1);
    expect(
      reduceLedger(
        (await reopened.journal()).flatMap((x) => x.records),
        meta
      ).includedUnits
    ).toBe(1);
  } finally {
    await git.cleanup();
  }
});
it.each(["attribute", "include"] as const)(
  "preserves native/import overlap and shared exclusions with unchanged %s choices",
  async (decision) => {
    const git = await createBareRemoteFixture();
    try {
      const repository = await resolveRepository(git.clones[0]);
      const root = join(git.root, "codex");
      await mkdir(join(root, "sessions"), { recursive: true });
      await writeFile(
        join(root, "sessions/source.jsonl"),
        codexRollout({ single: true }).replaceAll(
          "/synthetic/repo",
          repository.worktreeRoot
        )
      );
      const native = createCodexAdapter({ environment: {}, defaultHome: root });
      const [s] = await native.discover({
        repositoryId,
        enrolledRoots: [],
        signal: signal(),
      });
      let b!: ScanBatch;
      for await (const value of native.scan(s, null, signal(), scope))
        b = value;
      const v = {
        ...envelope(),
        provenance: {
          kind: "certified-native",
          provider: "codex",
          contract: "codex-token-usage-record-source-pin-86e17e9",
        },
        requests: [
          {
            identity: { threadId: "original", responseId: "response-1" },
            meters: b.observations[0].meters,
          },
        ],
      };
      const f = await fixture(v, "codex");
      const adapter = createNormalizedImportAdapter({
        provider: "codex",
        paths: [f.path],
        nativeAdapter: native,
      });
      const store = await openStore(repository, {
        processNamespace: async () => "synthetic",
      });
      await collectUsage({
        repository,
        store,
        policy,
        signal: signal(),
        adapters: { codex: adapter },
        privatePolicy: {
          overrides: normalizedImportOverrides(parseNormalizedImport(v), {
            privatePolicy: {},
            records: [],
            policy,
          }).map((choice) => ({ ...choice, decision })),
        },
      });
      expect(
        reduceLedger(
          (await store.journal()).flatMap((x) => x.records),
          meta
        ).includedUnits
      ).toBe(1);
      const latest = (await store.journal()).at(-1)!;
      const [record] = await store.pending();
      if ("kind" in record) throw new Error("expected observation");
      await store.commitBatch(
        latest.source,
        {
          source: latest.source,
          observations: [],
          nextCheckpoint: latest.checkpoint,
          outcome: "partial",
          diagnostics: [],
        },
        [
          {
            schemaVersion: 2,
            normalizationVersion: 1,
            repositoryId,
            kind: "exclude",
            targetUnitKey: record.unitKey,
            supersedes: [],
          },
        ]
      );
      await collectUsage({
        repository,
        store,
        policy,
        signal: signal(),
        adapters: { codex: adapter },
        privatePolicy: {
          overrides: normalizedImportOverrides(parseNormalizedImport(v), {
            privatePolicy: {},
            records: [],
            policy,
          }).map((choice) => ({ ...choice, decision })),
        },
      });
      expect(
        reduceLedger(
          (await store.journal()).flatMap((x) => x.records),
          meta
        ).excludedUnits
      ).toBe(1);
    } finally {
      await git.cleanup();
    }
  }
);
it("preserves a local exclude when preparing explicit import attribution", () => {
  const value = parseNormalizedImport(envelope());
  const [choice] = normalizedImportOverrides(value, {
    privatePolicy: {},
    records: [],
    policy,
  });
  const choices = normalizedImportOverrides(value, {
    privatePolicy: { overrides: [{ ...choice, decision: "exclude" }] },
    records: [],
    policy,
  });
  expect(choices).toEqual([{ ...choice, decision: "exclude" }]);
});
it("does not revive a later shared exclusion through reimport or historical replay of saved choices", async () => {
  const git = await createBareRemoteFixture();
  try {
    const repository = await resolveRepository(git.clones[0]);
    const f = await fixture();
    const store = await openStore(repository, {
      processNamespace: async () => "synthetic",
    });
    const value = parseNormalizedImport(envelope());
    const privatePolicy = {
      overrides: normalizedImportOverrides(value, {
        privatePolicy: {},
        records: [],
        policy,
      }),
    };
    const options = {
      repository,
      store,
      policy,
      privatePolicy,
      signal: signal(),
      adapters: { import: f.adapter },
    };
    await collectUsage(options);
    const latest = (await store.journal()).at(-1)!;
    const record = (await store.pending())[0];
    if ("kind" in record) throw new Error("expected observation");
    const exclude = {
      schemaVersion: 2 as const,
      normalizationVersion: 1 as const,
      repositoryId,
      kind: "exclude" as const,
      targetUnitKey: record.unitKey,
      supersedes: [],
    };
    await store.commitBatch(
      latest.source,
      {
        source: latest.source,
        observations: [],
        nextCheckpoint: latest.checkpoint,
        outcome: "partial",
        diagnostics: [],
      },
      [exclude]
    );
    const reopened = await openStore(repository, {
      processNamespace: async () => "synthetic",
    });
    await collectUsage({ ...options, store: reopened });
    const records = (await reopened.journal()).flatMap(
      (entry) => entry.records
    );
    expect(reduceLedger(records, meta).excludedUnits).toBe(1);
    expect(
      records.filter((record) => "kind" in record && record.kind === "include")
    ).toEqual([]);
    expect(
      normalizedImportOverrides(value, {
        privatePolicy: {},
        records: [record, exclude],
        policy,
      })
    ).toEqual([]);
  } finally {
    await git.cleanup();
  }
});
