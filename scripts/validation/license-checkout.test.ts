import { test, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, unlink, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

test('license bytes survive Windows-style Git checkout for shared release artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-badge-license-checkout-'));
  const paths = ['LICENSE', 'packages/core/LICENSE', 'packages/agent-badge/LICENSE', 'packages/create-agent-badge/LICENSE'];
  const canonical = Buffer.from('Canonical license text\nSecond line\n');
  const git = (...args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, stdio: 'pipe' });
  try {
    git('init', '-q');
    git('config', 'user.name', 'Release Fixture');
    git('config', 'user.email', 'release-fixture@example.invalid');
    for (const path of paths) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), canonical);
    }
    try { await writeFile(join(root, '.gitattributes'), await readFile('.gitattributes')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    git('-c', 'core.autocrlf=false', 'add', '.');
    git('commit', '-qm', 'Synthetic release license files');
    for (const path of paths) await unlink(join(root, path));
    git('-c', 'core.autocrlf=true', 'checkout-index', '--all', '--force');
    for (const path of paths) expect(await readFile(join(root, path)), path).toEqual(canonical);
  } finally { await rm(root, { recursive: true, force: true }); }
});
