import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  codexRollout,
  claudeNativeResponse,
  createBareRemoteFixture,
  type GitFixture,
} from "@agent-badge/testkit";
import { resolveRepository } from "../git/context.js";
import { openStore } from "../storage/store.js";
import { createCodexAdapter } from "../providers/codex/adapter.js";
import { createClaudeAdapter } from "../providers/claude/adapter.js";
import { reduceLedger } from "../ledger/reduce.js";
import { catalogHash, defaultCatalog } from "../pricing/catalog.js";
import { protocolObservationFixture } from "@agent-badge/testkit";
import { recordHash } from "../ledger/canonical-json.js";
import { collectUsage } from "./collect.js";
import {
  attributionPolicyHash,
  parsePrivateAttributionPolicy,
} from "./attribution.js";
import { observationEvidenceHash } from "./metadata.js";
import { sanitizeObservation } from "../ledger/sanitize.js";
import type { AttributionMetadata } from "./metadata.js";
import type { ScanBatch } from "../domain/capabilities.js";
import type { CollectOptions } from "./collect.js";

const repositoryId = "12345678-1234-4234-8234-123456789abc";
const policy = {
  schemaVersion: 1 as const,
  repositoryId,
  normalizationVersion: 1 as const,
  discovery: "auto" as const,
  disabledProviders: [],
  badge: { label: "AI usage", metric: "tokens" as const },
};

describe("durable local collection", () => {
  let fixture: GitFixture, options: CollectOptions, home: string, path: string;
  beforeEach(async () => {
    fixture = await createBareRemoteFixture();
    const repository = await resolveRepository(fixture.clones[0]);
    home = join(fixture.root, "codex");
    await mkdir(join(home, "sessions"), { recursive: true });
    path = join(home, "sessions/a.jsonl");
    const rollout = codexRollout({ single: true }).replaceAll(
      "/synthetic/repo",
      repository.worktreeRoot
    );
    await writeFile(path, rollout);
    options = {
      repository,
      policy,
      store: await openStore(repository, {
        processNamespace: async () => "synthetic",
      }),
      signal: new AbortController().signal,
      adapters: {
        codex: createCodexAdapter({ environment: {}, defaultHome: home }),
      },
    };
  });
  afterEach(async () => {
    await fixture.cleanup();
  });
  it("excludes unchanged cached 100-token usage to zero and re-includes causally after acknowledgment", async () => {
    const lines = (await readFile(path, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    for (const line of lines)
      if (line.type === "token_usage_record")
        line.payload.usage = {
          ...line.payload.usage,
          input_tokens: 90,
          total_tokens: 100,
        };
    await writeFile(
      path,
      lines.map((line) => JSON.stringify(line)).join("\n") + "\n"
    );
    const initial = await collectUsage(options);
    expect(initial.queuedHashes).toHaveLength(1);
    const original = (await options.store.pending())[0];
    expect("meters" in original && original.meters[0].total).toBe(100);
    await options.store.acknowledge(initial.queuedHashes);
    const observation = (await options.store.journal())[0].observations[0];
    const override = {
      provider: "codex",
      nativeUnitId: observation.nativeUnitId,
      representation: "request",
      decision: "exclude",
    };
    const excluded = await collectUsage({
      ...options,
      privatePolicy: { overrides: [override] },
    });
    expect(excluded.queuedHashes).toHaveLength(1);
    expect(await options.store.pending()).toMatchObject([
      {
        kind: "exclude",
        targetUnitKey: "unitKey" in original ? original.unitKey : "",
      },
    ]);
    const all = (await options.store.journal()).flatMap(
      (entry) => entry.records
    );
    const meta = {
      schemaVersion: 2 as const,
      protocolVersion: 1 as const,
      repositoryId,
      normalizationVersion: 1 as const,
      catalogVersion: 1,
      catalogHash: catalogHash(defaultCatalog),
      policy,
    };
    expect(reduceLedger([original], meta).knownTokens).toBe("100");
    expect(reduceLedger(all, meta).knownTokens).toBe("0");
    expect(
      all.some((record) => recordHash(record) === recordHash(original))
    ).toBe(true);
    const journalLength = (await options.store.journal()).length;
    await collectUsage({
      ...options,
      privatePolicy: { overrides: [override] },
    });
    expect((await options.store.journal()).length).toBe(journalLength);
    await collectUsage(options);
    const controls = (await options.store.pending()).filter(
      (record) => "kind" in record
    );
    expect(controls.map((record) => record.kind)).toEqual(
      expect.arrayContaining(["exclude", "include"])
    );
    const include = controls.find((record) => record.kind === "include")!;
    expect(include.supersedes).toHaveLength(1);
  });
  it("reprojects a removed sole mapping from the journal after the source disappears", async () => {
    const deleted = join(fixture.root, "deleted");
    await writeFile(
      path,
      (
        await readFile(path, "utf8")
      ).replaceAll(options.repository.worktreeRoot, deleted)
    );
    await collectUsage({
      ...options,
      privatePolicy: { mappings: [{ cwd: deleted, repositoryId }] },
    });
    expect(await options.store.pending()).toHaveLength(1);
    await rm(home, { recursive: true });
    const store = await openStore(options.repository, {
      processNamespace: async () => "synthetic",
    });
    await collectUsage({
      ...options,
      store,
      privatePolicy: { mappings: [{ cwd: deleted, repositoryId }] },
    });
    expect(
      (await store.pending()).filter((record) => "kind" in record)
    ).toHaveLength(0);
    await collectUsage({ ...options, store, privatePolicy: {} });
    expect(
      (await store.pending()).filter((record) => "kind" in record)
    ).toMatchObject([{ kind: "exclude" }]);
  });
  it("preserves historical verified membership after deletion, unavailable providers and disabled discovery", async () => {
    await collectUsage(options);
    const first = (await options.store.pending())[0];
    await rm(home, { recursive: true });
    await collectUsage({
      ...options,
      policy: { ...policy, disabledProviders: ["codex"] },
    });
    expect(await options.store.pending()).toEqual([first]);
    const reopened = await openStore(options.repository, {
      processNamespace: async () => "synthetic",
    });
    await collectUsage({
      ...options,
      store: reopened,
      privatePolicy: JSON.parse(
        JSON.stringify({
          verifiedWorktrees: [
            {
              path: options.repository.worktreeRoot,
              commonDir: options.repository.commonDir,
            },
          ],
        })
      ),
    });
    expect(await reopened.pending()).toEqual([first]);
  });
  it("keeps provider-native Claude provisional numbers private and isolates a corrupt provider", async () => {
    const claude = join(fixture.root, "claude");
    await mkdir(join(claude, "projects/p"), { recursive: true });
    const native = claudeNativeResponse();
    native.cwd = options.repository.worktreeRoot;
    await writeFile(
      join(claude, "projects/p/a.jsonl"),
      JSON.stringify(native) + "\n"
    );
    const broken = {
      async discover() {
        throw new Error("private secret filename");
      },
      async *scan() {},
    };
    const result = await collectUsage({
      ...options,
      adapters: {
        codex: broken,
        claude: createClaudeAdapter({ environment: {}, defaultHome: claude }),
      },
    });
    expect(result.sourceOutcomes.map((value) => value.outcome)).toEqual([
      "unavailable",
      "partial",
    ]);
    const pending = await options.store.pending();
    expect(pending).toHaveLength(1);
    expect("meters" in pending[0] && pending[0].meters[0].total).toBeNull();
    const text = JSON.stringify(pending);
    expect(text).not.toContain(options.repository.worktreeRoot);
    expect(text).not.toContain("privateEvidence");
    expect(JSON.stringify(result)).not.toContain("private secret");
  });
  it("matches targeted and full reconciliation and discovers a provider installed after initial empty discovery", async () => {
    const empty = join(fixture.root, "later");
    const later = createCodexAdapter({ environment: {}, defaultHome: empty });
    expect(
      (await collectUsage({ ...options, adapters: { codex: later } }))
        .sourceOutcomes[0].outcome
    ).toBe("empty");
    await mkdir(join(empty, "sessions"), { recursive: true });
    const target = join(empty, "sessions/a.jsonl");
    await writeFile(target, await readFile(path, "utf8"));
    const targeted = await collectUsage({
      ...options,
      adapters: { codex: later },
      target: { provider: "codex", sourceIdentity: target },
    });
    expect(targeted.queuedHashes).toHaveLength(1);
    expect(
      (await collectUsage({ ...options, adapters: { codex: later } }))
        .queuedHashes
    ).toEqual(targeted.queuedHashes);
    const unavailable = createCodexAdapter({
      environment: { CODEX_HOME: join(fixture.root, "missing") },
    });
    expect(
      (await collectUsage({ ...options, adapters: { codex: unavailable } }))
        .sourceOutcomes[0].outcome
    ).toBe("unavailable");
  });
  it("does not parse transcripts again for display or pricing-only changes", async () => {
    await collectUsage(options);
    const journal = await options.store.journal();
    const original = journal[0];
    const diagnosticAdapter = {
      async discover() {
        return [original.source];
      },
      async *scan(source: any, candidate: any, _signal: any, scope: any) {
        if (
          !candidate ||
          candidate.attributionPolicyHash !== scope.attributionPolicyHash
        )
          throw new Error("scope invalidated");
        yield {
          source,
          observations: [],
          nextCheckpoint: candidate,
          outcome: "complete" as const,
          diagnostics: [],
        };
      },
    };
    const result = await collectUsage({
      ...options,
      policy: { ...policy, badge: { label: "Cost", metric: "estimated-cost" } },
      adapters: { codex: diagnosticAdapter },
    });
    expect(result.sourceOutcomes[0].outcome).toBe("complete");
    expect(result.queuedHashes).toHaveLength(1);
    expect((await options.store.journal()).length).toBe(journal.length);
  });

  it.each(["override", "alias"] as const)(
    "retracts a removed sole %s using its journal-bound prior policy",
    async (kind) => {
      const observation = protocolObservationFixture();
      observation.execution.cwd =
        kind === "override" ? join(fixture.root, "absent") : fixture.clones[1];
      observation.execution.remoteUrl =
        kind === "alias" ? fixture.remote : null;
      const source = {
        provider: "codex" as const,
        root: "/synthetic/session",
        instanceKey: "/synthetic",
        sourceIdentity: "/synthetic/session",
        generation: "one",
        schema: "synthetic",
        readerVersion: "1",
      };
      observation.source = {
        instanceKey: source.instanceKey,
        sourceIdentity: source.sourceIdentity,
        generation: source.generation,
        sourceSchema: source.schema,
        readerVersion: source.readerVersion,
      };
      const adapter = {
        async discover() {
          return [source];
        },
        async *scan(input: any, candidate: any, _signal: any, scope: any) {
          yield {
            source: input,
            observations: candidate ? [] : [observation],
            nextCheckpoint: {
              schemaVersion: 1 as const,
              provider: source.provider,
              instanceKey: source.instanceKey,
              sourceIdentity: source.sourceIdentity,
              sourceGeneration: source.generation,
              sourceSchema: source.schema,
              readerVersion: source.readerVersion,
              ...scope,
              continuation: null,
              cursor: {
                offset: 1,
                size: 1,
                prefixHash: "b".repeat(64),
                incompleteTail: "",
              },
            },
            outcome: "complete" as const,
            diagnostics: [],
          };
        },
      };
      const privatePolicy =
        kind === "override"
          ? {
              overrides: [
                {
                  provider: "codex",
                  nativeUnitId: observation.nativeUnitId,
                  representation: "request",
                  decision: "include",
                },
              ],
            }
          : { remoteAliases: [fixture.remote] };
      await collectUsage({
        ...options,
        adapters: { codex: adapter },
        privatePolicy,
      });
      expect(await options.store.pending()).toHaveLength(1);
      const restarted = await openStore(options.repository, {
        processNamespace: async () => "synthetic",
      });
      await collectUsage({
        ...options,
        store: restarted,
        adapters: {},
        privatePolicy: {},
      });
      expect(
        (await restarted.pending()).filter((record) => "kind" in record)
      ).toMatchObject([{ kind: "exclude" }]);
    }
  );
  it("reprojects newly explicit historical enrollment without rereading a disappeared transcript", async () => {
    const deleted = join(fixture.root, "deleted-worktree");
    await writeFile(
      path,
      (
        await readFile(path, "utf8")
      ).replaceAll(options.repository.worktreeRoot, deleted)
    );
    await collectUsage(options);
    expect(await options.store.pending()).toHaveLength(0);
    await rm(home, { recursive: true });
    await collectUsage({
      ...options,
      privatePolicy: {
        verifiedWorktrees: [
          { path: deleted, commonDir: options.repository.commonDir },
        ],
      },
    });
    expect(await options.store.pending()).toHaveLength(1);
  });
  it("does not assign historical verification to a later unrelated request at a reused worktree path", async () => {
    const linked = join(fixture.root, "old-linked");
    await fixture.git(options.repository.worktreeRoot, [
      "worktree",
      "add",
      "--detach",
      linked,
      "HEAD",
    ]);
    const original = await readFile(path, "utf8");
    await writeFile(
      path,
      original.replaceAll(options.repository.worktreeRoot, linked)
    );
    await collectUsage(options);
    expect(await options.store.pending()).toHaveLength(1);
    await rm(linked, { recursive: true });
    await mkdir(linked);
    await fixture.git(linked, ["init"]);
    await appendFile(
      path,
      original
        .replaceAll(options.repository.worktreeRoot, linked)
        .replaceAll("response-1", "response-new")
    );
    await collectUsage(options);
    const pending = await options.store.pending();
    expect(pending).toHaveLength(1);
    expect(
      (await options.store.journal())
        .flatMap((entry) => entry.observations)
        .some((observation) =>
          observation.nativeUnitId.includes("response-new")
        )
    ).toBe(true);
  });

  it("owns the source lock during adapter scanning and isolates a corrupt source", async () => {
    const native = options.adapters!.codex!,
      competing = await openStore(options.repository, {
        processNamespace: async () => "synthetic",
      });
    const adapter = {
      async discover(context: Parameters<typeof native.discover>[0]) {
        const [source] = await native.discover(context);
        return [
          {
            ...source,
            root: join(home, "sessions/bad.jsonl"),
            sourceIdentity: join(home, "sessions/bad.jsonl"),
          },
          source,
        ];
      },
      async *scan(...args: Parameters<typeof native.scan>) {
        let locked = false;
        try {
          await competing.withLock(
            AbortSignal.timeout(25),
            async () => undefined
          );
        } catch {
          locked = true;
        }
        if (!locked) throw new Error("source scan was outside collection lock");
        if (args[0].root.endsWith("bad.jsonl"))
          throw new Error("synthetic corrupted source");
        yield* native.scan(...args);
      },
    };
    const result = await collectUsage({
      ...options,
      adapters: { codex: adapter },
    });
    expect(result.sourceOutcomes.map((value) => value.outcome)).toEqual([
      "unavailable",
      "complete",
    ]);
    expect(result.queuedHashes).toHaveLength(1);
  });
  it("passes the latest old reader candidate to the adapter instead of hiding or trusting it", async () => {
    await collectUsage(options);
    const entry = (await options.store.journal())[0];
    const changed = { ...entry.source, readerVersion: "synthetic-next-reader" };
    const adapter = {
      async discover() {
        return [changed];
      },
      async *scan(source: any, candidate: any, _signal: any, scope: any) {
        if (candidate?.readerVersion !== entry.source.readerVersion)
          throw new Error("lost latest candidate");
        const observation = {
          ...entry.observations[0],
          source: {
            ...entry.observations[0].source,
            readerVersion: source.readerVersion,
            generation: "reader-reset",
          },
        };
        const resolved = { ...source, generation: "reader-reset" };
        yield {
          source: resolved,
          observations: [observation],
          nextCheckpoint: {
            ...entry.checkpoint,
            ...scope,
            readerVersion: source.readerVersion,
            sourceGeneration: resolved.generation,
          },
          outcome: "complete" as const,
          diagnostics: [],
        };
      },
    };
    const result = await collectUsage({
      ...options,
      adapters: { codex: adapter },
    });
    expect(result.sourceOutcomes[0].outcome).toBe("complete");
    expect(
      (await options.store.checkpointCandidate(changed))?.readerVersion
    ).toBe("synthetic-next-reader");
    expect(result.queuedHashes).toHaveLength(1);
  });

  it("does not invent historical membership for journal entries written without attribution metadata", async () => {
    const native = options.adapters!.codex!;
    const [source] = await native.discover({
      repositoryId,
      enrolledRoots: [],
      signal: options.signal,
    });
    const scope = {
      repositoryId,
      normalizationVersion: 1 as const,
      attributionPolicyHash: "a".repeat(64),
    };
    for await (const batch of native.scan(source, null, options.signal, scope))
      await options.store.commitBatch(batch.source, batch, []);
    await collectUsage(options);
    expect(await options.store.pending()).toEqual([]);
    await collectUsage({
      ...options,
      privatePolicy: {
        mappings: [{ cwd: options.repository.worktreeRoot, repositoryId }],
      },
    });
    expect(await options.store.pending()).toHaveLength(1);
  });

  it("accepts repeated identical native request evidence without duplicating public usage", async () => {
    const request = (await readFile(path, "utf8"))
      .split("\n")
      .find((line) => line.includes('"type":"token_usage_record"'))!;
    await appendFile(
      path,
      JSON.stringify({ ...JSON.parse(request), ordinal: 3 }) + "\n"
    );
    const result = await collectUsage(options);
    expect(result.queuedHashes).toHaveLength(1);
    expect(result.sourceOutcomes[0].outcome).toBe("complete");
  });
  it.each(["include", "exclude"] as const)(
    "preserves independent linked-worktree membership through a temporary %s override",
    async (decision) => {
      const linked = join(fixture.root, "verified-linked");
      await fixture.git(options.repository.worktreeRoot, [
        "worktree",
        "add",
        "--detach",
        linked,
        "HEAD",
      ]);
      await writeFile(
        path,
        (
          await readFile(path, "utf8")
        ).replaceAll(options.repository.worktreeRoot, linked)
      );
      await collectUsage(options);
      const initial = (await options.store.journal())[0];
      const override = {
        provider: "codex",
        nativeUnitId: initial.observations[0].nativeUnitId,
        representation: "request",
        decision,
      };
      await collectUsage({
        ...options,
        privatePolicy: { overrides: [override] },
      });
      const temporary = (await options.store.journal()).at(-1)!;
      expect(temporary.attribution!.decisions[0].verifiedCommonDir).toBe(
        options.repository.commonDir
      );
      await rm(linked, { recursive: true });
      await collectUsage(options);
      const records = (await options.store.journal()).flatMap(
        (entry) => entry.records
      );
      const meta = {
        schemaVersion: 2 as const,
        protocolVersion: 1 as const,
        repositoryId,
        normalizationVersion: 1 as const,
        catalogVersion: 1,
        catalogHash: catalogHash(defaultCatalog),
        policy,
      };
      expect(reduceLedger(records, meta).knownTokens).toBe("110");
    }
  );
  it.each(["distinct-units", "single-unit"] as const)(
    "reprojects a source history over 10000 observations (%s) in durable bounded metadata chunks and progresses a healthy source",
    async (historyKind) => {
      const native = options.adapters!.codex!;
      const [source] = await native.discover({
        repositoryId,
        enrolledRoots: [],
        signal: options.signal,
      });
      let baseline: ScanBatch | undefined;
      const privatePolicy = parsePrivateAttributionPolicy({
        mappings: [{ cwd: join(fixture.root, "gone"), repositoryId }],
      });
      const scope = {
        repositoryId,
        normalizationVersion: 1 as const,
        attributionPolicyHash: attributionPolicyHash(policy, privatePolicy),
      };
      for await (const batch of native.scan(
        source,
        null,
        options.signal,
        scope
      ))
        baseline = batch;
      const observations = Array.from({ length: 10001 }, (_, index) => ({
        ...baseline!.observations[0],
        nativeUnitId:
          historyKind === "single-unit"
            ? "history-unit"
            : `history-unit-${index}`,
        nativeCoverageId: `history-evidence-${index}`,
        execution: {
          ...baseline!.observations[0].execution,
          cwd: join(fixture.root, "gone"),
        },
      }));
      const snapshot = {
        remoteAliases: privatePolicy.remoteAliases,
        mappings: privatePolicy.mappings,
        overrides: privatePolicy.overrides,
      };
      for (const batchObservations of [
        observations.slice(0, 10000),
        observations.slice(10000),
      ]) {
        const metadata: AttributionMetadata = {
          schemaVersion: 1,
          policyHash: scope.attributionPolicyHash,
          policy: snapshot,
          decisions: batchObservations.map((observation) => ({
            observationHash: observationEvidenceHash(observation),
            status: "included",
            reason: "private-mapping",
            verifiedCommonDir: null,
          })),
        };
        const records = batchObservations
          .filter(
            (observation) =>
              observation === observations[0] ||
              observation === observations[10000]
          )
          .map((observation) => sanitizeObservation(observation, policy));
        await options.store.commitBatch(
          baseline!.source,
          { ...baseline!, observations: batchObservations },
          records,
          metadata
        );
      }
      await writeFile(
        join(home, "sessions/healthy.jsonl"),
        (
          await readFile(path, "utf8")
        ).replaceAll("response-1", "healthy-response")
      );
      const result = await collectUsage({ ...options, privatePolicy: {} });
      expect(result.diagnostics).toEqual([]);
      expect(
        result.sourceOutcomes.some(
          (outcome) =>
            outcome.sourceIdentity?.endsWith("healthy.jsonl") &&
            outcome.outcome === "complete"
        )
      ).toBe(true);
      const journal = await options.store.journal();
      const replay = journal
        .slice(2)
        .filter(
          (entry) =>
            entry.source.sourceIdentity === baseline!.source.sourceIdentity &&
            entry.attribution?.policyHash !== scope.attributionPolicyHash
        );
      expect(replay.length).toBeGreaterThan(1);
      expect(
        replay.flatMap((entry) => entry.attribution!.decisions)
      ).toHaveLength(10001);
      expect(
        replay.every(
          (entry) =>
            entry.attribution!.decisions.length <= 10000 &&
            Buffer.byteLength(JSON.stringify(entry.attribution)) <=
              4 * 1024 * 1024
        )
      ).toBe(true);
      const controls = (await options.store.pending()).filter(
        (record) => "kind" in record
      );
      expect(controls).toHaveLength(historyKind === "single-unit" ? 1 : 2);
      expect(controls.every((record) => record.kind === "exclude")).toBe(true);
      expect(result.queuedHashes).toHaveLength(
        historyKind === "single-unit" ? 3 : 5
      );
    },
    60000
  );
  it("retains earlier durable batches when a later scan cancels", async () => {
    const baselineAdapter = options.adapters!.codex!;
    const sources = await baselineAdapter.discover({
      repositoryId,
      enrolledRoots: [],
      signal: options.signal,
    });
    const controller = new AbortController();
    const cancelling = {
      async discover() {
        return sources;
      },
      async *scan(...args: Parameters<typeof baselineAdapter.scan>) {
        for await (const batch of baselineAdapter.scan(...args)) yield batch;
        controller.abort();
        throw new Error("cancelled private path");
      },
    };
    const result = await collectUsage({
      ...options,
      signal: controller.signal,
      adapters: { codex: cancelling },
    });
    expect(result.cancelled).toBe(true);
    expect(result.queuedHashes).toHaveLength(1);
    expect(
      (await options.store.journal()).flatMap((entry) => entry.observations)
    ).toHaveLength(1);
  });
});
