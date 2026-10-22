import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';

export type StoreErrorCode = 'invalid-durable-data' | 'unsupported-durable-schema' | 'unsafe-store-path' |
  'store-permission' | 'store-full' | 'store-io' | 'store-busy' | 'invalid-batch';
/** Finite diagnostics: operating-system messages can contain private paths. */
export class StoreError extends Error {
  constructor(readonly code: StoreErrorCode, readonly uncertainty = false) { super(code); this.name = 'StoreError'; }
}
export function ioError(error: unknown): StoreError {
  if (error instanceof StoreError) return error;
  const code = (error as NodeJS.ErrnoException)?.code;
  return new StoreError(code === 'ENOSPC' || code === 'EDQUOT' ? 'store-full' :
    code === 'EACCES' || code === 'EPERM' ? 'store-permission' : code === 'ELOOP' ? 'unsafe-store-path' : 'store-io');
}
export function hasCode(error: unknown, code: string): boolean { return (error as NodeJS.ErrnoException)?.code === code; }
export async function privateDirectory(path: string): Promise<void> {
  try {
    try { await fs.mkdir(path, { mode: 0o700 }); } catch (error) { if (!hasCode(error, 'EEXIST')) throw error; }
    await assertDirectory(path);
    await fs.chmod(path, 0o700);
  } catch (error) { throw ioError(error); }
}
export async function assertDirectory(path: string): Promise<void> {
  const info = await fs.lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || (process.getuid && info.uid !== process.getuid()))
    throw new StoreError('unsafe-store-path');
}
export async function syncDirectory(path: string): Promise<void> {
  const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { await handle.sync(); } finally { await handle.close(); }
}
export async function readPrivateFile(path: string, maxBytes = 32 * 1024 * 1024): Promise<string> {
  try {
    await assertDirectory(dirname(path));
    const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > maxBytes || (process.getuid && info.uid !== process.getuid()))
        throw new StoreError('invalid-durable-data');
      await handle.chmod(0o600);
      return await handle.readFile('utf8');
    } finally { await handle.close(); }
  } catch (error) { if (hasCode(error, 'ENOENT')) throw error; throw ioError(error); }
}
/** Rename and directory fsync complete before a caller may advance a cursor. */
export async function atomicFile(path: string, value: unknown): Promise<void> {
  const parent = dirname(path);
  const temporary = join(parent, `.tmp-${randomUUID()}`);
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    const bytes = JSON.stringify(value);
    if (Buffer.byteLength(bytes, 'utf8') > 32 * 1024 * 1024) throw new StoreError('invalid-batch');
    await assertDirectory(parent);
    try { const current = await fs.lstat(path); if (!current.isFile() || current.isSymbolicLink()) throw new StoreError('unsafe-store-path'); }
    catch (error) { if (!hasCode(error, 'ENOENT')) throw error; }
    handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(bytes, 'utf8');
    await handle.sync();
    await handle.close(); handle = undefined;
    await fs.rename(temporary, path);
    await syncDirectory(parent);
  } catch (error) { throw ioError(error); }
  finally { await handle?.close().catch(() => {}); await fs.unlink(temporary).catch(() => {}); }
}
