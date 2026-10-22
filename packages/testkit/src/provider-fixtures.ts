import { mkdir, mkdtemp, rm, writeFile as writeFileOnDisk } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type ProviderName = "codex" | "claude";

/** Synthetic canaries, never sourced from user histories. */
export const protocolPrivacyCanaries = {
  prompt: "PROMPT_CANARY_do_not_publish",
  path: "/private/synthetic/PATH_CANARY/work.txt",
  email: "EMAIL_CANARY@example.invalid",
  credential: "CREDENTIAL_CANARY_not_a_real_token"
} as const;

/** Private normalized receipt. Copies may change source/lineage, never native request identity. */
export function protocolObservationFixture() {
  return { schemaVersion: 2 as const, normalizationVersion: 1 as const, provider: "codex" as const,
    representation: "request" as const, identity: "provider-native" as const, coverage: "native-request" as const,
    nativeUnitId: protocolPrivacyCanaries.credential, nativeCoverageId: protocolPrivacyCanaries.prompt,
    revision: { kind: "final" as const }, supersedes: [], quality: "exact" as const,
    execution: { cwd: protocolPrivacyCanaries.path, repositoryId: null,
      remoteUrl: `https://${protocolPrivacyCanaries.email}/synthetic` },
    source: { instanceKey: protocolPrivacyCanaries.email, sourceIdentity: protocolPrivacyCanaries.path,
      generation: "synthetic-generation", sourceSchema: "synthetic-request-v1", readerVersion: "1" },
    lineage: { kind: "root" as const, parentNativeId: null, inherited: "none" as const }, diagnostics: [],
    meters: [{ vendor: "openai" as const, model: "gpt-5.4-mini" as const, total: 140, input: 100,
      uncachedInput: 60, cachedInput: 40, cacheCreation: { fiveMinutes: null, oneHour: null, other: null },
      output: 40, reasoningOutput: 0,
      semantics: { input: "includes-cached" as const, output: "includes-reasoning" as const,
        cacheCreation: "unknown" as const, total: "input-plus-output" as const } }] };
}

export interface ProviderFixtureSeed {
  readonly files?: Record<string, string>;
}

export interface CreateProviderFixtureOptions {
  readonly codex?: boolean | ProviderFixtureSeed;
  readonly claude?: boolean | ProviderFixtureSeed;
}

export interface ProviderFixture {
  readonly homeRoot: string;
  readonly codexRoot: string | null;
  readonly claudeRoot: string | null;
  cleanup(): Promise<void>;
  writeProviderFile(
    provider: ProviderName,
    relativePath: string,
    content: string
  ): Promise<string>;
}

async function writeFixtureFile(
  root: string,
  relativePath: string,
  content: string
): Promise<string> {
  const targetPath = join(root, relativePath);

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFileOnDisk(targetPath, content, "utf8");

  return targetPath;
}

async function createProviderRoot(
  homeRoot: string,
  provider: ProviderName,
  seed: boolean | ProviderFixtureSeed | undefined
): Promise<string | null> {
  if (seed === false) {
    return null;
  }

  const providerRoot = join(homeRoot, provider === "codex" ? ".codex" : ".claude");
  await mkdir(providerRoot, { recursive: true });

  const files = typeof seed === "object" ? seed.files ?? {} : {};
  for (const [relativePath, content] of Object.entries(files)) {
    await writeFixtureFile(providerRoot, relativePath, content);
  }

  return providerRoot;
}

export async function createProviderFixture(
  options: CreateProviderFixtureOptions = {}
): Promise<ProviderFixture> {
  const homeRoot = await mkdtemp(join(tmpdir(), "agent-badge-home-"));
  const codexRoot = await createProviderRoot(homeRoot, "codex", options.codex ?? true);
  const claudeRoot = await createProviderRoot(
    homeRoot,
    "claude",
    options.claude ?? true
  );

  return {
    homeRoot,
    codexRoot,
    claudeRoot,
    async cleanup() {
      await rm(homeRoot, { recursive: true, force: true });
    },
    async writeProviderFile(provider, relativePath, content) {
      const root = provider === "codex" ? codexRoot : claudeRoot;

      if (root === null) {
        throw new Error(`Provider fixture for ${provider} is disabled.`);
      }

      return writeFixtureFile(root, relativePath, content);
    }
  };
}
