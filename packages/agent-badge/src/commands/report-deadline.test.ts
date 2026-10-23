import { afterEach, expect, test } from 'vitest';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createBareRemoteFixture } from '@agent-badge/testkit';
import type { GitFixture } from '@agent-badge/testkit';
import { resolveRepository, openStore } from '@legotin/agent-badge-core';
const execute=promisify(execFile),fixtures:GitFixture[]=[];
afterEach(async()=>{await Promise.all(fixtures.splice(0).map(f=>f.cleanup()));});

test.each(['read','cpu','inspection','capability'] as const)('actual diagnostic terminates owned %s work and exits within its original budget',async stage=>{
 const f=await createBareRemoteFixture();fixtures.push(f);const cwd=f.clones[0],ctx=await resolveRepository(cwd),store=await openStore(ctx);await store.pendingCount();
 const marker=join(f.root,'worker-pid'),hook=join(f.root,'stall.mjs');
 const providerRoot=join(f.root,'synthetic-code-home');
 if(stage==='capability') {
  const repositoryId='12345678-1234-4234-8234-123456789abc';await mkdir(join(cwd,'.agent-badge'));
  await writeFile(join(cwd,'.agent-badge/config.json'),JSON.stringify({schemaVersion:1,repositoryId,declaredUrl:'https://github.com/example/synthetic',dataRef:'refs/heads/agent-badge/data',runtimeVersion:'2.0.0-next.0',policy:{schemaVersion:1,repositoryId,normalizationVersion:1,discovery:'auto',disabledProviders:[],badge:{label:'Usage',metric:'tokens'}}}));
 }
 // Synthetic preload only in this subprocess. It targets the reporting index,
 // never real provider roots, and records only the owned child PID.
 await writeFile(hook,`import fs from 'node:fs';import promises from 'node:fs/promises';import{syncBuiltinESMExports}from'node:module';
 const marker=${JSON.stringify(marker)},target=${JSON.stringify(ctx.privateDir)};
 const mark=()=>fs.writeFileSync(marker,String(process.pid));
 if(${JSON.stringify(stage)}==='cpu'){const original=fs.readdirSync;fs.readdirSync=function(path,...args){if(String(path)===target+'/journal'){mark();while(true){}}return original.call(this,path,...args);};syncBuiltinESMExports();}
 else if(['inspection','capability'].includes(${JSON.stringify(stage)})){const original=promises.lstat;promises.lstat=async function(path,...args){if(String(path)===${JSON.stringify(stage==='inspection'?join(cwd,'.agent-badge/config.json'):providerRoot)}){mark();return new Promise(()=>setInterval(()=>{},1000));}return original.call(this,path,...args);};}
 else {const original=promises.open;promises.open=async function(path,...args){const handle=await original.call(this,path,...args);if(String(path)===target+'/cache/index.json')handle.readFile=()=>{mark();return new Promise(()=>setInterval(()=>{},1000));};return handle;};}
 syncBuiltinESMExports();
 `);
 const program=`import{runDoctorCommand}from ${JSON.stringify(new URL('../../dist/commands/doctor.js',import.meta.url).href)};console.log(JSON.stringify(await runDoctorCommand({cwd:${JSON.stringify(cwd)},timeoutMs:700})));`;
 const start=performance.now();let pid:number|undefined;
 try {
  const result=await execute(process.env.AGENT_BADGE_TEST_NODE??process.execPath,['--input-type=module','-e',program],{cwd,env:{...process.env,NODE_OPTIONS:'--import='+hook,CODEX_HOME:providerRoot,CLAUDE_CONFIG_DIR:join(f.root,'empty-claude'),GEMINI_CLI_HOME:join(f.root,'empty-gemini'),XDG_DATA_HOME:join(f.root,'empty-data')},timeout:2500});
  pid=Number(await readFile(marker,'utf8'));
  expect(JSON.parse(result.stdout)).toMatchObject({status:'attention-required',exitCode:1});
  expect(performance.now()-start).toBeLessThan(1800);
  expect(()=>process.kill(pid!,0)).toThrow();
 } finally {
  if(!pid)try{pid=Number(await readFile(marker,'utf8'));}catch{}
  if(pid)try{process.kill(-pid,'SIGKILL');}catch{}
 }
},7000);
