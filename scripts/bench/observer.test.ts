import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { observeProgress } from './observer.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function inventory(root: string, relative = ''): Promise<unknown[]> {
  const path = join(root, relative), info = await lstat(path, { bigint: true });
  const own = [relative, String(info.dev), String(info.ino), String(info.mode), String(info.size), String(info.mtimeNs), String(info.ctimeNs)];
  if (!info.isDirectory()) return [[...own, createHash('sha256').update(await readFile(path)).digest('hex')]];
  return [own, ...(await Promise.all((await readdir(path)).sort().map(name => inventory(root, join(relative, name))))).flat()];
}

test.each(['absent', 'corrupt'] as const)('progress observer leaves %s cache and authority bytes/stat fingerprints unchanged', async kind => {
  const root = await mkdtemp(join(tmpdir(), 'agent-badge-observer-')); roots.push(root);
  await mkdir(join(root, 'journal'));
  await writeFile(join(root, 'journal/0000000000000001.json'), 'synthetic inventory telemetry only');
  await writeFile(join(root, 'transport.json'), JSON.stringify({ schemaVersion: 1,
    repositoryId: '12345678-1234-4234-8234-123456789abc', canonicalPushUrl: 'https://github.com/synthetic/benchmark',
    dataRef: 'refs/heads/agent-badge/data', commit: 'a'.repeat(40) }), { mode: 0o600 });
  if (kind === 'corrupt') {
    await mkdir(join(root, 'cache'));
    for (const name of ['index.json', 'index.sqlite', 'accepted-stage.json', 'accepted-stage.sqlite'])
      await writeFile(join(root, 'cache', name), 'corrupt disposable bytes', { mode: 0o600 });
  }
  const before = await inventory(root);
  const result = await observeProgress(root, async commit => {
    expect(commit).toBe('a'.repeat(40)); return JSON.stringify({ recordedUnits: 128 });
  });
  expect(result).toEqual({ confirmedUnits: 128, pending: null, journalFiles: 1, stage: {} });
  expect(await inventory(root)).toEqual(before);
});

test('integrated timing harness has no owning progress queries', async () => {
  const source = await readFile(new URL('./hooks.ts', import.meta.url), 'utf8');
  expect(source).not.toMatch(/store\.(?:pendingCount|pending|transportState|sourceJournal)\(/);
  // Empty setup initialization and the explicit nonbounded seed are the only writers.
  expect(source.match(/await syncUsage\(/g)).toHaveLength(2);
});
