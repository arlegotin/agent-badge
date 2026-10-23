import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { packagePaths, packageNames, validateWorkspace } from './preflight.js';
async function assertPreparedWorkspace(root = '.') {
  const declared = JSON.parse(await readFile(join(root, 'packages/core/package.json'), 'utf8'));
  const version = await validateWorkspace(root);
  expect(version).toBe(declared.version);
  return version;
}
it('validates the actual prepared v2 Changesets output and exact dependency lock', () => assertPreparedWorkspace());

async function preparedFixture(version: string, mode?: 'pre' | 'exit') {
  const root = await mkdtemp(join(tmpdir(), 'agent-badge-prepared-workspace-'));
  try {
    const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
    for (const [index, path] of packagePaths.entries()) {
      const manifest = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
      manifest.version = version;
      if (index) manifest.dependencies[packageNames[index - 1]] = version;
      Object.assign(lock.packages[path], { version, dependencies: manifest.dependencies });
      await mkdir(join(root, path), { recursive: true });
      await writeFile(join(root, path, 'package.json'), JSON.stringify(manifest));
    }
    await writeFile(join(root, 'package-lock.json'), JSON.stringify(lock));
    await mkdir(join(root, '.changeset'));
    await writeFile(join(root, '.changeset/config.json'), await readFile('.changeset/config.json'));
    if (mode) {
      // Stable workspaces may have no pre.json; fixtures own their transition state.
      const pre = { mode, tag: 'next', initialVersions: Object.fromEntries(packageNames.map(name => [name, '1.1.20'])), changesets: ['repository-native-major'] };
      await writeFile(join(root, '.changeset/pre.json'), JSON.stringify(pre));
    }
    return root;
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}
it.each([
  ['2.0.0-next.1', 'pre'], ['2.0.0', 'exit'], ['2.0.0', undefined],
] as const)('accepts prepared %s with Changesets mode %s without editing the real workspace', async (version, mode) => {
  const root = await preparedFixture(version, mode);
  try { expect(await assertPreparedWorkspace(root)).toBe(version); }
  finally { await rm(root, { recursive: true, force: true }); }
});
it('rejects stable preparation while Changesets is still in prerelease mode', async () => {
  const root = await preparedFixture('2.0.0', 'pre');
  try { await expect(assertPreparedWorkspace(root)).rejects.toThrow('Stable release still in prerelease mode'); }
  finally { await rm(root, { recursive: true, force: true }); }
});
it('rejects traversal ZIPs before extraction and extracts only the exact bound inventory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-badge-zip-fixture-'));
  const env = { ...process.env, RELEASE_SHA: 'a'.repeat(40), RELEASE_TAG: 'v2.0.0-next.0' };
  try {
    const code = `import json,zipfile,sys\nnames=['@legotin/agent-badge-core','@legotin/agent-badge','create-agent-badge']\na=[dict(name=n,filename=str(i)+'.tgz') for i,n in enumerate(names)]\nc=dict(schemaVersion=1,sha='a'*40,tag='v2.0.0-next.0',artifacts=a)\nwith zipfile.ZipFile(sys.argv[1],'w') as z:\n z.writestr('candidate.json',json.dumps(c))\n for i in range(3):z.writestr(('../' if sys.argv[2]=='traversal' and i==2 else '')+str(i)+'.tgz','abc')\n`;
    for (const kind of ['traversal', 'valid']) {
      const zip = join(root, kind + '.zip'), dest = join(root, kind);
      execFileSync('python3', ['-c', code, zip, kind], { env });
      const args = [resolve('scripts/release/artifact-download.py'), zip, dest];
      if (kind === 'traversal') { expect(() => execFileSync('python3', args, { env, stdio: 'pipe' })).toThrow(); await expect(stat(dest)).rejects.toMatchObject({ code: 'ENOENT' }); }
      else { execFileSync('python3', args, { env }); expect(await readFile(join(dest, '2.tgz'), 'utf8')).toBe('abc'); }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
