import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { join, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveRepository, bindRemote, openStore, runGit, parseContribution, contributionBytes, contributionPath, importContribution,
  ENVELOPE_MAX_BYTES, validateEnvelope, resolvePushDestination, DataTransport } from '@legotin/agent-badge-core';
import type { RepositoryContext, ContributionEnvelope, ImportResult, BoundRemote } from '@legotin/agent-badge-core';
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
export interface AcceptedContributionsOptions { ref: string; defaultBranch: string; binding: BoundRemote }
/** Resolve accepted default-branch ancestry, then read immutable blobs by OID, never working tree paths. */
export async function readAcceptedContributions(repository: RepositoryContext, options: AcceptedContributionsOptions): Promise<ContributionEnvelope[]> {
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(options.ref) || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(options.defaultBranch)) throw new Error('Invalid accepted ref.');
  const git = async (args: string[], maxOutputBytes = ENVELOPE_MAX_BYTES + 1) => {
    const result = await runGit(['--no-replace-objects', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: repository.worktreeRoot, maxOutputBytes, timeoutMs: 20000 });
    if (result.status !== 'ok') throw new Error('Accepted default branch ref unavailable.');
    return result.stdout;
  };
  await git(['check-ref-format', `refs/heads/${options.defaultBranch}`]);
  const deadline = Date.now() + 20000, signal = AbortSignal.timeout(20000);
  await openStore(repository);
  const transport = await DataTransport.open({ repository, binding: options.binding, deadline, signal });
  let route;
  try { await transport.verifyRoute(); route = await resolvePushDestination(repository, options.binding); } finally { await transport.close(); }
  if (route.status !== 'valid' || !route.pushUrl) throw new Error('Trusted destination changed.');
  const url = !isAbsolute(route.pushUrl) && !route.pushUrl.includes(':') ? pathToFileURL(resolve(repository.worktreeRoot, route.pushUrl)).href : route.pushUrl;
  const head = await git(['ls-remote', '--symref', url, 'HEAD']);
  if (!head.startsWith(`ref: refs/heads/${options.defaultBranch}\tHEAD\n`)) throw new Error('Actual default branch mismatch.');
  const privateRef = `refs/agent-badge/imports/${randomUUID()}`;
  try {
    await git(['fetch', '--no-tags', '--no-write-fetch-head', '--no-recurse-submodules', '--no-auto-maintenance', url, `refs/heads/${options.defaultBranch}:${privateRef}`]);
    await git(['merge-base', '--is-ancestor', options.ref, privateRef]);
  } finally { await git(['update-ref', '-d', privateRef]); }

  const listing = await git(['ls-tree', '-r', '-z', options.ref, '--', '.agent-badge/contributions']);
  const envelopes: ContributionEnvelope[] = []; let totalBytes = 0, totalObjects = 0, totalFiles = 0;
  for (const line of listing.split('\0').filter(Boolean)) {
    const match = /^100644 blob ([a-f0-9]{40}|[a-f0-9]{64})\t(.+)$/.exec(line);
    if (!match || !managedPath.test(match[2])) throw new Error('Unsafe contribution tree.');
    totalFiles++; validateEnvelope(totalBytes, totalFiles);
    const size = Number((await git(['cat-file', '-s', match[1]], 64)).trim());
    validateEnvelope(totalBytes + size, totalObjects);
    const bytes = await git(['cat-file', 'blob', match[1]]);
    totalBytes += Buffer.byteLength(bytes); validateEnvelope(totalBytes, totalObjects);
    const envelope = validateBytes(match[2], bytes);
    totalObjects += envelope.records.length; validateEnvelope(totalBytes, totalObjects);
    envelopes.push(envelope);
  }
  return envelopes;
}
export interface ImportCommandOptions { cwd?: string; file?: string; acceptedRef?: string; defaultBranch?: string; repositoryId?: string; repositoryUrl?: string; timeoutMs?: number }
/** Explicit public import only. Private normalized-source input must use its separate local collection API. */
export async function runImportCommand(options: ImportCommandOptions): Promise<ImportResult | { status: 'unchanged' }> {
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
  const envelopes = options.acceptedRef ? await readAcceptedContributions(repository, { ref: options.acceptedRef, defaultBranch: options.defaultBranch!, binding }) : [await readContributionFile(repository.worktreeRoot, options.file!)];
  if (!envelopes.length) return { status: 'unchanged' };
  const records = new Map<string, ContributionEnvelope['records'][number]>();
  for (const envelope of envelopes) {
    if (envelope.repositoryId !== binding.repositoryId) throw new Error('Contribution repository mismatch.');
    for (const entry of envelope.records) records.set(entry.hash, entry);
  }
  const envelope = { ...envelopes[0], records: [...records.values()] };
  const deadline = Date.now() + (options.timeoutMs ?? 120000);
  return importContribution(envelope, { repository, binding, store: await openStore(repository), signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())), deadline });
}
