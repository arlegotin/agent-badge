import { afterEach, describe, expect, it } from "vitest";
import { createBareRemoteFixture, type GitFixture } from "@agent-badge/testkit";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveRepository } from "../git/context.js";
import { openStore } from "../storage/store.js";
import { collectUsage } from "./collect.js";
import { protocolObservationFixture } from "@agent-badge/testkit";
const repositoryId = "12345678-1234-4234-8234-123456789abc";
const policy = {
  schemaVersion: 1 as const,
  repositoryId,
  normalizationVersion: 1 as const,
  discovery: "auto" as const,
  disabledProviders: [],
  badge: { label: "AI usage", metric: "tokens" as const },
};
let fixture: GitFixture | undefined;
afterEach(async () => {
  await fixture?.cleanup();
});

describe("journal attribution boundary", () => {
  it("rejects metadata overflow on commit and recovery and rejects unrelated provenance", async () => {
    fixture = await createBareRemoteFixture();
    const repository = await resolveRepository(fixture.clones[0]);
    const store = await openStore(repository, {
        processNamespace: async () => "synthetic",
      }),
      observation = protocolObservationFixture();
    observation.execution.cwd = repository.worktreeRoot;
    observation.source = {
      ...observation.source,
      instanceKey: "/synthetic",
      sourceIdentity: "/synthetic/source",
    };
    const source = {
      provider: observation.provider,
      root: "/synthetic/source",
      instanceKey: observation.source.instanceKey,
      sourceIdentity: observation.source.sourceIdentity,
      generation: observation.source.generation,
      schema: observation.source.sourceSchema,
      readerVersion: observation.source.readerVersion,
    };
    const adapter = {
      async discover() {
        return [{ ...source, instanceKey: "/synthetic" }];
      },
      async *scan(input: any, _candidate: any, _signal: any, scope: any) {
        observation.source.instanceKey = input.instanceKey;
        yield {
          source: input,
          observations: [observation],
          nextCheckpoint: {
            schemaVersion: 1 as const,
            provider: input.provider,
            instanceKey: input.instanceKey,
            sourceIdentity: input.sourceIdentity,
            sourceGeneration: input.generation,
            sourceSchema: input.schema,
            readerVersion: input.readerVersion,
            ...scope,
            continuation: null,
            cursor: {
              offset: 1,
              size: 1,
              prefixHash: "a".repeat(64),
              incompleteTail: "",
            },
          },
          outcome: "complete" as const,
          diagnostics: [],
        };
      },
    };
    await collectUsage({
      repository,
      policy,
      store,
      signal: new AbortController().signal,
      adapters: { codex: adapter },
    });
    const entry = (await store.journal())[0];
    expect(entry.attribution).toBeDefined();
    const huge = {
      ...entry.attribution!,
      policy: {
        ...entry.attribution!.policy,
        overrides: Array.from({ length: 1500 }, (_, i) => ({
          provider: "codex",
          representation: "request",
          nativeUnitId: String(i) + "x".repeat(4000),
          decision: "include",
        })),
      },
    };
    const batch = {
      source: entry.source,
      observations: [],
      nextCheckpoint: entry.checkpoint,
      outcome: entry.outcome,
      diagnostics: entry.diagnostics,
    };
    await expect(
      store.commitBatch(entry.source, batch, [], huge as never)
    ).rejects.toThrow("invalid-batch");
    const unrelated = {
      ...entry.attribution!,
      decisions: [
        { ...entry.attribution!.decisions[0], observationHash: "f".repeat(64) },
      ],
    };
    await expect(
      store.commitBatch(entry.source, batch, [], unrelated)
    ).rejects.toThrow("invalid-batch");
    const file = join(
      repository.privateDir,
      "journal",
      (await readdir(join(repository.privateDir, "journal")))[0]
    );
    const disk = JSON.parse(await readFile(file, "utf8"));
    await writeFile(file, JSON.stringify({ ...disk, attribution: huge }));
    await expect(store.journal()).rejects.toThrow("invalid-durable-data");
  });
});
