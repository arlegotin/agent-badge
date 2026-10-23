import { realpath as fixtureRealpath } from 'node:fs/promises';
import { tmpdir as fixtureTmpdir } from 'node:os';
import { join as fixtureJoin } from 'node:path';
import { expect, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as nodeModule from 'node:module';

test('built launcher subpaths import before the budget without loading the core barrel or provider pipeline', async () => {
  const root = await fixtureRealpath(await mkdtemp(fixtureJoin(fixtureTmpdir(), 'agent-badge-lightweight-')));
  const loader = join(root, 'guard.mjs');
  const check = `if(/\\/(providers|collection|domain|pricing)\\//.test(resolved.url)||resolved.url.endsWith('/dist/index.js'))throw new Error('Heavy module imported before budget');return resolved;`;
  const synchronousHooks = typeof nodeModule.registerHooks === 'function';
  // Retained Node22.14 tests predate registerHooks; register is not deprecated there.
  await writeFile(loader, synchronousHooks
    ? `import { registerHooks } from 'node:module'; registerHooks({resolve(specifier,context,next){const resolved=next(specifier,context);${check}}});`
    : `export async function resolve(specifier,context,next){const resolved=await next(specifier,context);${check}}`);
  const preload = synchronousHooks ? pathToFileURL(loader).href
    : 'data:text/javascript,' + encodeURIComponent(`import { register } from 'node:module'; register(${JSON.stringify(pathToFileURL(loader).href)});`);
  try {
    const child = spawnSync(process.execPath, ['--import', preload, '--input-type=module', '-e', `
      const {createOperationBudget}=await import('@legotin/agent-badge-core/operations/budget');
      const budget=createOperationBudget('automatic');
      const {runRepositoryOperation}=await import('@legotin/agent-badge-core/operations/runner');
      if(typeof runRepositoryOperation!=='function')process.exit(2);
      budget.dispose();console.log('lightweight launcher ready');
    `], { cwd: join(process.cwd(), 'packages/core'), env: { ...process.env, NODE_NO_WARNINGS: undefined, NODE_OPTIONS: undefined }, encoding: 'utf8', timeout: 5000 });
    expect(child.status, child.stderr).toBe(0); expect(child.stdout.trim()).toBe('lightweight launcher ready'); expect(child.stderr).toBe('');
  } finally { await rm(root, { recursive: true, force: true }); }
});
