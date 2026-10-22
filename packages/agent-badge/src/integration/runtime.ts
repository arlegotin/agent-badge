import { readFile, lstat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOperationBudget } from '@legotin/agent-badge-core/operations/budget';
import { runRepositoryOperation } from '@legotin/agent-badge-core/operations/runner';
import type { RepositoryOperationRequest } from '@legotin/agent-badge-core/operations/runner';
import { assertSupportedNode, validatePin, parseDeclaration, gitEnvironment } from './manifest.js';
import type { Activation } from './manifest.js';
const execute = promisify(execFile);
async function read(path: string): Promise<string | null> {
  try { const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink() || info.size > 256 * 1024) throw new Error('Unsafe activation file.'); return await readFile(path, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
/** Private activation is never loaded from the code branch. */
export async function loadActivation(privateDir: string): Promise<Activation | null> {
  const bytes = await read(join(privateDir, 'local.json')); if (bytes === null) return null;
  const a = JSON.parse(bytes) as Activation;
  if (!a || Object.keys(a).sort().join(',') !== 'binding,capturePolicy,initializeAllowed,lockHash,privatePolicy,repositoryId,roots,runtimeVersion,schemaVersion,worktreeInventory' ||
      a.schemaVersion !== 1 || typeof a.initializeAllowed !== 'boolean' || !/^[a-f0-9]{64}$/.test(a.lockHash) || a.capturePolicy?.repositoryId !== a.repositoryId ||
      !a.privatePolicy || !a.roots || !['bound', 'unbound', 'rejected'].includes(a.binding?.status)) throw new Error('Invalid private activation.');
  return a;
}
export type ActivationCheck = { status: 'approved'; activation: Activation; privateDir: string; worktreeRoot: string } | { status: 'inactive' | 'suspended' | 'missing-runtime' };
/** Read-only trust check. No installation, provider access, or tracked launcher execution. */
export async function checkActivation(options: { cwd: string; privateDir?: string; signal?: AbortSignal; timeoutMs?: number }): Promise<ActivationCheck> {
  const git = async (args: string[]) => (await execute('git', args, { cwd: options.cwd, env: gitEnvironment(), signal: options.signal, timeout: Math.max(1, Math.ceil(options.timeoutMs ?? 1500)), maxBuffer: 64 * 1024 })).stdout.trimEnd();
  const worktreeRoot = await git(['rev-parse', '--show-toplevel']);
  const privateDir = join(resolve(options.cwd, await git(['rev-parse', '--git-common-dir'])), 'agent-badge');
  if (options.privateDir && resolve(options.privateDir) !== privateDir) return { status: 'suspended' };
  const activation = await loadActivation(privateDir); if (!activation) return { status: 'inactive' };
  const declarationBytes = await read(join(worktreeRoot, '.agent-badge/config.json'));
  const manifest = await read(join(worktreeRoot, '.agent-badge/runtime/package.json'));
  const lock = await read(join(worktreeRoot, '.agent-badge/runtime/package-lock.json'));
  // All absent means a pre-install branch. Partial or changed declarations suspend.
  if (declarationBytes !== null || manifest !== null || lock !== null) {
    if (!declarationBytes || !manifest || !lock) return { status: 'suspended' };
    try { const d = parseDeclaration(JSON.parse(declarationBytes));
      if (d.repositoryId !== activation.repositoryId || validatePin({ manifest, lock }, d.runtimeVersion) !== activation.lockHash || d.runtimeVersion !== activation.runtimeVersion) return { status: 'suspended' };
    } catch { return { status: 'suspended' }; }
  }
  const packageRoot = join(privateDir, 'runtime', activation.lockHash, 'node_modules/@legotin/agent-badge');
  const packageBytes = await read(join(packageRoot, 'package.json'));
  if (!packageBytes || JSON.parse(packageBytes).version !== activation.runtimeVersion || !await read(join(packageRoot, 'dist/cli/main.js')) || !await read(join(packageRoot, 'dist/integration/runtime.js'))) return { status: 'missing-runtime' };
  return { status: 'approved', activation, privateDir, worktreeRoot };
}
/** Task12 calls this approved private entry; the two-second timer precedes activation reads. */
export async function runApprovedOperation(options: { cwd: string; privateDir?: string; mode?: 'automatic' | 'manual'; target?: NonNullable<RepositoryOperationRequest['collection']>['target']; timeoutMs?: number; onDiagnostic?(line: string): void }) {
  assertSupportedNode();
  const budget = createOperationBudget(options.mode ?? 'automatic', options.timeoutMs);
  try {
    const checked = await checkActivation({ ...options, signal: budget.signal, timeoutMs: budget.remainingMs() });
    if (checked.status !== 'approved') { options.onDiagnostic?.('agent-badge: local activation required.'); return { status: 'queued' as const, exitCode: budget.mode === 'automatic' ? 0 : 1, acknowledgedCount: 0, queuedCount: null, pendingReconciliation: true }; }
    const a = checked.activation;
    const expectedRuntime = join(checked.privateDir, 'runtime', a.lockHash, 'node_modules/@legotin/agent-badge');
    if (resolve(fileURLToPath(new URL('../../', import.meta.url))) !== expectedRuntime) {
      options.onDiagnostic?.('agent-badge: runtime activation required.');
      return { status: 'queued' as const, exitCode: budget.mode === 'automatic' ? 0 : 1, acknowledgedCount: 0, queuedCount: null, pendingReconciliation: true };
    }
    return await runRepositoryOperation({ budget, onDiagnostic: options.onDiagnostic, request: { cwd: options.cwd, privateDir: checked.privateDir, repositoryId: a.repositoryId, binding: a.binding,
      collect: 'incremental', capturePolicy: a.capturePolicy, collection: { roots: a.roots, privatePolicy: a.privatePolicy, target: options.target } } });
  } catch { options.onDiagnostic?.('agent-badge: local work queued.'); return { status: 'queued' as const, exitCode: budget.mode === 'automatic' ? 0 : 1, acknowledgedCount: 0, queuedCount: null, pendingReconciliation: true }; }
  finally { budget.dispose(); }
}
