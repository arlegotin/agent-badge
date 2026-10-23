import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ProtocolError,
  PUBLIC_OBJECT_MAX_BYTES,
} from "../domain/capabilities.js";
import { validatePublicBlob } from "../domain/ledger.js";
import { validateLedgerTree } from "../ledger/validate-tree.js";
import type { PublicTreeEntry } from "../ledger/validate-tree.js";
import { assertDirectory,StoreError } from "../storage/atomic-file.js";
import { resolvePushDestination, canonicalRemoteUrl } from "./remote-binding.js";
import type { BoundRemote } from "./remote-binding.js";
import type { RepositoryContext } from "./context.js";
import { runGit } from "./process.js";
import { readVerifiedGitBlobs } from './objects.js';
import { AcceptedIndex } from '../storage/accepted-index.js';
import { rebuildAcceptedIndex,prepareAcceptedCandidate } from '../storage/accepted-stage.js';
import type { AcceptedExtension } from '../storage/accepted-index.js';
import type { GitRunOptions, GitRunResult } from "./process.js";

export class TransportError extends Error {
  constructor(
    readonly reason: "unavailable" | "routing-changed" | "history-rewritten" | "automatic-local-transport"
  ) {
    super(reason);
  }
}
export type AcceptedLedger = ReturnType<typeof validateLedgerTree> & {
  readonly commit: string;
  readonly indexed?: import('../storage/accepted-index.js').AcceptedIndex;
  readonly rebuilt?: boolean;
};
export interface TransportOptions {
  operationMode?: 'automatic' | 'manual';
  /** Only owning sync transactions may rebuild the disposable accepted cache. */
  indexMode?: 'full' | 'lazy';
  priorCommit?: string;
  /** Owning sync's existing acceptance routine, after complete current validation. */
  onValidatedStage?(snapshot:AcceptedLedger):Promise<void>;
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
  private acceptedIndex?:AcceptedIndex;
  private readonly candidates=new Map<string,AcceptedExtension>();
  private readonly retainedParents=new Map<string,string>();
  private refMayExist=false;
  private constructor(
    private readonly options: TransportOptions,
    private readonly directory: string,
    private readonly ref: string,
    private readonly url: string
  ) {}
  static async open(options: TransportOptions): Promise<DataTransport> {
    // The complete current route is verified below before any network operation.
    // Reject unsafe argv now; avoid repeating the same local routing probes.
    if (!canonicalRemoteUrl(options.binding.pushUrl,options.repository.worktreeRoot))
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
        executableUrl(options.binding.pushUrl, options.repository.worktreeRoot)
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
        signal: extra.signal ?? this.options.signal,
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
    const controller=new AbortController(),signal=AbortSignal.any([this.options.signal,controller.signal]);
    const checked=<T>(task:Promise<T>)=>task.catch(error=>{controller.abort();throw error;});
    const results=await Promise.allSettled([
      checked(resolvePushDestination(
      this.options.repository,
      this.options.binding,
      {...this.options,signal}
    ).then(route=>{if(route.status!=='valid')throw new TransportError('routing-changed');return route;})),
      checked(this.require(["ls-remote", "--get-url", this.url],{signal})),
      checked(this.git(["config", "--null", "--get-regexp", "^url\\..*\\.pushinsteadof$"],{signal}).then(result=>{
        if(result.status!=="ok" && !(result.status==="error" && result.exitCode===1))throw new TransportError('unavailable');return result;
      })),
    ]);
    for(const result of results)if(result.status==='rejected')throw result.reason;
    const route=(results[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof resolvePushDestination>>>).value;
    const expanded=(results[1] as PromiseFulfilledResult<string>).value;
    const rewrites=(results[2] as PromiseFulfilledResult<GitRunResult>).value;
    if (
      route.status !== "valid" ||
      !route.pushUrl ||
      executableUrl(route.pushUrl, this.options.repository.worktreeRoot) !==
        this.url
    )
      throw new TransportError("routing-changed");
    if (expanded.replace(/\r?\n$/, "") !== this.url)
      throw new TransportError("routing-changed");
    // An explicit named pushurl suppresses pushInsteadOf; a literal push does not.
    // Reject applicable changing push mappings rather than risk authorizing the named route only.
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
    this.refMayExist=true;
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
    if (!oidPattern.test(commit)) throw new ProtocolError("invalid-object-type");
    if(!this.options.indexMode)return readLedgerCommit(this.options.repository,commit,this.options);
    const candidate=this.candidates.get(commit);
    if(candidate&&this.acceptedIndex?.commit===candidate.baseCommit){
      await this.acceptedIndex.install(commit,candidate,this.options);
      // Confirmation already read the exact candidate from the bound remote.
      // Publish its derived generation before any further cancellable Git work;
      // otherwise a deadline destroys the verified base needed for delta recovery.
      await this.closeCache();this.acceptedIndex=await AcceptedIndex.load(this.options.repository.privateDir,commit)??undefined;
    }
    if(this.acceptedIndex?.commit!==commit){await this.closeCache();this.acceptedIndex=await AcceptedIndex.load(this.options.repository.privateDir,commit)??undefined;}
    let rebuilt=false;
    if(!this.acceptedIndex){
      if(this.options.indexMode==='lazy'){
        const index=await rebuildAcceptedIndex(this.options.repository,commit,{...this.options,
          binding:JSON.stringify([this.options.binding.repositoryId,this.options.binding.canonicalPushUrl,this.options.binding.dataRef]),
          onValidatedStage:this.options.onValidatedStage?async snapshot=>{
            if(snapshot.commit!==commit)throw new ProtocolError('invalid-record');
            await this.verifyRoute();
            const retained=snapshot.indexed?.validatedState.retainedCommit;if(retained)this.retainedParents.set(commit,retained);
            await this.options.onValidatedStage!(snapshot);
          }:undefined,
          recoverCommit:async oid=>{await this.verifyRoute();const result=await this.git(['fetch','--no-write-fetch-head','--no-tags','--no-recurse-submodules','--refmap=',this.url,oid]);return result.status==='ok';},
        });
        if(!index)throw new TransportError('unavailable');this.acceptedIndex=index;rebuilt=!index.recoveredCandidate;
      }else{
        const full=await readLedgerCommit(this.options.repository,commit,this.options);
        try{this.acceptedIndex=await AcceptedIndex.create(this.options.repository.privateDir,full);}
        catch(error){
          // Manual callers already own a fully validated detached snapshot.
          // A pinned disposable slot cannot prevent the normal acceptance path
          // from confirming it; a later invocation can refresh the cache.
          if(error instanceof StoreError&&error.code==='store-busy')return full;
          throw error;
        }
      }
    }
    const retained=this.acceptedIndex.validatedState.retainedCommit;if(retained)this.retainedParents.set(commit,retained);
    const snapshot=this.acceptedIndex.snapshot();
    if(this.options.indexMode==='lazy')return Object.assign(snapshot,{rebuilt});
    // Explicit/manual consumers own detached fully materialized results after close.
    return {commit:snapshot.commit,meta:snapshot.meta,catalog:snapshot.catalog,records:snapshot.records,ledger:snapshot.ledger,artifacts:snapshot.artifacts};
  }
  async closeCache():Promise<void>{const index=this.acceptedIndex;this.acceptedIndex=undefined;await index?.close();}
  async commitExtension(extension:AcceptedExtension):Promise<string>{
    if(extension.baseCommit!==this.acceptedIndex?.commit)throw new ProtocolError('invalid-record');
    const commit=await this.commit(extension.artifacts,extension.baseCommit,true);
    if(this.options.indexMode==='lazy')await prepareAcceptedCandidate(this.options.repository,commit,extension,{...this.options,binding:JSON.stringify([this.options.binding.repositoryId,this.options.binding.canonicalPushUrl,this.options.binding.dataRef])});
    this.candidates.set(commit,extension);this.retainedParents.set(commit,extension.baseCommit);return commit;
  }

  async assertDescendant(
    commit: string,
    accepted: string,
    artifacts: Pick<ReadonlyMap<string, Uint8Array>,'has'>
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
    if(commit===accepted)return;
    const result = await this.git([
      "merge-base",
      "--is-ancestor",
      accepted,
      commit,
    ]);
    if (result.status !== "ok") throw new TransportError("history-rewritten");
    // This invocation built the candidate by read-tree of the verified parent
    // plus canonical additions only; no immutable path could be removed.
    if(this.retainedParents.get(commit)===accepted)return;
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
  /** Existing acceptance evidence only; this never validates or acknowledges new records. */
  async verifyAnchor(commit: string): Promise<void> {
    if (!oidPattern.test(commit) || (await this.require(['rev-parse','--verify',`refs/agent-badge/accepted/${commit}^{commit}`])).trim() !== commit)
      throw new TransportError('history-rewritten');
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
    parent: string | null,
    patch=false
  ): Promise<string> {
    const indexFile = join(this.directory, "index");
    if(patch&&!parent)throw new ProtocolError('invalid-record');
    await this.require(patch?["read-tree",parent!]:["read-tree", "--empty"], { indexFile });
    const algorithm=(await this.require(['rev-parse','--show-object-format'])).trim();
    if(algorithm!=='sha1'&&algorithm!=='sha256')throw new TransportError('unavailable');
    const previous=new Map<string,string>();
    if(parent&&!patch)for(const line of (await this.require(['ls-tree','-r','-z',parent],{maxOutputBytes:Number.MAX_SAFE_INTEGER})).split('\0').filter(Boolean)) {
      const match=/^100644 blob ([a-f0-9]+)\t(.+)$/.exec(line);if(!match)throw new ProtocolError('invalid-path');previous.set(match[2],match[1]);
    }
    const entries: string[] = [],changed:{bytes:Uint8Array;oid:string}[]=[];
    for (const [path, bytes] of artifacts) {
      this.options.signal.throwIfAborted();validatePublicBlob(path,'100644',bytes,'blob');
      const oid=createHash(algorithm).update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      entries.push(`100644 ${oid}\t${path}\0`);
      if(previous.get(path)!==oid)changed.push({bytes,oid});
    }
    const objects=join(this.directory,'objects');await mkdir(objects,{mode:0o700});
    try {
      for(let offset=0;offset<changed.length;) {
        const batch:typeof changed=[];let bytes=0;
        while(offset<changed.length && batch.length<4096 && bytes+changed[offset].bytes.length<=8*1024*1024) {
          const object=changed[offset++];batch.push(object);bytes+=object.bytes.length;
        }
        const paths=batch.map((_,index)=>join(objects,String(index)));
        for(let start=0;start<batch.length;start+=64) {
          this.options.signal.throwIfAborted();
          await Promise.all(batch.slice(start,start+64).map((object,index)=>writeFile(paths[start+index],object.bytes,{mode:0o600,flag:'wx'})));
        }
        const written=(await this.require(['hash-object','-w','--no-filters','--stdin-paths'],{input:paths.map(path=>JSON.stringify(path)+'\n').join(''),maxOutputBytes:batch.length*66})).trim().split('\n');
        if(written.length!==batch.length || written.some((oid,index)=>oid!==batch[index].oid))throw new TransportError('unavailable');
        for(let start=0;start<paths.length;start+=64)await Promise.all(paths.slice(start,start+64).map(path=>rm(path)));
      }
    }finally{await rm(objects,{recursive:true,force:true});}
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
    // A supervised local receiver shares the worker group. Killing it while refs
    // are locked can strand a lock in a user-owned repository.
    if (this.options.operationMode === 'automatic' &&
        canonicalRemoteUrl(this.url, this.options.repository.worktreeRoot)?.startsWith('file://'))
      throw new TransportError('automatic-local-transport');
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
    if(this.refMayExist)await runGit(
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


/** Validate an immutable local tree using the same boundary as fetched ledgers. No refs/network writes. */
export async function readLedgerCommit(repository: RepositoryContext, commit: string,
  options: { signal: AbortSignal; deadline: number }): Promise<AcceptedLedger> {
  if (!oidPattern.test(commit)) throw new ProtocolError('invalid-record');
  const signal = options.signal;
  async function require(args: readonly string[], extra: Partial<GitRunOptions> = {}): Promise<string> {
    signal.throwIfAborted();
    const result = await runGit(['--no-replace-objects', '-c', 'core.hooksPath=/dev/null', ...args], {
      ...extra, cwd: repository.worktreeRoot, signal, timeoutMs: Math.max(1, options.deadline - Date.now()), env: { GIT_NO_REPLACE_OBJECTS: '1' },
    });
    if (result.status !== 'ok') throw new TransportError('unavailable');
    return result.stdout;
  }
  if ((await require(['cat-file','-t',commit])).trim() !== 'commit') throw new ProtocolError('invalid-object-type');
    const listing = await require(
      ["ls-tree", "-r", "-t", "-z", "-l", "--full-tree", commit],
      { maxOutputBytes: Number.MAX_SAFE_INTEGER }
    );
    const blobs: { path:string; mode:string; objectType:string; oid:string; size:number }[] = [];
    const entries: PublicTreeEntry[] = [],
      directories: string[] = [];
    const paths = new Set<string>();
    for (const line of listing.split("\0").filter(Boolean)) {
      signal.throwIfAborted();
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
      blobs.push({path,mode,objectType,oid,size:Number(size)});
    }
    // Bound each transfer independently of total historical ledger size. Git owns
    // object decompression; our standard runner owns cancellation/process groups.
    for(let offset=0;offset<blobs.length;) {
      const batch:typeof blobs=[];let limit=0;
      while(offset<blobs.length && batch.length<4096 && limit+blobs[offset].size+128<=8*1024*1024) {
        const blob=blobs[offset++];batch.push(blob);limit+=blob.size+128;
      }
      const bodies=await readVerifiedGitBlobs(repository.worktreeRoot,batch,options);
      batch.forEach((blob,index)=>entries.push({path:blob.path,mode:blob.mode,objectType:blob.objectType,bytes:bodies[index]}));
    }
    if (
      directories.some(
        (path) => !entries.some((entry) => entry.path.startsWith(`${path}/`))
      )
    )
      throw new ProtocolError("invalid-path");
    return {
      ...validateLedgerTree(entries, undefined, signal),
      commit,
    };
}
