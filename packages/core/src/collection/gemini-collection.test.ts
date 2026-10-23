import { afterEach, expect, test, vi } from "vitest";
import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  createBareRemoteFixture,
  createGeminiFixtureHome,
} from "@agent-badge/testkit";
import { resolveRepository } from "../git/context.js";
import { openStore } from "../storage/store.js";
import { collectUsage } from "./collect.js";
afterEach(() => vi.unstubAllEnvs());
test("ordinary default discovery collects a Gemini saved success with exact repository attribution", async () => {
  const f = await createBareRemoteFixture(),
    repository = await resolveRepository(f.clones[0]),
    g = await createGeminiFixtureHome(repository.worktreeRoot);
  try {
    const home = join(f.root, "gemini-home");
    await mkdir(home);
    await cp(g.root, join(home, ".gemini"), { recursive: true });
    vi.stubEnv("GEMINI_CLI_HOME", home);
    const store = await openStore(repository, {
        processNamespace: async () => "synthetic",
      }),
      policy = {
        schemaVersion: 1 as const,
        repositoryId: "12345678-1234-4234-8234-123456789abc",
        normalizationVersion: 1 as const,
        discovery: "auto" as const,
        disabledProviders: [],
        badge: { label: "AI usage", metric: "tokens" as const },
      };
    const result = await collectUsage({
      repository,
      store,
      policy,
      signal: AbortSignal.timeout(5000),
      roots: { codex: [], claude: [] },
    });
    expect(
      result.sourceOutcomes.some(
        (s) => s.provider === "gemini" && s.outcome === "partial"
      )
    ).toBe(true);
    expect(
      (await store.pending()).filter(
        (r) => "provider" in r && r.provider === "gemini"
      )
    ).toHaveLength(1);
    expect(JSON.stringify(await store.pending())).not.toContain(
      "PRIVATE_GEMINI_TRANSCRIPT_CANARY"
    );
  } finally {
    await g.cleanup();
    await f.cleanup();
  }
});
