import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';
import { runStorageFixtureProcess } from '@agent-badge/testkit';
import { acquireLock, localProcessNamespace } from './lock.js';

test.runIf(process.env.RUN_STORAGE_NAMESPACE_INTEGRATION === '1')('real OS namespace plus confirmed child death permits stale recovery', async () => {
  const namespace = await localProcessNamespace();
  expect(namespace).toMatch(/^[a-f0-9]{64}$/);
  const root = await realpath(await mkdtemp(join(tmpdir(), 'agent-badge-lock-integration-')));
  const directory = join(root, 'locks'); await mkdir(directory, { mode: 0o700 });
  try {
    const moduleUrl = pathToFileURL(join(process.cwd(), 'packages/core/src/storage/lock.ts')).href;
    const child = await runStorageFixtureProcess(process.cwd(), `
      const { acquireLock } = await import(${JSON.stringify(moduleUrl)});
      await acquireLock(${JSON.stringify(directory)}, AbortSignal.timeout(1000));
      process.kill(process.pid, 'SIGKILL');
    `);
    expect(child.signal).toBe('SIGKILL'); expect(child.stderr).toBe('');
    const release = await acquireLock(directory, AbortSignal.timeout(1000));
    await release();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('absent namespace evidence preserves stale ownership with uncertainty', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'agent-badge-lock-unknown-')));
  try {
    await writeFile(join(root, 'operation.lock'), JSON.stringify({ schemaVersion: 1, host: 'synthetic.invalid', namespace: null,
      pid: process.pid, token: '11111111-1111-4111-8111-111111111111', startedAt: 0 }));
    await expect(acquireLock(root, AbortSignal.timeout(30), async () => null)).rejects.toMatchObject({ code: 'store-busy', uncertainty: true });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('caller cancellation interrupts a hanging namespace probe without waiting for fallback', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'agent-badge-probe-cancel-')));
  const start = performance.now();
  try {
    await expect(acquireLock(root, AbortSignal.timeout(15), () => new Promise(() => {}))).rejects.toMatchObject({ code: 'store-busy' });
    expect(performance.now() - start).toBeLessThan(120);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('atomic lease publication preserves an existing symlink and never writes its target', async () => {
  const { symlink, readFile, readdir } = await import('node:fs/promises');
  const root = await realpath(await mkdtemp(join('/private/tmp', 'agent-badge-lock-symlink-')));
  const target = join(root, 'target');
  await writeFile(target, 'unchanged'); await symlink(target, join(root, 'operation.lock'));
  try {
    await expect(acquireLock(root, AbortSignal.timeout(40), async () => null)).rejects.toMatchObject({ code: 'unsafe-store-path' });
    expect(await readFile(target, 'utf8')).toBe('unchanged');
    expect((await readdir(root)).filter(name => name.startsWith('lease-'))).toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('unsupported hardlink publication fails closed and removes its staging file', async () => {
  const fs = (await import('node:fs/promises')).default;
  const { vi } = await import('vitest');
  const root = await realpath(await mkdtemp(join('/private/tmp', 'agent-badge-lock-link-failure-')));
  const spy = vi.spyOn(fs, 'link').mockRejectedValue(Object.assign(new Error('synthetic'), { code: 'ENOTSUP' }));
  try {
    await expect(acquireLock(root, AbortSignal.timeout(100), async () => null)).rejects.toMatchObject({ code: 'store-io' });
    expect(await fs.readdir(root)).toEqual([]);
  } finally { spy.mockRestore(); await rm(root, { recursive: true, force: true }); }
});
