import { lstat, readdir, open, link, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { controlRecordSchema } from '../domain/ledger.js';
import type { ControlRecord } from '../domain/ledger.js';
import { canonicalJson, recordHash } from '../ledger/canonical-json.js';
import { assertDirectory, readPrivateFile, hasCode, StoreError, privateDirectory, syncDirectory } from './atomic-file.js';
import { PUBLIC_OBJECT_MAX_BYTES } from '../domain/capabilities.js';
export async function readControlFile(root:string,path:string):Promise<ControlRecord>{
  if(!/^controls\/[a-f0-9]{64}\.json$/.test(path))throw new StoreError('invalid-durable-data');
  const info=await lstat(join(root,path));if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o777)!==0o600)throw new StoreError('invalid-durable-data');
  const bytes=await readPrivateFile(join(root,path),PUBLIC_OBJECT_MAX_BYTES,true);let value:unknown;
  try{value=JSON.parse(bytes);}catch{throw new StoreError('invalid-durable-data');}
  if(value&&typeof value==='object'&&'schemaVersion'in value&&value.schemaVersion!==2)throw new StoreError('unsupported-durable-schema');
  const parsed=controlRecordSchema.safeParse(value);
  if(!parsed.success||'controls/'+recordHash(parsed.data)+'.json'!==path||canonicalJson(parsed.data)!==bytes)throw new StoreError('invalid-durable-data');
  return parsed.data;
}
/** Immutable source-free explicit intent. No source path/checkpoint or private identity is invented. */
export async function readControls(root:string):Promise<ControlRecord[]> {
  const directory=join(root,'controls');
  try {await assertDirectory(directory);}catch(error){if(hasCode(error,'ENOENT'))return [];throw error;}
  const records:ControlRecord[]=[];
  for(const name of (await readdir(directory)).sort()) {
    if(/^\.tmp-[a-f0-9-]{36}$/.test(name))continue;
    if(!/^[a-f0-9]{64}\.json$/.test(name))throw new StoreError('invalid-durable-data');
    records.push(await readControlFile(root,'controls/'+name));
  }
  return records;
}
/** Caller holds the store lease. Existing edited/corrupt intent is never overwritten. */
export async function writeControl(root:string,input:ControlRecord):Promise<void> {
  const parsed=controlRecordSchema.safeParse(input);if(!parsed.success)throw new StoreError('invalid-batch');
  const bytes=canonicalJson(parsed.data);if(Buffer.byteLength(bytes)>PUBLIC_OBJECT_MAX_BYTES)throw new StoreError('invalid-batch');
  const previous=await readControls(root),hash=recordHash(parsed.data);
  if(previous.some(control=>recordHash(control)===hash))return;
  await privateDirectory(join(root,'controls'));
  await syncDirectory(root);
  const directory=join(root,'controls'),temporary=join(directory,'.tmp-'+randomUUID()),target=join(directory,hash+'.json');
  try {
    const handle=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    try {await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
    try {await link(temporary,target);}
    catch(error){if(!hasCode(error,'EEXIST'))throw error;const existing=await readControls(root);if(!existing.some(control=>recordHash(control)===hash))throw new StoreError('invalid-durable-data');}
    await syncDirectory(directory);
  } finally {await unlink(temporary).catch(()=>{});}

}
