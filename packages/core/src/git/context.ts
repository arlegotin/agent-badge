import { realpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { runGit } from "./process.js";

export interface KnownWorktree {
  readonly path: string;
  readonly head: string | null;
  readonly branch: string | null;
  readonly bare: boolean;
  readonly prunable: boolean;
}
export interface RepositoryContext {
  readonly worktreeRoot: string;
  readonly gitDir: string;
  readonly commonDir: string;
  readonly privateDir: string;
  readonly hooksPath: string;
  readonly superprojectRoot: string | null;
  /** Includes Git's prunable registrations; do not prune as a discovery side effect. */
  readonly worktrees: readonly KnownWorktree[];
  readonly head: { readonly kind: "branch" | "unborn"; readonly ref: string } | { readonly kind: "detached"; readonly oid: string };
  readonly shallow: boolean;
}

/** Resolves the nearest enclosing repository, including .git files and submodules. */
export async function resolveRepository(cwd: string): Promise<RepositoryContext> {
  try { return await discoverRepository(cwd); }
  catch { throw new Error("Unable to resolve repository"); }
}

async function discoverRepository(cwd: string): Promise<RepositoryContext> {
  // One shared discovery deadline rather than a fresh two seconds per command.
  const deadline = Date.now() + 2000;
  async function git(args: readonly string[], optional = false): Promise<string> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Unable to resolve repository");
    const result = await runGit(args, { cwd, timeoutMs: remaining });
    if (result.status === "ok") return result.stdout.replace(/\r?\n$/, "");
    if (optional && result.status === "error" && result.exitCode === 1) return "";
    throw new Error("Unable to resolve repository");
  }
  if (await git(["rev-parse", "--is-inside-work-tree"]) !== "true") throw new Error("Unable to resolve repository");
  const worktreeRoot = await realpath(await git(["rev-parse", "--show-toplevel"]));
  const gitDir = await realpath(await git(["rev-parse", "--absolute-git-dir"]));
  const commonDir = await realpath(resolve(cwd, await git(["rev-parse", "--git-common-dir"])));
  const hooks = await git(["config", "--path", "--get", "core.hooksPath"], true);
  const hooksPath = hooks ? (isAbsolute(hooks) ? hooks : resolve(worktreeRoot, hooks)) : join(commonDir, "hooks");
  const superproject = await git(["rev-parse", "--show-superproject-working-tree"]);
  const records = (await git(["worktree", "list", "--porcelain", "-z"])).split("\0\0");
  const worktrees: KnownWorktree[] = records.filter(Boolean).map(record => {
    const fields = record.split("\0");
    const field = (name: string): string | null => fields.find(value => value.startsWith(`${name} `))?.slice(name.length + 1) ?? null;
    return { path: field("worktree")!, head: field("HEAD"), branch: field("branch"), bare: fields.includes("bare"), prunable: fields.some(value => value === "prunable" || value.startsWith("prunable ")) };
  });
  const ref = await git(["symbolic-ref", "--quiet", "HEAD"], true);
  const oid = await git(["rev-parse", "--verify", "--quiet", "HEAD"], true);
  const head: RepositoryContext["head"] = ref ? { kind: oid ? "branch" : "unborn", ref } : { kind: "detached", oid };
  return { worktreeRoot, gitDir, commonDir, privateDir: join(commonDir, "agent-badge"), hooksPath, superprojectRoot: superproject ? await realpath(superproject) : null, worktrees, head, shallow: await git(["rev-parse", "--is-shallow-repository"]) === "true" };
}
