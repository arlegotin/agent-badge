import { afterEach, expect, test, vi } from 'vitest';
import { createBareRemoteFixture } from '@agent-badge/testkit';
import { run } from './main.js';
afterEach(()=>{process.exitCode=undefined;vi.restoreAllMocks();});
test('actual run emits static JSON for setup refusal without leaking the thrown local error',async()=>{
 const fixture=await createBareRemoteFixture(),before=process.cwd(),output:string[]=[];const capture=vi.spyOn(console,'log').mockImplementation(line=>output.push(String(line)));
 try{process.chdir(fixture.clones[0]);await run(['node','agent-badge','sync','--json'],{nodeVersion:'24.0.0'});
  expect(JSON.parse(output.join('\n'))).toMatchObject({schemaVersion:1,command:'sync',status:'needs-setup',exitCode:1});expect(process.exitCode).toBe(1);
  expect(output.join('')).not.toContain(fixture.root);
 }finally{capture.mockRestore();process.chdir(before);await fixture.cleanup();}
});

test('unsupported runtime JSON retains its safe static requirement before operational imports',async()=>{
 const output:string[]=[];vi.spyOn(console,'log').mockImplementation(line=>output.push(String(line)));
 await run(['node','agent-badge','sync','--json'],{nodeVersion:'22.14.0'});
 expect(JSON.parse(output.join('\n'))).toEqual({schemaVersion:1,command:'sync',status:'unsupported-node',message:'agent-badge requires Node 24 or 26.',exitCode:1});
 expect(process.exitCode).toBe(1);
});
