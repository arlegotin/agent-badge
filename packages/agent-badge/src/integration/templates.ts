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
  // Validate bootstrap commands before repository discovery or runtime installation.
  const setup = command === 'setup' || command === 'init';
  let help = command === '--help' || command === '-h';
  let showVersion = command === '--version';
  if (setup) {
    const args = process.argv.slice(3);
    for (let index = 0; index < args.length; index++) {
      const argument = args[index];
      if (argument === '--help' || argument === '-h') { help = true; continue; }
      if (argument === '--version') { showVersion = true; continue; }
      if (argument === '--dry-run') continue;
      const separator = argument.indexOf('=');
      const option = separator < 0 ? argument : argument.slice(0, separator);
      if (!['--target', '--repository-url', '--runtime-version'].includes(option)) throw new Error('Invalid setup argument.');
      const value = separator < 0 ? args[++index] : argument.slice(separator + 1);
      if (!value || value.startsWith('-')) throw new Error('Invalid setup argument.');
      if (option === '--target' && !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(value)) throw new Error('Invalid setup target.');
      if (option === '--runtime-version' && !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value)) throw new Error('Invalid exact runtime version.');
      if (option === '--repository-url') {
        const url = new URL(value);
        if (/[\x00-\x20\x7f]/.test(value) || !['https:', 'ssh:'].includes(url.protocol) || url.password || (url.protocol === 'https:' && url.username) || url.search || url.hash) throw new Error('Invalid public repository URL.');
      }
    }
  }
  if (help) { console.log('Usage: node .agent-badge/run.cjs setup [--target <remote>] [--repository-url <url>] [--runtime-version <exact-version>] [--dry-run]'); return; }
  if (showVersion) {
    const version = JSON.parse(fs.readFileSync(path.join(root, '.agent-badge/config.json'), 'utf8')).runtimeVersion;
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Invalid exact runtime version.');
    console.log(version); return;
  }
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
  function safeDirectory(p) { const s = fs.lstatSync(p); if (!s.isDirectory() || s.isSymbolicLink() || (process.getuid && s.uid !== process.getuid())) throw new Error('Unsafe runtime directory.'); }
  function directory(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { mode: 0o700 }); safeDirectory(p); }
  function ready(directory) {
    const packageRoot = path.join(directory, 'node_modules/@legotin/agent-badge');
    try {
      for (const p of [directory, path.join(directory, 'node_modules'), path.join(directory, 'node_modules/@legotin'), packageRoot, path.join(packageRoot, 'dist'), path.join(packageRoot, 'dist/cli'), path.join(packageRoot, 'dist/integration')]) safeDirectory(p);
      for (const file of ['package.json', 'dist/cli/main.js', 'dist/integration/runtime.js', 'dist/integration/runtime-worker.js']) { const s = fs.lstatSync(path.join(packageRoot, file)); if (!s.isFile() || s.isSymbolicLink() || (process.getuid && s.uid !== process.getuid())) throw new Error('Unsafe runtime file.'); }
      return JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).version === version;
    } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }
  if (command === 'setup' || command === 'init') { directory(privateDir); directory(path.join(privateDir, 'runtime')); }
  const runtime = path.join(privateDir, 'runtime', hash);
  const cli = path.join(runtime, 'node_modules/@legotin/agent-badge/dist/cli/main.js');
  if (command !== 'setup' && command !== 'init') {
    const a = JSON.parse(fs.readFileSync(path.join(privateDir, 'local.json'), 'utf8'));
    if (a.lockHash !== hash || a.repositoryId !== declaration.repositoryId) throw new Error('Runtime activation required.');
  }
  if (!ready(runtime)) {
    if (command !== 'setup' && command !== 'init') throw new Error('Runtime activation required.');
    const stage = fs.mkdtempSync(path.join(privateDir, 'runtime', '.install-'));
    try {
      fs.writeFileSync(path.join(stage, 'package.json'), manifest); fs.writeFileSync(path.join(stage, 'package-lock.json'), lock);
      const result = cp.spawnSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--workspaces=false'], { cwd: stage, stdio: 'ignore', timeout: 120000 });
      if (result.status !== 0) throw new Error('Runtime installation unavailable; retry setup when online.');
      if (!ready(stage)) throw new Error('Installed runtime incomplete or version mismatch.');
      // Remove only a verified owned hash directory, after its replacement is complete.
      if (fs.existsSync(runtime)) { safeDirectory(runtime); fs.rmSync(runtime, { recursive: true, force: true }); }
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
const started = performance.now();
if (!/^(24|26)\./.test(process.versions.node)) { console.error('agent-badge: Node 24 or 26 required.'); process.exitCode = 0; }
else if (process.platform === 'win32') { console.error('agent-badge: Windows automatic hooks unsupported; use manual sync.'); }
else {
  const path = require('node:path');
  const { pathToFileURL } = require('node:url');
  const privateDir = __dirname;
  async function main() {
    const args=process.argv.slice(2); let provider, duration=2000;
    if(args[0]==='--hook' && ['codex','claude','gemini'].includes(args[1])) { provider=args[1]; args.splice(0,2); }
    else if(args[0]==='--git-hook') args.shift();
    if(args.length) {
      if(![2,4].includes(args.length) || args[0]!=='--remaining-ms' || !/^\d+$/.test(args[1]) || +args[1]<1 || +args[1]>2000) return; duration=+args[1];
      if(args.length===4) {
        if(args[2]!=='--deadline-ms' || !/^\d{1,16}$/.test(args[3]) || !Number.isSafeInteger(+args[3]))return;
        const remaining=+args[3]-Number(process.hrtime.bigint()/1000000n);
        if(remaining>duration)return;
        duration=Math.min(duration,remaining);
      }
      if(duration<1)return;
    }
    let target;
    if(provider) {
      const payload=await new Promise(resolve=>{
        let length=0, chunks=[], done=false;
        const finish=value=>{ if(done)return; done=true;clearTimeout(timer);process.stdin.destroy();resolve(value); };
        const timer=setTimeout(()=>finish(null),Math.max(1,duration-(performance.now()-started)));
        process.stdin.on('data',chunk=>{ length+=chunk.length; if(length>65536)finish(null);else chunks.push(chunk); });
        process.stdin.once('error',()=>finish(null));
        process.stdin.once('end',()=>{try {finish(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{finish(null);} });
      });
      if(!payload || !(provider==='gemini' ? payload.hook_event_name==='AfterModel' : ['Stop','SubagentStop'].includes(payload.hook_event_name))) return;
      const source=payload.hook_event_name==='SubagentStop' ? payload.agent_transcript_path : payload.transcript_path;
      if(typeof source!=='string' || source.length>8192 || !path.isAbsolute(source) || /[\x00-\x1f]/.test(source)) return;
      target={provider,sourceIdentity:source};
      // No text/session/agent identifiers leave this bounded parser.
    }
    const remaining=Math.floor(duration-(performance.now()-started)); if(remaining<1)return;
    const runtime = path.join(privateDir, 'runtime', 'APPROVED_RUNTIME_HASH', 'node_modules/@legotin/agent-badge/dist/integration/runtime.js');
    const m=await import(pathToFileURL(runtime).href);
    const timeoutMs=Math.floor(duration-(performance.now()-started)); if(timeoutMs<1)return;
    const r=await m.runApprovedOperation({ cwd: process.cwd(), privateDir, target, timeoutMs, onDiagnostic: line => console.error(line) }); process.exitCode=r.exitCode;
  }
  main().catch(()=>{console.error('agent-badge: local work queued; run setup or manual sync.');});
}
`;
