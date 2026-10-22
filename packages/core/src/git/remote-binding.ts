import { isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { RepositoryContext } from "./context.js";
import { runGit } from "./process.js";

const DATA_REF = "refs/heads/agent-badge/data";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export interface VerifiedLedgerEvidence {
  /** Supplied only by a caller that fetched and validated remote meta.json. */
  readonly repositoryId: string;
  readonly canonicalPushUrl: string;
  readonly dataRef: string;
}
export interface BindingRequest {
  readonly repositoryId: string;
  readonly declaredUrl: string;
  /** Explicit local choice. Omission permits only origin matching declaredUrl. */
  readonly target?: string;
  readonly ledgerEvidence?: VerifiedLedgerEvidence;
}
type BindingReason = "invalid-request" | "remote-unavailable" | "unsafe-url" | "multiple-push-urls" | "multiple-fetch-urls" | "destination-mismatch" | "repository-id-mismatch" | "evidence-destination-mismatch" | "routing-changed";
export interface BoundRemote {
  readonly status: "bound";
  readonly repositoryId: string;
  readonly remoteName: string;
  readonly canonicalFetchUrl: string;
  readonly canonicalPushUrl: string;
  readonly dataRef: typeof DATA_REF;
  readonly ledgerEvidence: VerifiedLedgerEvidence | null;
}
/** Private local.json persistence input; never write to the committed declaration. */
export type RemoteBinding = BoundRemote | { readonly status: "unbound" | "rejected"; readonly reason: BindingReason };
export type BindingCheck = { readonly status: "valid" } | { readonly status: "suspended"; readonly reason: BindingReason };

/** Private canonical routing key. Only GitHub has proven cross-protocol aliases.
 * Generic SSH preserves its account and absolute versus home-relative namespace.
 * Local destinations are absolute file URLs and must never enter public artifacts.
 */
export function canonicalRemoteUrl(value: string, cwd?: string): string | null {
  if (!value || value.startsWith("-") || /[\x00-\x1f\x7f]/u.test(value)) return null;
  if (value.startsWith("file://")) {
    try {
      const url = new URL(value);
      if (url.host || url.username || url.password || url.search || url.hash) return null;
      return pathToFileURL(resolve(fileURLToPath(url))).href;
    } catch { return null; }
  }
  if (isAbsolute(value)) return pathToFileURL(resolve(value)).href;
  if (!value.includes(":")) {
    return cwd && isAbsolute(cwd) && !value.startsWith("~") ? pathToFileURL(resolve(cwd, value)).href : null;
  }
  if (/[\s\\?#%]/u.test(value)) return null;
  let host: string;
  let path: string;
  let account = "";
  let protocol: string;
  let port = "";
  if (/^(https?|ssh):\/\//i.test(value)) {
    // Reject ambiguity before WHATWG URL normalizes dot segments away.
    const raw = value.match(/^[a-z]+:\/\/[^/]+\/(.*)$/i);
    if (!raw) return null;
    path = raw[1];
    try {
      const url = new URL(value);
      host = url.hostname.toLowerCase();
      protocol = url.protocol.slice(0, -1);
      port = url.port;
      if (protocol === "ssh") {
        if (url.password) return null;
        account = url.username;
        if (port === "22") port = "";
      }
    } catch { return null; }
  } else {
    const scp = value.match(/^(?:([^@/:]+)@)?([a-z0-9.-]+):(.+)$/i);
    if (!scp || scp[3].startsWith(":")) return null;
    host = scp[2].toLowerCase();
    account = scp[1] ?? "";
    protocol = scp[3].startsWith("/") ? "ssh" : "ssh-home";
    path = scp[3].replace(/^\//, "");
  }
  if (!host || !path || /\/\/|(^|\/)\.{1,2}(\/|$)/.test(path)) return null;
  if (host === "github.com" && !port && (protocol === "https" || ((protocol === "ssh" || protocol === "ssh-home") && account === "git")) && /^[^/]+\/[^/]+\/?$/.test(path)) {
    return `github.com/${path.replace(/\/$/, "").replace(/\.git$/, "")}`;
  }
  return `${protocol}://${account ? `${account}@` : ""}${host}${port ? `:${port}` : ""}/${path}`;
}

async function routing(ctx: RepositoryContext, remoteName: string): Promise<{ fetch: string; push: string } | BindingReason> {
  const deadline = Date.now() + 2000;
  async function urls(push: boolean): Promise<string[] | null> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    const result = await runGit(["remote", "get-url", ...(push ? ["--push"] : []), "--all", remoteName], { cwd: ctx.worktreeRoot, timeoutMs: remaining });
    return result.status === "ok" ? result.stdout.replace(/\r?\n$/, "").split(/\r?\n/) : null;
  }
  const fetch = await urls(false);
  const push = await urls(true);
  if (!fetch || !push) return "remote-unavailable";
  if (push.length !== 1) return "multiple-push-urls";
  if (fetch.length !== 1) return "multiple-fetch-urls";
  const canonicalFetch = canonicalRemoteUrl(fetch[0], ctx.worktreeRoot);
  const canonicalPush = canonicalRemoteUrl(push[0], ctx.worktreeRoot);
  if (!canonicalFetch || !canonicalPush) return "unsafe-url";
  return { fetch: canonicalFetch, push: canonicalPush };
}

function evidenceFailure(repositoryId: string, push: string, evidence?: VerifiedLedgerEvidence | null): BindingReason | null {
  if (!evidence) return null;
  if (evidence.repositoryId !== repositoryId) return "repository-id-mismatch";
  if (evidence.canonicalPushUrl !== push || evidence.dataRef !== DATA_REF) return "evidence-destination-mismatch";
  return null;
}

/** Local routing consent only: transport must still fetch and validate meta before sending. */
export async function bindRemote(ctx: RepositoryContext, requested: BindingRequest): Promise<RemoteBinding> {
  const remoteName = requested.target ?? "origin";
  const declared = canonicalRemoteUrl(requested.declaredUrl, ctx.worktreeRoot);
  if (!UUID.test(requested.repositoryId) || !declared || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(remoteName)) return { status: "rejected", reason: "invalid-request" };
  const urls = await routing(ctx, remoteName);
  if (typeof urls === "string") return { status: "unbound", reason: urls };
  if (requested.target === undefined && urls.push !== declared) return { status: "unbound", reason: "destination-mismatch" };
  const failure = evidenceFailure(requested.repositoryId, urls.push, requested.ledgerEvidence);
  if (failure) return { status: "rejected", reason: failure };
  return { status: "bound", repositoryId: requested.repositoryId, remoteName, canonicalFetchUrl: urls.fetch, canonicalPushUrl: urls.push, dataRef: DATA_REF, ledgerEvidence: requested.ledgerEvidence ? { ...requested.ledgerEvidence } : null };
}

/** Verifies stored consent against current local routing; performs no remote I/O. */
export async function verifyBinding(ctx: RepositoryContext, binding: RemoteBinding): Promise<BindingCheck> {
  if (binding.status !== "bound") return { status: "suspended", reason: binding.reason };
  if (!UUID.test(binding.repositoryId) || binding.dataRef !== DATA_REF || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(binding.remoteName)) return { status: "suspended", reason: "invalid-request" };
  const urls = await routing(ctx, binding.remoteName);
  if (typeof urls === "string") return { status: "suspended", reason: urls };
  if (urls.fetch !== binding.canonicalFetchUrl || urls.push !== binding.canonicalPushUrl) return { status: "suspended", reason: "routing-changed" };
  const failure = evidenceFailure(binding.repositoryId, urls.push, binding.ledgerEvidence);
  return failure ? { status: "suspended", reason: failure } : { status: "valid" };
}
