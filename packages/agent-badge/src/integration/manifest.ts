import { createHash } from 'node:crypto';
import type { SharedPolicy, PrivateAttributionPolicy, RemoteBinding } from '@legotin/agent-badge-core';

export const NODE_RANGE = '^24.0.0 || ^26.0.0';
export const UNSUPPORTED_NODE_MESSAGE = 'agent-badge requires Node 24 or 26.';
export class UnsupportedNodeError extends Error {
  readonly code = 'unsupported-node';
  constructor() { super(UNSUPPORTED_NODE_MESSAGE); this.name = 'UnsupportedNodeError'; }
}
export function assertSupportedNode(version = process.versions.node): void {
  if (!/^(24|26)\./.test(version)) throw new UnsupportedNodeError();
}
export function assertExactVersion(version: string): void {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Runtime version must be exact.');
}
export interface RuntimePin { manifest: string; lock: string }
export interface Declaration {
  schemaVersion: 1; repositoryId: string; declaredUrl: string;
  dataRef: 'refs/heads/agent-badge/data'; runtimeVersion: string; policy: SharedPolicy;
}
export interface Activation {
  schemaVersion: 1; repositoryId: string; runtimeVersion: string; lockHash: string; initializeAllowed: boolean;
  binding: RemoteBinding; capturePolicy: SharedPolicy; privatePolicy: PrivateAttributionPolicy;
  worktreeInventory: { path: string; commonDir: string }[];
  roots: Partial<Record<'codex' | 'claude' | 'gemini', string[]>>;
}
export function json(value: unknown): string { return JSON.stringify(value, null, 2) + '\n'; }
export function digest(value: string): string { return createHash('sha256').update(value).digest('hex'); }
export function validatePin(pin: RuntimePin, version: string): string {
  assertExactVersion(version);
  if (Buffer.byteLength(pin.manifest) > 32 * 1024 || Buffer.byteLength(pin.lock) > 256 * 1024) throw new Error('Runtime lock exceeds supported size.');
  const manifest = JSON.parse(pin.manifest), lock = JSON.parse(pin.lock);
  if (manifest.private !== true || JSON.stringify(Object.keys(manifest.dependencies ?? {})) !== '["@legotin/agent-badge"]' ||
      manifest.dependencies['@legotin/agent-badge'] !== version || lock.lockfileVersion !== 3 ||
      lock.packages?.['']?.dependencies?.['@legotin/agent-badge'] !== version ||
      lock.packages?.['node_modules/@legotin/agent-badge']?.version !== version ||
      !lock.packages?.['node_modules/@legotin/agent-badge']?.integrity) throw new Error('Invalid exact runtime lock.');
  for (const [path, entry] of Object.entries(lock.packages ?? {}) as [string, { version?: string; resolved?: string; integrity?: string; link?: boolean }][]) {
    if (path === '') continue;
    if (entry.link || !entry.version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(entry.version) ||
        !entry.resolved || !/^https?:\/\//.test(entry.resolved) || !entry.integrity || !/^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity)) throw new Error('Invalid runtime resolution.');
    const url = new URL(entry.resolved);
    if (url.username || url.password || url.hash) throw new Error('Invalid runtime resolution.');
  }
  return digest(pin.manifest + '\0' + pin.lock);
}
export function parseDeclaration(value: unknown): Declaration {
  const d = value as Declaration;
  if (!d || Object.keys(d).sort().join(',') !== 'dataRef,declaredUrl,policy,repositoryId,runtimeVersion,schemaVersion' || d.schemaVersion !== 1 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d.repositoryId) ||
      d.dataRef !== 'refs/heads/agent-badge/data' || d.policy?.repositoryId !== d.repositoryId) throw new Error('Invalid repository declaration.');
  assertExactVersion(d.runtimeVersion);
  const url = new URL(d.declaredUrl);
  if (!['https:', 'ssh:'].includes(url.protocol) || url.password || (url.protocol === 'https:' && url.username) || url.search || url.hash)
    throw new Error('A credential-free public repository URL is required.');
  return d;
}

/** Hooks inherit Git's local routing environment; it must not redirect cwd discovery. */
export function gitEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_COMMON_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE', 'GIT_SHALLOW_FILE', 'GIT_IMPLICIT_WORK_TREE', 'GIT_GRAFT_FILE', 'GIT_REPLACE_REF_BASE']) delete env[key];
  return { ...env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' };
}
