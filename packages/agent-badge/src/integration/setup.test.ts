import { afterEach, expect, test } from 'vitest';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBareRemoteFixture } from '@agent-badge/testkit';
import type { GitFixture } from '@agent-badge/testkit';
import { planSetup, applySetup } from './setup.js';
import { loadActivation, checkActivation } from './runtime.js';

const fixtures: GitFixture[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(f => f.cleanup())); });
async function fixture() { const f = await createBareRemoteFixture(); fixtures.push(f); return f; }
const version = '1.1.20';
function pin() { return { manifest: JSON.stringify({ name: 'agent-badge-runtime', private: true, dependencies: { '@legotin/agent-badge': version } }), lock: JSON.stringify({ name: 'agent-badge-runtime', lockfileVersion: 3, packages: { '': { name: 'agent-badge-runtime', dependencies: { '@legotin/agent-badge': version } }, 'node_modules/@legotin/agent-badge': { version, resolved: 'https://registry.npmjs.org/@legotin/agent-badge/-/agent-badge-1.1.20.tgz', integrity: 'sha512-c3ludGhldGlj' } } }) }; }
async function install(directory: string) {
  const root = join(directory, 'node_modules/@legotin/agent-badge'); await mkdir(join(root, 'dist/cli'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@legotin/agent-badge', version }));
  await writeFile(join(root, 'dist/cli/main.js'), 'process.stdout.write("fixture-runtime\\n")');
  await mkdir(join(root, 'dist/integration'), { recursive: true });
  await writeFile(join(root, 'dist/integration/runtime.js'), 'export const fixture = true;');
  await writeFile(join(root, 'dist/integration/runtime-worker.js'), 'export const fixture = true;');
}
const options = { nodeVersion: '24.0.0', runtimeVersion: version, resolvePin: async () => pin(), installRuntime: install, runInitialOperation: async () => ({ status: 'queued' as const, acknowledgedCount: 0, queuedCount: null, pendingReconciliation: true, exitCode: 1 }) };

test.each(['none', 'npm', 'pnpm', 'yarn', 'bun'])('plans owned nested setup from a %s repository without root package changes', async manager => {
  const f = await fixture(), cwd = f.clones[0];
  if (manager !== 'none') { await writeFile(join(cwd, 'package.json'), '{"scripts":{"postinstall":"keep"}}\n'); await writeFile(join(cwd, manager + '.lock'), 'keep'); }
  const before = await readdir(cwd); await mkdir(join(cwd, 'nested'));
  const plan = await planSetup({ ...options, cwd: join(cwd, 'nested'), declaredUrl: 'https://github.com/example/repo' });
  expect(plan.changes.map(c => c.path)).toEqual(expect.arrayContaining(['.agent-badge/config.json', '.agent-badge/run.cjs', '.agent-badge/runtime/package.json', '.agent-badge/runtime/package-lock.json', '.agent-badge/ownership.json', 'README.md']));
  expect(plan.changes.some(c => c.path === 'package.json')).toBe(false);
  expect((await readdir(cwd)).sort()).toEqual([...before, 'nested'].sort());
  const result = await applySetup(plan);
  expect(result.status).toBe('queued');
  const activation = await loadActivation(plan.repository.privateDir);
  expect(activation?.runtimeVersion).toBe(version); expect(activation?.repositoryId).toBe(plan.declaration.repositoryId);
  expect(await readFile(join(cwd, 'README.md'), 'utf8')).toContain('agent-badge/data');
  if (manager !== 'none') expect(await readFile(join(cwd, 'package.json'), 'utf8')).toBe('{"scripts":{"postinstall":"keep"}}\n');
});

test('repeated setup reuses exact pin and approved runtime and preserves private choices', async () => {
  const f = await fixture(), cwd = f.clones[0];
  const first = await planSetup({ ...options, cwd, declaredUrl: 'https://github.com/example/repo', privatePolicy: { remoteAliases: ['https://github.com/example/repo'], mappings: [{ cwd, repositoryId: '12345678-1234-4234-8234-123456789abc' }] } });
  await applySetup(first);
  const second = await planSetup({ ...options, cwd });
  expect(second.changes).toEqual([]); expect(second.lockHash).toBe(first.lockHash);
  await applySetup(second);
  expect((await loadActivation(first.repository.privateDir))?.privatePolicy.mappings).toHaveLength(1);
  expect((await readFile(join(cwd, 'README.md'), 'utf8')).match(/<!-- agent-badge:start -->/g)).toHaveLength(1);
});

test('setup installs repository-local hooks and provider wakeups without claiming native trust', async () => {
  const f = await fixture(), cwd = f.clones[0];
  const plan = await planSetup({ ...options, cwd, declaredUrl: 'https://github.com/example/repo' });
  const result = await applySetup(plan);
  expect(result.hooks.status).toBe('installed'); expect(result.agentHooks.status).toBe('configured-needs-trust');
  expect(JSON.parse(await readFile(join(cwd, '.codex/hooks.json'), 'utf8')).hooks.SubagentStop).toHaveLength(1);
  const instructions = await readFile(join(cwd, '.agent-badge/README.md'), 'utf8');
  expect(instructions).toMatch(/native.*trust/); expect(instructions).toMatch(/Windows/);
});

test('an installed runtime missing its supervised activation worker is never approved', async () => {
  const f = await fixture();
  const { rm } = await import('node:fs/promises');
  const plan = await planSetup({ ...options, cwd: f.clones[0], declaredUrl: 'https://github.com/example/repo', installRuntime: async dir => { await install(dir); await rm(join(dir, 'node_modules/@legotin/agent-badge/dist/integration/runtime-worker.js'), { force: true }); } });
  await expect(applySetup(plan)).rejects.toThrow(/installation unavailable/);
  expect(await loadActivation(plan.repository.privateDir)).toBeNull();
});

test('offline or interrupted installation leaves no approved activation and resumes explicitly', async () => {
  const f = await fixture();
  const plan = await planSetup({ ...options, cwd: f.clones[0], declaredUrl: 'https://github.com/example/repo', installRuntime: async directory => { await writeFile(join(directory, 'partial'), 'interrupted'); throw new Error('offline'); } });
  await expect(applySetup(plan)).rejects.toThrow('Runtime installation unavailable');
  expect(await loadActivation(plan.repository.privateDir)).toBeNull();
  await applySetup(await planSetup({ ...options, cwd: f.clones[0], declaredUrl: 'https://github.com/example/repo' }));
  expect(await checkActivation({ cwd: f.clones[0] })).toMatchObject({ status: 'approved' });
});

test('rejects nonexact pins and unsupported Node before discovery or installation', async () => {
  await expect(planSetup({ ...options, cwd: '/does-not-exist', nodeVersion: '22.14.0' })).rejects.toThrow('Node 24 or 26');
  await expect(planSetup({ ...options, cwd: '/does-not-exist', runtimeVersion: '^1.1.20' })).rejects.toThrow('exact');
});

test('automatic activation survives older branches and linked worktrees but suspends changed pins', async () => {
  const f = await fixture(), cwd = f.clones[0];
  const before = (await f.git(cwd, ['rev-parse', 'HEAD'])).trim();
  const plan = await planSetup({ ...options, cwd, declaredUrl: 'https://github.com/example/repo' }); await applySetup(plan);
  await f.git(cwd, ['add', '.agent-badge', 'README.md']); await f.git(cwd, ['commit', '-m', 'Synthetic setup']);
  const linked = join(f.root, 'linked'); await f.git(cwd, ['worktree', 'add', '-b', 'linked', linked]);
  expect(await checkActivation({ cwd: linked })).toMatchObject({ status: 'approved', privateDir: plan.repository.privateDir });
  await f.git(cwd, ['checkout', before]);
  expect(await checkActivation({ cwd })).toMatchObject({ status: 'approved' });
  await f.git(cwd, ['checkout', 'main']);
  const manifestPath = join(cwd, '.agent-badge/runtime/package.json'); await writeFile(manifestPath, (await readFile(manifestPath, 'utf8')) + '\n');
  expect(await checkActivation({ cwd })).toEqual({ status: 'suspended' });
  // A separate clone has no consent, even when declaration and lock are identical.
  await f.git(cwd, ['push', 'origin', 'HEAD']); await f.git(f.clones[1], ['pull', '--ff-only']);
  expect(await checkActivation({ cwd: f.clones[1] })).toEqual({ status: 'inactive' });
});

test('missing runtime requires explicit repair and ordinary launcher calls never install', async () => {
  const f = await fixture(), cwd = f.clones[0];
  const plan = await planSetup({ ...options, cwd, declaredUrl: 'https://github.com/example/repo' }); await applySetup(plan);
  const { rm } = await import('node:fs/promises'); await rm(join(plan.repository.privateDir, 'runtime', plan.lockHash), { recursive: true });
  expect(await checkActivation({ cwd })).toEqual({ status: 'missing-runtime' });
  await applySetup(await planSetup({ ...options, cwd }));
  expect(await checkActivation({ cwd })).toMatchObject({ status: 'approved' });
});

test('setup preserves first-initialization intent and UUID across a queued retry', async () => {
  const f = await fixture(), cwd = f.clones[0];
  const first = await planSetup({ ...options, cwd, declaredUrl: 'https://github.com/example/repo' }); await applySetup(first);
  const retry = await planSetup({ ...options, cwd });
  expect(retry.initialize).toBe(true); expect(retry.declaration.repositoryId).toBe(first.declaration.repositoryId);
  expect((await loadActivation(first.repository.privateDir))?.initializeAllowed).toBe(true);
});

test('automatic membership inventory is private and never blanket historical attribution', async () => {
  const f = await fixture(), cwd = f.clones[0], linked = join(f.root, 'temporary-worktree');
  await f.git(cwd, ['worktree', 'add', '-b', 'temporary', linked]);
  const plan = await planSetup({ ...options, cwd, declaredUrl: 'https://github.com/example/repo' }); await applySetup(plan);
  const activation = await loadActivation(plan.repository.privateDir);
  expect(activation?.worktreeInventory.map(w => w.path)).toContain(linked);
  expect(activation?.privatePolicy.verifiedWorktrees).toEqual([]);
  await f.git(cwd, ['worktree', 'remove', linked]);
  const { mkdir, rm } = await import('node:fs/promises'); await mkdir(linked); await f.git(linked, ['init']); await rm(linked, { recursive: true });
  const { collectUsage, openStore } = await import('@legotin/agent-badge-core');
  const { createCodexAdapter } = await import('../../../core/src/providers/codex/adapter.js');
  const { codexRollout } = await import('@agent-badge/testkit');
  const root = join(f.root, 'codex-history'); await mkdir(join(root, 'sessions'), { recursive: true });
  await writeFile(join(root, 'sessions', 'new.jsonl'), codexRollout({ single: true }).replaceAll('/synthetic/repo', linked));
  const store = await openStore(plan.repository);
  await collectUsage({ repository: plan.repository, store, policy: plan.declaration.policy, privatePolicy: activation!.privatePolicy, signal: AbortSignal.timeout(5000), adapters: { codex: createCodexAdapter({ environment: {}, defaultHome: root }) } });
  expect(await store.pending()).toEqual([]);
  expect((await store.journal()).flatMap(e => e.attribution?.decisions ?? []).every(d => d.status !== 'included')).toBe(true);
});

test('rejects malformed exact lock before any installation and does not follow tracked directory symlinks', async () => {
  const f = await fixture(), cwd = f.clones[0];
  await expect(planSetup({ ...options, cwd, declaredUrl: 'https://github.com/example/repo', resolvePin: async () => ({ ...pin(), lock: JSON.stringify({ lockfileVersion: 3, packages: {} }) }) })).rejects.toThrow('Invalid exact');
  const { symlink } = await import('node:fs/promises'); await symlink(f.clones[1], join(cwd, '.agent-badge'));
  await expect(planSetup({ ...options, cwd, declaredUrl: 'https://github.com/example/repo' })).rejects.toThrow('Unsafe setup directory');
  expect(await readdir(f.clones[1])).not.toContain('local.json');
});

test('owned-file conflicts and concurrent plan edits fail without approving changes', async () => {
  const f = await fixture(), cwd = f.clones[0];
  const plan = await planSetup({ ...options, cwd, declaredUrl: 'https://github.com/example/repo' });
  await writeFile(join(cwd, 'README.md'), 'Changed after planning\n');
  await expect(applySetup(plan)).rejects.toThrow('changed after planning');
  expect(await loadActivation(plan.repository.privateDir)).toBeNull();
  const fresh = await planSetup({ ...options, cwd, declaredUrl: 'https://github.com/example/repo' }); await applySetup(fresh);
  await writeFile(join(cwd, '.agent-badge/run.cjs'), 'unowned executable');
  await expect(planSetup({ ...options, cwd })).rejects.toThrow('modified');
});

test('setup repairs tracked policy from locally accepted metadata without promoting stale branch policy', async () => {
  const f = await fixture(), cwd = f.clones[0];
  const initial = await planSetup({ ...options, cwd, target: 'origin', declaredUrl: 'https://github.com/example/repo' }); await applySetup(initial);
  const core = await import('@legotin/agent-badge-core'), store = await core.openStore(initial.repository);
  const meta = { schemaVersion: 2 as const, protocolVersion: 1 as const, repositoryId: initial.declaration.repositoryId, normalizationVersion: 1 as const, catalogVersion: 1, catalogHash: core.catalogHash(core.defaultCatalog), policy: initial.declaration.policy };
  const sync = { repository: initial.repository, store, binding: initial.activation.binding, collect: 'none' as const, signal: AbortSignal.timeout(15000), deadline: Date.now() + 15000 };
  expect((await core.syncUsage({ ...sync, initialize: { meta, catalog: core.defaultCatalog } })).status).toBe('synced');
  const changed = { ...meta, policy: { ...meta.policy, badge: { ...meta.policy.badge, label: 'Accepted label' } } };
  expect((await core.configureRepository({ ...sync, expectedMetadataRevision: core.metadataRevision(meta), meta: changed, catalog: core.defaultCatalog, writeDeclaration: async () => { throw new Error('interrupted local write'); } })).status).toBe('drift');
  const repair = await planSetup({ ...options, cwd });
  expect(repair.declaration.policy.badge.label).toBe('Accepted label');
  expect(repair.activation.capturePolicy.badge.label).toBe('Accepted label');
});

test('accepted declaration callback atomically updates only owned policy and honors cancellation', async () => {
  const f = await fixture(), cwd = f.clones[0];
  const plan = await planSetup({ ...options, cwd, declaredUrl: 'https://github.com/example/repo' }); await applySetup(plan);
  const { writeAcceptedDeclaration } = await import('./setup.js');
  expect(typeof writeAcceptedDeclaration).toBe('function');
  const core = await import('@legotin/agent-badge-core');
  const meta = { schemaVersion: 2 as const, protocolVersion: 1 as const, repositoryId: plan.declaration.repositoryId, normalizationVersion: 1 as const, catalogVersion: 1, catalogHash: core.catalogHash(core.defaultCatalog), policy: { ...plan.declaration.policy, badge: { ...plan.declaration.policy.badge, label: 'New accepted label' } } };
  const accepted = { meta } as Parameters<typeof writeAcceptedDeclaration>[1];
  const controller = new AbortController(); controller.abort();
  await expect(writeAcceptedDeclaration(plan.repository, accepted, controller.signal)).rejects.toThrow();
  expect(JSON.parse(await readFile(join(cwd, '.agent-badge/config.json'), 'utf8')).policy.badge.label).toBe('AI usage');
  await writeAcceptedDeclaration(plan.repository, accepted, AbortSignal.timeout(5000));
  const declaration = JSON.parse(await readFile(join(cwd, '.agent-badge/config.json'), 'utf8'));
  expect(declaration.policy.badge.label).toBe('New accepted label'); expect(declaration.runtimeVersion).toBe(version);
  expect(declaration.declaredUrl).toBe('https://github.com/example/repo');
});

test('a prunable Git registration is never automatic membership proof or tracked private data', async () => {
  const f = await fixture(), cwd = f.clones[0], missing = join(f.root, 'missing-worktree');
  await f.git(cwd, ['worktree', 'add', '-b', 'missing', missing]);
  const { rm } = await import('node:fs/promises'); await rm(missing, { recursive: true });
  const plan = await planSetup({ ...options, cwd, declaredUrl: 'https://github.com/example/repo' });
  expect(plan.repository.worktrees.find(w => w.path === missing)?.prunable).toBe(true);
  expect(plan.activation.worktreeInventory.map(w => w.path)).not.toContain(missing);
  expect(plan.activation.privatePolicy.verifiedWorktrees).toEqual([]);
  for (const change of plan.changes) expect(change.after).not.toContain(f.root);
});

test('repeated setup never silently rebinds changed routing through a remembered target name', async () => {
  const f = await fixture(), cwd = f.clones[0];
  const initial = await planSetup({ ...options, cwd, target: 'origin', declaredUrl: 'https://github.com/example/repo' }); await applySetup(initial);
  await f.git(cwd, ['remote', 'set-url', 'origin', 'https://github.com/example/fork']);
  const guarded = await planSetup({ ...options, cwd });
  expect(guarded.activation.binding.status).toBe('unbound');
  const rebound = await planSetup({ ...options, cwd, target: 'origin' });
  expect(rebound.activation.binding).toMatchObject({ status: 'bound', canonicalPushUrl: 'github.com/example/fork' });
});

test.each(['config.json', 'run.cjs'])('private first-setup intent survives interruption at tracked %s without authorizing a clone', async obstructed => {
  const f = await fixture(), cwd = f.clones[0];
  const first = await planSetup({ ...options, cwd, declaredUrl: 'https://github.com/example/repo', installRuntime: async directory => {
    await install(directory); await mkdir(join(cwd, '.agent-badge', obstructed), { recursive: true });
  } });
  await expect(applySetup(first)).rejects.toThrow();
  expect(await loadActivation(first.repository.privateDir)).toBeNull();
  const intent = JSON.parse(await readFile(join(first.repository.privateDir, 'setup-intent.json'), 'utf8'));
  expect(intent).toMatchObject({ repositoryId: first.declaration.repositoryId, initializeAllowed: true });
  const { rm } = await import('node:fs/promises'); await rm(join(cwd, '.agent-badge', obstructed), { recursive: true });
  if (obstructed === 'run.cjs') {
    await f.git(cwd, ['add', '.agent-badge/config.json']); await f.git(cwd, ['commit', '-m', 'Synthetic interrupted declaration']); await f.git(cwd, ['push', 'origin', 'HEAD']); await f.git(f.clones[1], ['pull', '--ff-only']);
    const cloned = await planSetup({ ...options, cwd: f.clones[1] });
    expect(cloned.declaration.repositoryId).toBe(first.declaration.repositoryId); expect(cloned.initialize).toBe(false);
  }
  const retry = await planSetup({ ...options, cwd, declaredUrl: 'https://github.com/example/repo' });
  expect(retry.declaration.repositoryId).toBe(first.declaration.repositoryId); expect(retry.initialize).toBe(true);
  let initializedId: string | undefined;
  retry.options.runInitialOperation = async request => { initializedId = request.initialize?.meta.repositoryId; return options.runInitialOperation(); };
  await applySetup(retry); expect(initializedId).toBe(first.declaration.repositoryId);
});


test('private first-setup intent refuses a symlink record or private directory', async () => {
  const f = await fixture(), cwd = f.clones[0], privateDir = join(cwd, '.git/agent-badge');
  const { symlink, rm } = await import('node:fs/promises');
  await mkdir(privateDir); await writeFile(join(f.root, 'external-intent'), 'keep external intent');
  await symlink(join(f.root, 'external-intent'), join(privateDir, 'setup-intent.json'));
  await expect(planSetup({ ...options, cwd, declaredUrl: 'https://github.com/example/repo' })).rejects.toThrow('Unsafe setup file');
  await rm(privateDir, { recursive: true }); await symlink(f.clones[1], privateDir);
  await expect(planSetup({ ...options, cwd, declaredUrl: 'https://github.com/example/repo' })).rejects.toThrow('Unsafe private setup directory');
  expect(await readFile(join(f.root, 'external-intent'), 'utf8')).toBe('keep external intent');
});
