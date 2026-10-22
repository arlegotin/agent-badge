// Controlled loopback registry: exercise actual packed artifacts without public registry traffic.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, realpath, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const execute = promisify(execFile);
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const root = await mkdtemp('/private/tmp/agent-badge-initializer-smoke-');
const packs = join(root, 'packs'), home = join(root, 'home'), cache = join(root, 'cache'), project = join(root, 'project');
const packages = new Map(), packed = new Map();
let registry;
const env = { ...process.env, HOME: home, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', npm_config_cache: cache,
  npm_config_userconfig: join(home, '.npmrc'), npm_config_globalconfig: join(root, 'global.npmrc'), npm_config_audit: 'false', npm_config_fund: 'false', npm_config_ignore_scripts: 'true', GIT_AUTHOR_NAME: 'Synthetic fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Synthetic fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
for (const key of Object.keys(env)) if (/^(GH_|GITHUB_|CODEX_|CLAUDE_|NPM_TOKEN|NODE_AUTH_TOKEN)/.test(key)) delete env[key];
async function run(command, args, cwd = root, extra = {}) {
  try { return await execute(command, args, { cwd, env, timeout: 120000, maxBuffer: 4 * 1024 * 1024, ...extra }); }
  catch (error) { console.error(String(error.stderr ?? '').slice(0, 4000), String(error.stdout ?? '').slice(0, 4000)); throw new Error(`Controlled smoke command failed: ${command} ${args.slice(0, 2).join(' ')}`); }
}
async function locate(name, from) {
  const require = createRequire(join(from, 'package.json'));
  for (const directory of require.resolve.paths(name) ?? []) {
    try { const manifest = JSON.parse(await readFile(join(directory, name, 'package.json'), 'utf8')); if (manifest.name === name) return await realpath(join(directory, name)); } catch {}
  }
  throw new Error('Dependency fixture unavailable: ' + name);
}
async function pack(directory) {
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const key = manifest.name + '@' + manifest.version;
  if (packed.has(key)) return;
  packed.set(key, true);
  const { stdout } = await run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', packs], directory);
  const filename = JSON.parse(stdout)[0].filename, bytes = await readFile(join(packs, filename));
  const entry = { manifest, filename, bytes, integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64') };
  const versions = packages.get(manifest.name) ?? new Map(); versions.set(manifest.version, entry); packages.set(manifest.name, versions);
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    const local = dependency === '@legotin/agent-badge' ? join(sourceRoot, 'packages/agent-badge') : dependency === '@legotin/agent-badge-core' ? join(sourceRoot, 'packages/core') : await locate(dependency, directory);
    await pack(local);
  }
}
try {
  if (!/^(24|26)\./.test(process.versions.node)) throw new Error('Run packed initializer smoke under Node 24 or 26 with target Node on PATH.');
  for (const path of [packs, home, cache, project]) await mkdir(path, { recursive: true });
  await writeFile(env.npm_config_userconfig, ''); await writeFile(env.npm_config_globalconfig, '');
  await pack(join(sourceRoot, 'packages/create-agent-badge'));
  registry = createServer((request, response) => {
    const route = decodeURIComponent(request.url.split('?')[0]);
    if (route.startsWith('/artifacts/')) {
      const entry = [...packages.values()].flatMap(v => [...v.values()]).find(e => route === '/artifacts/' + e.filename);
      if (entry) { response.writeHead(200, { 'content-type': 'application/octet-stream' }); response.end(entry.bytes); return; }
    }
    const name = route.slice(1), versions = packages.get(name);
    if (versions) {
      const content = Object.fromEntries([...versions].map(([version, e]) => [version, { ...e.manifest, dist: { tarball: env.npm_config_registry + 'artifacts/' + e.filename, integrity: e.integrity } }]));
      response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ name, 'dist-tags': { latest: [...versions.keys()][0] }, versions: content })); return;
    }
    response.writeHead(404); response.end('{}');
  });
  await new Promise((accept, reject) => { registry.once('error', reject); registry.listen(0, '127.0.0.1', accept); });
  env.npm_config_registry = `http://127.0.0.1:${registry.address().port}/`;
  await writeFile(join(root, 'package.json'), '{"private":true}');
  const version = JSON.parse(await readFile(join(sourceRoot, 'packages/create-agent-badge/package.json'), 'utf8')).version;
  // Only the initializer is requested; all runtime dependencies resolve from controlled actual tarballs.
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', 'create-agent-badge@' + version]);
  const initializer = join(root, 'node_modules/create-agent-badge/dist/index.js');
  await run('git', ['init', '--initial-branch=main'], project);
  await run('git', ['init', '--bare', '--initial-branch=main', join(root, 'remote.git')]);
  await run('git', ['remote', 'add', 'origin', join(root, 'remote.git')], project);
  const result = await run(process.execPath, [initializer, '--repository-url', 'https://github.com/example/synthetic', '--target', 'origin'], project);
  assert.match(result.stdout, /runtime .*usage (synced|unchanged)/);
  const privateDir = join(project, '.git/agent-badge'), activation = JSON.parse(await readFile(join(privateDir, 'local.json'), 'utf8'));
  const runtime = join(privateDir, 'runtime', activation.lockHash, 'node_modules/@legotin/agent-badge');
  assert.equal(JSON.parse(await readFile(join(runtime, 'package.json'), 'utf8')).version, version);
  assert.equal(JSON.parse(await readFile(join(project, '.agent-badge/runtime/package.json'), 'utf8')).dependencies['@legotin/agent-badge'], version);
  // Remove the temporary initializer installation. Fresh-clone activation must still work.
  await rm(join(root, 'node_modules'), { recursive: true, force: true });
  const second = await run(process.execPath, [join(project, '.agent-badge/run.cjs'), 'setup'], project);
  assert.match(second.stdout, /runtime .*usage unchanged/);
  assert.equal(await readFile(join(project, 'package.json'), 'utf8').catch(() => null), null);
  await run('git', ['add', '.agent-badge', 'README.md'], project);
  await run('git', ['commit', '-m', 'Synthetic installed declaration'], project);
  await run('git', ['push', 'origin', 'HEAD:refs/heads/main'], project);
  const clone = join(root, 'fresh-clone'); await run('git', ['clone', join(root, 'remote.git'), clone]);
  const fresh = await run(process.execPath, [join(clone, '.agent-badge/run.cjs'), 'setup', '--target', 'origin'], clone);
  assert.match(fresh.stdout, /runtime .*usage unchanged/);
  const clonePrivate = join(clone, '.git/agent-badge'), cloneActivation = JSON.parse(await readFile(join(clonePrivate, 'local.json'), 'utf8'));
  assert.equal(cloneActivation.repositoryId, activation.repositoryId);
  assert.equal(cloneActivation.initializeAllowed, false);
  const cloneRuntime = join(clonePrivate, 'runtime', cloneActivation.lockHash, 'node_modules/@legotin/agent-badge');
  const child = await run(process.execPath, ['--input-type=module', '-e', `const runtime=await import(${JSON.stringify(new URL('file://' + join(cloneRuntime, 'dist/integration/runtime.js')).href)});const r=await runtime.runApprovedOperation({cwd:process.cwd(),privateDir:${JSON.stringify(clonePrivate)}});if(!['unchanged','synced'].includes(r.status))process.exit(1);console.log(process.version+' private runtime '+r.status);`], clone);
  // A mutable tracked launcher cannot run during automatic collection.
  await writeFile(join(clone, '.agent-badge/run.cjs'), 'throw new Error("UNTRUSTED tracked launcher executed");');
  const automatic = await run(process.execPath, [join(clonePrivate, 'bootstrap.cjs')], clone);
  assert.equal(automatic.stderr, '');
  console.log('Packed initializer persistent-runtime smoke passed: ' + child.stdout.trim() + '; temporary initializer removed; fresh clone explicitly activated; mutable launcher ignored; no root package created.');
} finally {
  if (registry) await new Promise(accept => registry.close(accept));
  await rm(root, { recursive: true, force: true });
}
