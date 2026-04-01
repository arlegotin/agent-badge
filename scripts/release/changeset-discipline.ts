import { execFile } from "node:child_process";
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

const ignoredChangesetFiles = new Set([".changeset/README.md", ".changeset/config.json"]);

export interface ChangesetDisciplineArgs {
  readonly base: string;
  readonly head: string;
}

export interface ChangesetDisciplineReport {
  readonly status: "pass" | "fail";
  readonly summary: string;
  readonly changedFiles: readonly string[];
  readonly changedPublishableFiles: readonly string[];
  readonly changedChangesetFiles: readonly string[];
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

  return publishableWorkspacePrefixes.some((prefix) => filePath.startsWith(prefix));
}

function isRealChangesetFile(filePath: string): boolean {
  return filePath.startsWith(".changeset/") && !ignoredChangesetFiles.has(filePath);
}

export function evaluateChangesetDiscipline(
  changedFiles: readonly string[]
): ChangesetDisciplineReport {
  const changedPublishableFiles = changedFiles.filter(isPublishableWorkspacePath);
  const changedChangesetFiles = changedFiles.filter(isRealChangesetFile);

  if (changedPublishableFiles.length === 0) {
    return {
      status: "pass",
      summary: "No publishable workspace changes detected in the selected git range.",
      changedFiles,
      changedPublishableFiles,
      changedChangesetFiles
    };
  }

  if (changedChangesetFiles.length > 0) {
    return {
      status: "pass",
      summary: "Publishable workspace changes are accompanied by at least one release changeset.",
      changedFiles,
      changedPublishableFiles,
      changedChangesetFiles
    };
  }

  return {
    status: "fail",
    summary:
      "Publishable workspace changes require a checked-in .changeset/*.md file so the release workflow can version and publish npm packages.",
    changedFiles,
    changedPublishableFiles,
    changedChangesetFiles
  };
}

export function parseChangesetDisciplineArgs(argv: readonly string[]): ChangesetDisciplineArgs {
  const entries = new Map<string, string>();

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

  const base = entries.get("base");
  const head = entries.get("head");

  if (!base) {
    throw new Error("--base is required.");
  }

  if (!head) {
    throw new Error("--head is required.");
  }

  return { base, head };
}

async function runGitCommand(repoRoot: string, args: readonly string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync("git", [...args], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024
  });

  return `${stdout}${stderr}`.trim();
}

export async function listChangedFiles(
  args: ChangesetDisciplineArgs,
  repoRoot = repoRootFromScript
): Promise<readonly string[]> {
  if (isAllZeroGitSha(args.base)) {
    return normalizePaths(await runGitCommand(repoRoot, ["diff-tree", "--no-commit-id", "--name-only", "-r", args.head]));
  }

  return normalizePaths(await runGitCommand(repoRoot, ["diff", "--name-only", args.base, args.head]));
}

function formatReport(report: ChangesetDisciplineReport): string {
  const lines = [report.summary];

  if (report.changedPublishableFiles.length > 0) {
    lines.push("");
    lines.push("Publishable workspace files changed:");
    for (const filePath of report.changedPublishableFiles) {
      lines.push(`- ${filePath}`);
    }
  }

  if (report.changedChangesetFiles.length > 0) {
    lines.push("");
    lines.push("Changeset files detected:");
    for (const filePath of report.changedChangesetFiles) {
      lines.push(`- ${filePath}`);
    }
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = parseChangesetDisciplineArgs(process.argv.slice(2));
  const changedFiles = await listChangedFiles(args);
  const report = evaluateChangesetDiscipline(changedFiles);
  const output = formatReport(report);

  if (report.status === "fail") {
    throw new Error(output);
  }

  console.log(output);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
