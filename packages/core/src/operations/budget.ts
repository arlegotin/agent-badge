export interface OperationBudget {
  readonly mode: 'automatic' | 'manual';
  readonly deadline: number;
  readonly signal: AbortSignal;
  remainingMs(): number;
  dispose(): void;
}
/** The supervisor enforces CPU deadlines. This signal also bounds cooperative work. */
export function createOperationBudget(mode: 'automatic' | 'manual', timeoutMs?: number): OperationBudget {
  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 2 ** 31 - 1)) throw new Error('Invalid operation deadline');
  const duration = mode === 'automatic' ? Math.min(2000, timeoutMs ?? 2000) : timeoutMs ?? 30000;
  const end = performance.now() + duration, deadline = Date.now() + duration;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), duration);
  timer.unref();
  return { mode, deadline, signal: controller.signal, remainingMs: () => Math.max(0, end - performance.now()), dispose: () => clearTimeout(timer) };
}
