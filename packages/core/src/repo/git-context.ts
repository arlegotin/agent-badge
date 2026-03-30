import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitContext {
  readonly isRepo: boolean;
  readonly canInitialize: boolean;
  readonly hasOrigin: boolean;
  readonly blockingMessage: string | null;
}

export interface GetGitContextOptions {
  readonly cwd: string;
  readonly allowGitInit?: boolean;
}

export interface InitializeGitRepositoryOptions {
  readonly cwd: string;
  readonly context: GitContext;
}

async function execGit(
  cwd: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", args, { cwd });
}

async function isGitRepository(cwd: string): Promise<boolean> {
  try {
    const { stdout } = await execGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

async function hasOriginRemote(cwd: string): Promise<boolean> {
  try {
    await execGit(cwd, ["remote", "get-url", "origin"]);
    return true;
  } catch {
    return false;
  }
}

async function hasGitBinary(): Promise<boolean> {
  try {
    await execFileAsync("git", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

export async function getGitContext(
  options: GetGitContextOptions
): Promise<GitContext> {
  const isRepo = await isGitRepository(options.cwd);

  if (isRepo) {
    return {
      isRepo: true,
      canInitialize: true,
      hasOrigin: await hasOriginRemote(options.cwd),
      blockingMessage: null
    };
  }

  const gitAvailable = await hasGitBinary();
  const allowGitInit = options.allowGitInit ?? true;

  if (!gitAvailable) {
    return {
      isRepo: false,
      canInitialize: false,
      hasOrigin: false,
      blockingMessage: "Git is not available on PATH, so agent-badge cannot inspect or initialize this repository."
    };
  }

  if (!allowGitInit) {
    return {
      isRepo: false,
      canInitialize: false,
      hasOrigin: false,
      blockingMessage:
        "Current directory is a non-git workspace. Run `git init` first or enable git bootstrap before continuing."
    };
  }

  return {
    isRepo: false,
    canInitialize: true,
    hasOrigin: false,
    blockingMessage: null
  };
}

export async function initializeGitRepository(
  options: InitializeGitRepositoryOptions
): Promise<void> {
  if (options.context.isRepo || !options.context.canInitialize) {
    return;
  }

  await execGit(options.cwd, ["init", "--quiet"]);
}
