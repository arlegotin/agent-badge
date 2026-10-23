import { realpath as fixtureRealpath } from 'node:fs/promises';
import { tmpdir as fixtureTmpdir } from 'node:os';
import { join as fixtureJoin } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { mkdir, mkdtemp, writeFile, chmod, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import * as git from './process.js';
const roots: string[] = [];
afterEach(async()=> { await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true}))); });
async function command(source:string) {
 const root = await fixtureRealpath(await mkdtemp(fixtureJoin(fixtureTmpdir(), 'task15-stream-'))); roots.push(root);
 const bin = join(root,'bin'); await mkdir(bin);
 const script = join(bin,'synthetic.cjs'); await writeFile(script,source);
 const executable = join(bin,'git-synthetic'); await writeFile(executable,`#!/bin/sh\nexec '${process.execPath}' '${script}' "$@"\n`); await chmod(executable,0o755);
 return {root,args:[`--exec-path=${bin}`,'synthetic']};
}
async function collect(input:AsyncIterable<string>) { const records=[]; for await(const record of input) records.push(record); return records; }
test('streams arbitrarily many bounded NUL records without treating total output as a record limit',async()=> {
 expect(typeof git.streamGitRecords).toBe('function');
 const c = await command(`for(let i=0;i<50000;i++)process.stdout.write('record-record-record-record-record\\0');`);
 let count=0; for await(const record of git.streamGitRecords(c.args,{cwd:c.root,maxRecordBytes:40,timeoutMs:5000})) { expect(record).toBe('record-record-record-record-record'); count++; }
 expect(count).toBe(50000);
});
test('rejects an overlong record and incomplete final record without exposing untrusted bytes',async()=> {
 const c = await command(`process.stdout.write('PRIVATE_PATH_'+ 'x'.repeat(10000));`);
 await expect(collect(git.streamGitRecords(c.args,{cwd:c.root,maxRecordBytes:32}))).rejects.toThrow('output-limit');
 const d = await command(`process.stdout.write('unterminated');`);
 await expect(collect(git.streamGitRecords(d.args,{cwd:d.root}))).rejects.toThrow('invalid-record');
});
test('early iterator return kills the producer and its owned helper descendants',async()=> {
 const c = await command(`const fs=require('node:fs'),{spawn}=require('node:child_process');const helper=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync('pids',JSON.stringify([process.pid,helper.pid]));process.stdout.write('one\\0');setInterval(()=>{},1000);`);
 for await(const record of git.streamGitRecords(c.args,{cwd:c.root,timeoutMs:5000})) { expect(record).toBe('one'); break; }
 const pids = JSON.parse(await readFile(join(c.root,'pids'),'utf8'));
 await new Promise(resolve=>setTimeout(resolve,50)); // Allow the OS to reap killed orphan helpers, as in process.test.ts.
 for(const pid of pids) expect(()=>process.kill(pid,0)).toThrow();
});
test('cancellation and deadline kill a stalled producer even when consumer has received one record',async()=> {
 const c = await command(`process.stdout.write('one\\0');setInterval(()=>{},1000);`);
 const controller = new AbortController();
 const records = git.streamGitRecords(c.args,{cwd:c.root,signal:controller.signal,timeoutMs:5000});
 expect(await records.next()).toMatchObject({value:'one',done:false}); controller.abort();
 await expect(records.next()).rejects.toThrow('aborted');
 await expect(collect(git.streamGitRecords(c.args,{cwd:c.root,timeoutMs:150}))).rejects.toThrow('timeout');
});

test('a nonzero producer exit rejects EOF with bounded static diagnostics',async()=> {
 const c=await command(`process.stdout.write('one\\0');process.stderr.write('PRIVATE_STDERR_PATH secret-token');process.exitCode=2;`);
 const failure=await collect(git.streamGitRecords(c.args,{cwd:c.root})).then(()=>null,error=>error as Error);
 expect(failure?.message).toContain('git-stream-error');
 expect(failure?.message).not.toMatch(/PRIVATE_STDERR_PATH|secret-token/);
});


test('returning a paused iterator never signals a process group already reaped at producer close',async()=> {
 const c=await command(`require('node:fs').writeFileSync('producer-pid',String(process.pid));process.stdout.write('one\\0'+'tail\\0'.repeat(20000));setTimeout(()=>process.exit(0),20);`);
 const records=git.streamGitRecords(c.args,{cwd:c.root,timeoutMs:5000});
 expect(await records.next()).toMatchObject({value:'one'});
 const pid=Number(await readFile(join(c.root,'producer-pid'),'utf8'));
 for(let attempt=0;attempt<100;attempt++) { try { process.kill(pid,0); } catch { break; } await new Promise(resolve=>setTimeout(resolve,10)); }
 expect(()=>process.kill(pid,0)).toThrow();
 await new Promise(resolve=>setTimeout(resolve,50));
 const kill=vi.spyOn(process,'kill');
 try { await records.return(); expect(kill).not.toHaveBeenCalled(); }
 finally { kill.mockRestore(); }
});
