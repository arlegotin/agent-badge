import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, link, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { exportContribution, contributionBytes, contributionPath, resolveRepository, openStore, runGit, parseLedgerMeta, parsePublicRecord, recordHash, defaultCatalog, catalogHash, ENVELOPE_MAX_BYTES } from '@legotin/agent-badge-core';
import type { ContributionEnvelope, LedgerMeta, PublicRecord } from '@legotin/agent-badge-core';
import { loadActivation } from '../integration/runtime.js';

export interface ContributeCommandOptions { cwd?: string; selectedHashes?: string[]; meta?: LedgerMeta; records?: readonly PublicRecord[] }
/** Explicit export writes exactly one managed receipt. Staging is the contributor's normal Git operation. */
export async function runContributeCommand(options: ContributeCommandOptions = {}): Promise<{ path: string; envelope: ContributionEnvelope }> {
  const repository = await resolveRepository(options.cwd ?? process.cwd());
  let meta = options.meta, records = options.records, selectedHashes = options.selectedHashes;
  if (!meta || !records) {
    const activation = await loadActivation(repository.privateDir);
    if (!activation) throw new Error('Run explicit setup in this clone before contributing.');
    const store = await openStore(repository);
    const snapshot = await store.withLock(AbortSignal.timeout(20000), async () => {
      let meta: LedgerMeta = { schemaVersion: 2, protocolVersion: 1, repositoryId: activation.repositoryId, normalizationVersion: 1, catalogVersion: defaultCatalog.version,
        catalogHash: catalogHash(defaultCatalog), policy: activation.capturePolicy };
      const records = (await store.journal()).flatMap(entry => entry.records);
      const localHashes = records.map(recordHash);
      const accepted = await store.transportState();
      if (accepted?.commit) {
        const git = async (args: string[]) => {
          const result = await runGit(['--no-replace-objects', ...args], { cwd: repository.worktreeRoot, maxOutputBytes: ENVELOPE_MAX_BYTES + 1 });
          if (result.status !== 'ok') throw new Error('Accepted ledger unavailable; synchronize before exporting.');
          return result.stdout;
        };
        if ((await git(['rev-parse', '--verify', `refs/agent-badge/accepted/${accepted.commit}`])).trim() !== accepted.commit) throw new Error('Accepted ledger unavailable.');
        const listing = await git(['ls-tree', '-r', '-z', accepted.commit]);
        for (const line of listing.split('\0').filter(Boolean)) {
          const match = /^100644 blob ([a-f0-9]{40}|[a-f0-9]{64})\t(meta\.json|(?:observations|controls)\/[a-f0-9]{2}\/[a-f0-9]{64}\.json)$/.exec(line);
          if (!match) continue;
          const data = JSON.parse(await git(['cat-file', 'blob', match[1]]));
          if (match[2] === 'meta.json') meta = parseLedgerMeta(data); else records.push(parsePublicRecord(data));
        }
      }
      return { meta, records, localHashes };
    });
    meta = snapshot.meta; records = snapshot.records; selectedHashes ??= snapshot.localHashes;
  }
  const envelope = exportContribution({ meta, records, selectedHashes });
  const path = contributionPath(envelope), bytes = contributionBytes(envelope);
  for (const directory of ['.agent-badge', '.agent-badge/contributions']) {
    try { await mkdir(join(repository.worktreeRoot, directory), { mode: 0o755 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const info = await lstat(join(repository.worktreeRoot, directory));
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe contribution directory.');
  }
  const stage = join(repository.worktreeRoot, '.agent-badge/contributions', `.agent-badge-${randomUUID()}`);
  try {
    const handle = await open(stage, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    await link(stage, join(repository.worktreeRoot, path));
    const parent = await open(join(repository.worktreeRoot, '.agent-badge/contributions'), 'r');
    try { await parent.sync(); } finally { await parent.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const { readContributionFile } = await import('./import.js');
    if (contributionBytes(await readContributionFile(repository.worktreeRoot, path)) !== bytes) throw new Error('Immutable contribution changed; restore it before exporting.');
  } finally { await rm(stage, { force: true }); }
  return { path, envelope };
}
