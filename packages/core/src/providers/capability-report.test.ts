import { afterEach, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { reportCapabilities } from "./capability-report.js";
import { createClaudeAdapter } from "./claude/adapter.js";
import { discoverSources } from "../collection/source-resolver.js";
const roots: string[] = [];
const repositoryId = "12345678-1234-4234-8234-123456789abc";
const signal = () => new AbortController().signal;
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
it("reports all integrations with detected unsupported Cursor/Copilot and no invented token receipts", async () => {
  const home = await mkdtemp("/private/tmp/capability-");
  roots.push(home);
  for (const dir of [".cursor", ".copilot", ".local/share/opencode"])
    await mkdir(join(home, dir), { recursive: true });
  await writeFile(
    join(home, ".cursor/context.json"),
    JSON.stringify({ context_tokens: 999999 })
  );
  await writeFile(
    join(home, ".copilot/metrics.json"),
    JSON.stringify({ organization_tokens: 999999, pull_requests: 5 })
  );
  const report = await reportCapabilities(
    { repositoryId, enrolledRoots: [], signal: signal() },
    { home, environment: {} }
  );
  expect(report.integrations.map((x) => x.provider).sort()).toEqual([
    "claude",
    "codex",
    "copilot",
    "cursor",
    "gemini",
    "import",
    "opencode",
  ]);
  for (const provider of ["cursor", "copilot", "opencode"])
    expect(
      report.integrations.find((x) => x.provider === provider)
    ).toMatchObject({ detection: "detected", accounting: "unsupported" });
  expect(
    report.integrations.find((x) => x.provider === "import")
  ).toMatchObject({ detection: "explicit-only" });
  expect(JSON.stringify(report)).not.toContain("999999");
  expect(JSON.stringify(report)).not.toContain(home);
});
it.each(["copilot", "opencode", "codex", "claude", "gemini"] as const)(
  "keeps missing explicitly enrolled %s sources visible as unavailable",
  async (provider) => {
    const home = await mkdtemp("/private/tmp/capability-");
    roots.push(home);
    const report = await reportCapabilities(
      { repositoryId, enrolledRoots: [], signal: signal() },
      { home, environment: {}, roots: { [provider]: [join(home, "missing")] } }
    );
    expect(
      report.integrations.find((x) => x.provider === provider)
    ).toMatchObject({ detection: "unavailable", accounting: "unsupported" });
  }
);
it.each(["cursor", "copilot"])(
  "rejects a Claude-compatible hook targeting an unenrolled %s transcript",
  async (provider) => {
    const home = await mkdtemp("/private/tmp/capability-");
    roots.push(home);
    const path = join(home, provider, "transcript.jsonl");
    await mkdir(join(home, provider));
    await writeFile(
      path,
      JSON.stringify({
        type: "assistant",
        message: { id: "synthetic", usage: { input_tokens: 100 } },
      }) + "\n"
    );
    const result = await discoverSources({
      repositoryId,
      disabledProviders: [],
      adapters: {
        claude: createClaudeAdapter({
          environment: {},
          defaultHome: join(home, "claude"),
        }),
      },
      roots: {},
      signal: signal(),
      target: { provider: "claude", sourceIdentity: path },
    });
    expect(result.sources).toEqual([]);
  }
);

it("distinguishes absent tools from detected empty roots with no certified source", async () => {
  const home = await mkdtemp("/private/tmp/capability-");
  roots.push(home);
  const before = await reportCapabilities(
    { repositoryId, enrolledRoots: [], signal: signal() },
    { home, environment: {} }
  );
  for (const provider of ["codex", "claude", "gemini", "opencode"])
    expect(
      before.integrations.find((x) => x.provider === provider)?.detection
    ).toBe("absent");
  for (const dir of [".codex", ".claude", ".gemini"])
    await mkdir(join(home, dir));
  const after = await reportCapabilities(
    { repositoryId, enrolledRoots: [], signal: signal() },
    { home, environment: {} }
  );
  for (const provider of ["codex", "claude", "gemini"])
    expect(
      after.integrations.find((x) => x.provider === provider)
    ).toMatchObject({ detection: "detected", accounting: "unsupported" });
});
