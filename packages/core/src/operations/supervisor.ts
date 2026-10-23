import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { observeWorkerLease } from '../storage/lock.js';
import type { OperationBudget } from './budget.js';
import { parseWorkerSummary } from './worker-protocol.js';
import type { WorkerSummary } from './worker-protocol.js';

export interface SupervisedResult extends WorkerSummary { exitCode: number; diagnostic: string | null }
export interface SupervisorOptions {
  budget: OperationBudget;
  /** Approved runtime-owned module; activation/trust belongs to the caller. */
  worker: URL;
  input: unknown;
  leaseDirectory?: string;
  onDiagnostic?(line: string): void;
  /** Platform seam also permits explicit capability checks without spawning. */
  platform?: NodeJS.Platform;
  env?: Record<string, string>;
}
/** Lightweight launcher: provider discovery, CPU work, routing and cleanup all run
 * in an owned group. The launcher's own process group is never targeted. */
export async function superviseOperation(options: SupervisorOptions): Promise<SupervisedResult> {
  const { budget } = options;
  const finish = (summary: WorkerSummary, reason?: string): SupervisedResult => {
    const success = summary.status === 'synced' || summary.status === 'unchanged';
    const diagnostic = success ? (summary.pendingReconciliation ? 'agent-badge: usage synced; manual reconciliation pending' : null) : reason ?? (summary.reason === 'automatic-local-transport' ? 'agent-badge: local/file automatic publication unsupported; run manual sync' : summary.oversizedPendingUnits ? 'agent-badge: oversized usage groups queued; run manual sync' : summary.status === 'conflict' ? 'agent-badge: recovery required; run manual sync' : summary.status === 'unsupported' ? 'agent-badge: unsupported data or automatic process supervision; run manual sync' : summary.pendingReconciliation ? 'agent-badge: usage queued; manual reconciliation pending' : 'agent-badge: usage queued; automatic retry and catch-up continue');
    if (diagnostic) options.onDiagnostic?.(diagnostic);
    return { ...summary, diagnostic, exitCode: budget.mode === 'automatic' || success ? 0 : summary.status === 'conflict' ? 2 : summary.status === 'unsupported' ? 3 : 1 };
  };
  const queued: WorkerSummary = { status: 'queued', acknowledgedCount: 0, queuedCount: null, pendingReconciliation: true };
  if (budget.mode === 'automatic' && (options.platform ?? process.platform) === 'win32')
    return finish({ ...queued, status: 'unsupported' });
  if (budget.signal.aborted || budget.remainingMs() < 1) return finish(queued, 'agent-badge: deadline reached; usage queued');
  const reserve = Math.min(100, budget.remainingMs() / 10);
  const envelope = { worker: options.worker.href, input: options.input, deadline: budget.deadline-reserve, leaseToken: randomUUID() };
  let bytes: string;
  try { bytes = JSON.stringify(envelope); } catch { return finish(queued); }
  if (Buffer.byteLength(bytes) > 256 * 1024) return finish(queued);
  let host = new URL('./worker-host.js', import.meta.url);
  if (!existsSync(host)) host = new URL('./worker-host.ts', import.meta.url);
  const args = host.pathname.endsWith('.ts') ? ['--import', 'tsx', fileURLToPath(host)] : [fileURLToPath(host)];
  return new Promise(resolve => {
    const child = spawn(process.execPath, args, { detached: process.platform !== 'win32', env: { ...process.env, ...options.env }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    const cleanupLease = options.leaseDirectory ? observeWorkerLease(options.leaseDirectory, child, envelope.leaseToken) : async () => {};
    let summary: WorkerSummary | null = null, stopped = false, settled = false;
    const killTree = () => {
      if (!child.pid) return;
      if (process.platform === 'win32') {
        // Manual-only best effort. Automatic mode refuses before spawning.
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        killer.once('error', () => child.kill('SIGKILL'));
      }

      else try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already gone. */ }
    };
    const done = (reason?: string) => {
      if (settled) return;
      settled = true; clearTimeout(stopTimer); clearTimeout(hardTimer); budget.signal.removeEventListener('abort', abort);
      resolve(finish(stopped ? queued : summary ?? queued, reason));
    };
    const stop = () => { stopped = true; killTree(); };
    const abort = () => { stop(); done('agent-badge: deadline reached; usage queued'); };
    // Reserve time for exit observation, exact owned-lease cleanup and group reaping.
    const stopTimer = setTimeout(stop, Math.max(1, budget.remainingMs() - reserve));
    const hardTimer = setTimeout(abort, Math.max(1, budget.remainingMs()));
    budget.signal.addEventListener('abort', abort, { once: true });
    child.once('message', value => { summary = parseWorkerSummary(value); killTree(); });
    child.once('error', () => done());
    child.once('exit', async () => {
      killTree();
      await cleanupLease().catch(() => {});
      done(stopped ? 'agent-badge: deadline reached; usage queued' : undefined);
    });
    child.send(envelope, error => { if (error) { stop(); done(); } });
    if (budget.signal.aborted) abort();
  });
}
