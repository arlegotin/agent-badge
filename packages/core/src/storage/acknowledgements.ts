import fs from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { digestSchema } from '../domain/capabilities.js';
import { atomicFile, assertDirectory, hasCode, privateDirectory, readPrivateFile, StoreError, syncDirectory } from './atomic-file.js';
const schema = z.object({schemaVersion:z.literal(1),hashes:z.array(digestSchema)}).strict();
const hash = (bytes:string) => createHash('sha256').update(bytes).digest('hex');
function parse(bytes:string) {
  let value:unknown;try {value=JSON.parse(bytes);}catch {throw new StoreError('invalid-durable-data');}
  if(value && typeof value==='object' && 'schemaVersion' in value && value.schemaVersion!==1) throw new StoreError('unsupported-durable-schema');
  const parsed=schema.safeParse(value);if(!parsed.success)throw new StoreError('invalid-durable-data');return parsed.data;
}
export async function readAcknowledgementFile(root:string,path:string,readOnly=true):Promise<string[]>{
  if(path==='acknowledged.json')return parse(await readPrivateFile(join(root,path),undefined,readOnly)).hashes;
  if(!/^acknowledgements\/[a-f0-9]{64}\.json$/.test(path))throw new StoreError('invalid-durable-data');
  const bytes=await readPrivateFile(join(root,path),256*1024,readOnly),value=parse(bytes);
  if('acknowledgements/'+hash(bytes)+'.json'!==path||value.hashes.length>3000||JSON.stringify(value)!==bytes||JSON.stringify([...new Set(value.hashes)].sort())!==JSON.stringify(value.hashes))throw new StoreError('invalid-durable-data');
  return value.hashes;
}
/** Immutable bounded confirmation receipts. No cumulative-history snapshot ceiling. */
export async function readAcknowledgements(root:string, readOnly=false):Promise<string[]> {
  const hashes=new Set<string>();
  // Early repository-native snapshots remain authoritative; new confirmations never rewrite them.
  try {for(const h of parse(await readPrivateFile(join(root,'acknowledged.json'),undefined,readOnly)).hashes)hashes.add(h);}
  catch(error){if(!hasCode(error,'ENOENT'))throw error;}
  const directory=join(root,'acknowledgements');
  try {await assertDirectory(directory);}catch(error){if(hasCode(error,'ENOENT'))return [...hashes];throw error;}
  for(const name of (await fs.readdir(directory)).sort()) {
    if(/^\.tmp-[a-f0-9-]{36}$/.test(name))continue;
    if(!/^[a-f0-9]{64}\.json$/.test(name))throw new StoreError('invalid-durable-data');
    const bytes=await readPrivateFile(join(directory,name),256*1024,readOnly),value=parse(bytes);
    if(hash(bytes)+'.json'!==name || value.hashes.length>3000 || JSON.stringify(value)!==bytes ||
      JSON.stringify([...new Set(value.hashes)].sort())!==JSON.stringify(value.hashes))throw new StoreError('invalid-durable-data');
    for(const h of value.hashes)hashes.add(h);
  }
  return [...hashes];
}
/** Caller holds owning store lease and has filtered to confirmed known record hashes. */
export async function appendAcknowledgements(root:string, hashes:readonly string[]):Promise<void> {
  if(!hashes.length)return;
  const directory=join(root,'acknowledgements');await privateDirectory(directory);await syncDirectory(root);
  const ordered=[...new Set(hashes)].sort();
  for(let start=0;start<ordered.length;start+=3000) {
    const value=schema.parse({schemaVersion:1,hashes:ordered.slice(start,start+3000)}),bytes=JSON.stringify(value);
    const path=join(directory,hash(bytes)+'.json');
    try {if(await readPrivateFile(path,256*1024,true)!==bytes)throw new StoreError('invalid-durable-data');}
    catch(error){if(!hasCode(error,'ENOENT'))throw error;await atomicFile(path,value);}
  }
}
