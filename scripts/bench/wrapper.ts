import { assertOwnedGitFixture } from '../validation/fixture-root.js';
/** Actual installed shell-entry latency on an already populated synthetic fixture. */
import { spawnSync } from 'node:child_process';
import { readFile, readdir, realpath } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { setImmediate as yieldToReceiver } from 'node:timers/promises';
import { startFixtureGitDaemon } from '../../packages/testkit/src/git-daemon.js';
import { resolveRepository } from '../../packages/core/src/git/context.js';
import { readStoreSnapshot } from '../../packages/core/src/storage/store.js';
import { observeProgress } from './observer.js';

const root = await realpath(process.argv[2]), sampleCount = Number(process.argv[3] ?? 30);
if (!(await assertOwnedGitFixture(root)) || !Number.isSafeInteger(sampleCount) || sampleCount < 30)
  throw Error('Populated synthetic fixture and at least thirty samples required');
const cwd = join(root, 'clone-a'), declaration = JSON.parse(await readFile(join(cwd, '.agent-badge/config.json'), 'utf8'));
if (declaration.declaredUrl !== 'https://github.com/synthetic/benchmark') throw Error('Synthetic fixture required');
const repository = await resolveRepository(cwd), wrapper = join(repository.hooksPath, 'pre-push');
if (!(await readFile(wrapper, 'utf8')).includes(process.execPath)) throw Error('Approved runtime differs');
const receiver = JSON.parse(await readFile(join(root, 'receiver.json'), 'utf8'));
const daemon = await startFixtureGitDaemon({ root, remote: join(root, 'remote.git') }, receiver.port);
try {
  const progress = () => observeProgress(repository.privateDir, async commit => {
    const result = spawnSync('git', ['--no-replace-objects', 'show', `${commit}:summary.json`], { cwd, encoding: 'utf8' });
    if (result.status !== 0) throw Error('Confirmed summary unavailable');
    return result.stdout;
  });
  const before = await progress(), nativeSources = (await readdir(join(root, 'codex/sessions'))).length;
  const samples: {ms:number;queued:boolean}[] = [];
  for(let i=0;i<sampleCount;i++) {
    await yieldToReceiver();
    const start = performance.now(), result = spawnSync(wrapper, [], { cwd, input: 'refs\n', encoding: 'utf8', timeout: 3500 });
    if (result.status !== 0) throw Error('Installed hook failed');
    samples.push({ ms: performance.now() - start, queued: /queued|deadline|unsupported|recovery required/.test(result.stderr) });
  }
  const after = await progress(), snapshot = await readStoreSnapshot(repository);
  const sorted = samples.map(sample => sample.ms).sort((a, b) => a - b);
  console.log(JSON.stringify({ phase: 'installed-pre-push-wrapper', root, node: process.version, execPath: process.execPath,
    sampleCount, warmup: 'no discarded samples; no owning setup/sync/cache repair before measurements', nativeSources,
    confirmedUnits: before.confirmedUnits, journalFiles: before.journalFiles, pending: snapshot.pending.length,
    samples, p95: sorted[Math.ceil(sampleCount * .95) - 1] }));
  if (after.confirmedUnits !== before.confirmedUnits || snapshot.pending.length || samples.some(sample => sample.queued))
    throw Error('Installed warm samples did not remain unchanged and confirmed');
} finally { await daemon.stop(); }
