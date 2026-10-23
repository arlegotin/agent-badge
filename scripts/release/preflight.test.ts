import { describe, it, expect } from 'vitest';
import * as release from './preflight.js';

const sha = 'a'.repeat(40);
const request = { event: 'workflow_dispatch', ref: 'refs/heads/main', sha, head: sha, main: sha, tagSha: sha, tag: 'v2.0.0-next.0', version: '2.0.0-next.0', intent: 'major-prerelease' };
const artifacts = ['@legotin/agent-badge-core', '@legotin/agent-badge', 'create-agent-badge'].map((name, i) => ({ name, version: '2.0.0-next.0', filename: `${i}.tgz`, size: 3, integrity: `sha512-${Buffer.from('abc').toString('base64')}` }));

describe('exact release authorization before any publish', () => {
  it.each([
    ['non-main dispatch', { ref: 'refs/heads/feature' }], ['push event', { event: 'push' }],
    ['stale queued request', { main: 'b'.repeat(40) }], ['wrong checked out commit', { head: 'b'.repeat(40) }],
    ['retargeted tag', { tagSha: 'b'.repeat(40) }], ['implicit patch', { version: '1.1.21', tag: 'v1.1.21' }],
    ['stable without intent', { version: '2.0.0', tag: 'v2.0.0' }], ['wrong tag', { tag: 'v2.0.0' }]
  ])('blocks %s', (_name, patch) => expect(() => release.validateReleaseRequest({ ...request, ...patch })).toThrow());
  it('accepts explicit major prerelease and separately selected stable major', () => {
    expect(release.validateReleaseRequest(request)).toBe('next');
    expect(release.validateReleaseRequest({ ...request, intent: 'stable-major', version: '2.0.0', tag: 'v2.0.0' })).toBe('latest');
  });
  it('checks every package before publishing any, stops on changed tarball', async () => {
    const writes: string[] = [];
    await expect(release.publishCandidate(artifacts, async a => a.name === 'create-agent-badge' ? 'mismatch' : 'absent', async a => { writes.push(a.name); })).rejects.toThrow(/mismatch/);
    expect(writes).toEqual([]);
  });
  it('resumes partial publication in dependency order without rewriting matching versions', async () => {
    const uploaded = new Set([artifacts[0].name]);
    const writes: string[] = [];
    const result = await release.publishCandidate(artifacts, async a => uploaded.has(a.name) ? 'matching' : 'absent', async a => { uploaded.add(a.name); writes.push(a.name); });
    expect(writes).toEqual(['@legotin/agent-badge', 'create-agent-badge']);
    expect(result).toEqual(['resumed', 'published', 'published']);
  });
  it('repeat publication writes nothing', async () => {
    await expect(release.publishCandidate(artifacts, async () => 'matching', async () => { throw Error('unexpected write'); })).resolves.toEqual(['resumed', 'resumed', 'resumed']);
  });
  it('ambiguous publish failure is reconciled through exact bytes before continuing', async () => {
    let uploaded = false;
    await expect(release.publishCandidate([artifacts[0]], async () => uploaded ? 'matching' : 'absent', async () => { uploaded = true; throw Error('connection closed after upload'); })).resolves.toEqual(['published']);
  });
  it('unknown registry state fails closed before the first write', async () => {
    await expect(release.publishCandidate(artifacts, async () => { throw Error('HTTP 503'); }, async () => { throw Error('unexpected write'); })).rejects.toThrow('HTTP 503');
  });
  it('freshness failure after all-package preflight cannot be reconciled as an upload', async () => {
    const writes: string[] = [];
    await expect(release.publishCandidate(artifacts, async () => 'absent', async a => { writes.push(a.name); }, async () => { throw Error('main advanced'); })).rejects.toThrow('main advanced');
    expect(writes).toEqual([]);
  });

});
