import type { RepositoryContext } from '../git/context.js';
import type { LocalStore } from '../storage/store.js';
import type { SharedPolicy } from '../domain/policy.js';
import { parseSharedPolicy } from '../domain/policy.js';
import { parseLedgerMeta } from '../domain/ledger.js';
import { PUBLIC_OBJECT_MAX_BYTES } from '../domain/capabilities.js';
import { runGit } from '../git/process.js';
import type { WorkerContext } from './worker-protocol.js';
import { AcceptedIndex } from '../storage/accepted-index.js';

/** Worker-only: accepted private anchors outrank the activation bootstrap, including offline.
 * Missing/corrupt accepted evidence fails closed instead of reviving an obsolete policy. */
export async function loadCapturePolicy(repository: RepositoryContext, store: Pick<LocalStore, 'transportState'>, fallback: SharedPolicy,
  repositoryId: string, context: Pick<WorkerContext, 'signal' | 'deadline'>): Promise<SharedPolicy> {
  const policy = parseSharedPolicy(fallback);
  if (policy.repositoryId !== repositoryId) throw new Error('capture-identity-mismatch');
  const accepted = await store.transportState();
  if (!accepted?.commit) return policy;
  if (accepted.repositoryId !== repositoryId) throw new Error('capture-identity-mismatch');
  async function git(args: string[]) {
    const result = await runGit(['--no-replace-objects', ...args], { cwd: repository.worktreeRoot, signal: context.signal,
      timeoutMs: Math.max(1, context.deadline - Date.now()), maxOutputBytes: PUBLIC_OBJECT_MAX_BYTES + 1, env: { GIT_NO_REPLACE_OBJECTS: '1' } });
    if (result.status !== 'ok') throw new Error('capture-anchor-unavailable');
    return result.stdout.trimEnd();
  }
  if (await git(['rev-parse', '--verify', `refs/agent-badge/accepted/${accepted.commit}`]) !== accepted.commit) throw new Error('capture-anchor-unavailable');
  const cached=await AcceptedIndex.load(repository.privateDir,accepted.commit);
  if(cached) {
    try {const meta=cached.snapshot().meta;if(meta.repositoryId!==repositoryId)throw new Error('capture-identity-mismatch');return meta.policy;}
    finally{await cached.close();}
  }
  const listing = await git(['ls-tree', '-z', accepted.commit, '--', 'meta.json']);
  const match = /^100644 blob ([a-f0-9]{40}|[a-f0-9]{64})\tmeta\.json\0$/.exec(listing);
  if (!match) throw new Error('capture-anchor-unavailable');
  const meta = parseLedgerMeta(JSON.parse(await git(['cat-file', 'blob', match[1]])));
  if (meta.repositoryId !== repositoryId) throw new Error('capture-identity-mismatch');
  return meta.policy;
}
