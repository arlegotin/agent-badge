import { mkdir, mkdtemp, rm, writeFile as writeFileOnDisk } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type ProviderName = "codex" | "claude";

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
