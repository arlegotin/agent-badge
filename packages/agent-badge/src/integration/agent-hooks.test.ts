import { afterEach, expect, test, vi } from 'vitest';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { planAgentHooks, applyAgentHookPlan, removeAgentHooks } from './agent-hooks.js';
import { bootstrapSource } from './templates.js';
const roots: string[] = [];
// Retained Node22 Vitest needs its old addon; automatic child processes still
// run the supported explicit toolchain, including shell/provider PATH lookup.
if (process.env.AGENT_BADGE_TEST_NODE) process.env.PATH = dirname(process.env.AGENT_BADGE_TEST_NODE) + ':' + process.env.PATH;
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function fixture() {
  const cwd = await mkdtemp('/private/tmp/agent-badge-provider hooks-'); roots.push(cwd);
  spawnSync('git', ['init', '-q'], { cwd });
  const privateDir = join(cwd, '.git/agent-badge'); await mkdir(privateDir, { recursive: true });
  const hash = 'a'.repeat(64), runtime = join(privateDir, 'runtime', hash, 'node_modules/@legotin/agent-badge/dist/integration');
  await mkdir(runtime, { recursive: true });
  const output = join(cwd, 'routing.json');
  await writeFile(join(runtime, 'runtime.js'), `exports.runApprovedOperation=async o=>{require('node:fs').writeFileSync(${JSON.stringify(output)},JSON.stringify(o));return {exitCode:0};};`);
  await writeFile(join(privateDir, 'bootstrap.cjs'), bootstrapSource.replace('APPROVED_RUNTIME_HASH', hash));
  return { cwd, output, privateDir };
}
async function command(cwd: string, provider: 'codex' | 'claude') {
  const file = provider === 'codex' ? '.codex/hooks.json' : '.claude/settings.json';
  return JSON.parse(await readFile(join(cwd, file), 'utf8')).hooks.Stop.at(-1).hooks[0].command as string;
}
test('JSON adapter preserves unrelated handlers, TOML and trust settings; duplicate setup and removal preserve later additions', async () => {
  const f = await fixture(); await mkdir(join(f.cwd, '.codex')); await mkdir(join(f.cwd, '.claude'));
  const toml = 'model = "synthetic"\n[projects."/synthetic"]\ntrust_level = "untrusted"\n';
  await writeFile(join(f.cwd, '.codex/config.toml'), toml);
  await writeFile(join(f.cwd, '.codex/hooks.json'), JSON.stringify({ other: 'keep', hooks: { Stop: [{ matcher: 'keep', hooks: [{ type: 'command', command: 'echo keep' }] }] } }));
  await writeFile(join(f.cwd, '.claude/settings.json'), JSON.stringify({ permissions: { deny: ['Read(secret)'] }, hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo start' }] }] } }));
  const result = await applyAgentHookPlan(await planAgentHooks(f.cwd)); expect(result.status).toBe('configured-needs-trust');
  const config = JSON.parse(await readFile(join(f.cwd, '.codex/hooks.json'), 'utf8')); expect(config.other).toBe('keep'); expect(config.hooks.Stop[0].hooks[0].command).toBe('echo keep');
  expect(await readFile(join(f.cwd, '.codex/config.toml'), 'utf8')).toBe(toml);
  expect((await planAgentHooks(f.cwd)).changes).toEqual([]);
  const claude = JSON.parse(await readFile(join(f.cwd, '.claude/settings.json'), 'utf8')); expect(claude.permissions.deny).toEqual(['Read(secret)']);
  claude.extra = 'added later'; await writeFile(join(f.cwd, '.claude/settings.json'), JSON.stringify(claude));
  await removeAgentHooks(f.cwd);
  const removed = JSON.parse(await readFile(join(f.cwd, '.claude/settings.json'), 'utf8')); expect(removed.extra).toBe('added later'); expect(removed.hooks.SessionStart).toHaveLength(1); expect(removed.hooks.Stop).toBeUndefined();
  expect((await removeAgentHooks(f.cwd)).status).toBe('unchanged');
});
test.each(['codex', 'claude'] as const)('%s native event adapter forwards only targeted routing and discards assistant text', async provider => {
  const f = await fixture(); await applyAgentHookPlan(await planAgentHooks(f.cwd));
  const cmd = await command(f.cwd, provider); expect(cmd).not.toContain(f.cwd);
  const run = (event: object) => spawnSync('/bin/sh', ['-c', cmd], { cwd: f.cwd, input: JSON.stringify(event), encoding: 'utf8', timeout: 3500 });
  const input = { hook_event_name: 'Stop', transcript_path: '/synthetic/parent.jsonl', cwd: f.cwd, session_id: 'private-session', last_assistant_message: 'NEVER-PERSIST-THIS' };
  expect(run(input).status).toBe(0);
  let routing = await readFile(f.output, 'utf8'); expect(routing).not.toContain('NEVER-PERSIST'); expect(routing).not.toContain('private-session');
  expect(JSON.parse(routing).target).toEqual({ provider, sourceIdentity: '/synthetic/parent.jsonl' });
  expect(run({ ...input, hook_event_name: 'SubagentStop', agent_transcript_path: '/synthetic/child.jsonl', agent_id: 'private-agent' }).status).toBe(0);
  routing = await readFile(f.output, 'utf8'); expect(JSON.parse(routing).target.sourceIdentity).toBe('/synthetic/child.jsonl');
  expect(JSON.parse(routing).timeoutMs).toBeLessThan(2000);
});
test('malformed, oversized and wrong-event payloads never invoke the runtime or expose raw input', async () => {
  const f = await fixture(); await applyAgentHookPlan(await planAgentHooks(f.cwd)); const cmd = await command(f.cwd, 'claude');
  for (const input of ['private malformed', 'x'.repeat(70000), JSON.stringify({ hook_event_name: 'Other', transcript_path: '/secret' }), JSON.stringify({ hook_event_name: 'SubagentStop', transcript_path: '/parent' })]) {
    const r = spawnSync('/bin/sh', ['-c', cmd], { cwd: f.cwd, input, encoding: 'utf8', timeout: 3500 }); expect(r.status).toBe(0); expect(r.stderr).not.toContain('private malformed');
    await expect(readFile(f.output)).rejects.toThrow();
  }
});
test('open provider stdin has a bounded deadline and missing Node reports an actionable soft failure', async () => {
  const f = await fixture(); await applyAgentHookPlan(await planAgentHooks(f.cwd)); const cmd = await command(f.cwd, 'claude');
  const nativeSeconds = JSON.parse(await readFile(join(f.cwd, '.claude/settings.json'), 'utf8')).hooks.Stop.at(-1).hooks[0].timeout;
  const start = performance.now(); const child = spawn('/bin/sh', ['-c', cmd], { cwd: f.cwd, stdio: ['pipe', 'ignore', 'pipe'] });
  let nativeKilled = false;
  await new Promise<void>((resolve, reject) => {
    const nativeTimer = setTimeout(() => { nativeKilled = true; child.kill('SIGKILL'); }, nativeSeconds * 1000);
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('stdin deadline exceeded')); }, 2500);
    child.once('exit', () => { clearTimeout(timer); clearTimeout(nativeTimer); resolve(); });
  });
  expect(nativeKilled).toBe(false);
  expect(performance.now() - start).toBeLessThan(2300);
  const missing = spawnSync('/bin/sh', ['-c', cmd], { cwd: f.cwd, input: '{}', env: { PATH: '/missing' }, encoding: 'utf8' });
  expect(missing.status).toBe(0); expect(missing.stderr).toMatch(/Node.*PATH/);
});
test('unsupported inline TOML and invalid JSON schemas require local action without modifying user settings', async () => {
  const f = await fixture(); await mkdir(join(f.cwd, '.codex')); await mkdir(join(f.cwd, '.claude'));
  await writeFile(join(f.cwd, '.codex/config.toml'), '[hooks]\nStop = "unsupported"\n');
  await writeFile(join(f.cwd, '.claude/settings.json'), '{"hooks":{"Stop":"unsupported"}}\n');
  const p = await planAgentHooks(f.cwd); expect(p.actionItems.join()).toMatch(/inline TOML/); expect(p.actionItems.join()).toMatch(/Claude.*schema/);
  expect(p.changes.some(c => c.path === '.codex/hooks.json' || c.path === '.claude/settings.json')).toBe(false);
});

test('locator Git lookup includes its own helper cleanup and deducted elapsed time', async () => {
  const f = await fixture(); await applyAgentHookPlan(await planAgentHooks(f.cwd)); const cmd = await command(f.cwd, 'codex');
  const bin = join(f.cwd, 'bin'); await mkdir(bin);
  const realGit = spawnSync('/bin/sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  await writeFile(join(bin, 'git'), `#!${process.execPath}\nsetTimeout(()=>{const r=require('node:child_process').spawnSync(${JSON.stringify(realGit)},process.argv.slice(2),{stdio:'inherit'});process.exit(r.status);},250);`, { mode: 0o755 });
  const r = spawnSync('/bin/sh', ['-c', cmd], { cwd: f.cwd, env: { ...process.env, PATH: bin + ':' + process.env.PATH }, input: JSON.stringify({ hook_event_name: 'Stop', transcript_path: '/synthetic/a.jsonl' }), encoding: 'utf8', timeout: 3500 });
  expect(r.status, r.stderr).toBe(0); expect(JSON.parse(await readFile(f.output, 'utf8')).timeoutMs).toBeLessThan(1750);
});

test('Codex linked-worktree hook discovery requires primary-checkout integration and never edits that checkout', async () => {
  const f = await fixture();
  spawnSync('git', ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], { cwd: f.cwd });
  const linked = join(f.cwd, 'linked'); expect(spawnSync('git', ['worktree', 'add', '-qb', 'linked', linked], { cwd: f.cwd }).status).toBe(0);
  const missing = await planAgentHooks(linked); expect(missing.actionItems.join()).toMatch(/primary.checkout.*setup/i);
  await applyAgentHookPlan(missing); await expect(readFile(join(f.cwd, '.codex/hooks.json'))).rejects.toThrow();
  await applyAgentHookPlan(await planAgentHooks(f.cwd));
  const available = await planAgentHooks(linked); expect(available.actionItems.join()).not.toMatch(/primary.checkout.*setup/i); expect(available.notices.join()).toMatch(/primary.checkout/);
  await expect(readFile(join(f.cwd, '.codex/config.toml'))).rejects.toThrow();
});

test('locator timeout reaps a hung Git command and its helper without starting runtime', async () => {
  const f = await fixture(); await applyAgentHookPlan(await planAgentHooks(f.cwd)); const cmd = await command(f.cwd, 'codex');
  const bin = join(f.cwd, 'hung-bin'), pid = join(f.cwd, 'helper-pid'); await mkdir(bin);
  const helper = join(f.cwd, 'helper.cjs'); await writeFile(helper, `require('node:fs').writeFileSync(${JSON.stringify(pid)},String(process.pid));setInterval(()=>{},1000);`);
  await writeFile(join(bin, 'git'), `#!${process.execPath}\nrequire('node:child_process').spawn(process.execPath,[${JSON.stringify(helper)}],{stdio:'ignore'});setInterval(()=>{},1000);`, { mode: 0o755 });
  const start = performance.now();
  const r = spawnSync('/bin/sh', ['-c', cmd], { cwd: f.cwd, env: { ...process.env, PATH: bin + ':' + process.env.PATH }, input: '{}', encoding: 'utf8', timeout: 3500 });
  const helperPid = Number(await readFile(pid, 'utf8'));
  try {
    expect(r.status).toBe(0); expect(performance.now() - start).toBeLessThan(2300); expect(r.stderr).toMatch(/lookup unavailable/);
    expect(() => process.kill(helperPid, 0)).toThrow(); await expect(readFile(f.output)).rejects.toThrow();
  } finally { try { process.kill(helperPid, 'SIGKILL'); } catch { /* Reaped by locator. */ } }
});

test.each(['.codex/hooks.json', '.claude/settings.json', '.agent-badge/agent-hooks.json'])('interrupted provider publication at %s recovers exact ownership without duplicate/adopted handlers', async obstructed => {
  const f = await fixture(); await mkdir(join(f.cwd, '.claude')); const unrelated = { hooks: [{ type: 'command', command: 'echo user-owned', timeout: 5 }] };
  await writeFile(join(f.cwd, '.claude/settings.json'), JSON.stringify({ hooks: { Stop: [unrelated] } }));
  const plan = await planAgentHooks(f.cwd), rename = fs.rename;
  const fault = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => { const result = await rename(from, to); if (String(to) === join(f.cwd, obstructed)) throw new Error('interrupted provider publication'); return result; }); syncBuiltinESMExports();
  try { await expect(applyAgentHookPlan(plan)).rejects.toThrow('interrupted provider publication'); } finally { fault.mockRestore(); syncBuiltinESMExports(); }
  await applyAgentHookPlan(await planAgentHooks(f.cwd));
  const config = JSON.parse(await readFile(join(f.cwd, '.claude/settings.json'), 'utf8')); expect(config.hooks.Stop).toHaveLength(2); expect(config.hooks.Stop[0]).toEqual(unrelated);
  expect(JSON.parse(await readFile(join(f.cwd, '.codex/hooks.json'), 'utf8')).hooks.Stop).toHaveLength(1);
  await removeAgentHooks(f.cwd);
  expect(JSON.parse(await readFile(join(f.cwd, '.claude/settings.json'), 'utf8')).hooks.Stop).toEqual([unrelated]);
});

test.each(['hooks = { Stop = [] }', 'hooks.Stop = []', '["hooks"]\nStop = []', "['hooks']\nStop = []", '"hooks"."Stop" = []'])('parses TOML hook ownership for %s without changing bytes', async toml => {
  const f = await fixture(); await mkdir(join(f.cwd, '.codex')); const bytes = '# keep bytes\r\n' + toml + '\r\n'; await writeFile(join(f.cwd, '.codex/config.toml'), bytes);
  const plan = await planAgentHooks(f.cwd); expect(plan.actionItems.join()).toMatch(/inline TOML/); expect(plan.changes.some(c => c.path === '.codex/hooks.json')).toBe(false); expect(await readFile(join(f.cwd, '.codex/config.toml'), 'utf8')).toBe(bytes);
});

test('primary-checkout TOML hooks block a false linked-worktree configured claim', async () => {
  const f = await fixture(); await applyAgentHookPlan(await planAgentHooks(f.cwd)); await writeFile(join(f.cwd, '.codex/config.toml'), 'hooks = { Stop = [] }\n');
  spawnSync('git', ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], { cwd: f.cwd });
  const linked = join(f.cwd, 'linked'); spawnSync('git', ['worktree', 'add', '-qb', 'linked', linked], { cwd: f.cwd });
  expect((await planAgentHooks(linked)).actionItems.join()).toMatch(/primary.checkout.*setup/);
});

test('provider recovery refuses a third file state and preserves all user changes', async () => {
  const f = await fixture(), plan = await planAgentHooks(f.cwd), rename = fs.rename;
  const fault = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => { const result = await rename(from, to); if (String(to) === join(f.cwd, '.codex/hooks.json')) throw new Error('interrupted'); return result; }); syncBuiltinESMExports();
  try { await expect(applyAgentHookPlan(plan)).rejects.toThrow('interrupted'); } finally { fault.mockRestore(); syncBuiltinESMExports(); }
  const file = join(f.cwd, '.codex/hooks.json'), user = JSON.parse(await readFile(file, 'utf8')); user.userChange = 'preserve'; const bytes = JSON.stringify(user); await writeFile(file, bytes);
  expect((await applyAgentHookPlan(await planAgentHooks(f.cwd))).status).toBe('action-required'); expect((await removeAgentHooks(f.cwd)).status).toBe('action-required'); expect(await readFile(file, 'utf8')).toBe(bytes);
});

test('uninstall completes an exact interrupted install then removes only its owned handlers', async () => {
  const f = await fixture(), plan = await planAgentHooks(f.cwd), rename = fs.rename;
  const fault = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => { const result = await rename(from, to); if (String(to) === join(f.cwd, '.claude/settings.json')) throw new Error('interrupted'); return result; }); syncBuiltinESMExports();
  try { await expect(applyAgentHookPlan(plan)).rejects.toThrow('interrupted'); } finally { fault.mockRestore(); syncBuiltinESMExports(); }
  expect((await removeAgentHooks(f.cwd)).status).toBe('removed');
  for (const path of ['.codex/hooks.json', '.claude/settings.json']) expect(JSON.parse(await readFile(join(f.cwd, path), 'utf8')).hooks.Stop).toBeUndefined();
  await expect(readFile(join(f.privateDir, 'agent-hooks.pending.json'))).rejects.toThrow(); await expect(readFile(join(f.cwd, '.agent-badge/agent-hooks.json'))).rejects.toThrow();
});

test('a pending common-directory provider transaction stays bound to its original worktree', async () => {
  const f = await fixture(); spawnSync('git', ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], { cwd: f.cwd });
  const linked = join(f.cwd, 'linked'); spawnSync('git', ['worktree', 'add', '-qb', 'linked', linked], { cwd: f.cwd });
  const mainPlan = await planAgentHooks(f.cwd), otherPlan = await planAgentHooks(linked), rename = fs.rename;
  const fault = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => { const result = await rename(from, to); if (String(to) === join(f.cwd, '.codex/hooks.json')) throw new Error('interrupted'); return result; }); syncBuiltinESMExports();
  try { await expect(applyAgentHookPlan(mainPlan)).rejects.toThrow('interrupted'); } finally { fault.mockRestore(); syncBuiltinESMExports(); }
  const intent = await readFile(join(f.privateDir, 'agent-hooks.pending.json'), 'utf8');
  await expect(applyAgentHookPlan(otherPlan)).rejects.toThrow(/intent changed/);
  expect((await planAgentHooks(linked)).actionItems.join()).toMatch(/another worktree/); expect((await removeAgentHooks(linked)).status).toBe('action-required');
  expect(await readFile(join(f.privateDir, 'agent-hooks.pending.json'), 'utf8')).toBe(intent); await expect(readFile(join(linked, '.claude/settings.json'))).rejects.toThrow();
  await applyAgentHookPlan(await planAgentHooks(f.cwd));
});

test('concurrent worktree plans cannot overwrite the first published provider intent', async () => {
  const f = await fixture(); spawnSync('git', ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], { cwd: f.cwd });
  const linked = join(f.cwd, 'linked'); spawnSync('git', ['worktree', 'add', '-qb', 'linked', linked], { cwd: f.cwd });
  const plans = [await planAgentHooks(f.cwd), await planAgentHooks(linked)], link = fs.link; let count = 0, release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const fault = vi.spyOn(fs, 'link').mockImplementation(async (from, to) => { if (String(to) === join(f.privateDir, 'agent-hooks.pending.json')) { if (++count === 2) release(); await barrier; } return link(from, to); }); syncBuiltinESMExports();
  let results: PromiseSettledResult<unknown>[];
  try { results = await Promise.allSettled(plans.map(p => applyAgentHookPlan(p))); } finally { fault.mockRestore(); syncBuiltinESMExports(); }
  expect(results!.filter(r => r.status === 'fulfilled')).toHaveLength(1); const winner = results!.findIndex(r => r.status === 'fulfilled');
  expect(JSON.parse(await readFile(join(plans[winner].cwd, '.codex/hooks.json'), 'utf8')).hooks.Stop).toHaveLength(1);
  await expect(readFile(join(plans[1 - winner].cwd, '.codex/hooks.json'))).rejects.toThrow();
});

test('interrupted provider removal resumes its exact tombstone transaction', async () => {
  const f = await fixture(); await applyAgentHookPlan(await planAgentHooks(f.cwd)); const rename = fs.rename;
  const fault = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => { const result = await rename(from, to); if (String(to) === join(f.cwd, '.claude/settings.json')) throw new Error('remove interrupted'); return result; }); syncBuiltinESMExports();
  try { await expect(removeAgentHooks(f.cwd)).rejects.toThrow('remove interrupted'); } finally { fault.mockRestore(); syncBuiltinESMExports(); }
  expect((await planAgentHooks(f.cwd)).actionItems.join()).toMatch(/removal/);
  expect((await removeAgentHooks(f.cwd)).status).toBe('removed'); await expect(readFile(join(f.privateDir, 'agent-hooks.pending.json'))).rejects.toThrow(); await expect(readFile(join(f.cwd, '.agent-badge/agent-hooks.json'))).rejects.toThrow();
});
