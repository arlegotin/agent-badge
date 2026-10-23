import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
export function tarFiles(bytes) {
  const tar = gunzipSync(bytes), files = new Map();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const name = tar.subarray(offset, offset + 100).toString().replace(/\0.*$/s, '');
    if (!name) break;
    const size = parseInt(tar.subarray(offset + 124, offset + 136).toString().replace(/\0.*$/s, '').trim(), 8);
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.length) throw Error('Invalid npm tarball');
    if (tar[offset + 156] === 48 || tar[offset + 156] === 0) files.set(name, tar.subarray(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}
export async function loadArtifacts(directory) {
  const candidate = JSON.parse(await readFile(resolve(directory, 'candidate.json'), 'utf8'));
  const expected = ['@legotin/agent-badge-core', '@legotin/agent-badge', 'create-agent-badge'];
  assert.equal(candidate.schemaVersion, 1); assert.match(candidate.sha, /^[a-f0-9]{40}$/); assert.equal(candidate.tag, 'v' + candidate.version);
  assert.deepEqual(candidate.artifacts.map(a => a.name), expected);
  const entries = [];
  for (const [index, a] of candidate.artifacts.entries()) {
    assert.match(a.filename, /^[A-Za-z0-9_.-]+\.tgz$/);
    const bytes = await readFile(resolve(directory, a.filename));
    assert.equal(bytes.length, a.size); assert.equal('sha512-' + createHash('sha512').update(bytes).digest('base64'), a.integrity);
    const files = tarFiles(bytes), manifest = JSON.parse(files.get('package/package.json'));
    assert.equal(manifest.name, a.name); assert.equal(manifest.version, candidate.version); assert.equal(manifest.license, 'Apache-2.0'); assert.equal(manifest.engines.node, '^24.0.0 || ^26.0.0');
    assert.equal(files.get('package/LICENSE').toString(), await readFile(resolve(import.meta.dirname, '../../LICENSE'), 'utf8'));
    if (index) assert.equal(manifest.dependencies[expected[index - 1]], candidate.version);
    if (!index) assert(files.has('package/resources/workflows/agent-badge-import.yml'));
    for (const name of files.keys()) assert(/^(package\/(package.json|LICENSE|CHANGELOG.md|dist\/[^\s]+|resources\/workflows\/agent-badge-import.yml))$/.test(name), 'Unexpected public pack entry');
    entries.push({ ...a, bytes, manifest });
  }
  return { candidate, entries };
}
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  assert.match(process.versions.node, /^(24|26)\./, 'Use supported Node 24/26 on PATH');
  const result = await loadArtifacts(resolve(process.argv[2] ?? 'artifacts/candidate'));
  console.log(JSON.stringify({ status: 'retained-pack-check-passed', sha: result.candidate.sha, runtime: process.version, platform: process.platform, artifacts: result.candidate.artifacts }));
}
