import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile as writeFileOnDisk } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CreateRepoFixtureOptions {
  readonly git?: boolean;
  readonly readme?: boolean | string;
  readonly files?: Record<string, string>;
}

export interface RepoFixture {
  readonly root: string;
  readonly gitDir: string | null;
  readonly readmePath: string | null;
  cleanup(): Promise<void>;
  writeFile(relativePath: string, content: string): Promise<string>;
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

async function initializeGitRepo(root: string): Promise<void> {
  await execFileAsync("git", ["init", "--quiet"], { cwd: root });
}

export async function createRepoFixture(
  options: CreateRepoFixtureOptions = {}
): Promise<RepoFixture> {
  const root = await mkdtemp(join(tmpdir(), "agent-badge-repo-"));
  const shouldInitializeGit = options.git ?? true;
  const readmeValue = options.readme ?? true;

  if (shouldInitializeGit) {
    await initializeGitRepo(root);
  }

  const readmePath =
    readmeValue === false
      ? null
      : await writeFixtureFile(
          root,
          "README.md",
          typeof readmeValue === "string" ? readmeValue : "# Fixture Repo\n"
        );

  for (const [relativePath, content] of Object.entries(options.files ?? {})) {
    await writeFixtureFile(root, relativePath, content);
  }

  return {
    root,
    gitDir: shouldInitializeGit ? join(root, ".git") : null,
    readmePath,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
    writeFile(relativePath: string, content: string) {
      return writeFixtureFile(root, relativePath, content);
    }
  };
}

export async function createGitRepoFixture(
  options: Omit<CreateRepoFixtureOptions, "git"> = {}
): Promise<RepoFixture> {
  return createRepoFixture({ ...options, git: true });
}

export async function createNoGitRepoFixture(
  options: Omit<CreateRepoFixtureOptions, "git"> = {}
): Promise<RepoFixture> {
  return createRepoFixture({ ...options, git: false });
}
