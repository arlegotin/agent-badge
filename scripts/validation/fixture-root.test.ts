import { it, expect } from 'vitest';
import { mkdtemp, mkdir, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertOwnedGitFixture } from './fixture-root.js';
it('accepts only canonical direct temporary fixture roots; refuses similarly named nested user repositories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-badge-git-'));
  try {
    expect(await assertOwnedGitFixture(root)).toBe(await realpath(root));
    const nested = join(root, 'agent-badge-git-other'); await mkdir(nested);
    await expect(assertOwnedGitFixture(nested)).rejects.toThrow('synthetic');
  } finally { await rm(root, { recursive: true, force: true }); }
});
