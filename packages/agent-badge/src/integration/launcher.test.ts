import { afterEach, expect, test } from 'vitest';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createBareRemoteFixture } from '@agent-badge/testkit';
import type { GitFixture } from '@agent-badge/testkit';
import { launcherSource } from './templates.js';
const execute = promisify(execFile), fixtures: GitFixture[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(f => f.cleanup())); });
const node24 = process.env.AGENT_BADGE_TEST_NODE ?? process.execPath;

test('unsupported executable runtime fails before subprocesses or filesystem mutations', async () => {
  const f = await createBareRemoteFixture(); fixtures.push(f);
  const cwd = f.clones[0], path = join(cwd, 'launcher.cjs'); await writeFile(path, launcherSource);
  const { stdout, stderr } = await execute(process.execPath, ['-e', "Object.defineProperty(process.versions,'node',{value:'22.14.0'});require(process.argv[1])", path], { cwd }).catch(e => e);
  expect(stderr).toContain('Node 24 or 26'); expect(await readdir(cwd)).not.toContain('.agent-badge');
});

test.each(['--help', '--version', 'status'])('ordinary launcher %s never installs or creates private activation', async command => {
  const f = await createBareRemoteFixture(); fixtures.push(f); const cwd = f.clones[0];
  await mkdir(join(cwd, '.agent-badge/runtime'), { recursive: true });
  await writeFile(join(cwd, '.agent-badge/run.cjs'), launcherSource);
  const version = '1.1.20';
  await writeFile(join(cwd, '.agent-badge/config.json'), JSON.stringify({ runtimeVersion: version }));
  await writeFile(join(cwd, '.agent-badge/runtime/package.json'), JSON.stringify({ private: true, dependencies: { '@legotin/agent-badge': version } }));
  await writeFile(join(cwd, '.agent-badge/runtime/package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { '': { dependencies: { '@legotin/agent-badge': version } }, 'node_modules/@legotin/agent-badge': { version, integrity: 'sha512-c3ludGhldGlj' } } }));
  const result = await execute(node24, [join(cwd, '.agent-badge/run.cjs'), command], { cwd }).catch(e => e);
  expect(result.stderr).toContain('explicit setup'); expect(await readdir(join(cwd, '.git'))).not.toContain('agent-badge');
});
