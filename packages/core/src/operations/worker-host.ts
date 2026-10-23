import { inSupervisedProcessGroup } from '../git/process.js';
import { parseWorkerSummary } from './worker-protocol.js';

process.once('message', async (message: { worker: string; input: unknown; deadline: number; leaseToken: string }) => {
  try {
    const worker = await import(message.worker);
    const signal = AbortSignal.timeout(Math.max(1, Math.min(2 ** 31 - 1, Math.ceil(message.deadline - Date.now()))));
    const summary = parseWorkerSummary(await inSupervisedProcessGroup(() => worker.runOperation(message.input, {
      deadline: message.deadline, leaseToken: message.leaseToken, signal,
    })));
    process.send?.(summary, () => process.exit(summary ? 0 : 1));
  } catch { process.exit(1); }
});
// A vanished launcher cannot leave a CPU-cooperative worker running indefinitely.
process.once('disconnect', () => process.exit(1));
