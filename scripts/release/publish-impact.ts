import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRootFromScript = resolve(scriptDir, "..", "..");

const publishableWorkspacePrefixes = [
  "packages/core/",
  "packages/agent-badge/",
  "packages/create-agent-badge/"
] as const;

const publishableRootInputs = new Set([
  "package.json",
  "package-lock.json",
  "tsconfig.base.json"
]);

export interface PublishImpactArgs {
  readonly base: string;
  readonly head: string;
  readonly json: boolean;
  readonly githubOutputPath: string | null;
}

export interface PublishImpactReport {
  readonly impacted: boolean;
  readonly summary: string;
  readonly changedFiles: readonly string[];
  readonly changedPublishableFiles: readonly string[];
}

function isAllZeroGitSha(value: string): boolean {
  return /^0+$/.test(value);
}

function normalizePaths(stdout: string): readonly string[] {
  return stdout
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function isPublishableWorkspacePath(filePath: string): boolean {
  if (filePath.includes(".test.")) {
    return false;
  }

  if (publishableRootInputs.has(filePath)) {
    return true;
  }

  return publishableWorkspacePrefixes.some((prefix) => filePath.startsWith(prefix));
}

export function evaluatePublishImpact(
  changedFiles: readonly string[]
): PublishImpactReport {
  const changedPublishableFiles = changedFiles.filter(isPublishableWorkspacePath);

  if (changedPublishableFiles.length === 0) {
    return {
      impacted: false,
      summary: "No publishable workspace or build-input changes detected in the selected git range.",
      changedFiles,
      changedPublishableFiles
    };
  }

  return {
    impacted: true,
    summary: "Publishable workspace or build-input changes detected.",
    changedFiles,
    changedPublishableFiles
  };
}

export function parsePublishImpactArgs(argv: readonly string[]): PublishImpactArgs {
  let json = false;
  let githubOutputPath: string | null = null;
  const entries = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--json") {
      json = true;
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

    if (key === "github-output") {
      githubOutputPath = value;
    } else {
      entries.set(key, value);
    }

    index += 1;
  }

  const base = entries.get("base");
  const head = entries.get("head");

  if (!base) {
    throw new Error("--base is required.");
  }

  if (!head) {
    throw new Error("--head is required.");
  }

  return {
    base,
    head,
    json,
    githubOutputPath
  };
}

async function runGitCommand(repoRoot: string, args: readonly string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync("git", [...args], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024
  });

  return `${stdout}${stderr}`.trim();
}

export async function listChangedFiles(
  args: Pick<PublishImpactArgs, "base" | "head">,
  repoRoot = repoRootFromScript
): Promise<readonly string[]> {
  if (isAllZeroGitSha(args.base)) {
    return normalizePaths(
      await runGitCommand(repoRoot, ["diff-tree", "--no-commit-id", "--name-only", "-r", args.head])
    );
  }

  return normalizePaths(await runGitCommand(repoRoot, ["diff", "--name-only", args.base, args.head]));
}

async function writeGitHubOutputs(
  outputPath: string,
  report: PublishImpactReport
): Promise<void> {
  const payload = [
    `impacted=${report.impacted ? "true" : "false"}`,
    "changed_publishable_files<<EOF",
    ...report.changedPublishableFiles,
    "EOF"
  ].join("\n");

  await appendFile(outputPath, `${payload}\n`, "utf8");
}

async function main(): Promise<void> {
  const args = parsePublishImpactArgs(process.argv.slice(2));
  const changedFiles = await listChangedFiles(args);
  const report = evaluatePublishImpact(changedFiles);

  if (args.githubOutputPath !== null) {
    await writeGitHubOutputs(args.githubOutputPath, report);
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(report.summary);
  if (report.changedPublishableFiles.length > 0) {
    console.log("");
    console.log("Changed publishable inputs:");
    for (const filePath of report.changedPublishableFiles) {
      console.log(`- ${filePath}`);
    }
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
