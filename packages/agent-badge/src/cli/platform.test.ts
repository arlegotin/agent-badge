import { afterEach, expect, test, vi } from 'vitest';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { planAgentHooks } from '../integration/agent-hooks.js';
import type { RepositoryContext } from '@legotin/agent-badge-core';
import { createRequire } from 'node:module';
import { run, handleRunError } from './main.js';
import { planSetup, applySetup } from '../integration/setup.js';
import type { SetupPlan } from '../integration/setup.js';
import { launcherSource, bootstrapSource } from '../integration/templates.js';
const message = 'agent-badge: Native Windows is unsupported. Run Agent Badge and the coding agent in Linux/WSL2, or use macOS.';
const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
afterEach(() => { Object.defineProperty(process, 'platform', descriptor); process.exitCode=undefined; vi.restoreAllMocks(); });
const actions = [['init'],['setup'],['collect'],['sync'],['status'],['doctor'],['explain','synthetic'],['include','synthetic'],['exclude','synthetic'],['contribute'],['import','--file','synthetic'],['configure','--from-file','synthetic'],['upgrade','--runtime-version','2.0.0'],['uninstall']];
test.each(actions)('native Windows %s returns the static JSON rejection before repository effects', async (...args) => {
  const cwd = await mkdtemp(join(tmpdir(), 'agent-badge-platform-')), previous = process.cwd(), output:string[]=[];
  vi.spyOn(console,'log').mockImplementation(line=>output.push(String(line)));
  try {
    process.chdir(cwd); Object.defineProperty(process,'platform',{value:'win32',configurable:true});
    await run(['node','agent-badge',...args,'--json'],{nodeVersion:'24.0.0'});
    expect(output.map(line=>JSON.parse(line))).toEqual([{schemaVersion:1,command:args[0],status:'unsupported-platform',message,exitCode:3}]);
    expect(process.exitCode).toBe(3); expect(await readdir(cwd)).toEqual([]);
  } finally { process.chdir(previous); await rm(cwd,{recursive:true,force:true}); }
});
test('Windows plaintext, parsing and Node precedence retain their safe boundaries', async () => {
  Object.defineProperty(process,'platform',{value:'win32',configurable:true});
  const errors:string[]=[], output:string[]=[];
  vi.spyOn(console,'log').mockImplementation(line=>output.push(String(line)));
  await run(['node','badge','sync'],{nodeVersion:'24.0.0'}).catch(e=>handleRunError(e,{error:line=>errors.push(String(line))}));
  expect(errors).toEqual([message]); expect(process.exitCode).toBe(3);
  for(const args of [['--help'],['--version'],['setup','--help'],['sync','--help'],['sync','--unknown'],['explain'],['configure']]) {
    process.exitCode=undefined;
    const error=await run(['node','badge',...args],{nodeVersion:'24.0.0'}).catch(e=>e);
    expect(error.code).toMatch(/^commander\./); handleRunError(error,{error:line=>errors.push(String(line))});
    expect(process.exitCode).toBe(args.includes('--help')||args.includes('--version')?undefined:64);
  }
  // A help-looking value is data, not an exemption from the action boundary.
  await run(['node','badge','explain','--','--help'],{nodeVersion:'24.0.0'}).catch(e=>handleRunError(e,{error:line=>errors.push(String(line))}));
  expect(errors.at(-1)).toBe(message); expect(process.exitCode).toBe(3);
  output.length=0;
  await run(['node','badge','sync','--json'],{nodeVersion:'22.14.0'});
  expect(JSON.parse(output[0])).toMatchObject({status:'unsupported-node',exitCode:1});
});
test('direct setup APIs reject Windows before resolving a repository or reading a plan',async()=>{
  Object.defineProperty(process,'platform',{value:'win32',configurable:true});
  const options={nodeVersion:'24.0.0',get cwd():string {throw Error('repository read before platform gate');}};
  await expect(planSetup(options)).rejects.toMatchObject({name:'UnsupportedPlatformError',message});
  const plan={options:{nodeVersion:'24.0.0'},get pin():never{throw Error('pin read before platform gate');}} as unknown as SetupPlan;
  await expect(applySetup(plan)).rejects.toMatchObject({name:'UnsupportedPlatformError',message});
});
function executeSource(source:string,args:string[], metadata?:string) {
  const output:string[]=[],errors:string[]=[], effects:string[]=[];
  const nativeRequire=createRequire(import.meta.url);
  const fakeProcess={versions:{node:'24.0.0'},platform:'win32',argv:['node','/synthetic/.agent-badge/run.cjs',...args],exitCode:undefined as number|undefined};
  const require=(name:string)=>name==='node:path'?nativeRequire(name):name==='node:fs'&&metadata?{readFileSync:(path:string)=>{effects.push(path);return metadata;}}:new Proxy({}, {get:(_target,key)=>()=>{effects.push(name+'.'+String(key));throw Error('forbidden operational effect');}});
  runInNewContext(source,{require,process:fakeProcess,__dirname:'/synthetic/.agent-badge',console:{log:(line:string)=>output.push(line),error:(line:string)=>errors.push(line)},Buffer,URL});
  return {output,errors,effects,code:fakeProcess.exitCode};
}
test.each(actions)('actual generated launcher rejects Windows %s before pin/Git/npm/private I/O',(...args)=>{
  expect(executeSource(launcherSource,[...args,'--json'])).toEqual({output:[JSON.stringify({schemaVersion:1,command:args[0],status:'unsupported-platform',message,exitCode:3})],errors:[],effects:[],code:3});
});
test('actual generated launcher plaintext/help and invalid setup flags have no operational effects',()=>{
  expect(executeSource(launcherSource,['setup'])).toEqual({output:[],errors:[message],effects:[],code:3});
  const help=executeSource(launcherSource,['setup','--help']);expect(help.output.join('')).toContain('Usage:');expect(help.effects).toEqual([]);
  const invalid=executeSource(launcherSource,['setup','--unknown']);expect(invalid.code).toBe(64);expect(invalid.effects).toEqual([]);
});

test('Windows launcher version reads only declaration metadata and help reads no files',()=>{
  const version=executeSource(launcherSource,['--version'],'{"runtimeVersion":"2.0.0"}');
  expect(version.output).toEqual(['2.0.0']); expect(version.effects).toEqual([join('/synthetic','.agent-badge','config.json')]);
  expect(version.errors).toEqual([]);
  expect(executeSource(launcherSource,['--help']).effects).toEqual([]);
});
test('actual initializer executable returns Windows exit3 with no setup state',async()=>{
  const cwd=await mkdtemp(join(tmpdir(),'agent-badge-native-init-'));
  try {
    const preload=join(cwd,'platform.cjs');await writeFile(preload,"Object.defineProperty(process,'platform',{value:'win32'});");
    const entry=fileURLToPath(new URL('../../../create-agent-badge/dist/index.js',import.meta.url));
    const result=await promisify(execFile)(process.execPath,['--require',preload,entry,'--json'],{cwd}).then(r=>({...r,code:0})).catch(e=>e);
    expect(result.code).toBe(3);expect(JSON.parse(result.stdout)).toEqual({schemaVersion:1,command:'init',status:'unsupported-platform',message,exitCode:3});
    expect(await readdir(cwd)).toEqual(['platform.cjs']);
  } finally {await rm(cwd,{recursive:true,force:true});}
});
test.each(['bootstrap','locator'])('Windows automatic %s fails softly before loading runtime or spawning Git',async kind=>{
  const errors:string[]=[], effects:string[]=[], module={exports:{}};
  const require=(_name:string)=>{effects.push(_name);throw Error('operational import');};
  const process={platform:'win32',versions:{node:'24.0.0'},argv:[],hrtime:{bigint:()=>0n},exit:(code:number)=>{throw {softExit:code};}};
  const context={process,require,module,performance:{now:()=>0},console:{error:(line:string)=>errors.push(line)}};
  if(kind==='bootstrap') {
    expect(await runInNewContext(bootstrapSource+';runBootstrap();',context)).toEqual({exitCode:0});
    expect(errors).toEqual([message]);expect(effects).toEqual([]);return;
  }
  const cwd=await mkdtemp(join(tmpdir(),'agent-badge-native-locator-'));
  try {
    const repository={worktreeRoot:cwd,privateDir:join(cwd,'.git/agent-badge'),worktrees:[{path:cwd,bare:false}]} as RepositoryContext;
    const plan=await planAgentHooks(cwd,repository);
    const config=JSON.parse(plan.changes.find(change=>change.path==='.codex/hooks.json')!.after);
    const command=config.hooks.Stop[0].hooks[0].command as string;
    // Undo the shell single-quote encoding to run the actual fixed locator body.
    const encoded=command.split("then node -e '")[1].split("' codex;")[0];
    const locator=encoded.replaceAll("'\"'\"'", "'");
    errors.length=0;
    const nativeRequire=createRequire(import.meta.url);
    const result=(()=>{try{runInNewContext(locator,{...context,require:(name:string)=>new Proxy(nativeRequire(name),{get(target,key){if(key==='spawn')return ()=>{effects.push('spawn');throw Error('spawned');};return target[key];}})});return null;}catch(error){return error;}})();
    expect(result).toEqual({softExit:0});
    expect(errors).toEqual([message]);expect(effects).toEqual([]);
  } finally {await rm(cwd,{recursive:true,force:true});}
});

test('end-of-options keeps a literal JSON-looking argument subject to invalid-argument parsing',async()=>{
  Object.defineProperty(process,'platform',{value:'win32',configurable:true});
  const output:string[]=[];vi.spyOn(console,'log').mockImplementation(line=>output.push(String(line)));
  const error=await run(['node','badge','--','status','--json'],{nodeVersion:'24.0.0'}).catch(error=>error);
  handleRunError(error); expect(process.exitCode).toBe(64);expect(output).toEqual([]);
});

test('JSON rejection names the parsed action even when the command follows an option delimiter',async()=>{
  Object.defineProperty(process,'platform',{value:'win32',configurable:true});
  const output:string[]=[];vi.spyOn(console,'log').mockImplementation(line=>output.push(String(line)));
  await run(['node','badge','--','explain','--json'],{nodeVersion:'24.0.0'});
  expect(JSON.parse(output[0])).toEqual({schemaVersion:1,command:'explain',status:'unsupported-platform',message,exitCode:3});
});
