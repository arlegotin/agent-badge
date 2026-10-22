import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { join, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveRepository, bindRemote, openStore, runGit, parseContribution, contributionBytes, contributionPath, importContribution,
  ENVELOPE_MAX_BYTES, validateEnvelope, resolvePushDestination, DataTransport, TransportError, streamGitRecords, GitStreamError } from '@legotin/agent-badge-core';
import type { RepositoryContext, ContributionEnvelope, ImportResult, BoundRemote, AcceptedLedger } from '@legotin/agent-badge-core';
import { loadActivation } from '../integration/runtime.js';

const managedPath = /^\.agent-badge\/contributions\/[a-f0-9]{64}\.json$/;
function validateBytes(path: string, bytes: string): ContributionEnvelope {
  if (!managedPath.test(path)) throw new Error('Invalid contribution path.');
  const envelope = parseContribution(bytes);
  if (contributionPath(envelope) !== path || contributionBytes(envelope) !== bytes) throw new Error('Contribution digest mismatch.');
  return envelope;
}
/** Open once without following symlinks; validation and import consume this detached snapshot. */
export async function readContributionFile(root: string, path: string): Promise<ContributionEnvelope> {
  if (!managedPath.test(path)) throw new Error('Invalid contribution path.');
  for (const parent of ['.agent-badge', '.agent-badge/contributions']) {
    const info = await lstat(join(root, parent)); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe contribution directory.');
  }
  const handle = await open(join(root, path), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.mode & 0o111 || info.size > ENVELOPE_MAX_BYTES) throw new Error('Unsafe contribution file.');
    const bytes = Buffer.alloc(info.size + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const after = await handle.stat();
    if (bytesRead !== info.size || after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs) throw new Error('Contribution changed during read.');
    return validateBytes(path, new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytesRead)));
  } finally { await handle.close(); }
}
export interface AcceptedContributionsOptions { ref: string; defaultBranch: string; binding: BoundRemote; signal?: AbortSignal; deadline?: number }
/** Resolve accepted default-branch ancestry, then read immutable blobs by OID, never working tree paths. */
export async function* readAcceptedContributions(repository: RepositoryContext, options: AcceptedContributionsOptions): AsyncGenerator<ContributionEnvelope> {
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(options.ref) || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(options.defaultBranch)) throw new Error('Invalid accepted ref.');
  const deadline = options.deadline ?? Date.now() + 120000;
  const signal = AbortSignal.any([options.signal ?? new AbortController().signal, AbortSignal.timeout(Math.max(1, deadline - Date.now()))]);
  const git = async (args: string[], maxOutputBytes = ENVELOPE_MAX_BYTES + 1) => {
    const result = await runGit(['--no-replace-objects', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: repository.worktreeRoot, maxOutputBytes, signal, timeoutMs: Math.max(1, Math.min(20000, deadline - Date.now())) });
    if (result.status !== 'ok') throw new GitStreamError(result.status);
    return result.stdout;
  };
  await git(['check-ref-format', `refs/heads/${options.defaultBranch}`]);
  await openStore(repository);
  const transport = await DataTransport.open({ repository, binding: options.binding, deadline, signal });
  let route;
  try { await transport.verifyRoute(); route = await resolvePushDestination(repository, options.binding, {signal,deadline}); } finally { await transport.close(); }
  if (route.status !== 'valid' || !route.pushUrl) throw new Error('Trusted destination changed.');
  const url = !isAbsolute(route.pushUrl) && !route.pushUrl.includes(':') ? pathToFileURL(resolve(repository.worktreeRoot, route.pushUrl)).href : route.pushUrl;
  const head = await git(['ls-remote', '--symref', url, 'HEAD']);
  if (!head.startsWith(`ref: refs/heads/${options.defaultBranch}\tHEAD\n`)) throw new Error('Actual default branch mismatch.');
  const privateRef = `refs/agent-badge/imports/${randomUUID()}`;
  try {
    await git(['fetch', '--no-tags', '--no-write-fetch-head', '--no-recurse-submodules', '--no-auto-maintenance', url, `refs/heads/${options.defaultBranch}:${privateRef}`]);
    await git(['merge-base', '--is-ancestor', options.ref, privateRef]);
  } finally {
    const removed = await runGit(['-c','core.hooksPath=/dev/null','update-ref','-d',privateRef], {cwd:repository.worktreeRoot,timeoutMs:2000});
    if (removed.status !== 'ok') throw new Error('Owned import ref cleanup unavailable.');
  }

  const listing = streamGitRecords(['--no-replace-objects','-c','core.hooksPath=/dev/null','ls-tree','-r','-z','-l',options.ref,'--','.agent-badge/contributions'],
    {cwd:repository.worktreeRoot,signal,timeoutMs:Math.max(1,deadline-Date.now()),maxRecordBytes:1024});
  for await (const line of listing) {
    signal.throwIfAborted();
    const match = /^100644 blob ([a-f0-9]{40}|[a-f0-9]{64}) +(\d+)\t(.+)$/.exec(line);
    if (!match || !managedPath.test(match[3])) throw new Error('Unsafe contribution tree.');
    validateEnvelope(Number(match[2]), 0);
    const bytes = await git(['cat-file','blob',match[1]]);
    yield validateBytes(match[3],bytes);
  }
}

export interface ImportCommandSummary {
  status: ImportResult['status'] | 'partial' | 'invalid';
  complete: boolean;
  confirmedEnvelopes: number;
  confirmedCommit: string | null;
  accepted: AcceptedLedger | null;
  retrySource: 'contribution-envelope';
  retryRequired: boolean;
  failure: 'aborted' | 'deadline' | 'invalid-contribution' | 'unavailable' | 'conflict' | 'unsupported' | null;
}
export interface ImportCommandOptions {
  cwd?: string; file?: string; acceptedRef?: string; defaultBranch?: string; repositoryId?: string; repositoryUrl?: string; timeoutMs?: number;
  signal?: AbortSignal;
  /** Confirmed progress only, suitable for CLI/UI reporting and cancellation. No cursor authorizes skipping. */
  onProgress?(summary: Readonly<ImportCommandSummary>): void;
}
/** Each self-contained envelope is one shared atomic transaction; earlier accepted batches survive a later failure. */
export async function runImportCommand(options: ImportCommandOptions): Promise<ImportCommandSummary> {
  const deadline = Date.now() + (options.timeoutMs ?? 120000);
  const signal = AbortSignal.any([options.signal ?? new AbortController().signal, AbortSignal.timeout(Math.max(1,deadline-Date.now()))]);
  const repository = await resolveRepository(options.cwd ?? process.cwd());
  if (!!options.file === !!options.acceptedRef) throw new Error('Choose one contribution file or accepted default-branch ref.');
  let binding;
  if (options.acceptedRef) {
    if (!options.defaultBranch || !options.repositoryId || !options.repositoryUrl) throw new Error('Trusted import requires pinned repository identity and default branch.');
    binding = await bindRemote(repository, { repositoryId: options.repositoryId, declaredUrl: options.repositoryUrl });
  } else {
    const activation = await loadActivation(repository.privateDir);
    if (!activation) throw new Error('Run explicit setup before importing.');
    binding = activation.binding;
  }
  if (binding.status !== 'bound') throw new Error('Explicit writer binding required before import.');
  let result: ImportCommandSummary = {status:'unchanged',complete:false,confirmedEnvelopes:0,confirmedCommit:null,accepted:null,retrySource:'contribution-envelope',retryRequired:true,failure:null};
  let changed = false;
  const stopped = (failure: NonNullable<ImportCommandSummary['failure']>, status: ImportCommandSummary['status']): ImportCommandSummary =>
    ({...result,status:result.confirmedEnvelopes ? 'partial' : status,complete:false,retryRequired:true,failure});
  try {
    const envelopes = options.acceptedRef ? readAcceptedContributions(repository,{ref:options.acceptedRef,defaultBranch:options.defaultBranch!,binding,signal,deadline}) :
      (async function* () { yield await readContributionFile(repository.worktreeRoot,options.file!); })();
    const store = await openStore(repository);
    for await (const envelope of envelopes) {
      signal.throwIfAborted();
      const imported = await importContribution(envelope,{repository,binding,store,signal,deadline});
      if (imported.status !== 'synced' && imported.status !== 'unchanged') {
        const failure = signal.aborted ? (options.signal?.aborted ? 'aborted' : 'deadline') : imported.status === 'conflict' ? 'conflict' : imported.status === 'unsupported' ? 'unsupported' : 'unavailable';
        return stopped(failure,imported.status);
      }
      changed ||= imported.status === 'synced';
      result = {...result,status:changed?'synced':'unchanged',confirmedEnvelopes:result.confirmedEnvelopes+1,confirmedCommit:imported.confirmedCommit,accepted:imported.accepted};
      options.onProgress?.({...result});
      signal.throwIfAborted();
    }
    signal.throwIfAborted();
    return {...result,complete:true,retryRequired:false};
  } catch (error) {
    if (signal.aborted) return stopped(options.signal?.aborted?'aborted':'deadline','queued');
    if (error instanceof TransportError) return stopped(error.reason==='routing-changed'?'conflict':'unavailable',error.reason==='routing-changed'?'conflict':'queued');
    if (error instanceof GitStreamError) {
      if (error.reason === 'output-limit' || error.reason === 'invalid-record') return stopped('invalid-contribution','invalid');
      return stopped(error.reason==='timeout'?'deadline':'unavailable','queued');
    }
    return stopped('invalid-contribution','invalid');
  }
}
