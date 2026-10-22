import { mkdtemp, mkdir, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hostname } from 'node:os';
import { afterEach, describe, expect, test } from 'vitest';
import { protocolObservationFixture, runStorageFixtureProcess, createBareRemoteFixture, snapshotUserCheckout } from '@agent-badge/testkit';
import type { Checkpoint, ScanBatch, SourceDescriptor } from '../domain/capabilities.js';
import type { RepositoryContext } from '../git/context.js';
import { sanitizeObservation } from '../ledger/sanitize.js';
import { recordHash } from '../ledger/canonical-json.js';
import { openStore as openNativeStore } from './store.js';
const openStore = (ctx: RepositoryContext) => openNativeStore(ctx, { processNamespace: async () => 'synthetic-namespace' });
import { resolveRepository } from '../git/context.js';

const repositoryId = '12345678-1234-4234-8234-123456789abc';
const policy = { schemaVersion: 1 as const, repositoryId, normalizationVersion: 1 as const,
  discovery: 'auto' as const, disabledProviders: [], badge: { label: 'AI usage', metric: 'tokens' as const } };
const roots: string[] = [];
async function context(): Promise<RepositoryContext> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'agent-badge-storage-'))); roots.push(root);
  const commonDir = join(root, '.git'); await mkdir(commonDir);
  return { worktreeRoot: root, gitDir: commonDir, commonDir, privateDir: join(commonDir, 'agent-badge'),
    hooksPath: join(commonDir, 'hooks'), superprojectRoot: null, worktrees: [],
    head: { kind: 'unborn', ref: 'refs/heads/main' }, shallow: false };
}
function fixture(generation = 'generation-1', offset = 10) {
  const observation = protocolObservationFixture();
  observation.source = { ...observation.source, instanceKey: 'synthetic-instance', sourceIdentity: '/synthetic/source', generation };
  const source: SourceDescriptor = { provider: 'codex', root: '/synthetic', schema: observation.source.sourceSchema,
    instanceKey: observation.source.instanceKey, sourceIdentity: observation.source.sourceIdentity,
    generation, readerVersion: '1' };
  const checkpoint: Checkpoint = { schemaVersion: 1, provider: 'codex', instanceKey: source.instanceKey,
    sourceIdentity: source.sourceIdentity, sourceGeneration: generation, sourceSchema: source.schema,
    readerVersion: '1', normalizationVersion: 1, repositoryId, attributionPolicyHash: 'a'.repeat(64),
    continuation: null, cursor: { offset, size: offset, prefixHash: 'b'.repeat(64), incompleteTail: '' } };
  const batch: ScanBatch = { source, observations: [observation], nextCheckpoint: checkpoint, outcome: 'complete', diagnostics: [] };
  // Shared policy fixture is validated by sanitizer, independent from storage.
  const record = sanitizeObservation(observation, policy as never);
  return { source, batch, record };
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe('durable repository store', () => {
  test('restart replays once by public hash and retains private metadata after acknowledgement', async () => {
    const ctx = await context(); const { source, batch, record } = fixture();
    const store = await openStore(ctx);
    await store.commitBatch(source, batch, [record]);
    await store.commitBatch(source, batch, [record]);
    const restarted = await openStore(ctx);
    expect(await restarted.pending()).toEqual([record]);
    expect((await restarted.checkpoint(source, batch.nextCheckpoint))?.cursor.offset).toBe(10);
    await restarted.acknowledge(['f'.repeat(64)]);
    expect(await restarted.pending()).toEqual([record]);
    await restarted.acknowledge([recordHash(record)]);
    expect(await (await openStore(ctx)).pending()).toEqual([]);
    expect((await restarted.journal()).flatMap(entry => entry.observations)).toHaveLength(2);
  });

  test('unknown confirmation hashes cannot pre-acknowledge records collected later', async () => {
    const ctx = await context(); const store = await openStore(ctx); const f = fixture();
    await store.acknowledge([recordHash(f.record)]);
    await store.commitBatch(f.source, f.batch, [f.record]);
    expect(await store.pending()).toEqual([f.record]);
  });

  test('checkpoint reuse requires matching normalization, repository, policy and reader authority', async () => {
    const ctx = await context(); const store = await openStore(ctx); const f = fixture();
    await store.commitBatch(f.source, f.batch, [f.record]);
    expect(await store.checkpoint(f.source, { ...f.batch.nextCheckpoint, normalizationVersion: 2 } as never)).toBeNull();
    expect(await store.checkpoint(f.source, { ...f.batch.nextCheckpoint, attributionPolicyHash: 'c'.repeat(64) })).toBeNull();
    expect(await store.checkpoint(f.source, { ...f.batch.nextCheckpoint, repositoryId: '12345678-1234-4234-8234-123456789abd' })).toBeNull();
    expect(await store.checkpoint({ ...f.source, readerVersion: 'future' }, f.batch.nextCheckpoint)).toBeNull();
    expect((await store.checkpoint(f.source, f.batch.nextCheckpoint))?.cursor.offset).toBe(10);
  });

  test('deleting malformed disposable cache never clears pending durable data', async () => {
    const ctx = await context(); const store = await openStore(ctx); const f = fixture();
    await store.commitBatch(f.source, f.batch, [f.record]);
    await writeFile(join(ctx.privateDir, 'cache', 'broken.json'), '{');
    await store.invalidateCache();
    expect(await store.pending()).toEqual([f.record]);
    expect(await readdir(join(ctx.privateDir, 'cache'))).toEqual([]);
  });

  test('source replacement resets checkpoint without deleting old pending evidence', async () => {
    const ctx = await context(); const store = await openStore(ctx); const old = fixture(); const next = fixture('generation-2', 2);
    await store.commitBatch(old.source, old.batch, [old.record]);
    expect(await store.checkpoint(next.source, next.batch.nextCheckpoint)).toBeNull();
    await store.commitBatch(next.source, next.batch, [next.record]);
    expect((await store.checkpoint(next.source, next.batch.nextCheckpoint))?.cursor.offset).toBe(2);
    expect(await store.pending()).toEqual([old.record]);
    expect(await store.journal()).toHaveLength(2);
  });

  test('rejects stale generations and cursor regression while preserving previous evidence', async () => {
    const ctx = await context(); const store = await openStore(ctx);
    const old = fixture(); const next = fixture('generation-2', 20);
    await store.commitBatch(old.source, old.batch, [old.record]);
    await store.commitBatch(next.source, next.batch, [next.record]);
    await expect(store.commitBatch(old.source, old.batch, [old.record])).rejects.toThrow('invalid-batch');
    const regressed = fixture('generation-2', 3);
    await expect(store.commitBatch(regressed.source, regressed.batch, [regressed.record])).rejects.toThrow('invalid-batch');
    expect((await store.checkpoint(next.source, next.batch.nextCheckpoint))?.cursor.offset).toBe(20);
    expect(await store.journal()).toHaveLength(2);
  });

  test('caller mutations after commit cannot alter durable observations or records', async () => {
    const ctx = await context(); const store = await openStore(ctx); const f = fixture();
    const operation = store.commitBatch(f.source, f.batch, [f.record]);
    f.record.meters[0].total = 999;
    f.batch.observations[0].nativeUnitId = 'changed-after-call';
    await operation;
    expect((await store.pending())[0]).toHaveProperty('meters.0.total', 140);
    expect((await store.journal())[0].observations[0].nativeUnitId).not.toBe('changed-after-call');
  });

  test('missing source preserves last valid observation and checkpoint', async () => {
    const ctx = await context(); const store = await openStore(ctx); const f = fixture();
    await store.commitBatch(f.source, f.batch, [f.record]);
    await store.commitBatch(f.source, { ...f.batch, observations: [], outcome: 'unavailable', nextCheckpoint: { ...f.batch.nextCheckpoint, cursor: { ...f.batch.nextCheckpoint.cursor, offset: 0 } } }, []);
    expect(await store.pending()).toEqual([f.record]);
    expect((await store.checkpoint(f.source, f.batch.nextCheckpoint))?.cursor.offset).toBe(10);
  });

  test('rejects unsafe public fields and mismatched source/checkpoint before persisting', async () => {
    const ctx = await context(); const store = await openStore(ctx); const f = fixture();
    await expect(store.commitBatch(f.source, f.batch, [{ ...f.record, prompt: 'private' } as never])).rejects.toThrow();
    await expect(store.commitBatch(f.source, { ...f.batch, nextCheckpoint: { ...f.batch.nextCheckpoint, sourceGeneration: 'wrong' } }, [f.record])).rejects.toThrow();
    expect(await store.pending()).toEqual([]);
    expect(await store.journal()).toEqual([]);
  });

  test('private directory/file modes and symlink refusal protect discovery metadata', async () => {
    const ctx = await context(); const store = await openStore(ctx); const f = fixture();
    await store.commitBatch(f.source, f.batch, [f.record]);
    if (process.platform !== 'win32') {
      expect((await stat(ctx.privateDir)).mode & 0o777).toBe(0o700);
      const names = await readdir(join(ctx.privateDir, 'journal'));
      expect((await stat(join(ctx.privateDir, 'journal', names[0]))).mode & 0o777).toBe(0o600);
    }
    const other = await context(); await symlink(ctx.privateDir, other.privateDir);
    await expect(openStore(other)).rejects.toThrow();
    await rm(join(ctx.privateDir, 'cache'), { recursive: true });
    await symlink(ctx.worktreeRoot, join(ctx.privateDir, 'cache'));
    await expect(store.invalidateCache()).rejects.toThrow();
    expect(await stat(ctx.worktreeRoot)).toBeDefined();
  });

  test('parallel mutations inside one lock remain serialized', async () => {
    const ctx = await context(); const store = await openStore(ctx); const f = fixture();
    await store.withLock(AbortSignal.timeout(1000), async () => {
      await Promise.all(Array.from({ length: 5 }, () => store.commitBatch(f.source, f.batch, [f.record])));
    });
    expect((await store.journal()).map(entry => entry.sequence)).toEqual([1, 2, 3, 4, 5]);
  });

  test('future or corrupt durable journals fail closed with a path-free diagnostic', async () => {
    const ctx = await context(); const store = await openStore(ctx); const f = fixture();
    await store.commitBatch(f.source, f.batch, [f.record]);
    const path = join(ctx.privateDir, 'journal', (await readdir(join(ctx.privateDir, 'journal')))[0]);
    const original = JSON.parse(await readFile(path, 'utf8'));
    await writeFile(path, JSON.stringify({ ...original, schemaVersion: 999 }));
    await expect((await openStore(ctx)).pending()).rejects.toThrow('unsupported-durable-schema');
    await writeFile(path, '{');
    await expect(store.pending()).rejects.toThrow('invalid-durable-data');
  });

  test('lock release errors remain path-free and leave a conservatively recoverable owner', async () => {
    const ctx = await context(); const prelude = await childFixture(ctx);
    const result = await runStorageFixtureProcess(project, prelude + `
      const unlink = fs.default.unlink.bind(fs.default);
      fs.default.unlink = path => String(path).endsWith('/operation.lock') ? Promise.reject(Object.assign(new Error('private/path/secret.ts'), { code: 'EACCES' })) : unlink(path);
      try { await store.commitBatch(source, batch, [record]); } catch (error) { console.log(error.message); process.exitCode = 4; }
    `);
    expect(result.code).toBe(4); expect(result.stdout.trim()).toBe('store-permission');
    expect(await (await openStore(ctx)).pending()).toHaveLength(1);
  });

  test('queued operations drain before an explicit owner releases the common lock', async () => {
    const ctx = await context(); const prelude = await childFixture(ctx);
    const result = await runStorageFixtureProcess(project, prelude + `
      const rename = fs.default.rename.bind(fs.default);
      fs.default.rename = async (from, to) => { if (String(to).includes('/journal/')) await new Promise(r => setTimeout(r, 200)); return rename(from, to); };
      let queued;
      await store.withLock(AbortSignal.timeout(1000), async () => { queued = store.commitBatch(source, batch, [record]); });
      console.log((await fs.readdir(ctx.privateDir + '/journal')).filter(name => name.endsWith('.json')).length);
      await queued;
    `);
    expect(result.code).toBe(0); expect(result.stdout.trim()).toBe('1'); expect(result.stderr).toBe('');
  });

  test('invalid durable source/checkpoint relationships fail closed on replay', async () => {
    const ctx = await context(); const store = await openStore(ctx); const f = fixture();
    await store.commitBatch(f.source, f.batch, [f.record]);
    const path = join(ctx.privateDir, 'journal', (await readdir(join(ctx.privateDir, 'journal')))[0]);
    const original = JSON.parse(await readFile(path, 'utf8'));
    await writeFile(path, JSON.stringify({ ...original, checkpoint: { ...original.checkpoint, sourceGeneration: 'unrelated' } }));
    await expect(store.pending()).rejects.toThrow('invalid-durable-data');
  });

  test('future durable acknowledgements block new commits without touching journal', async () => {
    const ctx = await context(); const store = await openStore(ctx); const f = fixture();
    await writeFile(join(ctx.privateDir, 'acknowledged.json'), JSON.stringify({ schemaVersion: 9, hashes: [] }));
    await expect(store.commitBatch(f.source, f.batch, [f.record])).rejects.toThrow('unsupported-durable-schema');
    expect(await readdir(join(ctx.privateDir, 'journal'))).toEqual([]);
  });

  test('derived checkpoint corruption cannot put the cursor ahead of the durable journal', async () => {
    const ctx = await context(); const store = await openStore(ctx); const f = fixture();
    await store.commitBatch(f.source, f.batch, [f.record]);
    const path = join(ctx.privateDir, 'checkpoints', (await readdir(join(ctx.privateDir, 'checkpoints')))[0]);
    await writeFile(path, JSON.stringify({ schemaVersion: 999, cursor: 99999999 }));
    expect((await store.checkpoint(f.source, f.batch.nextCheckpoint))?.cursor.offset).toBe(10);
    await rm(join(ctx.privateDir, 'checkpoints'), { recursive: true });
    await mkdir(join(ctx.privateDir, 'checkpoints'));
    expect((await store.checkpoint(f.source, f.batch.nextCheckpoint))?.cursor.offset).toBe(10);
    expect(await store.pending()).toEqual([f.record]);
  });

  test('shared common directory serializes competing stores and supports explicit transaction lock', async () => {
    const ctx = await context(); const first = await openStore(ctx); const linked = await openStore({ ...ctx, worktreeRoot: join(ctx.worktreeRoot, 'linked'), gitDir: join(ctx.commonDir, 'worktrees', 'linked') });
    const a = fixture(); const b = fixture('generation-2', 20);
    await Promise.all([first.commitBatch(a.source, a.batch, [a.record]), linked.commitBatch(b.source, b.batch, [b.record])]);
    expect(await first.journal()).toHaveLength(2);
    await first.withLock(AbortSignal.timeout(1000), async () => {
      expect(await first.pending()).toHaveLength(1);
      await first.acknowledge([recordHash(a.record)]);
      await expect(linked.withLock(AbortSignal.timeout(50), async () => undefined)).rejects.toThrow('store-busy');
    });
    expect(await linked.pending()).toEqual([]);
  });
});


const project = process.cwd();
const moduleUrl = pathToFileURL(join(project, 'packages/core/src/storage/store.ts')).href;
async function childFixture(ctx: RepositoryContext) {
  const f = fixture();
  const input = join(ctx.worktreeRoot, 'synthetic-input.json');
  await writeFile(input, JSON.stringify({ ctx, ...f }));
  return `const fs = await import('node:fs/promises');
    const { ctx, source, batch, record } = JSON.parse(await fs.readFile(${JSON.stringify(input)}, 'utf8'));
    const { openStore } = await import(${JSON.stringify(moduleUrl)});
    const store = await openStore(ctx, { processNamespace: async () => 'synthetic-namespace' });`;
}

describe('real process death and filesystem failures', () => {
  test.each([
    ['write', '/journal/.tmp-', 'exit-after', false],
    ['sync', '/journal/.tmp-', 'exit-after', false],
    ['rename', '/journal/', 'exit-after', true],
    ['sync', '/journal', 'exit-after', true],
    ['rename', '/checkpoints/', 'exit-before', true],
    ['rename', '/checkpoints/', 'exit-after', true]
  ] as const)('death at %s %s %s leaves only recoverable cursor (%s)', async (operation, pathIncludes, action, durable) => {
    const ctx = await context(); const prelude = await childFixture(ctx); const f = fixture();
    const killed = await runStorageFixtureProcess(project, prelude + '\nawait store.commitBatch(source, batch, [record]);', { operation, pathIncludes, action, pathEndsWith: pathIncludes === '/journal' });
    expect(killed.signal).toBe('SIGKILL'); expect(killed.stderr).toBe('');
    const store = await openStore(ctx);
    expect((await store.checkpoint(f.source, f.batch.nextCheckpoint))?.cursor.offset ?? null).toBe(durable ? 10 : null);
    expect(await store.pending()).toHaveLength(durable ? 1 : 0);
    await store.commitBatch(f.source, f.batch, [f.record]);
    expect(await store.pending()).toEqual([f.record]);
  });

  test('death before acknowledgement leaves submitted data pending for remote confirmation', async () => {
    const ctx = await context(); const prelude = await childFixture(ctx); const f = fixture();
    const killed = await runStorageFixtureProcess(project, prelude + `
      await store.commitBatch(source, batch, [record]);
      await store.acknowledge([${JSON.stringify(recordHash(f.record))}]);`,
      { operation: 'rename', pathIncludes: '/acknowledged.json', action: 'exit-before' });
    expect(killed.signal).toBe('SIGKILL');
    const store = await openStore(ctx); expect(await store.pending()).toEqual([f.record]);
    await store.acknowledge([recordHash(f.record)]);
    expect(await (await openStore(ctx)).pending()).toEqual([]);
    expect(await store.journal()).toHaveLength(1);
  });

  test.each(['ENOSPC', 'EACCES'] as const)('%s before journal durability cannot advance checkpoint', async action => {
    const ctx = await context(); const prelude = await childFixture(ctx); const f = fixture();
    const failed = await runStorageFixtureProcess(project, prelude + `
      try { await store.commitBatch(source, batch, [record]); } catch (error) { console.log(error.message); process.exitCode = 4; }`,
      { operation: 'write', pathIncludes: '/journal/.tmp-', action });
    expect(failed.code).toBe(4); expect(failed.stdout.trim()).toBe(action === 'ENOSPC' ? 'store-full' : 'store-permission');
    const store = await openStore(ctx); expect(await store.pending()).toEqual([]);
    expect(await store.checkpoint(f.source, f.batch.nextCheckpoint)).toBeNull();
  });

  test('checkpoint write failure retains durable outbox and journal checkpoint', async () => {
    const ctx = await context(); const prelude = await childFixture(ctx); const f = fixture();
    const failed = await runStorageFixtureProcess(project, prelude + `
      try { await store.commitBatch(source, batch, [record]); } catch (error) { console.log(error.message); process.exitCode = 4; }`,
      { operation: 'rename', pathIncludes: '/checkpoints/', action: 'ENOSPC' });
    expect(failed.code).toBe(4); expect(failed.stdout.trim()).toBe('store-full');
    const store = await openStore(ctx); expect(await store.pending()).toEqual([f.record]);
    expect((await store.checkpoint(f.source, f.batch.nextCheckpoint))?.cursor.offset).toBe(10);
  });

  test('competing child processes preserve both batches across a shared common directory', async () => {
    const ctx = await context(); const prelude = await childFixture(ctx);
    const results = await Promise.all(Array.from({ length: 4 }, () => runStorageFixtureProcess(project,
      prelude + '\nawait store.commitBatch(source, batch, [record]);')));
    expect(results.map(result => result.code)).toEqual([0, 0, 0, 0]);
    expect(results.map(result => result.stderr)).toEqual(['', '', '', '']);
    expect((await (await openStore(ctx)).journal()).map(entry => entry.sequence)).toEqual([1, 2, 3, 4]);
    expect(await (await openStore(ctx)).pending()).toHaveLength(1);
  });

  test('live owner remains protected and foreign or malformed owner exposes uncertainty', async () => {
    const ctx = await context(); const store = await openStore(ctx);
    const path = join(ctx.privateDir, 'locks', 'operation.lock');
    const owner = { schemaVersion: 1, host: hostname(), namespace: 'synthetic-namespace', pid: process.pid, token: '11111111-1111-4111-8111-111111111111', startedAt: 0 };
    for (const value of [JSON.stringify(owner), JSON.stringify({ ...owner, host: 'other-host.invalid' }), '{']) {
      await writeFile(path, value);
      const start = Date.now();
      try { await store.withLock(AbortSignal.timeout(60), async () => { throw new Error('must not acquire'); }); throw new Error('must be busy'); }
      catch (error) {
        expect((error as Error).message).toBe('store-busy');
        expect((error as { uncertainty: boolean }).uncertainty).toBe(value !== JSON.stringify(owner));
      }
      expect(Date.now() - start).toBeLessThan(700);
      expect(await readFile(path, 'utf8')).toBe(value);
    }
  });
});


describe('repository and stale recovery boundaries', () => {
  test('real linked worktrees share one durable store without tracked private output', async () => {
    const git = await createBareRemoteFixture();
    try {
      const main = git.clones[0]; const linked = join(git.root, 'linked');
      await git.git(main, ['worktree', 'add', '--detach', linked, 'HEAD']);
      await writeFile(join(main, 'tracked.txt'), 'synthetic staged change');
      await git.git(main, ['add', 'tracked.txt']);
      await writeFile(join(main, 'tracked.txt'), 'synthetic unstaged change');
      await writeFile(join(main, 'untracked.txt'), 'synthetic untracked');
      await writeFile(join(linked, 'tracked.txt'), 'synthetic linked change');
      const before = await Promise.all([snapshotUserCheckout(main), snapshotUserCheckout(linked)]);
      const [a, b] = await Promise.all([resolveRepository(main), resolveRepository(linked)]);
      expect(a.commonDir).toBe(b.commonDir); expect(a.gitDir).not.toBe(b.gitDir);
      const [first, second] = await Promise.all([openStore(a), openStore(b)]); const f = fixture();
      await Promise.all([first.commitBatch(f.source, f.batch, [f.record]), second.commitBatch(f.source, f.batch, [f.record])]);
      expect(await first.pending()).toEqual([f.record]); expect(await second.journal()).toHaveLength(2);
      expect(await Promise.all([snapshotUserCheckout(main), snapshotUserCheckout(linked)])).toEqual(before);
      expect(await git.git(main, ['ls-files'])).toBe('tracked.txt\n');
      expect(JSON.stringify(await second.pending())).not.toContain(f.source.sourceIdentity);
      expect(JSON.stringify(await second.pending())).not.toContain(f.batch.observations[0].nativeUnitId);
    } finally { await git.cleanup(); }
  });

  test('two stale reapers cannot unlink a replacement live owner', async () => {
    const ctx = await context(); await openStore(ctx); const prelude = await childFixture(ctx);
    const exited = await runStorageFixtureProcess(project, 'console.log(process.pid)');
    const lock = join(ctx.privateDir, 'locks', 'operation.lock');
    await writeFile(lock, JSON.stringify({ schemaVersion: 1, host: hostname(), namespace: 'synthetic-namespace', pid: Number(exited.stdout.trim()),
      token: '11111111-1111-4111-8111-111111111111', startedAt: 0 }));
    const reaped = join(ctx.worktreeRoot, 'reaped'); const held = join(ctx.worktreeRoot, 'held');
    const waitFor = (path: string) => `while (true) { try { await fs.stat(${JSON.stringify(path)}); break; } catch {} await new Promise(r => setTimeout(r, 5)); }`;
    const first = runStorageFixtureProcess(project, prelude + `
      const unlink = fs.default.unlink.bind(fs.default); let paused = false;
      fs.default.unlink = async path => {
        await unlink(path);
        if (String(path) === ${JSON.stringify(lock)} && !paused) { paused = true; await fs.writeFile(${JSON.stringify(reaped)}, ''); await new Promise(r => setTimeout(r, 250)); }
      };
      await store.withLock(AbortSignal.timeout(1800), async () => console.log('first-acquired'));
    `);
    const replacement = runStorageFixtureProcess(project, prelude + `
      ${waitFor(reaped)}
      await store.withLock(AbortSignal.timeout(1800), async () => {
        await fs.writeFile(${JSON.stringify(held)}, '');
        await new Promise(r => setTimeout(r, 450));
        const owner = JSON.parse(await fs.readFile(${JSON.stringify(lock)}, 'utf8'));
        if (owner.pid !== process.pid) throw new Error('live lock replaced');
        console.log('replacement-preserved');
      });
    `);
    const second = runStorageFixtureProcess(project, prelude + `
      ${waitFor(held)}
      try { await store.withLock(AbortSignal.timeout(100), async () => { throw new Error('stole-live-lock'); }); }
      catch (error) { if (error.message !== 'store-busy') throw error; console.log('second-busy'); }
    `);
    const results = await Promise.all([first, replacement, second]);
    expect(results.map(result => result.code)).toEqual([0, 0, 0]);
    expect(results.map(result => result.stderr)).toEqual(['', '', '']);
    expect(results.map(result => result.stdout.trim())).toEqual(['first-acquired', 'replacement-preserved', 'second-busy']);
  });

  test.each([null, 'different-process-namespace'])('unknown or different namespace %s cannot reclaim a dead PID', async namespace => {
    const ctx = await context(); const store = await openNativeStore(ctx, { processNamespace: async () => namespace });
    const exited = await runStorageFixtureProcess(project, 'console.log(process.pid)');
    const path = join(ctx.privateDir, 'locks', 'operation.lock');
    const bytes = JSON.stringify({ schemaVersion: 1, host: hostname(), namespace: 'synthetic-namespace', pid: Number(exited.stdout.trim()),
      token: '11111111-1111-4111-8111-111111111111', startedAt: 0 });
    await writeFile(path, bytes);
    await expect(store.withLock(AbortSignal.timeout(70), async () => undefined)).rejects.toMatchObject({ code: 'store-busy', uncertainty: true });
    expect(await readFile(path, 'utf8')).toBe(bytes);
  });

  test('a hanging namespace probe is bounded and does not prevent fresh lock acquisition', async () => {
    const ctx = await context(); const store = await openNativeStore(ctx, { processNamespace: () => new Promise(() => {}) });
    const start = performance.now();
    await store.withLock(AbortSignal.timeout(1000), async () => undefined);
    expect(performance.now() - start).toBeLessThan(800);
  });

  test('orphan recovery guard cannot be bypassed to steal a dead-owner lock', async () => {
    const ctx = await context(); const store = await openStore(ctx);
    const exited = await runStorageFixtureProcess(project, 'console.log(process.pid)');
    const lock = join(ctx.privateDir, 'locks', 'operation.lock');
    await writeFile(lock, JSON.stringify({ schemaVersion: 1, host: hostname(), namespace: 'synthetic-namespace', pid: Number(exited.stdout.trim()),
      token: '11111111-1111-4111-8111-111111111111', startedAt: 0 }));
    await writeFile(join(ctx.privateDir, 'locks', 'recovery.lock'), 'interrupted-recovery');
    await expect(store.withLock(AbortSignal.timeout(70), async () => undefined)).rejects.toMatchObject({ code: 'store-busy', uncertainty: true });
    expect(await readFile(lock, 'utf8')).toContain(exited.stdout.trim());
  });
});

describe('scan-resolved checkpoint candidates', () => {
  test('returns only latest candidate across authority changes and requires exact batch source', async () => {
    const ctx=await context();const store=await openStore(ctx);const first=fixture();const replacement=fixture('generation-2',2);
    await store.commitBatch(first.source,first.batch,[first.record]);await store.commitBatch(replacement.source,replacement.batch,[replacement.record]);
    const changed={...replacement.source,generation:'physical-discovery-epoch',schema:'new-schema',readerVersion:'new-reader'};
    expect((await store.checkpointCandidate(changed))?.sourceGeneration).toBe('generation-2');
    expect(await store.checkpoint(changed,{...replacement.batch.nextCheckpoint,attributionPolicyHash:'c'.repeat(64)})).toBeNull();
    await expect(store.commitBatch({...replacement.source,root:'/different/source'},replacement.batch,[replacement.record])).rejects.toThrow('invalid-batch');
    expect((await store.journal()).length).toBe(2);
  });
});
