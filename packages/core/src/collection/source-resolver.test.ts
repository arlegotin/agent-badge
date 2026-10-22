import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createBareRemoteFixture,
  protocolObservationFixture,
  type GitFixture,
} from "@agent-badge/testkit";
import { resolveRepository } from "../git/context.js";
import {
  attributeObservation,
  parsePrivateAttributionPolicy,
} from "./attribution.js";
import {
  resolveAttributionEvidence,
  discoverSources,
} from "./source-resolver.js";

describe("private source resolution", () => {
  let fixture: GitFixture;
  beforeEach(async () => {
    fixture = await createBareRemoteFixture();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });
  it("resolves subdirectories and sibling worktrees without accepting nested repositories or submodules", async () => {
    const root = fixture.clones[0],
      repository = await resolveRepository(root),
      observation = protocolObservationFixture();
    const privatePolicy = parsePrivateAttributionPolicy({});
    const status = async (cwd: string) => {
      observation.execution.cwd = cwd;
      return attributeObservation(observation, {
        repositoryId: "12345678-1234-4234-8234-123456789abc",
        privatePolicy,
        evidence: await resolveAttributionEvidence(
          observation,
          repository,
          privatePolicy
        ),
      }).status;
    };
    await mkdir(join(root, "src"));
    expect(await status(join(root, "src"))).toBe("included");
    const linked = join(fixture.root, "linked");
    await fixture.git(root, ["worktree", "add", "--detach", linked, "HEAD"]);
    expect(await status(linked)).toBe("included");
    const nested = join(root, "nested");
    await mkdir(nested);
    await fixture.git(nested, ["init"]);
    expect(await status(nested)).toBe("excluded");
    await fixture.git(root, [
      "-c",
      "protocol.file.allow=always",
      "submodule",
      "add",
      fixture.remote,
      "module",
    ]);
    expect(await status(join(root, "module"))).toBe("excluded");
    await rm(linked, { recursive: true });
    expect(await status(linked)).toBe("ambiguous");
    const restored = parsePrivateAttributionPolicy({
      verifiedWorktrees: [{ path: linked, commonDir: repository.commonDir }],
    });
    observation.execution.cwd = linked;
    expect(
      (await resolveAttributionEvidence(observation, repository, restored))
        .historicalMembership
    ).toBe(true);
    const relocated = join(fixture.root, "unrelated");
    await mkdir(relocated);
    await fixture.git(relocated, ["init"]);
    observation.execution.cwd = relocated;
    expect(
      (await resolveAttributionEvidence(observation, repository, restored))
        .historicalMembership
    ).toBe(false);
  });
  it("selects targeted hints only from enrolled discovery and isolates discovery failures", async () => {
    const root = fixture.clones[0];
    await writeFile(join(root, "untrusted.jsonl"), "must not be read");
    const source = {
      provider: "codex" as const,
      root: "/enrolled/sessions/a.jsonl",
      instanceKey: "/enrolled",
      sourceIdentity: "/enrolled/sessions/a.jsonl",
      generation: "1",
      schema: "synthetic",
      readerVersion: "1",
    };
    const adapters = {
      codex: {
        async discover() {
          return [
            source,
            {
              ...source,
              root: join(root, "untrusted.jsonl"),
              sourceIdentity: join(root, "untrusted.jsonl"),
            },
          ];
        },
        async *scan() {},
      },
      claude: {
        async discover() {
          throw new Error("/private/secret");
        },
        async *scan() {},
      },
    };
    const result = await discoverSources({
      repositoryId: "12345678-1234-4234-8234-123456789abc",
      disabledProviders: [],
      adapters,
      roots: {},
      signal: new AbortController().signal,
      target: { sourceIdentity: join(root, "untrusted.jsonl") },
    });
    expect(result.sources).toEqual([]);
    expect(result.outcomes.map((value) => value.outcome)).toEqual([
      "unsupported",
      "unavailable",
    ]);
    expect(JSON.stringify(result)).not.toContain("/private/secret");
    const targeted = await discoverSources({
      repositoryId: "12345678-1234-4234-8234-123456789abc",
      disabledProviders: [],
      adapters,
      roots: {},
      signal: new AbortController().signal,
      target: { provider: "codex", sourceIdentity: source.sourceIdentity },
    });
    expect(targeted.sources.map((value) => value.source)).toEqual([source]);
  });
});
