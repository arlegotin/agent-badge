/** Component cost only: no usage/accounting claims. Run through run-isolated.py. */
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fingerprint } from '../../packages/core/src/storage/index-cache.js';
import { createCodexAdapter } from '../../packages/core/src/providers/codex/adapter.js';
const count=Number(process.argv[2]??10000),root=await mkdtemp(join(tmpdir(),'agent-badge-inventory-'));
try {
  const journal=join(root,'journal'),home=join(root,'codex'),sources=join(home,'sessions');
  await mkdir(journal);await mkdir(sources,{recursive:true});
  for(let start=0;start<count;start+=64)await Promise.all(Array.from({length:Math.min(64,count-start)},async(_,n)=>{
    await writeFile(join(journal,String(start+n).padStart(16,'0')+'.json'),'{}',{mode:0o600});
    await writeFile(join(sources,String(start+n).padStart(5,'0')+'.jsonl'),'{}\n');
  }));
  const fingerprints:number[]=[],discovery:number[]=[];let candidates=0;
  for(let n=0;n<10;n++){
    let start=performance.now();const inventory=new Map(readdirSync(journal).sort().map(name=>[name,fingerprint(join(journal,name))]));fingerprints.push(performance.now()-start);
    if(inventory.size!==count)throw Error('incomplete inventory');
    start=performance.now();const result=await createCodexAdapter({environment:{}}).discover({enrolledRoots:[home],signal:AbortSignal.timeout(2000),lazyEpoch:true});discovery.push(performance.now()-start);candidates=result.length;
  }
  console.log(JSON.stringify({node:process.version,platform:process.platform,count,candidates,fingerprints,discovery,rss:process.memoryUsage().rss}));
}finally{await rm(root,{recursive:true,force:true});}
