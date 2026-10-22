import { mkdtemp, open, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { readSourceFile, sourceFileEpoch } from '../../packages/core/src/providers/source-file.js';
const root=await mkdtemp('/private/tmp/badge-prefix-bench-'),path=join(root,'synthetic.jsonl');
try {
 const file=await open(path,'wx'),chunk=Buffer.alloc(1024*1024,32),hash=createHash('sha256');chunk[chunk.length-1]=10;
 for(let index=0;index<128;index++){await file.write(chunk);hash.update(chunk);}await file.write(Buffer.from('tail\n'));await file.close();
 const prefixHash=hash.digest('hex'),epoch=await sourceFileEpoch(path),samples:number[]=[];
 for(let index=0;index<5;index++){
   const start=performance.now(),read=await readSourceFile(path,512*1024,AbortSignal.timeout(1900),epoch.generation,{offset:128*1024*1024,prefixHash});
   samples.push(performance.now()-start);if(!read.resumed||read.bytes.toString()!=='tail\n')throw Error('append progress failed');
 }
 const edit=await open(path,'r+');await edit.write(Buffer.from('changed'),0,7,0);await edit.close();
 const rewritten=await readSourceFile(path,512*1024,AbortSignal.timeout(1900),epoch.generation,{offset:128*1024*1024,prefixHash});
 if(rewritten.resumed||rewritten.start!==0)throw Error('rewrite detection failed');
 console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,prefixBytes:128*1024*1024,samplesMs:samples,rss:process.memoryUsage().rss,appendBytes:5,rewriteDetected:true}));
}finally{await rm(root,{recursive:true,force:true});}
