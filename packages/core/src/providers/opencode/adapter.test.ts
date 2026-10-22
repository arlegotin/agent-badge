import { afterEach, expect, it } from "vitest";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { createOpenCodeAdapter } from "./adapter.js";
import { inspectOpenCodeExport } from "./reader.js";
import { openCodeExport } from "@agent-badge/testkit";
import type { ScanBatch } from "../../domain/capabilities.js";
const roots: string[] = [];
const scope = {
  repositoryId: "12345678-1234-4234-8234-123456789abc",
  normalizationVersion: 1 as const,
  attributionPolicyHash: "a".repeat(64),
};
const signal = () => new AbortController().signal;
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function fixture(
  version = "1.19.3",
  format: "cli" | "api" = "cli",
  maxBytes?: number
) {
  const root = await mkdtemp("/private/tmp/opencode-contract-");
  roots.push(root);
  const path = join(root, "export.json");
  await writeFile(path, JSON.stringify(await openCodeExport(version, format)));
  const adapter = createOpenCodeAdapter({
    environment: {},
    defaultHome: join(root, "absent"),
    exports: [{ path, version, format }],
    maxBytes,
  });
  const [source] = await adapter.discover({
    ...scope,
    enrolledRoots: [],
    signal: signal(),
  });
  return { root, path, adapter, source };
}
async function batch(f: Awaited<ReturnType<typeof fixture>>) {
  const batches: ScanBatch[] = [];
  for await (const b of f.adapter.scan(f.source, null, signal(), scope))
    batches.push(b);
  return batches[0];
}
it.each([
  ["1.19.3", "cli", "opencode-v1-export"],
  ["2.1.2", "cli", "opencode-v2-export"],
  ["2.1.2", "api", "opencode-v2-api-export"],
] as const)(
  "recognizes %s %s separately but refuses uncertifiable projected lineage",
  async (version, format, schema) => {
    const f = await fixture(version, format);
    const inspection = inspectOpenCodeExport(
      await readFile(f.path),
      version,
      format
    );
    expect(inspection).toMatchObject({
      schema,
      accounting: "unsupported",
      reason: "uncertain-lineage",
    });
    const result = await batch(f);
    expect(result.outcome).toBe("unsupported");
    expect(result.observations).toEqual([]);
    expect(result.diagnostics).toContainEqual({
      code: "uncertain-lineage",
      severity: "warning",
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_PROMPT_CANARY");
  }
);
it("does not infer v1/v2 formats from a mismatched version or HTTP wrapper", async () => {
  const v1 = Buffer.from(JSON.stringify(await openCodeExport("1.19.3")));
  expect(inspectOpenCodeExport(v1, "2.1.2", "cli").reason).toBe(
    "unsupported-source"
  );
  expect(inspectOpenCodeExport(v1, "9.0.0", "cli").reason).toBe(
    "unsupported-source"
  );
  const api = Buffer.from(JSON.stringify(await openCodeExport("2.1.2", "api")));
  expect(inspectOpenCodeExport(api, "2.1.2", "cli").reason).toBe(
    "unsupported-source"
  );
});
it.each(["1.19.3", "2.1.2"])(
  "never counts cost, duplicated step usage, fork copies or project/worktree rebinding (%s)",
  async (version) => {
    const f = await fixture(version);
    const original = await openCodeExport(version);
    const value = structuredClone(original);
    value.info.projectID = "shared-across-clones";
    if ('location' in value.info) value.info.location.directory = "/synthetic/other-worktree";
    else value.info.directory = "/synthetic/other-worktree";
    value.info.fork = { sessionID: "synthetic-parent", boundary: 1 };
    value.messages.push(structuredClone(value.messages[0]));
    await writeFile(f.path, JSON.stringify(value));
    expect((await batch(f)).observations).toEqual([]);
  }
);
it("bounds export bytes, rejects symlinked explicitly supplied exports and never invokes an executable", async () => {
  const f = await fixture("1.19.3", "cli", 16);
  await writeFile(
    join(f.root, "opencode"),
    '#!/bin/sh\nprintf invoked > "${0%/*}/invoked"\nexit 97\n',
    { mode: 0o755 }
  );
  expect((await batch(f)).outcome).toBe("partial");
  await symlink(f.path, join(f.root, "link.json"));
  const a = createOpenCodeAdapter({
    environment: { PATH: f.root },
    defaultHome: join(f.root, "absent"),
    exports: [
      { path: join(f.root, "link.json"), version: "1.19.3", format: "cli" },
    ],
  });
  const [s] = await a.discover({
    ...scope,
    enrolledRoots: [],
    signal: signal(),
  });
  const bs = [];
  for await (const b of a.scan(s, null, signal(), scope)) bs.push(b);
  expect(bs[0].observations).toEqual([]);
  expect(bs[0].outcome).toBe("unavailable");
  await expect(readFile(join(f.root, "invoked"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});
it("detects an installed data root without opening native databases or starting v2 servers", async () => {
  const root = await mkdtemp("/private/tmp/opencode-detect-");
  roots.push(root);
  await mkdir(join(root, "data"));
  const a = createOpenCodeAdapter({
    environment: {},
    defaultHome: join(root, "data"),
  });
  const [s] = await a.discover({
    ...scope,
    enrolledRoots: [],
    signal: signal(),
  });
  const bs = [];
  for await (const b of a.scan(s, null, signal(), scope)) bs.push(b);
  expect(bs[0]).toMatchObject({ outcome: "unsupported", observations: [] });
});
