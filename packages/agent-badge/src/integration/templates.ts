/** Explicit user entry. Automatic hooks must start private bootstrap.cjs instead. */
export const launcherSource = String.raw`#!/usr/bin/env node
'use strict';
if (!/^(24|26)\./.test(process.versions.node)) { console.error('agent-badge requires Node 24 or 26.'); process.exit(1); }
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
function main() {
  const root = path.dirname(__dirname);
  const command = process.argv[2] || 'setup';
  let declaration, manifest, lock;
  try {
    declaration = JSON.parse(fs.readFileSync(path.join(root, '.agent-badge/config.json'), 'utf8'));
    manifest = fs.readFileSync(path.join(root, '.agent-badge/runtime/package.json'), 'utf8');
    lock = fs.readFileSync(path.join(root, '.agent-badge/runtime/package-lock.json'), 'utf8');
  } catch { throw new Error('Committed setup unavailable. Run npm init agent-badge@latest explicitly.'); }
  const version = declaration.runtimeVersion;
  const m = JSON.parse(manifest), l = JSON.parse(lock);
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) || m.private !== true ||
      Object.keys(m.dependencies || {}).join(',') !== '@legotin/agent-badge' || m.dependencies['@legotin/agent-badge'] !== version ||
      l.lockfileVersion !== 3 || l.packages?.['']?.dependencies?.['@legotin/agent-badge'] !== version ||
      l.packages?.['node_modules/@legotin/agent-badge']?.version !== version || !l.packages?.['node_modules/@legotin/agent-badge']?.integrity) throw new Error('Invalid exact runtime pin.');
  if (Buffer.byteLength(manifest) > 32 * 1024 || Buffer.byteLength(lock) > 256 * 1024) throw new Error('Runtime lock exceeds supported size.');
  for (const [packagePath, entry] of Object.entries(l.packages || {})) {
    if (packagePath === '') continue;
    if (entry.link || !entry.version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(entry.version) || !entry.resolved || !/^https?:\/\//.test(entry.resolved) || !entry.integrity || !/^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity)) throw new Error('Invalid runtime resolution.');
    const url = new URL(entry.resolved); if (url.username || url.password || url.hash) throw new Error('Invalid runtime resolution.');
  }
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_COMMON_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE', 'GIT_SHALLOW_FILE', 'GIT_IMPLICIT_WORK_TREE', 'GIT_GRAFT_FILE', 'GIT_REPLACE_REF_BASE']) delete env[key];
  const git = args => cp.execFileSync('git', args, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
  if (fs.realpathSync(git(['rev-parse', '--show-toplevel'])) !== fs.realpathSync(root)) throw new Error('Repository boundary mismatch.');
  const common = path.resolve(root, git(['rev-parse', '--git-common-dir']));
  const privateDir = path.join(common, 'agent-badge');
  const hash = crypto.createHash('sha256').update(manifest + '\0' + lock).digest('hex');
  function directory(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { mode: 0o700 }); const s = fs.lstatSync(p); if (!s.isDirectory() || s.isSymbolicLink()) throw new Error('Unsafe runtime directory.'); }
  if (command === 'setup' || command === 'init') { directory(privateDir); directory(path.join(privateDir, 'runtime')); }
  const runtime = path.join(privateDir, 'runtime', hash);
  const cli = path.join(runtime, 'node_modules/@legotin/agent-badge/dist/cli/main.js');
  if (command !== 'setup' && command !== 'init') {
    const a = JSON.parse(fs.readFileSync(path.join(privateDir, 'local.json'), 'utf8'));
    if (a.lockHash !== hash || a.repositoryId !== declaration.repositoryId) throw new Error('Runtime activation required.');
  }
  if (!fs.existsSync(cli)) {
    if (command !== 'setup' && command !== 'init') throw new Error('Runtime activation required.');
    const stage = fs.mkdtempSync(path.join(privateDir, 'runtime', '.install-'));
    try {
      fs.writeFileSync(path.join(stage, 'package.json'), manifest); fs.writeFileSync(path.join(stage, 'package-lock.json'), lock);
      const result = cp.spawnSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--workspaces=false'], { cwd: stage, stdio: 'ignore', timeout: 120000 });
      if (result.status !== 0) throw new Error('Runtime installation unavailable; retry setup when online.');
      const pkg = JSON.parse(fs.readFileSync(path.join(stage, 'node_modules/@legotin/agent-badge/package.json'), 'utf8'));
      if (pkg.version !== version) throw new Error('Installed runtime version mismatch.');
      fs.renameSync(stage, runtime);
    } finally { fs.rmSync(stage, { recursive: true, force: true }); }
  }
  const result = cp.spawnSync(process.execPath, [cli, command, ...process.argv.slice(3)], { cwd: root, env, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
}
try { main(); } catch { console.error('agent-badge: setup unavailable; explicit setup may be required.'); process.exitCode = 1; }
`;

export const bootstrapSource = String.raw`#!/usr/bin/env node
'use strict';
if (!/^(24|26)\./.test(process.versions.node)) { console.error('agent-badge: Node 24 or 26 required.'); process.exitCode = 0; }
else {
  const fs = require('node:fs');
  const path = require('node:path');
  const { pathToFileURL } = require('node:url');
  const privateDir = __dirname;
  const started = performance.now();
  // Only private approved code is loaded; the runtime starts its budget before trust checks.
  try {
    const runtime = path.join(privateDir, 'runtime', 'APPROVED_RUNTIME_HASH', 'node_modules/@legotin/agent-badge/dist/integration/runtime.js');
    import(pathToFileURL(runtime).href).then(m => m.runApprovedOperation({ cwd: process.cwd(), privateDir, timeoutMs: Math.max(1, 2000 - (performance.now() - started)), onDiagnostic: line => console.error(line) })).then(r => { process.exitCode = r.exitCode; }).catch(() => { console.error('agent-badge: local work queued.'); });
  } catch { console.error('agent-badge: local activation required.'); }
}
`;
