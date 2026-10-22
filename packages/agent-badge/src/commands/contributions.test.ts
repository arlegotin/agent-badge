import { afterEach, expect, test, vi } from 'vitest';
import { mkdir, writeFile, readFile, symlink, readdir, chmod } from 'node:fs/promises';
import * as files from 'node:fs/promises';
import { join } from 'node:path';
import { createBareRemoteFixture, protocolObservationFixture, snapshotUserCheckout } from '@agent-badge/testkit';
import type { GitFixture } from '@agent-badge/testkit';
import * as core from '@legotin/agent-badge-core';
import { runContributeCommand } from './contribute.js';
import { readAcceptedContributions, readContributionFile, runImportCommand } from './import.js';
vi.mock('node:fs/promises',async () => { const actual = await vi.importActual<typeof files>('node:fs/promises'); return {...actual,open:vi.fn(actual.open)}; });
const repositoryId = '12345678-1234-4234-8234-123456789abc';
const policy = { schemaVersion: 1 as const, repositoryId, normalizationVersion: 1 as const, discovery: 'auto' as const, disabledProviders: [], badge: { label: 'Usage', metric: 'tokens' as const } };
const meta = { schemaVersion: 2 as const, protocolVersion: 1 as const, repositoryId, normalizationVersion: 1 as const, catalogVersion: 1, catalogHash: core.catalogHash(core.defaultCatalog), policy };
const record = core.sanitizeObservation(protocolObservationFixture(), policy);
const fixtures: GitFixture[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(fixtures.splice(0).map(f => f.cleanup())); });
async function fixture() { const f = await createBareRemoteFixture(); fixtures.push(f); return f; }

test('contribute writes only immutable managed envelope without staging or committing', async () => {
 const f = await fixture(), cwd = f.clones[0];
 const repository = await core.resolveRepository(cwd), store = await core.openStore(repository, { processNamespace: async () => 'synthetic' });
 const before = await snapshotUserCheckout(cwd);
 const result = await runContributeCommand({ cwd, meta, records: [record] });
 expect(result.path).toMatch(/^\.agent-badge\/contributions\/[a-f0-9]{64}\.json$/);
 expect(await readFile(join(cwd, result.path), 'utf8')).toBe(core.contributionBytes(result.envelope));
 const after = await snapshotUserCheckout(cwd);
 expect(after.head).toBe(before.head); expect(after.index).toEqual(before.index);
 expect(after.refs).toBe(before.refs); expect(after.headRef).toBe(before.headRef);
 expect(Object.keys(after.files).sort()).toEqual([...Object.keys(before.files),result.path].sort());
 for(const [path,contents] of Object.entries(before.files)) expect(after.files[path]).toEqual(contents);
 expect(await readdir(join(cwd, '.agent-badge/contributions'))).toHaveLength(1);
 expect((await runContributeCommand({ cwd, meta, records: [record] })).path).toBe(result.path);
 expect(await store.journal()).toEqual([]);
});

test('reads one validated file snapshot and rejects paths, changed bytes, symlinks and executables', async () => {
 const f = await fixture(), cwd = f.clones[0];
 const result = await runContributeCommand({ cwd, meta, records: [record] });
 const snapshot = await readContributionFile(cwd, result.path);
 await chmod(join(cwd,result.path),0o755);
 await expect(readContributionFile(cwd,result.path)).rejects.toThrow();
 await chmod(join(cwd,result.path),0o644);
 await writeFile(join(cwd, result.path), '{"private":"changed"}');
 expect(snapshot.records).toHaveLength(1);
 await expect(readContributionFile(cwd, result.path)).rejects.toThrow();
 await expect(readContributionFile(cwd, '../escape.json')).rejects.toThrow();
 const link = core.contributionPath(core.exportContribution({meta, records: []}));
 await symlink(join(cwd, result.path), join(cwd, link));
 await expect(readContributionFile(cwd, link)).rejects.toThrow();
});

test('only accepted default branch blobs import; unmerged/closed proposals do not affect upstream', async () => {
 const f = await fixture(), cwd = f.clones[0], repository = await core.resolveRepository(cwd);
 const binding = await core.bindRemote(repository, { repositoryId, declaredUrl: f.remote });
 if (binding.status !== 'bound') throw Error('fixture');
 const base = (await f.git(cwd, ['rev-parse', 'HEAD'])).trim();
 const branch = (await f.git(cwd, ['branch', '--show-current'])).trim();
 await f.git(cwd, ['checkout', '-b', 'proposal']);
 const result = await runContributeCommand({ cwd, meta, records: [record] });
 await f.git(cwd, ['add', result.path]); await f.git(cwd, ['commit', '-m', 'Sanitized contribution']);
 const proposal = (await f.git(cwd, ['rev-parse', 'HEAD'])).trim();
 expect(await readAcceptedContributions(repository, { ref: base, defaultBranch: branch, binding })).toEqual([]);
 await expect(readAcceptedContributions(repository, { ref: proposal, defaultBranch: branch, binding })).rejects.toThrow();
 await f.git(cwd,['update-ref',`refs/remotes/origin/${branch}`,proposal]);
 await expect(readAcceptedContributions(repository,{ref:proposal,defaultBranch:branch,binding})).rejects.toThrow();
 await f.git(cwd, ['checkout', branch]); await f.git(cwd, ['merge', '--ff-only', 'proposal']); await f.git(cwd, ['push', 'origin', branch]);
 await f.git(cwd, ['fetch', 'origin']);
 await writeFile(join(cwd, result.path), '{"changed":"worktree"}');
 const accepted = await readAcceptedContributions(repository, { ref: proposal, defaultBranch: branch, binding });
 expect(accepted).toHaveLength(1); expect(accepted[0].records).toHaveLength(1);
});


test('interrupted export leaves no partial immutable receipt blocking a retry', async () => {
 const f = await fixture(), cwd = f.clones[0];
 const original = (await vi.importActual<typeof files>('node:fs/promises')).open;
 vi.mocked(files.open).mockImplementation(async (...args: Parameters<typeof files.open>) => {
   const handle = await original(...args);
   const write = handle.writeFile.bind(handle);
   handle.writeFile = async () => { await write('partial'); throw new Error('synthetic disk failure'); };
   return handle;
 });
 await expect(runContributeCommand({cwd,meta,records:[record]})).rejects.toThrow('synthetic disk failure');
 expect(await readdir(join(cwd,'.agent-badge/contributions'))).toEqual([]);
 vi.mocked(files.open).mockImplementation(original);
 const retry = await runContributeCommand({cwd,meta,records:[record]});
 expect((await readContributionFile(cwd,retry.path)).records).toHaveLength(1);
});


test('trusted accepted import performs one shared transaction without running tracked launcher or lifecycle code', async () => {
 const f = await fixture(), cwd = f.clones[0], repository = await core.resolveRepository(cwd);
 const binding = await core.bindRemote(repository,{repositoryId,declaredUrl:f.remote});
 const store = await core.openStore(repository,{processNamespace:async()=> 'synthetic'});
 await core.syncUsage({repository,binding,store,collect:'none',initialize:{meta,catalog:core.defaultCatalog},signal:AbortSignal.timeout(20000),deadline:Date.now()+20000});
 const contribution = await runContributeCommand({cwd,meta,records:[record]});
 await writeFile(join(cwd,'package.json'),'{"scripts":{"postinstall":"touch ROOT_EXECUTED"}}');
 await writeFile(join(cwd,'.agent-badge/run.cjs'),'require("node:fs").writeFileSync("LAUNCHER_EXECUTED","unsafe")');
 await f.git(cwd,['add',contribution.path,'package.json','.agent-badge/run.cjs']); await f.git(cwd,['commit','-m','Accept contribution data']); await f.git(cwd,['push','origin','HEAD']);
 const acceptedRef = (await f.git(cwd,['rev-parse','HEAD'])).trim();
 await f.git(cwd,['commit','--allow-empty','-m','Later accepted default branch work']); await f.git(cwd,['push','origin','HEAD']);
 const before = await snapshotUserCheckout(cwd);
 const result = await runImportCommand({cwd,acceptedRef,defaultBranch:'main',repositoryId,repositoryUrl:f.remote});
 expect(result.status).toBe('synced');
 expect('accepted' in result && result.accepted?.ledger.knownTokens).toBe('140');
 expect(await snapshotUserCheckout(cwd)).toEqual(before);
 expect(await f.git(cwd,['for-each-ref','--format=%(refname)','refs/agent-badge/imports'])).toBe('');
 await expect(readFile(join(cwd,'ROOT_EXECUTED'))).rejects.toThrow(); await expect(readFile(join(cwd,'LAUNCHER_EXECUTED'))).rejects.toThrow();
 expect((await runImportCommand({cwd,acceptedRef,defaultBranch:'main',repositoryId,repositoryUrl:f.remote})).status).toBe('unchanged');
});
