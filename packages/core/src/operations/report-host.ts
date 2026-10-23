import { inSupervisedProcessGroup } from '../git/process.js';
process.once('message', async (message:{worker:string;input:unknown;deadline:number})=>{
  try {
    const worker=await import(message.worker);
    const signal=AbortSignal.timeout(Math.max(1,message.deadline-Date.now()));
    const result=await inSupervisedProcessGroup(()=>worker.runReport(message.input,{signal,deadline:message.deadline}));
    process.send?.(result);
    // The parent terminates/reaps our complete group after receiving the result.
  } catch { process.exit(1); }
});
process.once('disconnect',()=>process.exit(1));
