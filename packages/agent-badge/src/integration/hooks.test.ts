import { afterEach, expect, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveRepository } from '@legotin/agent-badge-core';
import { planHooks, applyHookPlan, removeHooks } from './hooks.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
function git(cwd: string, args: string[], env = process.env) {
  return spawnSync('git', args, { cwd, env, encoding: 'utf8', timeout: 15000 });
}
async function fixture(hook?: string, hooksPath?: string) {
  const root = await mkdtemp('/private/tmp/agent-badge hooks-'); roots.push(root);
  const cwd = join(root, 'repository with spaces'); await mkdir(cwd);
  expect(git(cwd, ['init', '-q']).status).toBe(0);
  for (const [k, v] of [['user.name', 'Synthetic'], ['user.email', 'synthetic@example.invalid']]) git(cwd, ['config', k, v]);
  await writeFile(join(cwd, 'tracked'), 'synthetic'); git(cwd, ['add', 'tracked']); git(cwd, ['commit', '-qm', 'synthetic']);
  const remote = join(root, 'remote.git'); git(root, ['init', '--bare', '-q', remote]); git(cwd, ['remote', 'add', 'origin', remote]);
  if (hooksPath) git(cwd, ['config', '--local', 'core.hooksPath', hooksPath === 'absolute' ? join(cwd, 'custom hooks') : hooksPath]);
  const ctx = await resolveRepository(cwd); await mkdir(ctx.hooksPath, { recursive: true });
  const hookPath = join(ctx.hooksPath, 'pre-push');
  if (hook) { await writeFile(hookPath, hook); await chmod(hookPath, 0o755); }
  await mkdir(ctx.privateDir, { recursive: true });
  const receipt = join(root, 'badge.json');
  await writeFile(join(ctx.privateDir, 'bootstrap.cjs'), `require('node:fs').writeFileSync(${JSON.stringify(receipt)},JSON.stringify({args:process.argv.slice(2),stdin:require('node:fs').readFileSync(0,'utf8'),cwd:process.cwd(),env:process.env.HOOK_TEST}));`);
  return { root, cwd, ctx, hookPath, receipt, runtime: { privateDir: ctx.privateDir, nodePath: process.execPath } };
}

// Removing executable delegation, dropping argv/env/stdin or swallowing user failures breaks these real pushes.
test.each(['shell', 'python', 'node', 'set-e', 'early-exit'] as const)('real push preserves %s user-hook execution and both refs consumers', async kind => {
  const f = await fixture(); const output = join(f.root, 'user.json');
  const shell = `#!/bin/sh\n${kind === 'set-e' ? 'set -e\n' : ''}cat > '${output}'\n${kind === 'early-exit' ? 'exit 0\necho forbidden\n' : ''}`;
  const source = kind === 'python' ? `#!/usr/bin/python3\nimport json,os,sys\nopen(${JSON.stringify(output)},'w').write(json.dumps({'stdin':sys.stdin.read(),'args':sys.argv[1:],'env':os.environ.get('HOOK_TEST')}))\n`
    : kind === 'node' ? `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(output)},JSON.stringify({stdin:require('node:fs').readFileSync(0,'utf8'),args:process.argv.slice(2),env:process.env.HOOK_TEST}));\n` : shell;
  await writeFile(f.hookPath, source); await chmod(f.hookPath, 0o755);
  const installed = await applyHookPlan(await planHooks(f.ctx, f.runtime)); expect(installed.status).toBe('installed');
  const pushed = git(f.cwd, ['push', 'origin', 'HEAD:refs/heads/main'], { ...process.env, HOOK_TEST: 'preserved' });
  expect(pushed.status, pushed.stderr).toBe(0);
  const badge = JSON.parse(await readFile(f.receipt, 'utf8'));
  const userBytes = await readFile(output, 'utf8'); const user = ['python', 'node'].includes(kind) ? JSON.parse(userBytes) : { stdin: userBytes };
  expect(user.stdin).toMatch(/^HEAD [0-9a-f]{40} refs\/heads\/main 0{40}\n$/);
  expect(badge.stdin).toBe(user.stdin); expect(badge.args.slice(0, 1)).toEqual(['--git-hook']);
  if (user.args) { expect(user.args).toEqual(['origin', join(f.root, 'remote.git')]); expect(user.env).toBe('preserved'); }
});

test('user failure still blocks a push while badge receives the same refs', async () => {
  const f = await fixture('#!/bin/sh\ncat > user-refs\nexit 7\n');
  await applyHookPlan(await planHooks(f.ctx, f.runtime));
  const result = git(f.cwd, ['push', 'origin', 'HEAD:refs/heads/main']); expect(result.status).not.toBe(0);
  expect(JSON.parse(await readFile(f.receipt, 'utf8')).stdin).toBe(await readFile(join(f.cwd, 'user-refs'), 'utf8'));
  expect(git(f.cwd, ['ls-remote', 'origin', 'refs/heads/main']).stdout).toBe('');
  const direct = spawnSync(f.hookPath, ['remote', 'url'], { cwd: f.cwd, input: 'refs\n', encoding: 'utf8' }); expect(direct.status).toBe(7);
});

test.each(['custom hooks', 'absolute'])('repository-local hooksPath %s preserves symlink and repeated setup/removal', async hooksPath => {
  const f = await fixture(undefined, hooksPath); const target = join(f.ctx.hooksPath, 'user-hook');
  await writeFile(target, '#!/bin/sh\ncat > symlink-refs\n'); await chmod(target, 0o755); await symlink('user-hook', f.hookPath);
  await applyHookPlan(await planHooks(f.ctx, f.runtime));
  expect((await applyHookPlan(await planHooks(f.ctx, f.runtime))).status).toBe('unchanged');
  expect(git(f.cwd, ['push', 'origin', 'HEAD:refs/heads/main']).status).toBe(0);
  expect(await readFile(join(f.cwd, 'symlink-refs'), 'utf8')).toContain('refs/heads/main');
  expect((await removeHooks(f.ctx)).status).toBe('removed'); expect((await removeHooks(f.ctx)).status).toBe('unchanged');
  const { readlink } = await import('node:fs/promises'); expect(await readlink(f.hookPath)).toBe('user-hook');
});

test('minimal GUI PATH, missing runtime and missing approved Node keep the user hook working', async () => {
  const f = await fixture('#!/bin/sh\n/bin/cat > user-refs\n');
  await applyHookPlan(await planHooks(f.ctx, f.runtime));
  const run = () => spawnSync(f.hookPath, [], { cwd: f.cwd, input: 'exact\n', env: { PATH: '/usr/bin:/bin' }, encoding: 'utf8', timeout: 3000 });
  expect(run().status).toBe(0); expect(JSON.parse(await readFile(f.receipt, 'utf8')).stdin).toBe('exact\n');
  await rm(join(f.ctx.privateDir, 'bootstrap.cjs')); const missing = run(); expect(missing.status).toBe(0); expect(missing.stderr).toMatch(/local activation required/); expect(missing.stderr).not.toContain('MODULE_NOT_FOUND');
  await removeHooks(f.ctx); await applyHookPlan(await planHooks(f.ctx, { ...f.runtime, nodePath: '/missing/approved-node' }));
  expect(run().status).toBe(0); expect(await readFile(join(f.cwd, 'user-refs'), 'utf8')).toBe('exact\n');
});

test('refuses legacy markers, shared hooks paths, changed plans and edited owned delegates without executing them', async () => {
  const f = await fixture('#!/bin/sh\n# agent-badge:start\nexit 99\n# agent-badge:end\n');
  expect((await planHooks(f.ctx, f.runtime)).actionItems.join()).toMatch(/legacy/i);
  expect((await applyHookPlan(await planHooks(f.ctx, f.runtime))).status).toBe('action-required');
  const outside = join(f.root, 'shared hooks'); git(f.cwd, ['config', 'core.hooksPath', outside]);
  expect((await planHooks(await resolveRepository(f.cwd), f.runtime)).actionItems.join()).toMatch(/shared/i);
  git(f.cwd, ['config', '--unset', 'core.hooksPath']); await rm(f.hookPath);
  const plan = await planHooks(f.ctx, f.runtime); await writeFile(f.hookPath, '#!/bin/sh\nexit 9\n');
  await expect(applyHookPlan(plan)).rejects.toThrow(/changed/i);
  await applyHookPlan(await planHooks(f.ctx, f.runtime)); await writeFile(f.hookPath, '#!/bin/sh\nexit 8\n');
  await expect(removeHooks(f.ctx)).rejects.toThrow(/modified/i);
});

test('Windows automatic installation is explicitly unsupported', async () => {
  const f = await fixture(); expect((await planHooks(f.ctx, { ...f.runtime, platform: 'win32' })).actionItems.join()).toMatch(/Windows/);
});

test('empty original hook is idempotent and removable, and relative interpreter resources survive delegation', async () => {
  const f = await fixture(); await applyHookPlan(await planHooks(f.ctx, f.runtime));
  expect((await applyHookPlan(await planHooks(f.ctx, f.runtime))).status).toBe('unchanged');
  await removeHooks(f.ctx); await expect(readFile(f.hookPath)).rejects.toThrow();
  await writeFile(join(f.ctx.hooksPath, 'resource'), 'relative-resource');
  await writeFile(f.hookPath, `#!/bin/sh\n/bin/cat "$(dirname "$0")/resource" > resource-result\n/bin/cat > refs-result\n`); await chmod(f.hookPath, 0o755);
  await applyHookPlan(await planHooks(f.ctx, f.runtime));
  expect(git(f.cwd, ['push', 'origin', 'HEAD:refs/heads/main']).status).toBe(0);
  expect(await readFile(join(f.cwd, 'resource-result'), 'utf8')).toBe('relative-resource');
});

test('self-dispatching managers and global hooksPath require explicit local integration', async () => {
  const f = await fixture('#!/bin/sh\n# husky manager\n. "$(dirname "$0")/h"\n');
  expect((await planHooks(f.ctx, f.runtime)).actionItems.join()).toMatch(/manager/);
  await rm(f.hookPath); const global = join(f.root, 'global-config'); await writeFile(global, '[core]\n hooksPath = custom\n');
  const previous = process.env.GIT_CONFIG_GLOBAL; process.env.GIT_CONFIG_GLOBAL = global;
  try { expect((await planHooks(await resolveRepository(f.cwd), f.runtime)).actionItems.join()).toMatch(/global/); }
  finally { process.env.GIT_CONFIG_GLOBAL = previous; }
});

test.each([false, true])('linked-worktree actual push respects common versus worktree-local hook availability (custom=%s)', async custom => {
  const f = await fixture(undefined, custom ? 'local-hooks' : undefined);
  const installed = await applyHookPlan(await planHooks(f.ctx, f.runtime));
  if (custom) expect(installed.actionItems.join()).toMatch(/Other branches\/worktrees/);
  const linked = join(f.root, 'linked tree'); expect(git(f.cwd, ['worktree', 'add', '-qb', 'linked', linked]).status).toBe(0);
  const pushed = git(linked, ['push', 'origin', 'HEAD:refs/heads/main']); expect(pushed.status, pushed.stderr).toBe(0);
  if (custom) {
    await expect(readFile(f.receipt)).rejects.toThrow();
    expect((await planHooks(await resolveRepository(linked), f.runtime)).actionItems.join()).toMatch(/previous owned integration/);
  } else expect(JSON.parse(await readFile(f.receipt, 'utf8')).cwd).toBe(linked);
});

test('CRLF refs and a CRLF-bodied Node hook are preserved byte for byte on POSIX', async () => {
  const f = await fixture(); const output = join(f.root, 'crlf');
  const source = `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(output)},require('node:fs').readFileSync(0));\r\n`;
  await writeFile(f.hookPath, source); await chmod(f.hookPath, 0o755);
  await applyHookPlan(await planHooks(f.ctx, f.runtime));
  const r = spawnSync(f.hookPath, ['remote', 'url'], { cwd: f.cwd, input: 'refs\r\nsecond\r\n', timeout: 3000 }); expect(r.status).toBe(0);
  expect(await readFile(output, 'utf8')).toBe('refs\r\nsecond\r\n'); expect(await readFile(join(f.ctx.hooksPath, '.agent-badge-user-pre-push'), 'utf8')).toBe(source);
});

test('ignored nonexecutable user hooks stay ignored and changed Git routing invalidates the plan', async () => {
  const f = await fixture('#!/bin/sh\nexit 9\n'); await chmod(f.hookPath, 0o644);
  await applyHookPlan(await planHooks(f.ctx, f.runtime));
  expect(git(f.cwd, ['push', 'origin', 'HEAD:refs/heads/main']).status).toBe(0);
  await removeHooks(f.ctx); const plan = await planHooks(f.ctx, f.runtime);
  git(f.cwd, ['config', 'core.hooksPath', 'different-hooks']); await expect(applyHookPlan(plan)).rejects.toThrow(/changed/);
});

test('Node module mode, shebang interpreter arguments and sibling imports survive delegation', async () => {
  const f = await fixture(); await writeFile(join(f.cwd, 'package.json'), '{"type":"module"}');
  await writeFile(join(f.ctx.hooksPath, 'sibling.mjs'), 'export const value="sibling import";');
  await writeFile(f.hookPath, '#!/usr/bin/env -S node --no-warnings\nimport {value} from "./sibling.mjs";import {writeFileSync,readFileSync} from "node:fs";writeFileSync("module-result",value);readFileSync(0);'); await chmod(f.hookPath, 0o755);
  await applyHookPlan(await planHooks(f.ctx, f.runtime));
  const r = git(f.cwd, ['push', 'origin', 'HEAD:refs/heads/main']); expect(r.status, r.stderr).toBe(0); expect(await readFile(join(f.cwd, 'module-result'), 'utf8')).toBe('sibling import');
});

test('ownership detects changed non-UTF8 backup bytes without silently restoring them', async () => {
  const f = await fixture(); await writeFile(f.hookPath, Buffer.from([255]));
  await applyHookPlan(await planHooks(f.ctx, f.runtime));
  await writeFile(join(f.ctx.hooksPath, '.agent-badge-user-pre-push'), Buffer.from([254]));
  await expect(removeHooks(f.ctx)).rejects.toThrow(/backup modified/);
});
