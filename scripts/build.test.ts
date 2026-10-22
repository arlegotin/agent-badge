import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';

test('clean package build removes deleted v1 outputs and rebuilds unchanged sources',async()=>{
  const root=await mkdtemp(join(tmpdir(),'agent-badge-build-'));
  try {
    for(const name of ['core','agent-badge','create-agent-badge','testkit']) {
      const directory=join(root,'packages',name);await mkdir(join(directory,'src/cli'),{recursive:true});
      await writeFile(join(directory,'tsconfig.json'),JSON.stringify({compilerOptions:{composite:true,outDir:'dist',rootDir:'src',types:[],target:'ES2023'},include:['src/**/*.ts']}));
      await writeFile(join(directory,'src/index.ts'),'export const value = 1;');
      if(name==='agent-badge')await writeFile(join(directory,'src/cli/main.ts'),'export const cli = 1;');
    }
    const {buildWorkspace}=await import('./build.mjs');
    await buildWorkspace(root);
    const stale=join(root,'packages/core/dist/publish/gist.js');await mkdir(join(root,'packages/core/dist/publish'));await writeFile(stale,'stale v1 runtime');
    const kept=join(root,'packages/core/src/keep.txt');await writeFile(kept,'unrelated source');
    await buildWorkspace(root);
    await expect(stat(stale)).rejects.toMatchObject({code:'ENOENT'});
    expect(await readFile(join(root,'packages/core/dist/index.js'),'utf8')).toContain('value = 1');
    expect(await readFile(kept,'utf8')).toBe('unrelated source');
    if(process.platform!=='win32')expect((await stat(join(root,'packages/agent-badge/dist/cli/main.js'))).mode&0o111).toBe(0o111);
  }finally{await rm(root,{recursive:true,force:true});}
});
