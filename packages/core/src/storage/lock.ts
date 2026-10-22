import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { hostname } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { assertDirectory, hasCode, ioError, readPrivateFile, StoreError, syncDirectory } from './atomic-file.js';

export type ProcessNamespaceProbe = () => Promise<string | null>;
let successfulNamespace: string | null = null;
/** Private boot/PID-namespace identity. A denied or unsupported probe is uncertainty. */
export async function localProcessNamespace(): Promise<string | null> {
  if (successfulNamespace) return successfulNamespace;
  try {
    let evidence: string[];
    if (process.platform === 'darwin') {
      const { stdout } = await promisify(execFile)('/usr/sbin/sysctl', ['-n', 'kern.bootsessionuuid'], { timeout: 200, maxBuffer: 256 });
      const boot = stdout.trim();
      if (!/^[a-f0-9-]{36}$/i.test(boot)) return null;
      evidence = ['darwin', boot];
    } else if (process.platform === 'linux') {
      const [boot, namespace] = await Promise.all([fs.readFile('/proc/sys/kernel/random/boot_id', 'utf8'), fs.readlink('/proc/self/ns/pid')]);
      if (!/^[a-f0-9-]{36}$/i.test(boot.trim()) || !/^pid:\[[0-9]+\]$/.test(namespace)) return null;
      evidence = ['linux', boot.trim(), namespace];
    } else return null;
    successfulNamespace = createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
    return successfulNamespace;
  } catch { return null; }
}
interface Owner { schemaVersion: 1; host: string; namespace: string | null; pid: number; token: string; startedAt: number }
function parseOwner(bytes: string): Owner | null {
  try {
    const value = JSON.parse(bytes);
    return value.schemaVersion === 1 && typeof value.host === 'string' && Number.isSafeInteger(value.pid) && value.pid > 0 &&
      (value.namespace === null || typeof value.namespace === 'string' && value.namespace.length > 0 && value.namespace.length <= 1024) &&
      typeof value.token === 'string' && /^[a-f0-9-]{36}$/.test(value.token) && Number.isFinite(value.startedAt) ? value : null;
  } catch { return null; }
}
/** Only ESRCH for the recorded local process proves death. Age is never proof. */
function processState(owner: Owner, namespace: string | null): 'live' | 'dead' | 'uncertain' {
  if (!namespace || owner.namespace !== namespace || owner.host !== hostname()) return 'uncertain';
  try { process.kill(owner.pid, 0); return 'live'; }
  catch (error) { return hasCode(error, 'ESRCH') ? 'dead' : 'uncertain'; }
}
async function reclaim(path: string, directory: string, namespace: string | null): Promise<boolean> {
  // Serialize stale recovery so two waiters cannot delete a newly acquired lock.
  const guard = join(directory, 'recovery.lock');
  let handle;
  try { handle = await fs.open(guard, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
  catch (error) { if (hasCode(error, 'EEXIST')) return false; throw error; }
  try {
    let owner: Owner | null;
    try { owner = parseOwner(await readPrivateFile(path, 4096)); } catch (error) { if (hasCode(error, 'ENOENT')) return true; throw error; }
    if (!owner || processState(owner, namespace) !== 'dead') return false;
    await fs.unlink(path); await syncDirectory(directory); return true;
  } finally { await handle.close(); await fs.unlink(guard); }
}
export async function acquireLock(directory: string, signal: AbortSignal, probe: ProcessNamespaceProbe = localProcessNamespace): Promise<() => Promise<void>> {
  const path = join(directory, 'operation.lock');
  const deadline = performance.now() + 2000;
  let namespace: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { namespace = await Promise.race([probe(), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 250); })]); }
  catch { /* uncertainty */ }
  finally { clearTimeout(timer); }
  if (namespace !== null && (typeof namespace !== 'string' || namespace.length === 0 || namespace.length > 1024)) namespace = null;
  let uncertain = false;
  while (!signal.aborted && performance.now() < deadline) {
    try {
      await assertDirectory(directory);
      const handle = await fs.open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      const owner: Owner = { schemaVersion: 1, host: hostname(), namespace, pid: process.pid, token: randomUUID(), startedAt: Date.now() - process.uptime() * 1000 };
      try { await handle.writeFile(JSON.stringify(owner)); await handle.sync(); }
      catch (error) { await handle.close(); await fs.unlink(path); throw error; }
      await handle.close();
      return async () => {
        const current = parseOwner(await readPrivateFile(path, 4096));
        if (!current || current.token !== owner.token) throw new StoreError('store-busy', true);
        await fs.unlink(path);
      };
    } catch (error) {
      if (!hasCode(error, 'EEXIST')) throw ioError(error);
      try {
        if (await reclaim(path, directory, namespace)) continue;
        const owner = parseOwner(await readPrivateFile(path, 4096));
        uncertain = !owner || processState(owner, namespace) !== 'live';
      } catch (error) { if (!hasCode(error, 'ENOENT')) throw ioError(error); }
      await delay(Math.min(20, Math.max(1, deadline - performance.now())), undefined, { signal }).catch(() => {});
    }
  }
  throw new StoreError('store-busy', uncertain);
}
