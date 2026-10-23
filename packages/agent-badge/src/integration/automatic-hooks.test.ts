import { realpath as fixtureRealpath } from 'node:fs/promises';
import { tmpdir as fixtureTmpdir } from 'node:os';
import { join as fixtureJoin } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { planSetup, applySetup } from './setup.js';
import { codexRollout, createGeminiFixtureHome, geminiSavedSession } from '@agent-badge/testkit';
import { openStore } from '@legotin/agent-badge-core';
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
const node = process.env.AGENT_BADGE_TEST_NODE ?? process.execPath;
async function fixture(provider: 'codex' | 'gemini' = 'codex') {
  const root = await fixtureRealpath(await mkdtemp(fixtureJoin(fixtureTmpdir(), 'agent-badge-automatic-'))); roots.push(root);
  const cwd = join(root, 'repo with spaces'); await mkdir(cwd); spawnSync('git', ['init', '-q'], { cwd });
  spawnSync('git', ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '--allow-empty', '-qm', 'before'], { cwd });
  const home = join(root, 'codex'); await mkdir(join(home, 'sessions'), { recursive: true });
  const gemini = await createGeminiFixtureHome(cwd); roots.push(gemini.root);
  const version = '1.1.20';
  const pin = { manifest: JSON.stringify({ name: 'runtime', private: true, dependencies: { '@legotin/agent-badge': version } }), lock: JSON.stringify({ lockfileVersion: 3, packages: { '': { dependencies: { '@legotin/agent-badge': version } }, 'node_modules/@legotin/agent-badge': { version, resolved: 'https://registry.npmjs.org/@legotin/agent-badge/-/agent-badge-1.1.20.tgz', integrity: 'sha512-c3ludGhldGlj' } } }) };
  const plan = await planSetup({ cwd, nodeVersion: '24.0.0', runtimeVersion: version, declaredUrl: 'https://github.com/synthetic/fixture', roots: { codex: provider === 'codex' ? [home] : [], claude: [], gemini: provider === 'gemini' ? [gemini.root] : [] }, resolvePin: async () => pin,
    installRuntime: async directory => {
      const cli = join(directory, 'node_modules/@legotin/agent-badge'); await mkdir(join(cli, 'dist'), { recursive: true });
      await cp(resolve('packages/agent-badge/dist/integration'), join(cli, 'dist/integration'), { recursive: true });
      await mkdir(join(cli, 'dist/cli')); await writeFile(join(cli, 'dist/cli/main.js'), '// fixture entry');
      await writeFile(join(cli, 'package.json'), JSON.stringify({ name: '@legotin/agent-badge', type: 'module', version }));
      await symlink(resolve('packages/core'), join(directory, 'node_modules/@legotin/agent-badge-core'));
    }, runInitialOperation: async () => ({ status: 'queued', exitCode: 1, acknowledgedCount: 0, queuedCount: null, pendingReconciliation: true }) });
  await applySetup(plan);
  const installed = join(plan.repository.privateDir, 'runtime', plan.lockHash, 'node_modules/@legotin/agent-badge');
  return { root, cwd, home, gemini, plan, installed, bootstrap: join(plan.repository.privateDir, 'bootstrap.cjs') };
}
test('real approved automatic entry durably captures a targeted source while routing is unbound', async () => {
  const f = await fixture(); const source = join(f.home, 'sessions', 'synthetic.jsonl');
  await writeFile(source, codexRollout({ single: true }).replaceAll('/synthetic/repo', f.cwd));
  const r = spawnSync(node, [f.bootstrap, '--hook', 'codex'], { cwd: f.cwd, input: JSON.stringify({ hook_event_name: 'Stop', transcript_path: source, last_assistant_message: 'never log me' }), encoding: 'utf8', timeout: 3500 });
  expect(r.status, r.stderr).toBe(0); expect(r.stderr).not.toContain('never log me');
  const store = await openStore(f.plan.repository); expect((await store.pending()).length).toBe(1);
  expect((await store.journal()).flatMap(e => e.observations)).toHaveLength(1);
  const outside = join(f.root, 'not-enrolled.jsonl'); await writeFile(outside, codexRollout({ single: true }));
  spawnSync(node, [f.bootstrap, '--hook', 'codex'], { cwd: f.cwd, input: JSON.stringify({ hook_event_name: 'Stop', transcript_path: outside }), encoding: 'utf8', timeout: 3500 });
  expect((await store.pending()).length).toBe(1);
});
test('installed native provider locator reaches the approved worker and durably captures usage', async () => {
  const f = await fixture(), source = join(f.home, 'sessions', 'native-entry.jsonl');
  await writeFile(source, codexRollout({ single: true }).replaceAll('/synthetic/repo', f.cwd));
  const hooks = JSON.parse(await readFile(join(f.cwd, '.codex/hooks.json'), 'utf8'));
  const command = hooks.hooks.Stop.at(-1).hooks[0].command;
  const result = spawnSync('/bin/sh', ['-c', command], { cwd: f.cwd,
    input: JSON.stringify({ hook_event_name: 'Stop', transcript_path: source, last_assistant_message: 'PRIVATE_NATIVE_CANARY' }),
    encoding: 'utf8', timeout: 3500 });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).not.toContain('PRIVATE_NATIVE_CANARY');
  const store = await openStore(f.plan.repository);
  expect(await store.pending()).toHaveLength(1);
  expect((await store.journal()).flatMap(entry => entry.observations)).toHaveLength(1);
});
test('CPU-blocked activation-worker import is killed within the original automatic deadline', async () => {
  const f = await fixture(), entered = join(f.root, 'entered'); await writeFile(join(f.installed, 'dist/integration/runtime-worker.js'), `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(entered)},'entered');while(true) {}`);
  const start = performance.now();
  const r = spawnSync(node, [f.bootstrap], { cwd: f.cwd, encoding: 'utf8', timeout: 3500 });
  expect(r.status, r.stderr).toBe(0); expect(performance.now() - start).toBeLessThan(2300); expect(r.stderr).toMatch(/deadline|queued/);
  expect(await readFile(entered, 'utf8')).toBe('entered');
});
test('stalled activation Git and its helper descendant are killed by the same supervised group', async () => {
  const f = await fixture(), bin = join(f.root, 'bin'), pid = join(f.root, 'helper-pid'); await mkdir(bin);
  const helper = join(f.root, 'helper.cjs'); await writeFile(helper, `require('node:fs').writeFileSync(${JSON.stringify(pid)},String(process.pid));setInterval(()=>{},1000);`);
  await writeFile(join(bin, 'git'), `#!${node}\nrequire('node:child_process').spawn(process.execPath,[${JSON.stringify(helper)}],{stdio:'ignore'});setInterval(()=>{},1000);`); await chmod(join(bin, 'git'), 0o755);
  const start = performance.now(); const r = spawnSync(node, [f.bootstrap], { cwd: f.cwd, env: { ...process.env, PATH: bin + ':' + process.env.PATH }, encoding: 'utf8', timeout: 3500 });
  expect(r.status, r.stderr).toBe(0); expect(performance.now() - start).toBeLessThan(2300);
  const helperPid = Number(await readFile(pid, 'utf8'));
  try { expect(() => process.kill(helperPid, 0)).toThrow(); }
  finally { try { process.kill(helperPid, 'SIGKILL'); } catch { /* Supervised group already reaped. */ } }
});

test('actual automatic hooks suspend changed pins and capture from a pre-install branch after prior approval', async () => {
  const f = await fixture(), source = join(f.home, 'sessions/synthetic.jsonl');
  await writeFile(source, codexRollout({ single: true }).replaceAll('/synthetic/repo', f.cwd));
  spawnSync('git', ['add', '.agent-badge', '.codex', '.claude', 'README.md'], { cwd: f.cwd });
  expect(spawnSync('git', ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '-qm', 'setup'], { cwd: f.cwd }).status).toBe(0);
  const run = () => spawnSync(node, [f.bootstrap, '--hook', 'codex'], { cwd: f.cwd, input: JSON.stringify({ hook_event_name: 'Stop', transcript_path: source }), encoding: 'utf8', timeout: 3500 });
  await writeFile(join(f.cwd, '.agent-badge/runtime/package-lock.json'), '{}'); expect(run().status).toBe(0);
  const store = await openStore(f.plan.repository); expect(await store.pending()).toHaveLength(0);
  expect(spawnSync('git', ['checkout', '-qf', 'HEAD^'], { cwd: f.cwd }).status).toBe(0); expect(run().status).toBe(0);
  expect(await store.pending()).toHaveLength(1);
});

test('automatic worker lease is cleaned after CPU timeout so the next real hook can capture', async () => {
  const f = await fixture(), worker = join(f.installed, 'dist/integration/runtime-worker.js'), original = await readFile(worker, 'utf8'), entered = join(f.root, 'locked');
  await writeFile(worker, `import {openStore,resolveRepository} from '@legotin/agent-badge-core';import {writeFileSync} from 'node:fs';export async function runOperation(input,ctx){const repo=await resolveRepository(input.cwd);const store=await openStore(repo,{supervisedLeaseToken:ctx.leaseToken});return store.withLock(ctx.signal,async()=>{writeFileSync(${JSON.stringify(entered)},'locked');while(true){}});}`);
  const start = performance.now(); const timed = spawnSync(node, [f.bootstrap], { cwd: f.cwd, encoding: 'utf8', timeout: 3500 });
  expect(timed.status, timed.stderr).toBe(0); expect(performance.now() - start).toBeLessThan(2300); expect(await readFile(entered, 'utf8')).toBe('locked');
  await writeFile(worker, original); const source = join(f.home, 'sessions/after-timeout.jsonl'); await writeFile(source, codexRollout({ single: true }).replaceAll('/synthetic/repo', f.cwd));
  const next = spawnSync(node, [f.bootstrap, '--hook', 'codex'], { cwd: f.cwd, input: JSON.stringify({ hook_event_name: 'Stop', transcript_path: source }), encoding: 'utf8', timeout: 3500 });
  expect(next.status, next.stderr).toBe(0); expect(await (await openStore(f.plan.repository)).pending()).toHaveLength(1);
});

test('Git driver includes delayed bootstrap startup in the same absolute deadline', async () => {
  const f = await fixture(), entered = join(f.root, 'entered-delayed-bootstrap');
  await writeFile(join(f.installed, 'dist/integration/runtime-worker.js'), `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(entered)},'entered');while(true){}`);
  const bootstrap = await readFile(f.bootstrap, 'utf8');
  await writeFile(f.bootstrap, bootstrap.replace("'use strict';", "'use strict'; const delay=performance.now();while(performance.now()-delay<400){}"));
  const started = performance.now();
  const r = spawnSync(node, [join(f.plan.repository.privateDir, 'git-hook.cjs'), ''], { cwd: f.cwd, input: 'refs\n', encoding: 'utf8', timeout: 3500 });
  expect(r.status, r.stderr).toBe(0); expect(performance.now() - started).toBeLessThan(2300); expect(await readFile(entered, 'utf8')).toBe('entered');
});

test('expired startup and invalid propagated deadlines skip before importing a worker', async () => {
  const f = await fixture(), entered = join(f.root, 'must-not-enter');
  await writeFile(join(f.installed, 'dist/integration/runtime-worker.js'), `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(entered)},'entered');while(true){}`);
  const original = await readFile(f.bootstrap, 'utf8');
  await writeFile(f.bootstrap, original.replace("'use strict';", "'use strict'; const delay=performance.now();while(performance.now()-delay<2100){}"));
  const driver = spawnSync(node, [join(f.plan.repository.privateDir, 'git-hook.cjs'), ''], { cwd: f.cwd, input: 'refs\n', encoding: 'utf8', timeout: 3000 });
  expect(driver.status, driver.stderr).toBe(0); await expect(readFile(entered)).rejects.toThrow();
  await writeFile(f.bootstrap, original);
  for (const deadline of ['invalid', '9007199254740992', String(Number(process.hrtime.bigint()/1000000n) + 60000)]) {
    const r = spawnSync(node, [f.bootstrap, '--git-hook', '--remaining-ms', '2000', '--deadline-ms', deadline], { cwd: f.cwd, encoding: 'utf8', timeout: 1000 });
    expect(r.status, r.stderr).toBe(0); await expect(readFile(entered)).rejects.toThrow();
  }
});

test('Gemini approved targeted and untargeted automatic collection share receipts and reject an unenrolled AfterModel path', async () => {
  const f = await fixture('gemini'), source = f.gemini.path;
  const run = (path?: string, event = 'AfterModel') => spawnSync(node, [f.bootstrap, ...(path ? ['--hook', 'gemini'] : ['--git-hook'])], { cwd: f.cwd, input: path ? JSON.stringify({ hook_event_name: event, transcript_path: path, llm_response: { text: 'PRIVATE_HOOK_CONTENT', usage_metadata: { total_token_count: 99999 } }, session_id: 'PRIVATE_ID' }) : 'refs\n', encoding: 'utf8', timeout: 3500 });
  const first = run(source); expect(first.status, first.stderr).toBe(0); expect(first.stderr).not.toContain('PRIVATE_HOOK_CONTENT');
  const store = await openStore(f.plan.repository); expect(await store.pending()).toHaveLength(1);
  expect(await store.pending()).toMatchObject([{ provider: 'gemini', quality: 'partial', meters: [{ total: 135, toolInput: 5 }] }]);
  expect((await store.journal()).flatMap(e => e.observations)).toHaveLength(1);
  const outside = join(f.root, 'not-enrolled.jsonl'); await writeFile(outside, (await geminiSavedSession(f.cwd)).replaceAll('synthetic-response', 'outside-response'));
  expect(run(outside).status).toBe(0); expect(await store.pending()).toHaveLength(1);
  const second = join(f.gemini.root, 'tmp/synthetic-project/chats/session-second.jsonl'); await writeFile(second, (await geminiSavedSession(f.cwd)).replaceAll('synthetic-response', 'second-response'));
  expect(run(second, 'Stop').status).toBe(0); expect(await store.pending()).toHaveLength(1);
  expect(run().status).toBe(0); expect(await store.pending()).toHaveLength(2);
  expect(run(source).status).toBe(0); expect(await store.pending()).toHaveLength(2);
  expect(JSON.stringify(await store.pending())).not.toMatch(/PRIVATE_HOOK_CONTENT|PRIVATE_GEMINI_TRANSCRIPT_CANARY|PRIVATE_ID|synthetic-response/);
});
