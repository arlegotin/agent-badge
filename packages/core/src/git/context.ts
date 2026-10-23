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
export interface RepositoryDiscoveryBudget {signal?:AbortSignal;deadline?:number}
export async function resolveRepository(cwd: string,budget:RepositoryDiscoveryBudget={}): Promise<RepositoryContext> {
  try { return await discoverRepository(cwd,budget); }
  catch { throw new Error("Unable to resolve repository"); }
}

async function discoverRepository(cwd: string,budget:RepositoryDiscoveryBudget): Promise<RepositoryContext> {
  // One shared discovery deadline rather than a fresh two seconds per command.
  const deadline = Math.min(Date.now()+2000,budget.deadline??Infinity);
  const controller = new AbortController();
  const signal=budget.signal?AbortSignal.any([budget.signal,controller.signal]):controller.signal;
  if(signal.aborted||deadline<=Date.now())throw new Error('Unable to resolve repository');
  async function git(args: readonly string[], optional = false): Promise<string> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Unable to resolve repository");
    const result = await runGit(args, { cwd, timeoutMs: remaining, signal });
    if (result.status === "ok") return result.stdout.replace(/\r?\n$/, "");
    if (optional && result.status === "error" && result.exitCode === 1) return "";
    controller.abort();
    throw new Error("Unable to resolve repository");
  }
  // Separate argv/output retains arbitrary path bytes, including embedded newlines.
  // Await every child even on failure so abort/cleanup finishes before discovery returns.
  const results = await Promise.allSettled([
    git(["rev-parse", "--is-inside-work-tree"]),git(["rev-parse", "--show-toplevel"]),
    git(["rev-parse", "--absolute-git-dir"]),git(["rev-parse", "--git-common-dir"]),
    git(["config", "--path", "--get", "core.hooksPath"], true),
    git(["rev-parse", "--show-superproject-working-tree"]),git(["worktree", "list", "--porcelain", "-z"]),
    git(["symbolic-ref", "--quiet", "HEAD"], true),git(["rev-parse", "--verify", "--quiet", "HEAD"], true),
    git(["rev-parse", "--is-shallow-repository"]),
  ]);
  if(results.some(result=>result.status==='rejected'))throw new Error("Unable to resolve repository");
  const [inside,rootPath,gitPath,commonPath,hooks,superproject,listing,ref,oid,shallow]=results.map(result=>(result as PromiseFulfilledResult<string>).value);
  if(inside!=="true")throw new Error("Unable to resolve repository");
  const [worktreeRoot,gitDir,commonDir]=await Promise.all([realpath(rootPath),realpath(gitPath),realpath(resolve(cwd,commonPath))]);
  const hooksPath = hooks ? (isAbsolute(hooks) ? hooks : resolve(worktreeRoot, hooks)) : join(commonDir, "hooks");
  const records = listing.split("\0\0");
  const worktrees: KnownWorktree[] = records.filter(Boolean).map(record => {
    const fields = record.split("\0");
    const field = (name: string): string | null => fields.find(value => value.startsWith(`${name} `))?.slice(name.length + 1) ?? null;
    return { path: field("worktree")!, head: field("HEAD"), branch: field("branch"), bare: fields.includes("bare"), prunable: fields.some(value => value === "prunable" || value.startsWith("prunable ")) };
  });
  const head: RepositoryContext["head"] = ref ? { kind: oid ? "branch" : "unborn", ref } : { kind: "detached", oid };
  return { worktreeRoot, gitDir, commonDir, privateDir: join(commonDir, "agent-badge"), hooksPath, superprojectRoot: superproject ? await realpath(superproject) : null, worktrees, head, shallow: shallow === "true" };
}
