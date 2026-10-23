import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const packagePaths = ['packages/core', 'packages/agent-badge', 'packages/create-agent-badge'] as const;
export const packageNames = ['@legotin/agent-badge-core', '@legotin/agent-badge', 'create-agent-badge'] as const;
export const engines = '^24.0.0 || ^26.0.0';
export interface Artifact { name: string; version: string; filename: string; size: number; integrity: string }
export interface Candidate { schemaVersion: 1; sha: string; tag: string; version: string; artifacts: Artifact[]; checks: Record<string, string>; runtime: string; platform: string }
export interface ReleaseRequest { event: string; ref: string; sha: string; head: string; main: string; tagSha: string; tag: string; version: string; intent: string }
export function validateReleaseRequest(r: ReleaseRequest): 'next' | 'latest' {
  if (r.event !== 'workflow_dispatch' || r.ref !== 'refs/heads/main') throw Error('Release requires manual dispatch from main');
  if (!/^[a-f0-9]{40}$/.test(r.sha) || [r.head, r.main, r.tagSha].some(value => value !== r.sha)) throw Error('Stale request or commit/tag/main mismatch');
  if (r.tag !== `v${r.version}`) throw Error('Exact version tag required');
  if (r.intent === 'major-prerelease' && /^2\.0\.0-next\.\d+$/.test(r.version)) return 'next';
  if (r.intent === 'stable-major' && r.version === '2.0.0') return 'latest';
  throw Error('Explicit major prerelease or stable major intent required');
}
export type RegistryState = 'absent' | 'matching' | 'mismatch';
/** Lookup must validate downloaded bytes, registry SRI and the intended dist-tag. */
export async function publishCandidate(artifacts: readonly Artifact[], lookup: (a: Artifact) => Promise<RegistryState>, publish: (a: Artifact) => Promise<void>, beforeFirstWrite?: () => Promise<void>, progress?: (results:string[])=>void): Promise<string[]> {
  const before = [];
  for (const artifact of artifacts) before.push(await lookup(artifact));
  if (before.some(state => state !== 'absent' && state !== 'matching')) throw Error('Existing artifact mismatch; no packages published');
  if (before.includes('absent')) await beforeFirstWrite?.();
  const result = [];
  for (let index = 0; index < artifacts.length; index++) {
    if (before[index] === 'matching') { result.push('resumed'); progress?.([...result]); continue; }
    // An ambiguous upload is reconciled by exact-version bytes, never by a bump or blind retry.
    let failure: unknown;
    try { await publish(artifacts[index]); } catch (error) { failure = error; }
    if (await lookup(artifacts[index]) !== 'matching') throw failure ?? Error('Upload could not be verified');
    result.push('published'); progress?.([...result]);
  }
  return result;
}
export interface PublishEvidence {
 schemaVersion:1;sha:string;tag:string;candidateRunId:string;artifactId:string;artifacts:Artifact[];
 publication:'complete'|'incomplete';results:string[];failure:'publication-unverified'|null;
}
/** Persist confirmed progress even if a later upload or registry verification fails. */
export async function publishWithEvidence(candidate:Candidate,identity:{candidateRunId:string;artifactId:string},lookup:(a:Artifact)=>Promise<RegistryState>,publish:(a:Artifact)=>Promise<void>,beforeFirstWrite:()=>Promise<void>,write:(value:PublishEvidence)=>void|Promise<void>):Promise<PublishEvidence> {
 const evidence:PublishEvidence={schemaVersion:1,sha:candidate.sha,tag:candidate.tag,...identity,artifacts:candidate.artifacts,publication:'incomplete',results:[],failure:null};
 try {await publishCandidate(candidate.artifacts,lookup,publish,beforeFirstWrite,results=>{evidence.results=results;});evidence.publication='complete';}
 catch {evidence.failure='publication-unverified';}
 await write(evidence);return evidence;
}
export function integrity(bytes: Uint8Array): string { return 'sha512-' + createHash('sha512').update(bytes).digest('base64'); }
export async function validateArtifacts(directory: string): Promise<Candidate> {
  const candidate: Candidate = JSON.parse(await readFile(resolve(directory, 'candidate.json'), 'utf8'));
  if (candidate.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(candidate.sha) || candidate.tag !== `v${candidate.version}` || candidate.artifacts.length !== 3) throw Error('Invalid candidate manifest');
  for (const [index, artifact] of candidate.artifacts.entries()) {
    if (artifact.name !== packageNames[index] || artifact.version !== candidate.version || basename(artifact.filename) !== artifact.filename || !artifact.filename.endsWith('.tgz')) throw Error('Candidate package inventory mismatch');
    const bytes = await readFile(resolve(directory, artifact.filename));
    if (bytes.length !== artifact.size || integrity(bytes) !== artifact.integrity) throw Error('Retained tarball changed');
  }
  return candidate;
}
export async function validateWorkspace(root = '.'): Promise<string> {
  const lock = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8'));
  const manifests = await Promise.all(packagePaths.map(p => readFile(resolve(root, p, 'package.json'), 'utf8').then(JSON.parse)));
  const version = manifests[0].version;
  for (const [index, manifest] of manifests.entries()) {
    if (manifest.name !== packageNames[index] || manifest.version !== version || manifest.license !== 'Apache-2.0' || manifest.engines?.node !== engines) throw Error('Package metadata drift');
    if (index && manifest.dependencies?.[packageNames[index - 1]] !== version) throw Error('Internal dependency must select the exact candidate version');
    const locked = lock.packages[packagePaths[index]];
    if (locked?.version !== version || locked.license !== manifest.license || locked.engines?.node !== engines || JSON.stringify(locked.dependencies ?? {}) !== JSON.stringify(manifest.dependencies ?? {})) throw Error('Lockfile drift');
  }
  const config = JSON.parse(await readFile(resolve(root, '.changeset/config.json'), 'utf8'));
  if (JSON.stringify(config.fixed) !== JSON.stringify([[...packageNames]]) || !config.ignore.includes('@agent-badge/testkit')) throw Error('Changesets fixed inventory drift');
  if (version.includes('-')) {
    const pre = JSON.parse(await readFile(resolve(root, '.changeset/pre.json'), 'utf8'));
    if (pre.mode !== 'pre' || pre.tag !== 'next') throw Error('Prerelease state drift');
  } else {
    try { const pre = JSON.parse(await readFile(resolve(root, '.changeset/pre.json'), 'utf8')); if (pre.mode === 'pre') throw Error('Stable release still in prerelease mode'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return version;
}
function git(args: string[]): string { return execFileSync('git', args, { encoding: 'utf8' }).trim(); }
export async function validateHostedRequest(candidate: Candidate): Promise<'next' | 'latest'> {
  // Validate untrusted workflow input before it can reach Git argument parsing.
  const sha = process.env.RELEASE_SHA ?? '', tag = process.env.RELEASE_TAG ?? '';
  if (!/^[a-f0-9]{40}$/.test(sha) || !/^v2\.0\.0(?:-next\.\d+)?$/.test(tag)) throw Error('Invalid exact release input');
  if (process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || process.env.GITHUB_REF !== 'refs/heads/main') throw Error('Release requires manual main dispatch');
  git(['fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main', `+refs/tags/${tag}:refs/tags/${tag}`]);
  const result = validateReleaseRequest({ event: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF, sha, head: git(['rev-parse', 'HEAD']), main: git(['rev-parse', 'refs/remotes/origin/main']), tagSha: git(['rev-parse', `${tag}^{commit}`]), tag, version: candidate.version, intent: process.env.RELEASE_INTENT ?? '' });
  if (candidate.sha !== sha || candidate.tag !== tag || await validateWorkspace() !== candidate.version) throw Error('Candidate source binding mismatch');
  if (git(['status', '--porcelain', '--untracked-files=no'])) throw Error('Tracked release inputs changed');
  return result;
}
const registry = 'https://registry.npmjs.org/';
export async function registryState(artifact: Artifact, tag: string, request: typeof fetch = fetch): Promise<RegistryState> {
  const response = await request(`${registry}${encodeURIComponent(artifact.name)}/${artifact.version}`, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (response.status === 404) return 'absent';
  if (!response.ok) throw Error(`Registry lookup failed: HTTP ${response.status}`);
  const metadata = await response.json();
  if (metadata.name !== artifact.name || metadata.version !== artifact.version || metadata.dist?.integrity !== artifact.integrity) return 'mismatch';
  const url = new URL(metadata.dist.tarball);
  if (url.origin !== new URL(registry).origin || url.username || url.password) throw Error('Unexpected tarball registry route');
  const downloaded = await request(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!downloaded.ok) throw Error('Registry artifact download failed');
  const bytes = new Uint8Array(await downloaded.arrayBuffer());
  if (bytes.length !== artifact.size || integrity(bytes) !== artifact.integrity) return 'mismatch';
  const tags = await request(`${registry}-/package/${encodeURIComponent(artifact.name)}/dist-tags`, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!tags.ok || (await tags.json())[tag] !== artifact.version) throw Error('Intended dist-tag requires separately authorized repair');
  return 'matching';
}
export function publishTarball(directory:string,a:Artifact,tag:string):void {
    if (execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim() !== '11.6.0') throw Error('Use pinned npm 11.6.0');
    // npm's human console output never enters the structured stdout/file channel.
    execFileSync('npm', ['publish', resolve(directory, a.filename), '--registry', registry, '--access', 'public', '--tag', tag, '--provenance', '--ignore-scripts'], { stdio: ['ignore',2,2] });
}
async function main() {
  const directory = process.argv[2];
  if (!directory) throw Error('Provide retained candidate directory');
  const candidate = await validateArtifacts(directory);
  const tag = await validateHostedRequest(candidate);
  const publish = process.argv[3] === '--publish';
  // Re-check freshness directly before the all-package registry preflight/first write.
  if (publish) await validateHostedRequest(candidate);
  if (!publish) {
    const states = [];
    for (const artifact of candidate.artifacts) states.push(await registryState(artifact, tag));
    if (states.includes('mismatch')) throw Error('Existing artifact mismatch');
    console.log(JSON.stringify({sha:candidate.sha,tag:candidate.tag,states,publication:'not-requested'}));
    return;
  }
  const result = await publishWithEvidence(candidate,{candidateRunId:process.env.CANDIDATE_RUN_ID??'unknown',artifactId:process.env.CANDIDATE_ARTIFACT_ID??'unknown'},a => registryState(a, tag), async a => {
    publishTarball(directory,a,tag);
  }, async () => { await validateHostedRequest(candidate); },async evidence=>{await writeFile(resolve(directory,'publish-result.json'),JSON.stringify(evidence,null,2)+'\n');});
  console.log(JSON.stringify(result));
  if(result.publication!=='complete')process.exitCode=1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
