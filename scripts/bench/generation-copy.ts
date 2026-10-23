/** Disposable copy/seal component measurement; all data is synthetic. */
import {constants} from 'node:fs';
import {copyFile,mkdtemp,open,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
const root=await mkdtemp('/private/tmp/agent-badge-generation-copy-');
try {
  for(const bytes of [24*1024*1024,192*1024*1024]) {
    const source=join(root,'source'),file=await open(source,'w',0o600),block=Buffer.alloc(1024*1024,71);
    for(let offset=0;offset<bytes;offset+=block.length)await file.write(block);
    await file.sync();await file.close();
    for(const clone of [false,true]) {
      const samples:number[]=[];
      for(let n=0;n<10;n++) {
        const target=join(root,'target'),start=performance.now();
        await copyFile(source,target,constants.COPYFILE_EXCL|(clone?constants.COPYFILE_FICLONE:0));
        const copied=await open(target,'r+');await copied.sync();await copied.close();
        const directory=await open(root,'r');await directory.sync();await directory.close();
        samples.push(performance.now()-start);
        if((await stat(target)).size!==bytes)throw Error('incomplete copy');await rm(target);
      }
      console.log(JSON.stringify({node:process.version,bytes,clone,samplesMs:samples}));
    }
  }
}finally {await rm(root,{recursive:true,force:true});}
