import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { atomicFile } from './atomic-file.js';

test('oversized private snapshots fail without replacing last readable state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-badge-atomic-'));
  try {
    const path = join(root, 'acknowledged.json');
    await writeFile(path, 'last-readable-state');
    await expect(atomicFile(path, { hashes: ['a'.repeat(32 * 1024 * 1024)] })).rejects.toMatchObject({ code: 'invalid-batch' });
    expect(await readFile(path, 'utf8')).toBe('last-readable-state');
  } finally { await rm(root, { recursive: true, force: true }); }
});
