import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ProtocolError,
  PUBLIC_OBJECT_MAX_BYTES,
} from "../domain/capabilities.js";
import { validatePublicBlob } from "../domain/ledger.js";
import { validateLedgerTree } from "../ledger/validate-tree.js";
import type { PublicTreeEntry } from "../ledger/validate-tree.js";
import { assertDirectory } from "../storage/atomic-file.js";
import { resolvePushDestination } from "./remote-binding.js";
import type { BoundRemote } from "./remote-binding.js";
import type { RepositoryContext } from "./context.js";
import { runGit } from "./process.js";
import type { GitRunOptions, GitRunResult } from "./process.js";

export class TransportError extends Error {
  constructor(
    readonly reason: "unavailable" | "routing-changed" | "history-rewritten"
  ) {
    super(reason);
  }
}
export type AcceptedLedger = ReturnType<typeof validateLedgerTree> & {
  readonly commit: string;
};
export interface TransportOptions {
  repository: RepositoryContext;
  binding: BoundRemote;
  signal: AbortSignal;
  deadline: number;
}
function executableUrl(value: string, cwd: string): string {
  return !isAbsolute(value) && !value.includes(":")
    ? pathToFileURL(resolve(cwd, value)).href
    : value;
}
const oidPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
// Git passes its actual remote advertisement here before sending objects. receive-pack
// then compares that same old OID in its atomic ref transaction. Never call user hooks.
const pushGuard = `#!/bin/sh
candidate=$AGENT_BADGE_CANDIDATE
expected=$AGENT_BADGE_EXPECTED_OLD
case "$candidate$expected" in ''|*[!0-9a-f]*) exit 1;; esac
case \${#candidate} in 40|64) ;; *) exit 1;; esac
[ "\${#expected}" = "\${#candidate}" ] || exit 1
IFS=' ' read -r local_ref local_oid remote_ref remote_oid extra || exit 1
[ "$local_ref" = "$candidate" ] && [ "$local_oid" = "$candidate" ] &&
[ "$remote_ref" = 'refs/heads/agent-badge/data' ] && [ "$remote_oid" = "$expected" ] &&
[ -z "$extra" ] || exit 1
trailing=
if IFS= read -r trailing || [ -n "$trailing" ]; then exit 1; fi
exit 0
`;

/** Invocation-private refs/index and an owned-only ref-guard hooks directory. Never touches FETCH_HEAD or checkout. */
export class DataTransport {
  private constructor(
    private readonly options: TransportOptions,
    private readonly directory: string,
    private readonly ref: string,
    private readonly url: string
  ) {}
  static async open(options: TransportOptions): Promise<DataTransport> {
    const route = await resolvePushDestination(
      options.repository,
      options.binding,
      options
    );
    if (route.status !== "valid" || !route.pushUrl)
      throw new TransportError("routing-changed");
    await assertDirectory(options.repository.privateDir);
    const directory = await mkdtemp(
      join(options.repository.privateDir, "transport-")
    );
    try {
      await mkdir(join(directory, "hooks"), { mode: 0o700 });
      const transport = new DataTransport(
        options,
        directory,
        `refs/agent-badge/transactions/${randomUUID()}`,
        executableUrl(route.pushUrl, options.repository.worktreeRoot)
      );
      await writeFile(join(directory, "hooks", "pre-push"), pushGuard, {
        mode: 0o700,
        flag: "wx",
      });
      await transport.verifyRoute();
      return transport;
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }
  private async git(
    args: readonly string[],
    extra: Partial<GitRunOptions> = {}
  ): Promise<GitRunResult> {
    const timeoutMs = this.options.deadline - Date.now();
    if (timeoutMs < 1 || this.options.signal.aborted)
      throw new TransportError("unavailable");
    return runGit(
      [
        "--no-replace-objects",
        "-c",
        `core.hooksPath=${join(this.directory, "hooks")}`,
        "-c",
        "gc.auto=0",
        "-c",
        "maintenance.auto=false",
        ...args,
      ],
      {
        ...extra,
        cwd: this.options.repository.worktreeRoot,
        signal: this.options.signal,
        timeoutMs,
        env: { ...extra.env, GIT_NO_REPLACE_OBJECTS: "1" },
      }
    );
  }
  private async require(
    args: readonly string[],
    extra: Partial<GitRunOptions> = {}
  ): Promise<string> {
    const result = await this.git(args, extra);
    if (result.status !== "ok") throw new TransportError("unavailable");
    return result.stdout;
  }
  /** Git expands a literal URL again. Fail closed if either direction would reroute it. */
  async verifyRoute(): Promise<void> {
    const route = await resolvePushDestination(
      this.options.repository,
      this.options.binding,
      this.options
    );
    if (
      route.status !== "valid" ||
      !route.pushUrl ||
      executableUrl(route.pushUrl, this.options.repository.worktreeRoot) !==
        this.url
    )
      throw new TransportError("routing-changed");
    const expanded = await this.require(["ls-remote", "--get-url", this.url]);
    if (expanded.replace(/\r?\n$/, "") !== this.url)
      throw new TransportError("routing-changed");
    // An explicit named pushurl suppresses pushInsteadOf; a literal push does not.
    // Reject applicable changing push mappings rather than risk authorizing the named route only.
    const rewrites = await this.git([
      "config",
      "--null",
      "--get-regexp",
      "^url\\..*\\.pushinsteadof$",
    ]);
    if (
      rewrites.status !== "ok" &&
      !(rewrites.status === "error" && rewrites.exitCode === 1)
    )
      throw new TransportError("unavailable");
    for (const entry of rewrites.stdout.split("\0").filter(Boolean)) {
      const newline = entry.indexOf("\n");
      if (newline < 0) throw new TransportError("routing-changed");
      const key = entry.slice(0, newline),
        prefix = entry.slice(newline + 1);
      if (
        !/^url\.[^\x00-\x1f\x7f]*\.pushinsteadof$/.test(key) ||
        /[\x00-\x1f\x7f]/.test(prefix)
      )
        throw new TransportError("routing-changed");
      const replacement = key.slice(4, -14);
      if (
        this.url.startsWith(prefix) &&
        replacement + this.url.slice(prefix.length) !== this.url
      )
        throw new TransportError("routing-changed");
    }
  }
  /** Presence is separate so the caller durably records it before trusting the tree. */
  async remoteTip(): Promise<string | null> {
    await this.verifyRoute();
    const result = await this.git([
      "ls-remote",
      "--exit-code",
      "--refs",
      this.url,
      this.options.binding.dataRef,
    ]);
    if (result.status === "error" && result.exitCode === 2 && !result.stdout)
      return null;
    if (result.status !== "ok") throw new TransportError("unavailable");
    const fields = result.stdout.trimEnd().split("\t");
    if (
      fields.length !== 2 ||
      !oidPattern.test(fields[0]) ||
      fields[1] !== this.options.binding.dataRef
    )
      throw new TransportError("unavailable");
    return fields[0];
  }
  async fetch(): Promise<AcceptedLedger> {
    await this.verifyRoute();
    await this.require([
      "fetch",
      "--no-write-fetch-head",
      "--no-tags",
      "--no-recurse-submodules",
      "--refmap=",
      this.url,
      `+${this.options.binding.dataRef}:${this.ref}`,
    ]);
    const commit = (
      await this.require(["rev-parse", "--verify", this.ref])
    ).trim();
    if (
      !oidPattern.test(commit) ||
      (await this.require(["cat-file", "-t", commit])).trim() !== "commit"
    )
      throw new ProtocolError("invalid-object-type");
    const listing = await this.require(
      ["ls-tree", "-r", "-t", "-z", "-l", "--full-tree", commit],
      { maxOutputBytes: Number.MAX_SAFE_INTEGER }
    );
    const entries: PublicTreeEntry[] = [],
      directories: string[] = [];
    const paths = new Set<string>();
    for (const line of listing.split("\0").filter(Boolean)) {
      this.options.signal.throwIfAborted();
      const match = /^(\d{6}) (\w+) ([a-f0-9]+) +(-|\d+)\t(.+)$/.exec(line);
      if (!match) throw new ProtocolError("invalid-path");
      const [, mode, objectType, oid, size, path] = match;
      if (paths.has(path)) throw new ProtocolError("invalid-path");
      paths.add(path);
      if (
        mode === "040000" &&
        objectType === "tree" &&
        /^(?:observations|controls)(?:\/[a-f0-9]{2})?$/.test(path)
      ) {
        directories.push(path);
        continue;
      }
      validatePublicBlob(path, mode, new Uint8Array(), objectType);
      if (!/^\d+$/.test(size) || Number(size) > PUBLIC_OBJECT_MAX_BYTES)
        throw new ProtocolError("object-too-large");
      const bytes = Buffer.from(
        await this.require(["cat-file", "blob", oid], {
          maxOutputBytes: PUBLIC_OBJECT_MAX_BYTES + 1,
        }),
        "utf8"
      );
      if (bytes.length !== Number(size))
        throw new ProtocolError("invalid-record");
      entries.push({ path, mode, objectType, bytes });
    }
    if (
      directories.some(
        (path) => !entries.some((entry) => entry.path.startsWith(`${path}/`))
      )
    )
      throw new ProtocolError("invalid-path");
    return {
      ...validateLedgerTree(entries, undefined, this.options.signal),
      commit,
    };
  }
  async assertDescendant(
    commit: string,
    accepted: string,
    artifacts: ReadonlyMap<string, Uint8Array>
  ): Promise<void> {
    if (!oidPattern.test(commit) || !oidPattern.test(accepted))
      throw new TransportError("history-rewritten");
    // The durable private anchor must exist; neither shallow absence nor user replace refs proves ancestry.
    const anchor = (
      await this.require([
        "rev-parse",
        "--verify",
        `refs/agent-badge/accepted/${accepted}`,
      ])
    ).trim();
    if (anchor !== accepted) throw new TransportError("history-rewritten");
    const result = await this.git([
      "merge-base",
      "--is-ancestor",
      accepted,
      commit,
    ]);
    if (result.status !== "ok") throw new TransportError("history-rewritten");
    const immutable = await this.require(
      [
        "ls-tree",
        "-r",
        "-z",
        "--name-only",
        accepted,
        "--",
        "observations",
        "controls",
      ],
      { maxOutputBytes: Number.MAX_SAFE_INTEGER }
    );
    for (const path of immutable.split("\0").filter(Boolean)) {
      this.options.signal.throwIfAborted();
      if (!artifacts.has(path)) throw new TransportError("history-rewritten");
    }
  }
  async containsCommit(descendant: string, ancestor: string): Promise<boolean> {
    if (!oidPattern.test(descendant) || !oidPattern.test(ancestor)) throw new TransportError("unavailable");
    const result = await this.git(["merge-base", "--is-ancestor", ancestor, descendant]);
    if (result.status === "ok") return true;
    if (result.status === "error" && result.exitCode === 1) return false;
    throw new TransportError("unavailable");
  }
  async anchor(commit: string): Promise<void> {
    if (!oidPattern.test(commit)) throw new TransportError("unavailable");
    await this.require([
      "update-ref",
      `refs/agent-badge/accepted/${commit}`,
      commit,
    ]);
  }
  async commit(
    artifacts: ReadonlyMap<string, Uint8Array>,
    parent: string | null
  ): Promise<string> {
    const indexFile = join(this.directory, "index");
    await this.require(["read-tree", "--empty"], { indexFile });
    const entries: string[] = [];
    for (const [path, bytes] of artifacts) {
      this.options.signal.throwIfAborted();
      validatePublicBlob(path, "100644", bytes, "blob");
      const oid = (
        await this.require(["hash-object", "-w", "--stdin"], { input: bytes })
      ).trim();
      if (!oidPattern.test(oid)) throw new TransportError("unavailable");
      entries.push(`100644 ${oid}\t${path}\0`);
    }
    await this.require(["update-index", "-z", "--index-info"], {
      indexFile,
      input: entries.join(""),
    });
    const tree = (await this.require(["write-tree"], { indexFile })).trim();
    const signing = await this.git([
      "config",
      "--bool",
      "--get",
      "commit.gpgSign",
    ]);
    if (
      signing.status !== "ok" &&
      !(signing.status === "error" && signing.exitCode === 1)
    )
      throw new TransportError("unavailable");
    const commit = (
      await this.require(
        [
          "commit-tree",
          tree,
          ...(parent ? ["-p", parent] : []),
          ...(signing.stdout.trim() === "true" ? ["-S"] : []),
          "-m",
          "Update agent-badge usage",
        ],
        {
          env: {
            GIT_AUTHOR_NAME: "agent-badge bot",
            GIT_AUTHOR_EMAIL: "agent-badge@example.invalid",
            GIT_COMMITTER_NAME: "agent-badge bot",
            GIT_COMMITTER_EMAIL: "agent-badge@example.invalid",
            GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
            GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
          },
        }
      )
    ).trim();
    if (!oidPattern.test(commit)) throw new TransportError("unavailable");
    return commit;
  }
  async push(commit: string, parent: string | null): Promise<void> {
    if (!oidPattern.test(commit)) throw new TransportError("unavailable");
    const tip = await this.remoteTip();
    if (parent && !tip) throw new TransportError("history-rewritten");
    if (tip !== parent) return; // Ref moved: confirm and rebuild on its current accepted state.
    await this.verifyRoute();
    // Never infer rejection/auth/non-FF from redacted stderr. Always confirm by fetching.
    await this.git(
      [
        "push",
        "--porcelain",
        "--verify",
        "--no-follow-tags",
        "--recurse-submodules=no",
        this.url,
        `${commit}:${this.options.binding.dataRef}`,
      ],
      {
        env: {
          AGENT_BADGE_CANDIDATE: commit,
          AGENT_BADGE_EXPECTED_OLD: parent ?? "0".repeat(commit.length),
        },
      }
    );
  }
  async close(): Promise<void> {
    // Cleanup has a small independent budget even when the transaction has expired.
    await runGit(
      [
        "--no-replace-objects",
        "-c",
        `core.hooksPath=${join(this.directory, "hooks")}`,
        "update-ref",
        "-d",
        this.ref,
      ],
      { cwd: this.options.repository.worktreeRoot, timeoutMs: 1000 }
    );
    await rm(this.directory, { recursive: true, force: true });
  }
}
