import { appendFile, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRootFromScript = resolve(scriptDir, "..", "..");

const publishableManifestPaths = [
  "packages/core/package.json",
  "packages/agent-badge/package.json",
  "packages/create-agent-badge/package.json"
] as const;

const internalDependencyUpdates = [
  {
    manifestPath: "packages/agent-badge/package.json",
    dependencyName: "@legotin/agent-badge-core"
  },
  {
    manifestPath: "packages/create-agent-badge/package.json",
    dependencyName: "@legotin/agent-badge"
  }
] as const;

interface PackageManifestFile {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly dependencies?: unknown;
}

interface PackageLockFile {
  readonly packages?: unknown;
}

export interface AutoVersionArgs {
  readonly registryVersion: string | null;
  readonly write: boolean;
  readonly githubOutputPath: string | null;
}

export interface PublishableManifest {
  readonly manifestPath: string;
  readonly name: string;
  readonly version: string;
}

export interface AutoVersionResult {
  readonly previousVersion: string;
  readonly nextVersion: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSemver(value: string): { readonly major: number; readonly minor: number; readonly patch: number } {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());

  if (!match) {
    throw new Error(`Expected a plain semver version, received: ${value}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function compareSemver(left: string, right: string): number {
  const a = parseSemver(left);
  const b = parseSemver(right);

  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

export function bumpPatch(version: string): string {
  const parsed = parseSemver(version);
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

export function resolveNextVersion(
  currentVersions: readonly string[],
  registryVersion: string | null
): AutoVersionResult {
  if (currentVersions.length === 0) {
    throw new Error("At least one current version is required.");
  }

  const uniqueVersions = [...new Set(currentVersions)];

  if (uniqueVersions.length !== 1) {
    throw new Error(`Publishable workspace versions must stay aligned, found: ${uniqueVersions.join(", ")}`);
  }

  const previousVersion =
    registryVersion !== null && compareSemver(registryVersion, uniqueVersions[0]) > 0
      ? registryVersion
      : uniqueVersions[0];

  return {
    previousVersion,
    nextVersion: bumpPatch(previousVersion)
  };
}

export function parseAutoVersionArgs(argv: readonly string[]): AutoVersionArgs {
  let write = false;
  let githubOutputPath: string | null = null;
  let registryVersion: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--write") {
      write = true;
      continue;
    }

    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const value = argv[index + 1];

    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Argument --${key} expects a value.`);
    }

    if (key === "registry-version") {
      registryVersion = value;
    } else if (key === "github-output") {
      githubOutputPath = value;
    } else {
      throw new Error(`Unsupported argument: --${key}`);
    }

    index += 1;
  }

  return {
    registryVersion,
    write,
    githubOutputPath
  };
}

export async function loadPublishableManifests(
  repoRoot = repoRootFromScript
): Promise<readonly PublishableManifest[]> {
  return Promise.all(
    publishableManifestPaths.map(async (manifestPath) => {
      const parsed = JSON.parse(
        await readFile(resolve(repoRoot, manifestPath), "utf8")
      ) as PackageManifestFile;

      if (typeof parsed.name !== "string" || parsed.name.trim().length === 0) {
        throw new Error(`Manifest ${manifestPath} is missing a valid package name.`);
      }

      if (typeof parsed.version !== "string" || parsed.version.trim().length === 0) {
        throw new Error(`Manifest ${manifestPath} is missing a valid package version.`);
      }

      return {
        manifestPath,
        name: parsed.name,
        version: parsed.version
      };
    })
  );
}

async function updateManifestVersion(
  repoRoot: string,
  manifestPath: string,
  nextVersion: string
): Promise<void> {
  const absolutePath = resolve(repoRoot, manifestPath);
  const parsed = JSON.parse(await readFile(absolutePath, "utf8")) as Record<string, unknown>;

  parsed.version = nextVersion;

  if (isRecord(parsed.dependencies)) {
    const mutableDependencies = parsed.dependencies as Record<string, unknown>;
    for (const update of internalDependencyUpdates) {
      if (update.manifestPath === manifestPath && typeof mutableDependencies[update.dependencyName] === "string") {
        mutableDependencies[update.dependencyName] = `^${nextVersion}`;
      }
    }
  }

  await writeFile(absolutePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

async function updatePackageLock(
  repoRoot: string,
  nextVersion: string
): Promise<void> {
  const absolutePath = resolve(repoRoot, "package-lock.json");
  const parsed = JSON.parse(await readFile(absolutePath, "utf8")) as PackageLockFile & Record<string, unknown>;

  if (!isRecord(parsed.packages)) {
    throw new Error("package-lock.json is missing the root packages map.");
  }

  const packages = parsed.packages as Record<string, unknown>;
  const packageEntries = [
    {
      key: "packages/core",
      internalDependencies: [] as string[]
    },
    {
      key: "packages/agent-badge",
      internalDependencies: ["@legotin/agent-badge-core"]
    },
    {
      key: "packages/create-agent-badge",
      internalDependencies: ["@legotin/agent-badge"]
    }
  ] as const;

  for (const entry of packageEntries) {
    const current = packages[entry.key];
    if (!isRecord(current)) {
      continue;
    }

    current.version = nextVersion;
    if (isRecord(current.dependencies)) {
      const deps = current.dependencies as Record<string, unknown>;
      for (const dependencyName of entry.internalDependencies) {
        if (typeof deps[dependencyName] === "string") {
          deps[dependencyName] = `^${nextVersion}`;
        }
      }
    }
  }

  await writeFile(absolutePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

export async function applyAutoVersion(
  nextVersion: string,
  repoRoot = repoRootFromScript
): Promise<void> {
  await Promise.all(
    publishableManifestPaths.map((manifestPath) => updateManifestVersion(repoRoot, manifestPath, nextVersion))
  );
  await updatePackageLock(repoRoot, nextVersion);
}

async function writeGitHubOutputs(outputPath: string, result: AutoVersionResult): Promise<void> {
  const payload = [
    `previous_version=${result.previousVersion}`,
    `next_version=${result.nextVersion}`
  ].join("\n");

  await appendFile(outputPath, `${payload}\n`, "utf8");
}

async function main(): Promise<void> {
  const args = parseAutoVersionArgs(process.argv.slice(2));
  const manifests = await loadPublishableManifests();
  const result = resolveNextVersion(
    manifests.map((manifest) => manifest.version),
    args.registryVersion
  );

  if (args.write) {
    await applyAutoVersion(result.nextVersion);
  }

  if (args.githubOutputPath !== null) {
    await writeGitHubOutputs(args.githubOutputPath, result);
  }

  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
