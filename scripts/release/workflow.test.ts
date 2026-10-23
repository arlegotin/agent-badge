import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { load as parse } from 'js-yaml';
import { execFileSync } from 'node:child_process';
import { createBareRemoteFixture } from '@agent-badge/testkit';
it('serializes every explicit release without replacing queued/running requests; no automatic publish trigger', async () => {
  const w = parse(await readFile('.github/workflows/release.yml', 'utf8'));
  expect(Object.keys(w.on)).toEqual(['workflow_dispatch']);
  expect(w.concurrency).toEqual({ group: 'npm-release', 'cancel-in-progress': false, queue: 'max' });
});
it('trusted inline remote guard precedes requested checkout, npm lifecycle and candidate scripts', async () => {
  const w = parse(await readFile('.github/workflows/release.yml', 'utf8'));
  const steps = w.jobs.release.steps;
  const guard = steps.findIndex(s => s.id === 'authorize_source');
  expect(guard).toBeGreaterThanOrEqual(0);
  const requested = steps.findIndex(s => s.with?.ref === '${{ inputs.sha }}');
  expect(requested).toBeGreaterThan(guard);
  expect(steps.slice(0, guard).every(s => !s.run)).toBe(true);
  expect(steps.slice(0, guard).filter(s => s.uses).every(s => s.with?.ref === 'main')).toBe(true);
  const fixture = await createBareRemoteFixture();
  try {
    const script = steps[guard].run;
    expect(script.startsWith('node --input-type=module')).toBe(true);
    const code = script.split('\n').slice(1, -2).join('\n');
    // The inline code runs against a synthetic local remote, never GitHub or credential helpers.
    const sha = (await fixture.git(fixture.clones[0], ['rev-parse', 'HEAD'])).trim();
    await fixture.git(fixture.clones[0], ['tag', 'v2.0.0-next.0']);
    await fixture.git(fixture.clones[0], ['push', 'origin', 'refs/tags/v2.0.0-next.0']);
    const env = { ...process.env, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', RELEASE_SHA: sha, RELEASE_TAG: 'v2.0.0-next.0', RELEASE_INTENT: 'major-prerelease' };
    expect(() => execFileSync(process.execPath, ['--input-type=module', '-e', code], { cwd: fixture.clones[0], env: { ...env, RELEASE_SHA: 'b'.repeat(40) }, stdio: 'pipe' })).toThrow();
    expect(() => execFileSync(process.execPath, ['--input-type=module', '-e', code], { cwd: fixture.clones[0], env: { ...env, GITHUB_REF: 'refs/heads/feature' }, stdio: 'pipe' })).toThrow();
    expect(execFileSync(process.execPath, ['--input-type=module', '-e', code], { cwd: fixture.clones[0], env, encoding: 'utf8' })).toContain('authorized exact main/tag source');
  } finally { await fixture.cleanup(); }
});
