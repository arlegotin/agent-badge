import { expect, test } from 'vitest';
import { connect } from 'node:net';
import { createBareRemoteFixture } from './git-fixtures.js';
import { startFixtureGitDaemon } from './git-daemon.js';

const listening = (port: number) => new Promise<boolean>(resolve => {
  const socket = connect({ host: '127.0.0.1', port });
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
});

test('owned loopback receiver exports only the exact fixture and stops while retaining fixture data', async () => {
  const fixture = await createBareRemoteFixture();
  const daemon = await startFixtureGitDaemon(fixture);
  try {
    expect(daemon.url).toMatch(/^git:\/\/127\.0\.0\.1:\d+\/remote.git$/);
    expect(await fixture.git(fixture.root, ['ls-remote', daemon.url, 'refs/heads/main'])).toContain('refs/heads/main');
    await expect(fixture.git(fixture.root, ['ls-remote', daemon.url.replace('remote.git', 'clone-a/.git')])).rejects.toThrow();
    await expect(fixture.git(fixture.root, ['ls-remote', daemon.url.replace('remote.git', 'remote.git/../clone-a/.git')])).rejects.toThrow();
    expect(await listening(daemon.port)).toBe(true);
    await daemon.stop();
    expect(await listening(daemon.port)).toBe(false);
    const resumed = await startFixtureGitDaemon(fixture, daemon.port);
    try { expect(resumed.url).toBe(daemon.url); expect(await listening(daemon.port)).toBe(true); } finally { await resumed.stop(); }
    expect(await fixture.git(fixture.remote, ['rev-parse', 'refs/heads/main'])).toMatch(/^[a-f0-9]{40}\n$/);
    await daemon.stop();
  } finally { await daemon.stop(); await fixture.cleanup(); }
});

test('interrupted harness stops its owned listener while keeping synthetic repository data', async () => {
  const { spawn } = await import('node:child_process');
  const { readFile, writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const fixture = await createBareRemoteFixture(), marker = join(fixture.root, 'daemon.json'), script = join(fixture.root, 'harness.mjs');
  await writeFile(script, `import{writeFile}from'node:fs/promises';import{startFixtureGitDaemon}from ${JSON.stringify(new URL('./git-daemon.ts', import.meta.url).href)};const daemon=await startFixtureGitDaemon(${JSON.stringify({root:fixture.root,remote:fixture.remote})});await writeFile(${JSON.stringify(marker)},JSON.stringify({port:daemon.port,pid:daemon.pid}));setInterval(()=>{},1000);`);
  const child = spawn(process.execPath, ['--import', 'tsx', script], { stdio: 'ignore', cwd: process.cwd() });
  const exited = new Promise<number | null>(resolve => child.once('exit', resolve));
  let observed: { port: number; pid: number } | undefined;
  try {
    await expect.poll(async () => { observed = await readFile(marker, 'utf8').then(JSON.parse).catch(() => undefined); return Boolean(observed); }).toBe(true);
    expect(await listening(observed!.port)).toBe(true);
    child.kill('SIGTERM'); expect(await exited).toBe(143);
    expect(await listening(observed!.port)).toBe(false);
    expect(await fixture.git(fixture.remote, ['rev-parse', 'refs/heads/main'])).toMatch(/^[a-f0-9]{40}\n$/);
  } finally {
    child.kill('SIGKILL');
    if (observed) try { process.kill(-observed.pid, 'SIGKILL'); } catch { /* Exact owned group is already stopped. */ }
    await fixture.cleanup();
  }
});
