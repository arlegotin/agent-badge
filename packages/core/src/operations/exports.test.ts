import { expect, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('built launcher subpaths import before the budget without loading the core barrel or provider pipeline', async () => {
  const root = await mkdtemp('/private/tmp/agent-badge-lightweight-');
  const loader = join(root, 'guard.mjs');
  await writeFile(loader, `export async function resolve(specifier,context,next){const resolved=await next(specifier,context);if(/\\/(providers|collection|domain|pricing)\\//.test(resolved.url)||resolved.url.endsWith('/dist/index.js'))throw new Error('Heavy module imported before budget');return resolved;}`);
  try {
    const child = spawnSync(process.execPath, ['--loader', pathToFileURL(loader).href, '--input-type=module', '-e', `
      const {createOperationBudget}=await import('@legotin/agent-badge-core/operations/budget');
      const budget=createOperationBudget('automatic');
      const {runRepositoryOperation}=await import('@legotin/agent-badge-core/operations/runner');
      if(typeof runRepositoryOperation!=='function')process.exit(2);
      budget.dispose();console.log('lightweight launcher ready');
    `], { cwd: join(process.cwd(), 'packages/core'), env: { ...process.env, NODE_NO_WARNINGS: '1' }, encoding: 'utf8', timeout: 5000 });
    expect(child.status, child.stderr).toBe(0); expect(child.stdout.trim()).toBe('lightweight launcher ready'); expect(child.stderr).toBe('');
  } finally { await rm(root, { recursive: true, force: true }); }
});
