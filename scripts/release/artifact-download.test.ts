import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { validateWorkspace } from './preflight.js';
it('validates the actual prepared v2 Changesets output and exact dependency lock', async () => {
  expect(await validateWorkspace()).toBe('2.0.0-next.0');
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
