/** Deterministic synthetic evidence for a client-owned local receive-pack. */
import { readFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBareRemoteFixture } from '../../packages/testkit/src/git-fixtures.js';
import { createOperationBudget } from '../../packages/core/src/operations/budget.js';
import { superviseOperation } from '../../packages/core/src/operations/supervisor.js';

const fixture = await createBareRemoteFixture();
const workerPid = join(fixture.root, 'worker.pid'), evidence = join(fixture.root, 'receiver.json');
const hook = `#!${process.execPath}
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
if(process.argv[2]==='prepared'){
 const worker=Number(readFileSync(${JSON.stringify(workerPid)},'utf8'));
 const ids=[worker,process.ppid,process.pid];
 const inspected=spawnSync('/bin/ps',['-o','pid=,ppid=,pgid=','-p',ids.join(',')],{encoding:'utf8'});
 writeFileSync(${JSON.stringify(evidence)},JSON.stringify({worker,receiver:process.ppid,hook:process.pid,inspectionStatus:inspected.status,groups:inspected.stdout.trim()}));
 while(true){}
}
`;
// Node treats extensionless Git hooks as CommonJS; dynamic import keeps the hook portable.
await writeFile(join(fixture.remote, 'hooks/reference-transaction'), hook.replace("import {readFileSync,writeFileSync} from 'node:fs';", "const {readFileSync,writeFileSync}=require('node:fs');").replace("import {spawnSync} from 'node:child_process';", "const {spawnSync}=require('node:child_process');"), { mode: 0o700 });
const worker = join(fixture.root, 'worker.mjs');
await writeFile(worker, `import {writeFileSync} from 'node:fs';import {runGit} from ${JSON.stringify(pathToFileURL(resolve('packages/core/src/git/process.ts')).href)};
export async function runOperation(input,context){writeFileSync(input.workerPid,String(process.pid));await runGit(['push',input.remote,'HEAD:refs/heads/agent-badge/data'],{cwd:input.cwd,signal:context.signal,timeoutMs:context.deadline-Date.now()});return {status:'queued',acknowledgedCount:0,queuedCount:null,pendingReconciliation:true};}`);
const budget = createOperationBudget('automatic');
try {
  const start = performance.now();
  const result = await superviseOperation({ budget, worker: pathToFileURL(worker), input: { cwd: fixture.clones[0], remote: fixture.remote, workerPid } });
  const ms = performance.now() - start, observed = JSON.parse(await readFile(evidence, 'utf8'));
  const alive: Record<string, boolean> = {};
  for (const name of ['worker', 'receiver', 'hook']) {
    try { process.kill(observed[name], 0); alive[name] = true; } catch { alive[name] = false; }
  }
  const lock = join(fixture.remote, 'refs/heads/agent-badge/data.lock'), info = await stat(lock);
  console.log(JSON.stringify({ root: fixture.root, ms, result, observed, alive, lock: { bytes: await readFile(lock, 'utf8'), size: info.size, mtime: info.mtime.toISOString() } }));
} finally { budget.dispose(); }
