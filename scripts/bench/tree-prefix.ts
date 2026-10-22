/** Compare verified raw-prefix cost with per-record replay on synthetic Git data. */
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,realpath} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {streamGitRecords} from '../../packages/core/src/git/process.js';
const root=await realpath(process.argv[2]);if(!root.startsWith('/private/tmp/')||!basename(root).startsWith('agent-badge-git-'))throw Error('synthetic fixture required');
const cwd=join(root,'clone-a');if(JSON.parse(await readFile(join(cwd,'.agent-badge/config.json'),'utf8')).declaredUrl!=='https://github.com/synthetic/benchmark')throw Error('synthetic fixture required');
const owner=JSON.parse(await readFile(join(cwd,'.git/agent-badge/cache/accepted-stage-owner.json'),'utf8'));
for(const kind of process.argv[3]?[process.argv[3]]:['tree','retention']){
  const args=['--no-replace-objects','-c','core.hooksPath=/dev/null','ls-tree','-r','-z',...(kind==='tree'?['-t','-l']:kind==='tree-no-size'?['-t']:['--name-only']),owner.commit,...(kind==='retention'?['--','observations','controls']:[])];
  for(const mode of ['records','raw'])for(let sample=0;sample<3;sample++){
    const start=performance.now(),hash=createHash('sha256');let records=0,bytes=0;
    if(mode==='records')for await(const line of streamGitRecords(args,{cwd,timeoutMs:5000,maxRecordBytes:1024})){records++;hash.update(line).update('\0');bytes+=Buffer.byteLength(line)+1;}
    else {
      const child=spawn('git',args,{cwd,stdio:['ignore','pipe','ignore']}),done=new Promise<number|null>(resolve=>child.once('close',resolve));
      const timer=setTimeout(()=>child.kill('SIGKILL'),5000);
      try{for await(const chunk of child.stdout){bytes+=chunk.length;hash.update(chunk);let offset=0;while((offset=chunk.indexOf(0,offset))!==-1){records++;offset++;}}if(await done!==0)throw Error('Git failed');}finally{clearTimeout(timer);child.kill('SIGKILL');}
    }
    console.log(JSON.stringify({kind,mode,sample,ms:performance.now()-start,records,bytes,digest:hash.digest('hex')}));
  }
}
