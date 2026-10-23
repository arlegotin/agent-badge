import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { basename, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFile } from 'node:fs/promises';
import { realpath } from 'node:fs/promises';
import type { GitFixture } from './git-fixtures.js';

export interface FixtureGitDaemon {
  readonly url: string;
  readonly port: number;
  readonly pid: number;
  stop(): Promise<void>;
}

async function unusedLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (!address || typeof address === 'string') throw Error('Synthetic loopback port unavailable');
  return address.port;
}

/** Own the receiver separately from supervised clients, as a hosted Git service does. */
export async function startFixtureGitDaemon(fixture: Pick<GitFixture, 'root' | 'remote'>, retainedPort?: number): Promise<FixtureGitDaemon> {
  const root = await realpath(fixture.root), remote = await realpath(fixture.remote);
  if (process.platform === 'win32') throw Error('POSIX receiver fixture unsupported on Windows');
  if (dirname(root) !== await realpath(tmpdir()) || !/^agent-badge-git-[A-Za-z0-9_-]+$/.test(basename(root)) || dirname(remote) !== root || basename(remote) !== 'remote.git')
    throw Error('Receiver requires an exact synthetic bare fixture');
  if (retainedPort !== undefined && (!Number.isSafeInteger(retainedPort) || retainedPort < 1024 || retainedPort > 65535))
    throw Error('Invalid retained synthetic port');
  const port = retainedPort ?? await unusedLoopbackPort();
  const gitConfig = root + '/receiver.gitconfig';
  await writeFile(gitConfig, '[credential]\n\thelper =\n');
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  const child = spawn('git', ['-c', 'gc.auto=0', '-c', 'maintenance.auto=false', 'daemon',
    '--reuseaddr', '--verbose', '--listen=127.0.0.1', `--port=${port}`, `--base-path=${root}`,
    '--strict-paths', '--export-all', '--enable=receive-pack', '--disable=upload-archive', remote], {
    cwd: root, detached: true, stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: gitConfig, GIT_TERMINAL_PROMPT: '0' },
  });
  let exited = false, stopping: Promise<void> | undefined;
  const lifetime = setTimeout(() => { void stop(); }, 2 * 60 * 60 * 1000);
  lifetime.unref();
  const closed = new Promise<void>(resolve => child.once('close', () => { exited = true; resolve(); }));
  const killOwnedGroup = (signal: NodeJS.Signals) => {
    if (!child.pid) return;
    try { process.kill(-child.pid, signal); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  };
  const onExit = () => killOwnedGroup('SIGKILL');
  const onInterrupt = () => { void stop().finally(() => process.exit(130)); };
  const onTerminate = () => { void stop().finally(() => process.exit(143)); };
  async function stop(): Promise<void> {
    if (stopping) return stopping;
    stopping = (async () => {
      clearTimeout(lifetime);
      try {
        killOwnedGroup('SIGTERM');
        if (!exited) await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 500))]);
        // The exact owned group can still contain a receiver after its leader exits.
        killOwnedGroup('SIGKILL');
        await closed;
      } finally {
        process.removeListener('exit', onExit);
        process.removeListener('SIGINT', onInterrupt);
        process.removeListener('SIGTERM', onTerminate);
      }
    })();
    return stopping;
  }
  process.once('exit', onExit);
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => finish(Error('Synthetic receiver startup timed out')), 3000);
      let stderr = '';
      const finish = (error?: Error) => {
        clearTimeout(timer); child.removeListener('error', failed); child.removeListener('exit', ended);
        error ? reject(error) : resolve();
      };
      const failed = (error: Error) => finish(error);
      const ended = () => finish(Error('Synthetic receiver exited before readiness'));
      child.once('error', failed); child.once('exit', ended);
      child.stderr.on('data', bytes => {
        stderr = (stderr + String(bytes)).slice(-4096);
        if (stderr.includes('Ready to rumble')) finish();
      });
    });
    if (!child.pid) throw Error('Synthetic receiver has no owned PID');
    return { url: `git://127.0.0.1:${port}/remote.git`, port, pid: child.pid, stop };
  } catch (error) { await stop(); throw error; }
}
