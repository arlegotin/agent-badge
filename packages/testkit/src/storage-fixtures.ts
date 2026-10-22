import { spawn } from 'node:child_process';

/** Faults affect one real filesystem operation in a synthetic child, never the parent. */
export interface StorageFault {
  operation: 'rename' | 'link' | 'sync' | 'write';
  pathIncludes: string;
  pathEndsWith?: boolean;
  action: 'exit-before' | 'exit-after' | 'ENOSPC' | 'EACCES';
}
export function storageFaultPrelude(fault?: StorageFault): string {
  if (!fault) return '';
  return `
    const storageFs = (await import('node:fs/promises')).default;
    const storageFault = ${JSON.stringify(fault)};
    let storageFired = false;
    async function storageIntercept(operation, path, invoke) {
      if (storageFired || operation !== storageFault.operation || !(storageFault.pathEndsWith ? String(path).endsWith(storageFault.pathIncludes) : String(path).includes(storageFault.pathIncludes))) return invoke();
      storageFired = true;
      if (storageFault.action === 'exit-before') process.kill(process.pid, 'SIGKILL');
      if (storageFault.action === 'ENOSPC' || storageFault.action === 'EACCES') throw Object.assign(new Error('synthetic filesystem failure'), { code: storageFault.action });
      const result = await invoke();
      process.kill(process.pid, 'SIGKILL');
      return result;
    }
    const storageRename = storageFs.rename.bind(storageFs);
    storageFs.rename = (from, to) => storageIntercept('rename', to, () => storageRename(from, to));
    const storageLink = storageFs.link.bind(storageFs);
    storageFs.link = (from, to) => storageIntercept('link', to, () => storageLink(from, to));
    const storageOpen = storageFs.open.bind(storageFs);
    storageFs.open = async (...args) => {
      const handle = await storageOpen(...args);
      const sync = handle.sync.bind(handle);
      const write = handle.writeFile.bind(handle);
      handle.sync = () => storageIntercept('sync', args[0], sync);
      handle.writeFile = (...values) => storageIntercept('write', args[0], () => write(...values));
      return handle;
    };
  `;
}
export async function runStorageFixtureProcess(cwd: string, script: string, fault?: StorageFault): Promise<{
  code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', storageFaultPrelude(fault) + script], {
      cwd, env: { ...process.env, NODE_NO_WARNINGS: '1' }, stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Synthetic storage child timed out')); }, 10_000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('close', (code, signal) => { clearTimeout(timeout); resolve({ code, signal, stdout, stderr }); });
  });
}
