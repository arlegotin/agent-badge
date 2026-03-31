import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRootFromScript = resolve(scriptDir, "..", "..");

const execFileAsync = promisify(execFile);

const publishableManifestPaths = [
  "packages/core/package.json",
  "packages/agent-badge/package.json",
  "packages/create-agent-badge/package.json"
] as const;

type PublishPath = "github-actions" | "local-cli";

export interface CaptureEvidenceArgs {
  readonly phaseDir: string;
  readonly publishPath: PublishPath;
  readonly preflightJson: string;
  readonly workflowRunUrl?: string;
  readonly workflowRunId?: string;
  readonly workflowRunConclusion?: string;
  readonly publishedAt: string;
  readonly fallbackReason?: string;
}

export interface PublishablePackageManifest {
  readonly manifestPath: string;
  readonly name: string;
  readonly version: string;
}

interface ManifestFile {
  readonly name?: unknown;
  readonly version?: unknown;
}

interface RegistryResult {
  readonly packageName: string;
  readonly command: readonly string[];
  readonly observedVersion: string | null;
  readonly distTagsLatest: string | null;
  readonly error: string | null;
}

export interface ReleaseEvidence {
  readonly publishPath: PublishPath;
  readonly gitSha: string;
  readonly preflightPath: string;
  readonly publishedAt: string;
  readonly packages: readonly PublishablePackageManifest[];
  readonly registryResults: readonly RegistryResult[];
  readonly workflowRunUrl?: string;
  readonly workflowRunId?: string;
  readonly workflowRunConclusion?: string;
  readonly fallbackReason?: string;
}

export interface ParsedArgs {
  readonly args: CaptureEvidenceArgs;
}

export function parseEvidenceArgs(argv: readonly string[]): CaptureEvidenceArgs {
  const entries = new Map<string, string | undefined>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const value = argv[index + 1];

    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Argument --${key} expects a value.`);
    }

    entries.set(key, value);
    index += 1;
  }

  const phaseDir = entries.get("phase-dir");
  const publishPath = entries.get("publish-path") as PublishPath | undefined;
  const preflightJson = entries.get("preflight-json");
  const publishedAt = entries.get("published-at");

  if (!phaseDir) throw new Error("--phase-dir is required.");
  if (!publishPath) throw new Error("--publish-path is required.");
  if (!preflightJson) throw new Error("--preflight-json is required.");
  if (!publishedAt) throw new Error("--published-at is required.");

  if (publishPath !== "github-actions" && publishPath !== "local-cli") {
    throw new Error(`Unsupported --publish-path: ${publishPath}`);
  }

  const workflowRunUrl = entries.get("workflow-run-url");
  const workflowRunId = entries.get("workflow-run-id");
  const workflowRunConclusion = entries.get("workflow-run-conclusion");
  const fallbackReason = entries.get("fallback-reason");

  if (publishPath === "github-actions") {
    if (!workflowRunUrl) {
      throw new Error("--workflow-run-url is required for github-actions publish path.");
    }
    if (!workflowRunId) {
      throw new Error("--workflow-run-id is required for github-actions publish path.");
    }
    if (!workflowRunConclusion) {
      throw new Error("--workflow-run-conclusion is required for github-actions publish path.");
    }
  }

  if (publishPath === "local-cli" && !fallbackReason) {
    throw new Error("--fallback-reason is required for local-cli fallback mode.");
  }

  return {
    phaseDir,
    publishPath,
    preflightJson,
    workflowRunUrl,
    workflowRunId,
    workflowRunConclusion,
    publishedAt,
    fallbackReason
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function firstNonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseRegistryState(raw: unknown): { readonly version: string | null; readonly distTagsLatest: string | null } {
  if (Array.isArray(raw) && raw.length > 0 && isRecord(raw[0])) {
    return parseRegistryState(raw[0]);
  }

  if (!isRecord(raw)) {
    return { version: null, distTagsLatest: null };
  }

  const distTags = isRecord(raw["dist-tags"]) ? raw["dist-tags"] : null;
  const flattenedLatest = firstNonEmpty(distTags?.latest);

  return {
    version: firstNonEmpty(raw.version),
    distTagsLatest: firstNonEmpty((raw as Record<string, unknown>)["dist-tags.latest"]) ?? flattenedLatest
  };
}

export async function loadPublishablePackageInventory(
  repoRoot = repoRootFromScript
): Promise<readonly PublishablePackageManifest[]> {
  const manifests = await Promise.all(
    publishableManifestPaths.map(async (manifestPath) => {
      const manifest = JSON.parse(await readFile(resolve(repoRoot, manifestPath), "utf8")) as ManifestFile;

      const name = firstNonEmpty(manifest.name);
      const version = firstNonEmpty(manifest.version);

      if (!name || !version) {
        throw new Error(`Manifest ${manifestPath} is missing a valid package name or version.`);
      }

      return { manifestPath, name, version };
    })
  );

  return manifests.sort((left, right) => left.name.localeCompare(right.name));
}

async function runNpmCommand(repoRoot: string, args: readonly string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync("npm", args, {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024
  });

  return `${stdout}${stderr}`.trim();
}

async function runGitCommand(repoRoot: string, args: readonly string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024
  });

  return `${stdout}${stderr}`.trim();
}

function formatChildProcessError(error: unknown): string {
  if (!isRecord(error)) {
    return String(error);
  }

  return `${String(error.stderr ?? "")}\n${String(error.stdout ?? "")}\n${String(error.message ?? "")}`.trim();
}

async function readRegistryState(packageName: string, repoRoot: string): Promise<RegistryResult> {
  const command = ["view", packageName, "version", "dist-tags.latest", "--json"] as const;

  try {
    const stdout = await runNpmCommand(repoRoot, command);
    const parsed = parseRegistryState(JSON.parse(stdout));

    return {
      packageName,
      command,
      observedVersion: parsed.version,
      distTagsLatest: parsed.distTagsLatest,
      error: null
    };
  } catch (error) {
    return {
      packageName,
      command,
      observedVersion: null,
      distTagsLatest: null,
      error: formatChildProcessError(error)
    };
  }
}

async function getGitSha(repoRoot: string): Promise<string> {
  const gitSha = (await runGitCommand(repoRoot, ["rev-parse", "HEAD"])).trim(); // git rev-parse

  if (!gitSha) {
    throw new Error("Unable to capture git SHA from git rev-parse HEAD.");
  }

  return gitSha;
}

function buildEvidenceMarkdown(evidence: ReleaseEvidence): string {
  const lines = [
    `Publish path: ${evidence.publishPath}`,
    `Published commit: ${evidence.gitSha}`,
    `Preflight file: ${evidence.preflightPath}`,
    `Workflow run: ${evidence.workflowRunUrl ?? "n/a"}`,
    `Fallback reason: ${evidence.fallbackReason ?? "n/a"}`,
    `Published at: ${evidence.publishedAt}`,
    "Registry results:"
  ];

  for (const result of evidence.registryResults) {
    const base = `${result.packageName}: command=[${result.command.join(" ")}]`;
    const details = [
      result.observedVersion ? `version=${result.observedVersion}` : null,
      result.distTagsLatest ? `dist-tags.latest=${result.distTagsLatest}` : null,
      result.error ? `error=${result.error}` : null
    ].filter((value): value is string => value !== null);

    lines.push(`${base}; ${details.join(", ")}`);
  }

  return lines.join("\n");
}

export async function runCaptureEvidence(
  args: CaptureEvidenceArgs,
  repoRoot = repoRootFromScript
): Promise<ReleaseEvidence> {
  const manifestInventory = await loadPublishablePackageInventory(repoRoot);

  const preflightPath = resolve(repoRoot, args.preflightJson);
  const preflightContent = await readFile(preflightPath, "utf8");

  JSON.parse(preflightContent);

  const gitSha = await getGitSha(repoRoot);
  const registryResults = await Promise.all(
    manifestInventory.map((manifest) => readRegistryState(manifest.name, repoRoot))
  );

  const baseEvidence: ReleaseEvidence = {
    publishPath: args.publishPath,
    gitSha,
    preflightPath: args.preflightJson,
    publishedAt: args.publishedAt,
    packages: manifestInventory,
    registryResults,
    workflowRunUrl: args.workflowRunUrl,
    workflowRunId: args.workflowRunId,
    workflowRunConclusion: args.workflowRunConclusion,
    fallbackReason: args.fallbackReason
  };

  const evidence =
    args.publishPath === "github-actions"
      ? { ...baseEvidence, fallbackReason: undefined }
      : baseEvidence;

  const phaseDir = resolve(repoRoot, args.phaseDir);
  await mkdir(phaseDir, { recursive: true });
  await writeFile(resolve(phaseDir, "12-PUBLISH-EVIDENCE.json"), JSON.stringify(evidence, null, 2));
  await writeFile(resolve(phaseDir, "12-PUBLISH-EVIDENCE.md"), buildEvidenceMarkdown(evidence));

  return evidence;
}

function main(): void {
  const args = parseEvidenceArgs(process.argv.slice(2));
  runCaptureEvidence(args)
    .then(() => {
      console.log(`Wrote release evidence files under ${resolve(repoRootFromScript, args.phaseDir)}.`);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`release evidence capture failed: ${message}`);
      process.exitCode = 1;
    });
}

const executedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);
if (executedPath === modulePath) {
  main();
}
