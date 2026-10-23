import { constants } from 'node:fs';
import { open, lstat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { configureRepository, parseLedgerMeta, parsePriceCatalog } from '@legotin/agent-badge-core';
import { activeContext, CommandFailure } from './context.js';
import { writeAcceptedDeclaration } from '../integration/setup.js';
/** Detached explicit input; no native-export guessing or symlink traversal. */
export async function readExplicitJson(path:string,maxBytes=1024*1024):Promise<unknown> {
  const absolute=resolve(path);let parent=dirname(absolute);
  while(true){const info=await lstat(parent);if(!info.isDirectory()||info.isSymbolicLink())throw new CommandFailure('invalid-input');const next=dirname(parent);if(next===parent)break;parent=next;}
  const handle=await open(absolute,constants.O_RDONLY|constants.O_NOFOLLOW);
  try {const before=await handle.stat();if(!before.isFile()||before.size>maxBytes)throw new CommandFailure('invalid-input');
    const bytes=Buffer.alloc(before.size+1),{bytesRead}=await handle.read(bytes,0,bytes.length,0),after=await handle.stat();
    if(bytesRead!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)throw new CommandFailure('invalid-input');
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,bytesRead)));
  }finally{await handle.close();}
}
export async function runConfigureCommand(options:{cwd?:string;fromFile:string;timeoutMs?:number}) {
  const value=await readExplicitJson(options.fromFile) as {schemaVersion:number;expectedMetadataRevision:string;meta:unknown;catalog:unknown};
  if(!value||Object.keys(value).sort().join(',')!=='catalog,expectedMetadataRevision,meta,schemaVersion'||value.schemaVersion!==1||!/^[a-f0-9]{64}$/.test(value.expectedMetadataRevision))throw new CommandFailure('invalid-input');
  const meta=parseLedgerMeta(value.meta),catalog=parsePriceCatalog(value.catalog),ctx=await activeContext(options.cwd,options.timeoutMs);
  const result=await configureRepository({repository:ctx.repository,store:ctx.store,binding:ctx.activation.binding,signal:ctx.signal,deadline:ctx.deadline,
    expectedMetadataRevision:value.expectedMetadataRevision,meta,catalog,writeDeclaration:(accepted,signal)=>writeAcceptedDeclaration(ctx.repository,accepted,signal)});
  return {schemaVersion:1 as const,status:result.status,exitCode:result.exitCode,confirmedCommit:result.confirmedCommit,metadataRevision:result.metadataRevision};
}
