import { readFile, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { afterEach, expect, test } from 'vitest';
import { isDirectExecution, runCreateAgentBadge } from './index.js';
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
const target = process.env.AGENT_BADGE_TEST_NODE ?? process.execPath;
async function fixture() { const root = await mkdtemp(join(tmpdir(), 'agent-badge-initializer-')); roots.push(root); return root; }

test('initializer safely reports a missing CLI package without raw import errors', async () => {
  const root = await fixture(), entry = join(root, 'initializer.mjs');
  const canary = 'synthetic-private-package-path';
  const dependency = join(root, 'node_modules/@legotin/agent-badge');
  await import('node:fs/promises').then(m => m.mkdir(dependency, { recursive: true }));
  await writeFile(entry, await readFile(new URL('../dist/index.js', import.meta.url)));
  await writeFile(join(dependency, 'package.json'), JSON.stringify({ name: '@legotin/agent-badge', type: 'module', exports: { './cli': './' + canary + '.js' } }));
  let failure: { status: number; stderr: string } | undefined;
  try { execFileSync(target, [entry, '--help'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) { failure = error as typeof failure; }
  expect(failure?.status).toBe(1);
  expect(failure?.stderr).toBe('agent-badge: operation unavailable; run doctor.\n');
  expect(failure?.stderr).not.toContain(root);
  expect(failure?.stderr).not.toContain(canary);
});

test('recognizes a symlinked executable and missing argv', async () => {
  const root = await fixture(), link = join(root, 'initializer'); await symlink(new URL('./index.ts', import.meta.url), link);
  expect(isDirectExecution([process.execPath, link])).toBe(true); expect(isDirectExecution([process.execPath])).toBe(false);
});
test('unsupported Node rejects before importing the shared CLI or discovering a repository', async () => {
  await expect(runCreateAgentBadge({ nodeVersion: '22.14.0', argv: [] })).rejects.toThrow('Node 24 or 26');
});

test.each([{ args: ['--help'] }, { args: ['--version'] }, { args: ['--definitely-invalid'] }, { args: ['setup', '--definitely-invalid'] }])('packed executable arguments %j have no operational side effects', async ({ args }) => {
  const root = await fixture(), bin = join(root, 'bin'), marker = join(root, 'subprocess-ran'); await import('node:fs/promises').then(m => m.mkdir(bin));
  for (const command of ['git', 'npm', 'gh']) await writeFile(join(bin, command), '#!/bin/sh\necho forbidden > "' + marker + '"\nexit 97\n', { mode: 0o700 });
  let stdout = '', code = 0;
  try { stdout = execFileSync(target, [new URL('../dist/index.js', import.meta.url).pathname, ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, HOME: root, PATH: bin, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } }); }
  catch (error) { code = (error as { status: number }).status; }
  expect(code).toBe(args.includes('--help') || args.includes('--version') ? 0 : 64);
  expect((await readdir(root)).sort()).toEqual(['bin']);
  if (args[0] === '--help') expect(stdout).toContain('setup');
  if (args[0] === '--version') expect(stdout).toMatch(/^\d+\.\d+\.\d+/);
});

test.each(['../dist/index.js', '../../agent-badge/dist/cli/main.js'])('executable %s rejects unsupported Node before loading operational code', async entry => {
  const root = await fixture(), path = new URL(entry, import.meta.url).pathname;
  const code = "const entry=process.argv[1];process.argv=[process.execPath,entry];Object.defineProperty(process.versions,'node',{value:'22.14.0'});import(require('node:url').pathToFileURL(entry).href);";
  let result;
  try { execFileSync(process.execPath, ['-e', code, path], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PATH: '', HOME: root } }); }
  catch (error) { result = error as { status: number; stderr: string }; }
  expect(result?.status).toBe(1); expect(String(result?.stderr)).toContain('Node 24 or 26');
  expect(String(result?.stderr)).not.toContain('SQLite'); expect(await readdir(root)).toEqual([]);
});

// Real executable boundary: malformed private JSON must never reach stderr.
test.each(['malformed', 'permissions', 'ordinary'])('initializer redacts %s operational failures', async kind => {
  const cwd = await fixture();
  execFileSync('git', ['init', cwd], {stdio:'ignore'});
  try {
    const canary = 'synthetic-private-prompt-credential-provider-id';
    const { mkdir, chmod } = await import('node:fs/promises');
    const privateDir = join(cwd, '.git/agent-badge'); await mkdir(privateDir);
    const activation = join(privateDir, 'local.json');
    await writeFile(activation, kind === 'malformed' ? '{"private":"' + canary + '",invalid}' : '{}');
    if (kind === 'permissions') await chmod(activation, 0);
    let failure: { status: number; stderr: string; stdout: string } | undefined;
    try { execFileSync(target, [new URL('../dist/index.js', import.meta.url).pathname, 'setup'], { cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }); }
    catch (error) { failure = error as typeof failure; }
    finally { await chmod(activation, 0o600); }
    expect(failure?.status).toBe(1);
    expect(failure?.stderr).toContain('operation unavailable');
    expect(failure?.stderr).not.toContain(canary);
    expect(failure?.stderr).not.toContain(cwd);
  } finally { /* fixture cleanup owns the synthetic repository */ }
});
