import { afterEach, expect, test } from 'vitest';
import { createBareRemoteFixture } from '@agent-badge/testkit';
import type { GitFixture } from '@agent-badge/testkit';
import { planSetup } from './setup.js';
import { setupOptions } from '../../test/operational-fixture.js';
const fixtures:GitFixture[]=[];afterEach(async()=>{await Promise.all(fixtures.splice(0).map(f=>f.cleanup()));});
test('opt-in workflow consumes exact approved lock and verified SSH GitHub identity/default branch',async()=>{
 const f=await createBareRemoteFixture();fixtures.push(f);const cwd=f.clones[0];await f.git(cwd,['remote','set-url','origin','git@github.com:Example/Repo.git']);
 const plan=await planSetup({...setupOptions,cwd,declaredUrl:'https://github.com/Example/Repo',importWorkflow:true,readWorkflowRemoteHead:async(url,signal)=>{expect(url).toBe('git@github.com:Example/Repo.git');expect(signal.aborted).toBe(false);return 'ref: refs/heads/trunk\tHEAD\n'+'a'.repeat(40)+'\tHEAD\n';}});
 const change=plan.changes.find(c=>c.path==='.github/workflows/agent-badge-import.yml');expect(change).toBeDefined();
 expect(change!.after).toContain('refs/heads/trunk');expect(change!.after).toContain(Buffer.from(plan.pin.lock).toString('base64'));expect(change!.after).toContain('https://github.com/Example/Repo');
 const ownership=JSON.parse(plan.changes.find(c=>c.path==='.agent-badge/ownership.json')!.after);expect(ownership.files['.github/workflows/agent-badge-import.yml']).toMatch(/^[a-f0-9]{64}$/);
});
test('workflow refuses unverified default branch, wrong destination and unsupported hosts before creating files',async()=>{
 const f=await createBareRemoteFixture();fixtures.push(f);const cwd=f.clones[0];await f.git(cwd,['remote','set-url','origin','ssh://git@ghe.example/example/repo']);
 await expect(planSetup({...setupOptions,cwd,declaredUrl:'ssh://git@ghe.example/example/repo',importWorkflow:true,readWorkflowRemoteHead:async()=>''})).rejects.toThrow();
 await f.git(cwd,['remote','set-url','origin','https://github.com/example/repo']);
 await expect(planSetup({...setupOptions,cwd,declaredUrl:'https://github.com/example/repo',importWorkflow:true,readWorkflowRemoteHead:async()=>'ref: refs/heads/main\tHEAD\n'})).rejects.toThrow();
});
