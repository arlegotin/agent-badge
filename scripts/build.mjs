import { chmod, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
const workspace=fileURLToPath(new URL('../',import.meta.url));
const packages=['core','agent-badge','create-agent-badge','testkit'];
/** Build only known generated outputs; callers must not run consumers concurrently. */
export async function buildWorkspace(root=workspace) {
  for(const name of packages) {
    await rm(join(root,'packages',name,'dist'),{recursive:true,force:true});
    await rm(join(root,'packages',name,'tsconfig.tsbuildinfo'),{force:true});
  }
  const compiler=join(workspace,'node_modules/typescript/bin/tsc');
  const result=spawnSync(process.execPath,[compiler,'-b',...packages.map(name=>join(root,'packages',name,'tsconfig.json'))],{cwd:root,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error('TypeScript build failed.');
  for(const entry of ['agent-badge/dist/cli/main.js','create-agent-badge/dist/index.js'])await chmod(join(root,'packages',entry),0o755);
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await buildWorkspace();
