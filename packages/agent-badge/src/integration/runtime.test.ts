import { expect, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as nodeModule from 'node:module';

test('approved bootstrap imports no provider pipeline or core barrel before starting its budget', async () => {
  const root = await mkdtemp('/private/tmp/agent-badge-runtime-import-');
  const loader = join(root, 'guard.mjs');
  const check = `if(/\\/(providers|collection|domain|pricing)\\//.test(resolved.url)||resolved.url.endsWith('/core/dist/index.js'))throw new Error('Heavy module imported before budget');return resolved;`;
  const synchronousHooks = typeof nodeModule.registerHooks === 'function';
  await writeFile(loader, synchronousHooks
    ? `import { registerHooks } from 'node:module'; registerHooks({resolve(specifier,context,next){const resolved=next(specifier,context);${check}}});`
    : `export async function resolve(specifier,context,next){const resolved=await next(specifier,context);${check}}`);
  const preload = synchronousHooks ? pathToFileURL(loader).href : 'data:text/javascript,' + encodeURIComponent(`import { register } from 'node:module'; register(${JSON.stringify(pathToFileURL(loader).href)});`);
  try {
    const child = spawnSync(process.execPath, ['--import', preload, '--input-type=module', '-e', `const m=await import('@legotin/agent-badge/integration/runtime');if(typeof m.runApprovedOperation!=='function')process.exit(1);console.log('approved runtime lightweight');`],
      { cwd: join(process.cwd(), 'packages/agent-badge'), env: { ...process.env, NODE_NO_WARNINGS: undefined, NODE_OPTIONS: undefined }, encoding: 'utf8', timeout: 5000 });
    expect(child.status, child.stderr).toBe(0); expect(child.stdout.trim()).toBe('approved runtime lightweight'); expect(child.stderr).toBe('');
  } finally { await rm(root, { recursive: true, force: true }); }
});
