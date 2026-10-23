import { it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import * as npm from './npm.js';
it('Windows npm uses the selected Node and bundled npm CLI without a command shell', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-badge-npm-port-'));
  try {
    const cli = join(root, 'node_modules/npm/bin'); await mkdir(cli, { recursive: true });
    await writeFile(join(cli, 'npm-cli.js'), 'console.log(JSON.stringify(process.argv.slice(2)))');
    const selected = npm.npmInvocation(['ci', '--ignore-scripts'], 'win32', join(root, 'node'));
    expect(selected.command).toBe(join(root, 'node'));
    expect(JSON.parse(execFileSync(process.execPath, selected.args, { encoding: 'utf8' }))).toEqual(['ci', '--ignore-scripts']);
    expect(npm.npmInvocation(['ci'], 'darwin').command).toBe('npm');
  } finally { await rm(root, { recursive: true, force: true }); }
});
