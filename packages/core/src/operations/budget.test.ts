import { afterEach, expect, test } from 'vitest';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createOperationBudget } from './budget.js';
import { superviseOperation } from './supervisor.js';
import { acquireLock } from '../storage/lock.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(body: string) {
  const root = await realpath(await mkdtemp(join('/private/tmp', 'agent-badge-budget-'))); roots.push(root);
  const worker = join(root, 'worker.mjs'); await writeFile(worker, body);
  return { root, worker: pathToFileURL(worker) };
}
const moduleUrl = (path: string) => pathToFileURL(join(process.cwd(), 'packages/core/src', path)).href;
const success = `{status:'unchanged',acknowledgedCount:0,queuedCount:0,pendingReconciliation:false}`;

test('automatic budget caps caller timeouts and manual cancellation returns an actionable failure', async () => {
  const budget = createOperationBudget('automatic', 9000);
  expect(budget.remainingMs()).toBeLessThanOrEqual(2000);
  budget.dispose();
  const manual = createOperationBudget('manual', 20);
  await new Promise(resolve => setTimeout(resolve, 35));
  expect(manual.signal.aborted).toBe(true); expect(manual.remainingMs()).toBe(0);
  manual.dispose();
});

test('parent stops a CPU-blocked reader within the total automatic budget and emits one queued diagnostic', async () => {
  const { worker } = await fixture(`export async function runOperation(){while(true){}}`);
  const budget = createOperationBudget('automatic', 550);
  const start = performance.now(); const diagnostics: string[] = [];
  const result = await superviseOperation({ worker, input: {}, budget, onDiagnostic: d => diagnostics.push(d) });
  expect(performance.now() - start).toBeLessThan(1000);
  expect(result.status).toBe('queued'); expect(result.exitCode).toBe(0);
  expect(diagnostics).toEqual([result.diagnostic]); expect(result.diagnostic).not.toMatch(/private|worker.mjs/);
  budget.dispose();
});

test('manual timeout returns nonzero while automatic unsupported platform refuses before spawning', async () => {
  const { root, worker } = await fixture(`import{writeFile}from'node:fs/promises';export async function runOperation(input){await writeFile(input.marker,'started');while(true){}}`);
  const marker = join(root, 'marker');
  const unsupportedBudget = createOperationBudget('automatic');
  const unsupported = await superviseOperation({ worker, input: { marker }, budget: unsupportedBudget, platform: 'win32' });
  expect(unsupported.status).toBe('unsupported'); expect(unsupported.exitCode).toBe(0);
  await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' }); unsupportedBudget.dispose();
  const manualBudget = createOperationBudget('manual', 550);
  const manual = await superviseOperation({ worker, input: { marker }, budget: manualBudget });
  expect(manual.exitCode).not.toBe(0); expect(manual.diagnostic).toContain('deadline'); manualBudget.dispose();
});

test.each(['timeout', 'normal'])('supervisor cleans actual worker Git and auth-helper descendants on %s without touching another tool', async mode => {
  const { root, worker } = await fixture(`import{writeFile}from'node:fs/promises';import{runGit}from ${JSON.stringify(moduleUrl('git/process.ts'))};export async function runOperation(input){await writeFile(input.root+'/worker.pid',String(process.pid));const git=runGit(['-c','credential.helper='+input.helper,'credential','fill'],{cwd:input.root,input:'protocol=https\\nhost=synthetic.invalid\\n\\n',timeoutMs:10000});while(true){try{await (await import('node:fs/promises')).access(input.marker);break}catch{await new Promise(r=>setTimeout(r,5))}}${mode === 'timeout' ? 'while(true){}' : `return ${success}`}}`);
  const marker = join(root, 'helper.pid'), helper = join(root, 'helper');
  await writeFile(helper, `#!/bin/sh\necho "$$ $PPID" > "$HELPER_MARKER"\nwhile :; do sleep 1; done\n`, { mode: 0o700 });
  // Git's helper environment is explicitly synthetic and inherits through the owned worker.
  const { spawn } = await import('node:child_process');
  const other = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  try {
    const budget = createOperationBudget('automatic', mode === 'timeout' ? 1400 : 2000);
    const result = await superviseOperation({ worker, input: { root, marker, helper }, budget, env: { HELPER_MARKER: marker } });
    const pids = (await readFile(marker, 'utf8')).trim().split(/\s+/).map(Number);
    pids.push(Number(await readFile(join(root,'worker.pid'),'utf8')));
    for (const pid of pids) await expect.poll(() => { try { process.kill(pid, 0); return false; } catch { return true; } }).toBe(true);
    expect(() => process.kill(other.pid!, 0)).not.toThrow();
    expect(result.status).toBe(mode === 'timeout' ? 'queued' : 'unchanged');
    budget.dispose();
  } finally { other.kill('SIGKILL'); }
});

test('confirmed child exit cleans exactly its owned lease even with unknown namespace; later operation can acquire', async () => {
  const { root, worker } = await fixture(`import{acquireLock}from ${JSON.stringify(moduleUrl('storage/lock.ts'))};export async function runOperation(input,context){await acquireLock(input.root,new AbortController().signal,async()=>null,context.leaseToken);await(await import('node:fs/promises')).writeFile(input.root+'/acquired','yes');while(true){}}`);
  const budget = createOperationBudget('automatic', 800);
  const result = await superviseOperation({ worker, input: { root }, budget, leaseDirectory: root });
  expect(result.status).toBe('queued'); budget.dispose();
  expect(await readFile(join(root,'acquired'),'utf8')).toBe('yes');
  const release = await acquireLock(root, AbortSignal.timeout(100), async () => null); await release();
});

test('supervisor preserves a foreign lease instead of treating child death as generic stale-lock proof', async () => {
  const { root, worker } = await fixture(`export async function runOperation(){while(true){}}`);
  const token = '11111111-1111-4111-8111-111111111111';
  await writeFile(join(root, 'operation.lock'), JSON.stringify({ schemaVersion: 1, host: 'synthetic.invalid', namespace: null, pid: process.pid, token, startedAt: 0 }));
  const budget = createOperationBudget('automatic', 400);
  await superviseOperation({ worker, input: {}, budget, leaseDirectory: root }); budget.dispose();
  expect(JSON.parse(await readFile(join(root, 'operation.lock'), 'utf8')).token).toBe(token);
  await expect(acquireLock(root, AbortSignal.timeout(30), async () => null)).rejects.toMatchObject({ code: 'store-busy', uncertainty: true });
});

test('matching child PID with the wrong lease nonce remains conservative', async () => {
  const { root, worker } = await fixture(`import{acquireLock}from ${JSON.stringify(moduleUrl('storage/lock.ts'))};export async function runOperation(input){await acquireLock(input.root,new AbortController().signal,async()=>null,'22222222-2222-4222-8222-222222222222');while(true){}}`);
  const budget = createOperationBudget('automatic', 700);
  await superviseOperation({ worker, input: { root }, budget, leaseDirectory: root }); budget.dispose();
  expect(JSON.parse(await readFile(join(root, 'operation.lock'), 'utf8')).token).toBe('22222222-2222-4222-8222-222222222222');
  await expect(acquireLock(root, AbortSignal.timeout(25), async () => null)).rejects.toMatchObject({ code: 'store-busy', uncertainty: true });
});

test('parent crash loses direct child proof and unknown namespace never authorizes recovery', async () => {
  const { root, worker } = await fixture(`import{acquireLock}from ${JSON.stringify(moduleUrl('storage/lock.ts'))};import{writeFile}from'node:fs/promises';export async function runOperation(input,context){await acquireLock(input.root,new AbortController().signal,async()=>null,context.leaseToken);await writeFile(input.root+'/worker.pid',String(process.pid));process.kill(process.ppid,'SIGKILL');while(true){}}`);
  const { runStorageFixtureProcess } = await import('@agent-badge/testkit');
  const child = await runStorageFixtureProcess(process.cwd(), `const{superviseOperation}=await import(${JSON.stringify(moduleUrl('operations/supervisor.ts'))});const{createOperationBudget}=await import(${JSON.stringify(moduleUrl('operations/budget.ts'))});await superviseOperation({worker:new URL(${JSON.stringify(worker.href)}),input:{root:${JSON.stringify(root)}},leaseDirectory:${JSON.stringify(root)},budget:createOperationBudget('automatic')});`);
  expect(child.signal).toBe('SIGKILL');
  const pid = Number(await readFile(join(root, 'worker.pid'), 'utf8'));
  try {
    process.kill(-pid, 'SIGKILL');
    await expect(acquireLock(root, AbortSignal.timeout(35), async () => null)).rejects.toMatchObject({ code: 'store-busy', uncertainty: true });
    expect(JSON.parse(await readFile(join(root, 'operation.lock'), 'utf8')).pid).toBe(pid);
  } finally { try { process.kill(-pid, 'SIGKILL'); } catch { /* Reaped. */ } }
});

test('completed targeted sync reports durable broad reconciliation pending in one diagnostic', async () => {
  const { worker } = await fixture(`export async function runOperation(){return{status:'unchanged',acknowledgedCount:0,queuedCount:0,pendingReconciliation:true}}`);
  const budget = createOperationBudget('automatic'), diagnostics: string[] = [];
  const result = await superviseOperation({ worker, input: {}, budget, onDiagnostic: line => diagnostics.push(line) });
  budget.dispose(); expect(result.status).toBe('unchanged'); expect(result.exitCode).toBe(0);
  expect(result.diagnostic).toContain('reconciliation pending'); expect(diagnostics).toEqual([result.diagnostic]);
});
