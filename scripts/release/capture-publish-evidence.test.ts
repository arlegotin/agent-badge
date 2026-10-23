import { it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { integrity, packageNames, validateArtifacts, registryState } from './preflight.js';
it('rejects modified retained bytes before a registry request', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-badge-artifact-test-'));
  try {
    const artifacts = packageNames.map((name, i) => ({ name, version: '2.0.0-next.0', filename: `${i}.tgz`, size: 3, integrity: integrity(Buffer.from('abc')) }));
    for (const a of artifacts) await writeFile(join(directory, a.filename), 'abc');
    await writeFile(join(directory, 'candidate.json'), JSON.stringify({ schemaVersion: 1, sha: 'a'.repeat(40), tag: 'v2.0.0-next.0', version: '2.0.0-next.0', artifacts }));
    expect((await validateArtifacts(directory)).artifacts).toHaveLength(3);
    await writeFile(join(directory, '2.tgz'), 'def');
    await expect(validateArtifacts(directory)).rejects.toThrow('Retained tarball changed');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
it.each([401, 403, 500, 503])('HTTP %d is not package absence', async status => {
  const artifact = { name: 'create-agent-badge', version: '2.0.0-next.0', filename: 'c.tgz', size: 3, integrity: integrity(Buffer.from('abc')) };
  await expect(registryState(artifact, 'next', async () => new Response('{}', { status }))).rejects.toThrow(`HTTP ${status}`);
});
it('only an exact-version 404 permits a missing package', async () => {
  const artifact = { name: 'create-agent-badge', version: '2.0.0-next.0', filename: 'c.tgz', size: 3, integrity: integrity(Buffer.from('abc')) };
  const routes: string[] = [];
  expect(await registryState(artifact, 'next', async url => { routes.push(String(url)); return new Response('{}', { status: 404 }); })).toBe('absent');
  expect(routes).toEqual(['https://registry.npmjs.org/create-agent-badge/2.0.0-next.0']);
});
it('existing matching bytes with a wrong tag require explicit repair', async () => {
  const artifact = { name: 'create-agent-badge', version: '2.0.0-next.0', filename: 'c.tgz', size: 3, integrity: integrity(Buffer.from('abc')) };
  const responses = [new Response(JSON.stringify({ name: artifact.name, version: artifact.version, dist: { tarball: 'https://registry.npmjs.org/c.tgz', integrity: artifact.integrity } })), new Response('abc'), new Response('{"next":"1.1.20"}')];
  await expect(registryState(artifact, 'next', async () => responses.shift()!)).rejects.toThrow('dist-tag');
});
