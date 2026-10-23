import { assertOwnedGitFixture } from '../validation/fixture-root.js';
/** Separate macOS hook-command RSS probe; run through run-isolated.py. */
import {startFixtureGitDaemon} from '../../packages/testkit/src/git-daemon.js';
import { spawnSync } from 'node:child_process';
import { readFile, realpath, stat } from 'node:fs/promises';
import { availableParallelism, cpus, release, totalmem } from 'node:os';
import { basename, join } from 'node:path';

const root = await realpath(process.argv[2]);
if (!(await assertOwnedGitFixture(root))) throw Error('synthetic fixture required');
if (process.platform !== 'darwin') throw Error('this probe requires macOS time -l');
const cwd = join(root, 'clone-a'), privateDir = join(cwd, '.git/agent-badge');
const declaration = JSON.parse(await readFile(join(cwd, '.agent-badge/config.json'), 'utf8'));
if (declaration.declaredUrl !== 'https://github.com/synthetic/benchmark') throw Error('synthetic fixture required');
const receiver=JSON.parse(await readFile(join(root,'receiver.json'),'utf8'));
const daemon=await startFixtureGitDaemon({root,remote:join(root,'remote.git')},receiver.port);
try {
const wrapper = join(cwd, '.git/hooks/pre-push');
if (!(await readFile(wrapper, 'utf8')).includes(process.execPath)) throw Error('approved runtime differs');
const results = [];
for (const targeted of [true, false]) {
  const args = targeted ? [process.execPath, join(privateDir, 'bootstrap.cjs'), '--hook', 'codex'] : [wrapper];
  const measured = spawnSync('/usr/bin/time', ['-l', ...args], {
    cwd, input: targeted ? JSON.stringify({ hook_event_name: 'Stop', transcript_path: join(root, 'codex/sessions/source-00000.jsonl') }) : 'refs\n',
    encoding: 'utf8', timeout: 3500,
  });
  const match = /(\d+)\s+maximum resident set size/.exec(measured.stderr);
  if (measured.status !== 0 || !match) throw Error('time -l memory measurement unavailable');
  results.push({ targeted, maximumResidentSetSizeBytes: Number(match[1]), queued: /queued|deadline/.test(measured.stderr) });
}
const cacheBytes: Record<string, number> = {};
for (const name of ['index.sqlite', 'accepted.sqlite', 'accepted-next.sqlite']) {
  try { cacheBytes[name] = (await stat(join(privateDir, 'cache', name))).size; } catch { /* Optional disposable slot. */ }
}
console.log(JSON.stringify({ root, node: process.version,
  environment: { platform: process.platform, arch: process.arch, release: release(), cpu: cpus()[0]?.model, availableParallelism: availableParallelism(), totalMemoryBytes: totalmem(),
    git: spawnSync('git', ['--version'], { encoding: 'utf8', timeout: 5000 }).stdout.trim() },
  measurement: '/usr/bin/time -l maximum resident set size for each fresh hook command; separate from observer RSS and latency samples', cacheBytes, results }));

} finally { await daemon.stop(); }
