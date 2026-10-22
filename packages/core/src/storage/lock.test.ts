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
