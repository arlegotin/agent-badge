// Exact retained candidates, initializer alone, real dependency graph, no uplinks.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { loadArtifacts, tarFiles } from './verify-packed-install.mjs';
import { assertWindowsManualSetup } from './windows-setup-result.mjs';
const execute = promisify(execFile);
const directory = resolve(process.argv[2] ?? 'artifacts/candidate'), closure = resolve(process.argv[3] ?? 'artifacts/dependency-closure');
const { candidate, entries } = await loadArtifacts(directory);
if (!/^(24|26)\./.test(process.versions.node)) throw Error('Use Node 24/26 floor on PATH');
// Runner is a required boundary: refuse execution under an ordinary user HOME.
if (process.env.AGENT_BADGE_TEST_NODE !== process.execPath || process.env.AGENT_BADGE_TEST_PROVIDER_ROOTS !== '{"codex":[],"claude":[],"gemini":[],"opencode":[]}') throw Error('Run through scripts/validation/run-isolated.mjs');
const root = await mkdtemp(join(tmpdir(), 'agent-badge-registry-smoke-'));
const home = join(root, 'home'), cache = join(root, 'cache'), project = join(root, 'project');
const packages = new Map(), requests = [];
let registry;
const env = { ...process.env, HOME: home, USERPROFILE: home, npm_config_cache: cache, npm_config_userconfig: join(root, 'user.npmrc'), npm_config_globalconfig: join(root, 'global.npmrc'), GIT_CONFIG_GLOBAL: join(root, 'gitconfig'), npm_config_ignore_scripts: 'false', GIT_AUTHOR_NAME: 'Synthetic fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Synthetic fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
const npm = 'npm';
function successfulResult(execution, command) {
  if (process.platform === 'win32' && ['init', 'setup'].includes(command)) return assertWindowsManualSetup(execution, command, 'json');
  assert.equal(execution.code, 0);
  const result = execution.stdout.split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }).find(value => value.schemaVersion === 1 && value.command === command);
  assert(result, 'Missing stable command JSON');
  assert(['synced', 'unchanged'].includes(result.status)); assert.equal(result.exitCode, 0); assert.equal(result.pendingReconciliation, false);
  return result;
}
function successfulSetup(execution) {
  if (process.platform === 'win32') return assertWindowsManualSetup(execution, 'setup', 'plaintext');
  assert.equal(execution.code, 0); assert.match(execution.stdout, /^agent-badge: setup unchanged\./m);
}
async function run(command, args, cwd = root, windowsSetupCommand) {
  if (command === npm && process.platform === 'win32') { command = process.execPath; args = [join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), ...args]; }
  try { return { ...await execute(command, args, { cwd, env, timeout: 120000, maxBuffer: 4 * 1024 * 1024 }), code: 0 }; }
  catch (error) {
    if (process.platform === 'win32' && windowsSetupCommand && error.code === 1) {
      const result = { stdout: String(error.stdout ?? ''), stderr: String(error.stderr ?? ''), code: error.code };
      assertWindowsManualSetup(result, windowsSetupCommand, windowsSetupCommand === 'init' || args.includes('--json') ? 'json' : 'plaintext'); return result;
    }
    console.error(String(error.stderr ?? '').slice(0, 4000), String(error.stdout ?? '').slice(0, 4000)); throw new Error('Synthetic smoke command failed: ' + command + ' ' + args.slice(0, 2).join(' '));
  }
}
try {
  for (const path of [home, cache, project]) await mkdir(path, { recursive: true });
  for (const path of [env.npm_config_userconfig, env.npm_config_globalconfig]) await writeFile(path, '');
  await writeFile(env.GIT_CONFIG_GLOBAL, '[credential]\n\thelper =\n');
  const deps = JSON.parse(await readFile(join(closure, 'closure.json'), 'utf8'));
  for (const a of deps) {
    assert(!candidate.artifacts.some(p => p.name === a.name), 'No project-package uplink/closure override');
    assert.match(a.filename, /^[A-Za-z0-9_.-]+\.tgz$/);
    const bytes = await readFile(join(closure, a.filename));
    assert.equal(bytes.length, a.size); assert.equal('sha512-' + createHash('sha512').update(bytes).digest('base64'), a.integrity);
    const manifest = JSON.parse(tarFiles(bytes).get('package/package.json'));
    assert.equal(manifest.name, a.name); assert.equal(manifest.version, a.version);
    entries.push({ ...a, bytes, manifest });
  }
  for (const entry of entries) { assert(!packages.has(entry.name), 'Duplicate closure name'); packages.set(entry.name, entry); }
  registry = createServer((request, response) => {
    if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
    const route = decodeURIComponent(request.url.split('?')[0]); requests.push(route);
    const artifact = entries.find(e => route === '/artifacts/' + e.filename);
    if (artifact) { response.writeHead(200, { 'content-type': 'application/octet-stream' }); response.end(artifact.bytes); return; }
    const name = route.slice(1), entry = packages.get(name);
    if (entry) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ name, 'dist-tags': { latest: entry.version, next: entry.version }, versions: { [entry.version]: { ...entry.manifest, dist: { tarball: env.npm_config_registry + 'artifacts/' + entry.filename, integrity: entry.integrity } } } })); return;
    }
    response.writeHead(404); response.end('{}');
  });
  await new Promise((accept, reject) => { registry.once('error', reject); registry.listen(0, '127.0.0.1', accept); });
  env.npm_config_registry = `http://127.0.0.1:${registry.address().port}/`;
  await run('git', ['init', '--initial-branch=main'], project);
  await run('git', ['init', '--bare', '--initial-branch=main', join(root, 'remote.git')]);
  await run('git', ['remote', 'add', 'origin', join(root, 'remote.git')], project);
  // npm init requests only create-agent-badge; core/CLI resolve transitively from the same registry.
  const initialized = await run(npm, ['init', '--yes', 'agent-badge@' + candidate.version, '--', '--repository-url', 'https://github.com/example/synthetic', '--target', 'origin', '--json'], project, 'init');
  successfulResult(initialized, 'init');
  const privateDir = join(project, '.git/agent-badge'), activation = JSON.parse(await readFile(join(privateDir, 'local.json'), 'utf8'));
  const runtime = join(privateDir, 'runtime', activation.lockHash, 'node_modules/@legotin/agent-badge');
  assert.equal(JSON.parse(await readFile(join(runtime, 'package.json'), 'utf8')).version, candidate.version);
  assert.equal(JSON.parse(await readFile(join(project, '.agent-badge/runtime/package.json'), 'utf8')).dependencies['@legotin/agent-badge'], candidate.version);
  // Installed core must find its packaged workflow resource and generate a complete workflow.
  const core = join(privateDir, 'runtime', activation.lockHash, 'node_modules/@legotin/agent-badge-core/dist/index.js');
  const generation = await run(process.execPath, ['--input-type=module', '-e', `const {generateContributionWorkflow}=await import(${JSON.stringify(pathToFileURL(core).href)});const v=${JSON.stringify(candidate.version)};const manifest=JSON.stringify({private:true,dependencies:{'@legotin/agent-badge':v}});const lock=JSON.stringify({lockfileVersion:3,packages:{'':{dependencies:{'@legotin/agent-badge':v}},'node_modules/@legotin/agent-badge':{version:v,resolved:'https://registry.npmjs.org/synthetic.tgz',integrity:'sha512-c3ludGhldGlj'}}});const text=await generateContributionWorkflow({repositoryId:${JSON.stringify(activation.repositoryId)},repositoryUrl:'https://github.com/example/synthetic',defaultBranch:'main',runtimeVersion:v,pin:{manifest,lock}});if(text.includes('__MANIFEST_BASE64__')||!text.includes('workflow_dispatch:'))throw Error('incomplete installed workflow');console.log('installed-core-resource-generation-passed');`], project);
  assert.match(generation.stdout, /installed-core-resource-generation-passed/);
  // Remove npm-exec's initializer cache; setup is repository-owned and does not require it.
  await rm(cache, { recursive: true, force: true }); await mkdir(cache);
  const setup = () => run(process.execPath, [join(project, '.agent-badge/run.cjs'), 'setup'], project, 'setup');
  successfulSetup(await setup());
  successfulResult(await run(process.execPath,[join(project,'.agent-badge/run.cjs'),'setup','--json'],project,'setup'),'setup');
  const status=JSON.parse((await run(process.execPath,[join(project,'.agent-badge/run.cjs'),'status','--json'],project)).stdout);
  assert.equal(status.state,'synced');assert.equal(status.queuedRecords,0);assert.equal(status.failure,null);
  if (process.platform !== 'win32') {
    const doctor=JSON.parse((await run(process.execPath,[join(project,'.agent-badge/run.cjs'),'doctor','--json'],project)).stdout);
    assert.equal(doctor.status,'healthy');assert.equal(doctor.remote,'not-requested');
  }
  const originalCli = await readFile(join(runtime, 'dist/cli/main.js'), 'utf8');
  await rm(join(runtime, 'dist/cli/main.js')); successfulSetup(await setup());
  assert.equal(await readFile(join(runtime, 'dist/cli/main.js'), 'utf8'), originalCli);
  assert.equal(await readFile(join(project, 'package.json'), 'utf8').catch(() => null), null);
  // Native settings and their ownership both stay local in this first commit.
  await run('git', ['add', '.agent-badge/config.json', '.agent-badge/run.cjs', '.agent-badge/runtime', '.agent-badge/README.md', '.agent-badge/ownership.json', 'README.md'], project);
  await run('git', ['-c', 'core.hooksPath=' + join(root, 'empty-hooks'), 'commit', '-m', 'Synthetic installed declaration'], project);
  await run('git', ['-c', 'core.hooksPath=' + join(root, 'empty-hooks'), 'push', 'origin', 'HEAD:refs/heads/main'], project);
  const clone = join(root, 'fresh-clone'); await run('git', ['clone', join(root, 'remote.git'), clone]);
  const dry=JSON.parse((await run(process.execPath,[join(clone,'.agent-badge/run.cjs'),'setup','--dry-run','--json'],clone)).stdout);
  assert.equal(dry.status,'bootstrap-planned');assert.equal(dry.applied,false);
  assert(!(await readdir(join(clone,'.git'))).includes('agent-badge'));
  const fresh = await run(process.execPath, [join(clone, '.agent-badge/run.cjs'), 'setup', '--target', 'origin'], clone, 'setup');
  successfulSetup(fresh);
  const clonePrivate = join(clone, '.git/agent-badge'), cloned = JSON.parse(await readFile(join(clonePrivate, 'local.json'), 'utf8'));
  assert.equal(cloned.repositoryId, activation.repositoryId); assert.equal(cloned.initializeAllowed, false);
  // Prove approved worker runtime, rather than inferring it from the invoking process.
  const workerPath = join(clonePrivate, 'runtime', cloned.lockHash, 'node_modules/@legotin/agent-badge-core/dist/operations/worker-sync.js'), original = await readFile(workerPath, 'utf8'), proof = join(root, 'worker-runtime.json');
  try {
    await writeFile(workerPath, `import{writeFileSync as proofWrite}from'node:fs';proofWrite(${JSON.stringify(proof)},JSON.stringify({node:process.version,execPath:process.execPath}));\n` + original);
    const synced = await run(process.execPath, [join(clone, '.agent-badge/run.cjs'), 'sync', '--json'], clone);
    successfulResult(synced, 'sync');
  } finally { await writeFile(workerPath, original); }
  const actualWorker = JSON.parse(await readFile(proof, 'utf8')); assert.equal(actualWorker.node, process.version); assert.equal(actualWorker.execPath, process.execPath);
  // The other coherent commit set tracks exact reviewed native definitions with ownership.
  const nativeFiles = ['.agent-badge/agent-hooks.json', '.codex/hooks.json', '.claude/settings.json', '.gemini/settings.json'];
  await run('git', ['add', ...nativeFiles], project);
  await run('git', ['-c', 'core.hooksPath=' + join(root, 'empty-hooks'), 'commit', '-m', 'Synthetic reviewed hook definitions and ownership'], project);
  await run('git', ['-c', 'core.hooksPath=' + join(root, 'empty-hooks'), 'push', 'origin', 'HEAD:refs/heads/main'], project);
  const trackedClone = join(root, 'fresh-clone-tracked-hooks'); await run('git', ['clone', join(root, 'remote.git'), trackedClone]);
  const trackedSetup = await run(process.execPath, [join(trackedClone, '.agent-badge/run.cjs'), 'setup', '--target', 'origin'], trackedClone, 'setup');
  successfulSetup(trackedSetup);
  const trackedActivation = JSON.parse(await readFile(join(trackedClone, '.git/agent-badge/local.json'), 'utf8'));
  assert.equal(trackedActivation.repositoryId, activation.repositoryId); assert.equal(trackedActivation.initializeAllowed, false);
  for (const file of nativeFiles) assert.equal(await readFile(join(trackedClone, file), 'utf8'), await readFile(join(project, file), 'utf8'));
  const standalone=join(root,'standalone-clone'),standaloneRemote=join(root,'standalone.git');
  await run('git',['clone',join(root,'remote.git'),standalone]);
  await run('git',['init','--bare','--initial-branch=main',standaloneRemote]);
  await run('git',['remote','set-url','origin',standaloneRemote],standalone);
  successfulResult(await run(process.execPath,[join(standalone,'.agent-badge/run.cjs'),'setup','--new-repository','--repository-url','https://github.com/example/standalone','--target','origin','--json'],standalone,'setup'),'setup');
  const standaloneActivation=JSON.parse(await readFile(join(standalone,'.git/agent-badge/local.json'),'utf8'));
  assert.notEqual(standaloneActivation.repositoryId,activation.repositoryId);
  if (process.platform !== 'win32') {
    await writeFile(join(clone, '.agent-badge/run.cjs'), 'throw new Error("UNTRUSTED launcher executed");');
    // Local/file automatic publication is unsupported and may report it; no receiver or live route is used.
    const automatic = await run(process.execPath, [join(clonePrivate, 'bootstrap.cjs')], clone);
    assert.doesNotMatch(automatic.stderr, /UNTRUSTED launcher executed/);
  }
  for (const a of candidate.artifacts) assert(requests.some(route => route === '/artifacts/' + a.filename));
  console.log(JSON.stringify({ status: 'candidate-registry-smoke-passed', sha: candidate.sha, runtime: process.version, actualWorker, platform: `${process.platform}/${process.arch}`, initializerOnly: true, scripts: 'default-enabled', projectUplinks: false, externalRoutes: false, checks: ['single-command-npm-init', 'same-registry-transitive-dependencies', 'installed-core-workflow-generation', 'repository-owned-setup', 'partial-runtime-repair', 'fresh-clone-local-native-config', 'fresh-clone-tracked-reviewed-native-config', 'manual-cli-core-worker-runtime-proof', 'persistent-setup-json', 'nonmutating-fresh-dry-run', 'standalone-fork-setup', 'indexed-status', ...(process.platform === 'win32' ? [] : ['owned-doctor-worker'])], artifacts: candidate.artifacts }));
} finally {
  if (registry) await new Promise(accept => registry.close(accept));
  await rm(root, { recursive: true, force: true });
}
