import { execFile } from "node:child_process";
import { lstat, mkdtemp, readFile, readdir, readlink, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Ignore developer Git configuration, identities, hooks and repository overrides.
function fixtureEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  return {
    ...env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "agent-badge fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "agent-badge fixture",
    GIT_COMMITTER_EMAIL: "fixture@example.invalid",
    GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
    GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z"
  };
}

function git(cwd: string, args: readonly string[], input?: string): Promise<string> {
  return new Promise((fulfill, reject) => {
    const child = execFile("git", [...args], { cwd, env: fixtureEnvironment(), timeout: 10_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${error.message}\n${stderr}`));
      else fulfill(stdout);
    });
    child.stdin?.on("error", () => { /* execFile reports the command failure. */ });
    child.stdin?.end(input);
  });
}


export interface CheckoutSnapshot {
  readonly head: string;
  readonly headRef: string;
  readonly index: string | null;
  readonly refs: string;
  readonly files: Record<string, { readonly content: string; readonly mode: number }>;
}

export interface GitFixture {
  readonly root: string;
  readonly remote: string;
  readonly clones: readonly [string, string];
  git(cwd: string, args: readonly string[], input?: string): Promise<string>;
  cleanup(): Promise<void>;
}

export async function createBareRemoteFixture(): Promise<GitFixture> {
  // Git reports physical paths (not macOS /var or /tmp symlink spellings).
  const root = await realpath(await mkdtemp(join(tmpdir(), "agent-badge-git-")));
  const remote = join(root, "remote.git");
  const clones = [join(root, "clone-a"), join(root, "clone-b")] as const;
  try {
    await git(root, ["init", "--bare", "--initial-branch=main", remote]);
    await git(root, ["clone", remote, clones[0]]);
    await writeFile(join(clones[0], "tracked.txt"), "synthetic initial code\n");
    await git(clones[0], ["add", "tracked.txt"]);
    await git(clones[0], ["commit", "-m", "Synthetic initial code"]);
    await git(clones[0], ["push", "origin", "HEAD:refs/heads/main"]);
    await git(root, ["clone", remote, clones[1]]);
    for (const cwd of clones) {
      await writeFile(join(cwd, "tracked.txt"), "synthetic stashed code\n");
      await git(cwd, ["stash", "push", "-m", "Synthetic existing stash"]);
    }
    return { root, remote, clones, git, cleanup: () => rm(root, { recursive: true, force: true }) };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

export async function snapshotUserCheckout(cwd: string): Promise<CheckoutSnapshot> {
  const head = (await git(cwd, ["rev-parse", "HEAD"])).trim();
  const headRef = (await git(cwd, ["rev-parse", "--symbolic-full-name", "HEAD"])).trim();
  const indexPath = resolve(cwd, (await git(cwd, ["rev-parse", "--git-path", "index"])).trim());
  let index: string | null;
  try {
    index = (await readFile(indexPath)).toString("hex");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    index = null;
  }
  const refs = await git(cwd, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads", "refs/stash"]);
  const files: CheckoutSnapshot["files"] = {};
  async function walk(directory: string, prefix = ""): Promise<void> {
    for (const name of (await readdir(directory)).sort()) {
      if (!prefix && name === ".git") continue;
      const path = join(directory, name);
      const relativePath = prefix ? `${prefix}/${name}` : name;
      const stat = await lstat(path);
      if (stat.isDirectory()) await walk(path, relativePath);
      else files[relativePath] = {
        mode: stat.mode,
        content: stat.isSymbolicLink() ? Buffer.from(await readlink(path)).toString("hex") : (await readFile(path)).toString("hex")
      };
    }
  }
  await walk(cwd);
  return { head, headRef, index, refs, files };
}

/** Constructs untrusted synthetic trees directly, including entries normal checkout cannot create. */
export async function commitFixtureTree(fixture: GitFixture, cwd: string,
  entries: readonly { path: string; content: string; mode?: string }[], parent?: string): Promise<string> {
  interface Directory { children: Map<string, Directory | { content: string; mode: string }> }
  const root: Directory = { children: new Map() };
  for (const entry of entries) {
    const parts = entry.path.split('/'); let directory = root;
    for (const part of parts.slice(0, -1)) {
      let child = directory.children.get(part);
      if (!child) { child = { children: new Map() }; directory.children.set(part, child); }
      if (!('children' in child)) throw new Error('Invalid synthetic tree');
      directory = child;
    }
    directory.children.set(parts.at(-1)!, { content: entry.content, mode: entry.mode ?? '100644' });
  }
  async function tree(directory: Directory): Promise<string> {
    const lines: string[] = [];
    for (const [name, child] of directory.children) {
      const nested = 'children' in child;
      const oid = nested ? await tree(child) : (await fixture.git(cwd, ['hash-object', '-w', '--stdin'], child.content)).trim();
      lines.push(`${nested ? '040000 tree' : `${child.mode} blob`} ${oid}\t${name}\0`);
    }
    return (await fixture.git(cwd, ['mktree', '-z'], lines.join(''))).trim();
  }
  return (await fixture.git(cwd, ['commit-tree', await tree(root), ...(parent ? ['-p', parent] : []), '-m', 'Synthetic ledger fixture'])).trim();
}

/** Synthetic fixtures only; also used by isolated receiver-backed benchmark clients. */
