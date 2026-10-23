import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Trusted owned reporting modules only. No leases or writes are acquired here.
 * Resolve only after the owned child has exited; Git children share its group. */
export async function runReportingTask<T>(worker: URL, input: unknown, deadline: number, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted || Date.now() >= deadline) throw Error('diagnostic-deadline');
  let host = new URL('./report-host.js', import.meta.url);
  if (!existsSync(host)) host = new URL('./report-host.ts', import.meta.url);
  if (!existsSync(worker) && worker.pathname.endsWith('.js')) worker = new URL(worker.href.replace(/\.js$/, '.ts'));
  return new Promise<T>((resolve, reject) => {
    const child = spawn(process.execPath, [...(host.pathname.endsWith('.ts') ? ['--import','tsx'] : []),fileURLToPath(host)], { detached:process.platform !== 'win32',stdio:['ignore','ignore','ignore','ipc'] });
    let result: T, received = false, expired = false;
    const kill = () => {
      if (!child.pid) return;
      if (process.platform === 'win32') {
        const killer=spawn('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
        killer.once('error',()=>child.kill('SIGKILL'));
      } else { try { process.kill(-child.pid,'SIGKILL'); } catch {} }
    };
    const abort=()=>{expired=true;kill();};
    const timer=setTimeout(abort,Math.max(1,deadline-Date.now()));
    signal?.addEventListener('abort',abort,{once:true});
    const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
    child.once('message',value=>{result=value as T;received=true;kill();});
    child.once('error',()=>{cleanup();reject(Error('reporting-unavailable'));});
    child.once('exit',()=>{kill();cleanup();if(received&&!expired)resolve(result);else reject(Error('reporting-unavailable'));});
    child.send({worker:worker.href,input,deadline},error=>{if(error)abort();});
    if(signal?.aborted)abort();
  });
}
