/** Diagnose receiver-log backpressure while its owning harness blocks in spawnSync. */
import { spawnSync } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay, setImmediate as yieldToReceiver } from 'node:timers/promises';
import { startFixtureGitDaemon } from '../../packages/testkit/src/git-daemon.js';

const root = await realpath(process.argv[2]);
const receiver = JSON.parse(await readFile(join(root, 'receiver.json'), 'utf8'));
const daemon = await startFixtureGitDaemon({ root, remote: join(root, 'remote.git') }, receiver.port);
try {
  const sample = () => {
    const start = performance.now();
    const child = spawnSync('git', ['ls-remote', '--refs', daemon.url, 'refs/heads/agent-badge/data'], {
      encoding: 'utf8', timeout: 1000,
    });
    return { ms: performance.now() - start, status: child.status, signal: child.signal,
      error: child.error && (child.error as NodeJS.ErrnoException).code, stderr: child.stderr, stdout: child.stdout };
  };
  let completed = 0;
  const yielding = process.argv.includes('yield');
  for (let operation = 1; operation <= (yielding ? 60 : 500); operation++) {
    if(yielding)await yieldToReceiver();
    const result = sample();
    if (result.status !== 0) { console.log(JSON.stringify({ phase: 'blocked-parent', operation, result })); break; }
    completed++;
  }
  // The receiver and repository remain unchanged; only let this parent's log reader run.
  await delay(100);
  console.log(JSON.stringify({ phase: 'after-event-loop-yield', completed, result: sample() }));
} finally { await daemon.stop(); }
