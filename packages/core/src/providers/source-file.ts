import { createHash } from 'node:crypto';
import { open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';
import type { SourceDescriptor } from '../domain/capabilities.js';

export const UNRESOLVED_SOURCE_EPOCH = 'unresolved-source-epoch';
/** Discovery hints are resolved before a checkpoint is selected. Failures never
 * become journal generations. A resolved alias must remain inside its enrolled root. */
export async function resolveSourceEpoch(source: SourceDescriptor, signal: AbortSignal): Promise<SourceDescriptor> {
  if(source.generation!==UNRESOLVED_SOURCE_EPOCH)return source;
  signal.throwIfAborted();
  const epoch=await sourceFileEpoch(source.root),local=relative(source.instanceKey,epoch.identity);
  signal.throwIfAborted();
  if(local==='..'||local.startsWith('..'+sep)||isAbsolute(local))throw new Error('unavailable-source');
  return {...source,root:epoch.identity,sourceIdentity:epoch.identity,generation:epoch.generation};
}

export const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
export const emptyHash = digest('');
export interface ReadResult {
  bytes: Buffer; identity: string; generation: string; size: number; bounded: boolean;
  start: number; prefixHash: string; resumed: boolean; hashThrough(length:number):string;
}
export async function sourceFileEpoch(path: string): Promise<{identity:string;generation:string}> {
  const identity=await realpath(path); const handle=await open(identity,'r');
  try { const info=await handle.stat({bigint:true}); if(!info.isFile()) throw new Error('unavailable-source');
    return {identity,generation:digest(JSON.stringify([String(info.dev),String(info.ino),String(info.birthtimeNs)]))};
  } finally {await handle.close();}
}
/** Streaming prefix verification is separate from bounded parsing; no provider text enters persisted state. */
export async function readSourceFile(path: string, maxBytes: number, signal: AbortSignal,
  expectedGeneration:string, resume?: {offset:number;prefixHash:string}): Promise<ReadResult> {
  signal.throwIfAborted();
  const identity = await realpath(path); const handle = await open(identity, 'r');
  try {
    const before = await handle.stat({bigint:true});
    const generation=digest(JSON.stringify([String(before.dev),String(before.ino),String(before.birthtimeNs)]));
    if (!before.isFile() || generation !== expectedGeneration || before.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('incomplete-source');
    let hasher=createHash('sha256'); let start=0; let resumed=false;
    if(resume && resume.offset <= Number(before.size)) {
      const scratch=Buffer.alloc(1024*1024);
      while(start < resume.offset) {signal.throwIfAborted(); const n=Math.min(scratch.length,resume.offset-start);
        const {bytesRead}=await handle.read(scratch,0,n,start); if(bytesRead!==n) throw new Error('incomplete-source');
        hasher.update(scratch.subarray(0,n)); start+=n;
      }
      resumed=hasher.copy().digest('hex') === resume.prefixHash;
      if(!resumed) {start=0;hasher=createHash('sha256');}
    }
    const limit=Math.min(Number(before.size)-start,maxBytes); const bytes=Buffer.alloc(limit); let offset=0;
    while(offset < limit) {signal.throwIfAborted(); const n=Math.min(64*1024,limit-offset);
      const {bytesRead}=await handle.read(bytes,offset,n,start+offset); if(!bytesRead) throw new Error('incomplete-source'); offset+=bytesRead;
    }
    const after=await handle.stat({bigint:true}); const current=await sourceFileEpoch(path); signal.throwIfAborted();
    if(before.size!==after.size || before.mtimeNs!==after.mtimeNs || before.ctimeNs!==after.ctimeNs || generation!==current.generation)
      throw new Error('incomplete-source');
    const hashThrough=(length:number)=>hasher.copy().update(bytes.subarray(0,length)).digest('hex');
    const lastNewline=bytes.lastIndexOf(10)+1;
    return {bytes,identity,generation,size:Number(before.size),start,resumed,prefixHash:hashThrough(lastNewline),hashThrough,bounded:start+limit < Number(before.size)};
  } finally {await handle.close();}
}
