// Pack exactly once. A retry consumes this directory; it never invokes Changesets or npm pack.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { integrity, packagePaths, validateWorkspace, type Candidate } from './preflight.js';
const directory = resolve(process.argv[2] ?? 'artifacts/candidate');
const version = await validateWorkspace();
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim()) throw Error('Commit candidate sources before packing');
await mkdir(directory, { recursive: true });
try { await readFile(resolve(directory, 'candidate.json')); throw Error('Candidate already retained; validate/resume it without repacking'); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
const npm = process.platform === 'win32' ? process.execPath : 'npm';
const npmPrefix = process.platform === 'win32' ? [join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')] : [];
const artifacts = [];
for (const path of packagePaths) {
  const [entry] = JSON.parse(execFileSync(npm, [...npmPrefix, 'pack', '--workspace', path, '--json', '--ignore-scripts', '--pack-destination', directory], { encoding: 'utf8' }));
  const bytes = await readFile(resolve(directory, entry.filename));
  artifacts.push({ name: entry.name, version: entry.version, filename: entry.filename, size: bytes.length, integrity: integrity(bytes) });
}
const candidate: Candidate = { schemaVersion: 1, sha, tag: `v${version}`, version, artifacts, runtime: process.version, platform: `${process.platform}/${process.arch}`, checks: { packing: 'passed', publication: 'not-authorized', hostedOidc: 'unverified', hostedPrivateImage: 'unverified' } };
await writeFile(resolve(directory, 'candidate.json'), JSON.stringify(candidate, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(candidate, null, 2));
