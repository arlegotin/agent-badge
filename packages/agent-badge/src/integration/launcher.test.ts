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
  if (command === 'status') expect(result.stderr).toContain('explicit setup'); else expect(result.stdout).toContain(command === '--version' ? '1.1.20' : 'setup');
  expect(await readdir(join(cwd, '.git'))).not.toContain('agent-badge');
});

async function launcherFixture() {
  const f = await createBareRemoteFixture(); fixtures.push(f); const cwd = f.clones[0], version = '1.1.20';
  const pin = { manifest: JSON.stringify({ private: true, dependencies: { '@legotin/agent-badge': version } }), lock: JSON.stringify({ lockfileVersion: 3, packages: { '': { dependencies: { '@legotin/agent-badge': version } }, 'node_modules/@legotin/agent-badge': { version, resolved: 'https://registry.npmjs.org/@legotin/agent-badge/-/agent-badge-1.1.20.tgz', integrity: 'sha512-c3ludGhldGlj' } } }) };
  await mkdir(join(cwd, '.agent-badge/runtime'), { recursive: true });
  await writeFile(join(cwd, '.agent-badge/run.cjs'), launcherSource);
  await writeFile(join(cwd, '.agent-badge/config.json'), JSON.stringify({ runtimeVersion: version }));
  await writeFile(join(cwd, '.agent-badge/runtime/package.json'), pin.manifest);
  await writeFile(join(cwd, '.agent-badge/runtime/package-lock.json'), pin.lock);
  return { f, cwd, pin };
}

test.each([
  { args: ['setup', '--help'], code: 0 },
  { args: ['setup', '--version'], code: 0 },
  { args: ['setup', '--target', 'bad remote'], code: 64 },
  { args: ['setup', '--runtime-version=^1.1.20'], code: 64 },
  { args: ['setup', '--definitely-invalid'], code: 64 },
  { args: ['setup', '--target'], code: 64 },
  { args: ['setup', '--target', '-unsafe'], code: 64 },
  { args: ['setup', '--runtime-version', '^1.1.20'], code: 64 },
  { args: ['setup', '--repository-url', 'file:///synthetic/private'], code: 64 },
  { args: ['setup', '--repository-url', 'https://token@example.invalid/repo'], code: 64 },
])('launcher validates $args before Git discovery, installs, or mutations', async ({ args, code }) => {
  const { f, cwd } = await launcherFixture(), bin = join(f.root, 'bin'); await mkdir(bin);
  for (const command of ['git', 'npm']) await writeFile(join(bin, command), '#!/bin/sh\necho forbidden > "$CALL_MARKER"\nexit 97\n', { mode: 0o700 });
  const result = await execute(node24, [join(cwd, '.agent-badge/run.cjs'), ...args], { cwd, env: { ...process.env, PATH: bin, CALL_MARKER: join(f.root, 'subprocess-ran') } }).then(r => ({ ...r, code: 0 })).catch(e => ({ ...e, code: e.code }));
  expect(result.code).toBe(code); expect(await readdir(f.root)).not.toContain('subprocess-ran');
  expect(await readdir(join(cwd, '.git'))).not.toContain('agent-badge');
  if (code === 0) expect(result.stdout).toContain(args.includes('--version') ? '1.1.20' : 'setup');
});

async function repairFixture() {
  const fixture = await launcherFixture(); const { f, cwd, pin } = fixture;
  const { createHash } = await import('node:crypto'); const hash = createHash('sha256').update(pin.manifest + '\0' + pin.lock).digest('hex');
  const privateDir = join(cwd, '.git/agent-badge'), runtime = join(privateDir, 'runtime', hash);
  const packageRoot = join(runtime, 'node_modules/@legotin/agent-badge');
  await mkdir(join(packageRoot, 'dist/integration'), { recursive: true });
  await writeFile(join(packageRoot, 'package.json'), '{"name":"@legotin/agent-badge","version":"1.1.20"}');
  await writeFile(join(packageRoot, 'dist/integration/runtime.js'), 'old partial runtime');
  await writeFile(join(runtime, 'retained-partial'), 'old partial bytes');
  const bin = join(f.root, 'bin'); await mkdir(bin);
  await writeFile(join(bin, 'npm'), '#!/bin/sh\nmkdir -p node_modules/@legotin/agent-badge/dist/cli node_modules/@legotin/agent-badge/dist/integration\nprintf \'%s\' \'{"name":"@legotin/agent-badge","version":"1.1.20"}\' > node_modules/@legotin/agent-badge/package.json\nprintf \'%s\' \'require("node:fs").writeFileSync(process.env.REPAIR_MARKER,"repaired");\' > node_modules/@legotin/agent-badge/dist/cli/main.js\nprintf \'%s\' \'exports.valid=true;\' > node_modules/@legotin/agent-badge/dist/integration/runtime.js\nprintf \'%s\' \'exports.valid=true;\' > node_modules/@legotin/agent-badge/dist/integration/runtime-worker.js\n', { mode: 0o700 });
  return { ...fixture, privateDir, runtime, bin };
}

test('explicit launcher setup repairs a nonempty runtime missing its CLI only after staged verification', async () => {
  const { f, cwd, runtime, bin } = await repairFixture();
  const result = await execute(node24, [join(cwd, '.agent-badge/run.cjs'), 'setup'], { cwd, env: { ...process.env, PATH: bin + ':' + process.env.PATH, REPAIR_MARKER: join(f.root, 'repaired') } }).then(r => ({ ...r, code: 0 })).catch(e => ({ ...e, code: e.code }));
  expect(result.code, result.stderr).toBe(0); expect(await readFile(join(f.root, 'repaired'), 'utf8')).toBe('repaired');
  expect(await readdir(runtime)).not.toContain('retained-partial');
});

test('a failed staged replacement retains the existing partial runtime', async () => {
  const { cwd, runtime, bin } = await repairFixture();
  await writeFile(join(bin, 'npm'), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  await expect(execute(node24, [join(cwd, '.agent-badge/run.cjs'), 'setup'], { cwd, env: { ...process.env, PATH: bin + ':' + process.env.PATH } })).rejects.toThrow();
  expect(await readFile(join(runtime, 'retained-partial'), 'utf8')).toBe('old partial bytes');
});

test('runtime repair refuses a symlink hash directory and preserves its target', async () => {
  const { f, cwd, runtime, bin } = await repairFixture(); const { symlink } = await import('node:fs/promises');
  await rm(runtime, { recursive: true }); await writeFile(join(f.root, 'keep'), 'outside owned runtime'); await symlink(f.root, runtime);
  await expect(execute(node24, [join(cwd, '.agent-badge/run.cjs'), 'setup'], { cwd, env: { ...process.env, PATH: bin + ':' + process.env.PATH } })).rejects.toThrow();
  expect(await readFile(join(f.root, 'keep'), 'utf8')).toBe('outside owned runtime');
  expect((await (await import('node:fs/promises')).lstat(runtime)).isSymbolicLink()).toBe(true);
});

test.each(['missing', 'incomplete'])('launcher dry run preserves %s runtime without npm', async kind => {
  const fixture = kind === 'incomplete' ? await repairFixture() : await launcherFixture();
  const { cwd, f } = fixture;
  const before = await readdir(join(cwd, '.git'), { recursive: true });
  const result = await execute(node24, [join(cwd, '.agent-badge/run.cjs'), 'setup', '--dry-run', '--json', '--import-workflow'], { cwd });
  expect(JSON.parse(result.stdout)).toMatchObject({ command: 'setup', status: 'bootstrap-planned', applied: false });
  expect(await readdir(join(cwd, '.git'), { recursive: true })).toEqual(before);
  expect(await readdir(f.root)).not.toContain('repaired');
});

test('fresh standalone launcher keeps bootstrap acquisition outside private authority', async () => {
  const { cwd, f, privateDir, bin } = await repairFixture();
  await rm(privateDir, { recursive: true });
  // Synthetic installed executable proves the real launcher did not pre-create authority.
  const npm = await readFile(join(bin, 'npm'), 'utf8');
  await writeFile(join(bin, 'npm'), npm.replace('require("node:fs").writeFileSync(process.env.REPAIR_MARKER,"repaired");', 'const fs=require("node:fs");if(fs.existsSync(process.env.PRIVATE_DIR))process.exit(91);fs.writeFileSync(process.env.REPAIR_MARKER,JSON.stringify(process.argv.slice(2)));'));
  const marker = join(f.root, 'forwarded');
  const args = ['setup','--new-repository','--repository-url','https://github.com/example/fork','--json','--import-workflow'];
  await execute(node24, [join(cwd, '.agent-badge/run.cjs'), ...args], { cwd, env: { ...process.env, PATH: bin + ':' + process.env.PATH, PRIVATE_DIR: privateDir, REPAIR_MARKER: marker } });
  expect(JSON.parse(await readFile(marker,'utf8'))).toEqual(args);
  expect(await readdir(join(cwd,'.git'))).not.toContain('agent-badge');
});

test('standalone launcher refuses existing private authority even for dry run', async () => {
  const { cwd, privateDir } = await repairFixture();
  const before = await readdir(privateDir, { recursive:true });
  await expect(execute(node24,[join(cwd,'.agent-badge/run.cjs'),'setup','--new-repository','--repository-url','https://github.com/example/fork','--dry-run'],{cwd})).rejects.toMatchObject({code:1});
  expect(await readdir(privateDir,{recursive:true})).toEqual(before);
});

test('approved complete runtime dry run reports availability without executing or altering it',async()=>{
 const {cwd,privateDir,runtime}=await repairFixture();
 const pkg=join(runtime,'node_modules/@legotin/agent-badge');await mkdir(join(pkg,'dist/cli'));
 await writeFile(join(pkg,'dist/cli/main.js'),'throw Error("dry-run executed runtime");');
 await writeFile(join(pkg,'dist/integration/runtime-worker.js'),'exports.valid=true;');
 await writeFile(join(privateDir,'local.json'),'{"synthetic":"approved fixture"}');
 const before=await readdir(privateDir,{recursive:true});
 const result=await execute(node24,[join(cwd,'.agent-badge/run.cjs'),'setup','--dry-run','--json'],{cwd});
 expect(JSON.parse(result.stdout)).toMatchObject({status:'bootstrap-planned',applied:false,runtimeAcquisition:'available'});
 expect(await readdir(privateDir,{recursive:true})).toEqual(before);
 expect(await readFile(join(pkg,'dist/cli/main.js'),'utf8')).toContain('dry-run executed runtime');
});

test('bootstrap dry run distinguishes requested runtime from acquisition runtime',async()=>{
 const {cwd}=await launcherFixture();
 const result=await execute(node24,[join(cwd,'.agent-badge/run.cjs'),'setup','--dry-run','--json','--runtime-version','2.0.0-next.1'],{cwd});
 expect(JSON.parse(result.stdout)).toMatchObject({runtimeVersion:'2.0.0-next.1',bootstrapRuntimeVersion:'1.1.20',applied:false});
});
