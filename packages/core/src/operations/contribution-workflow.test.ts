import { expect, test } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { generateContributionWorkflow } from './contribution-workflow.js';
const yaml = createRequire(import.meta.url)('js-yaml');
const version = '2.0.0-next.0';
const pin = { manifest: JSON.stringify({ private:true, dependencies:{'@legotin/agent-badge':version} }), lock: JSON.stringify({lockfileVersion:3,packages:{'':{dependencies:{'@legotin/agent-badge':version}},'node_modules/@legotin/agent-badge':{version,resolved:'https://registry.npmjs.org/badge.tgz',integrity:'sha512-c3ludGhldGlj'}}}) };
const options = { repositoryId:'12345678-1234-4234-8234-123456789abc',repositoryUrl:'https://github.com/example/repo',defaultBranch:'trunk',runtimeVersion:version,pin };
const execute = promisify(execFile);
test('workflow parses and guards dispatch ref before trusted runtime installation or write', async () => {
 const workflow = yaml.load(await generateContributionWorkflow(options));
 expect(workflow.on.push.branches).toEqual(['trunk']);
 expect(workflow.on.schedule).toBeUndefined();
 expect(workflow.permissions).toEqual({});
 expect(workflow.jobs.import.permissions).toEqual({contents:'write'});
 expect(workflow.jobs.import.steps.find((s: {name:string})=>s.name==='Checkout accepted data only').with['fetch-depth']).toBe(0);
 const root = await mkdtemp('/private/tmp/badge-workflow-');
 try {
  const guard = workflow.jobs.import.steps[0];
  await expect(execute('bash',['-e','-c',guard.run],{cwd:root,env:{...process.env,BADGE_REF:'refs/heads/proposal',BADGE_DEFAULT_REF:'refs/heads/trunk',BADGE_DEFAULT_BRANCH:'trunk',BADGE_ACTUAL_DEFAULT_BRANCH:'trunk'}})).rejects.toThrow();
  await execute('bash',['-e','-c',guard.run],{cwd:root,env:{...process.env,BADGE_REF:'refs/heads/trunk',BADGE_DEFAULT_REF:'refs/heads/trunk',BADGE_DEFAULT_BRANCH:'trunk',BADGE_ACTUAL_DEFAULT_BRANCH:'trunk'}});
 } finally { await rm(root,{recursive:true,force:true}); }
});
test('bootstrap installs from embedded exact lock outside checkout and invokes pinned importer once', async () => {
 const workflow = yaml.load(await generateContributionWorkflow({...options,schedule:'17 4 * * 1'}));
 expect(workflow.on.schedule).toEqual([{cron:'17 4 * * 1'}]);
 const root = await mkdtemp('/private/tmp/badge-workflow-');
 try {
  const bin = join(root,'bin'), runner = join(root,'runner'), checkout = join(root,'repo');
  await mkdir(bin); await mkdir(runner); await mkdir(checkout);
  await writeFile(join(checkout,'package.json'),'{"scripts":{"postinstall":"touch ROOT_LIFECYCLE_RAN"}}');
  await writeFile(join(bin,'npm'),`#!/bin/sh\nset -e\n[ "$PWD" != "$GITHUB_WORKSPACE" ] || exit 91\n[ "$*" = 'ci --ignore-scripts --no-audit --no-fund --workspaces=false --registry=https://registry.npmjs.org/' ] || exit 92\nnode -e 'const fs=require("node:fs");const manifest=JSON.parse(fs.readFileSync("package.json"));const lock=JSON.parse(fs.readFileSync("package-lock.json"));if(manifest.dependencies["@legotin/agent-badge"]!=="2.0.0-next.0"||lock.packages["node_modules/@legotin/agent-badge"].integrity!=="sha512-c3ludGhldGlj")process.exit(93)'\nmkdir -p node_modules/@legotin/agent-badge/dist/cli\nprintf '%s' 'require("node:fs").writeFileSync(process.env.GITHUB_WORKSPACE+"/imported.json",JSON.stringify({argv:process.argv.slice(2),cwd:process.cwd()}))' > node_modules/@legotin/agent-badge/dist/cli/main.js\n`,{mode:0o755});
  const step = workflow.jobs.import.steps.find((s: {name:string})=>s.name==='Import accepted contributions');
  await execute('bash',['-e','-c',step.run],{cwd:checkout,env:{...process.env,...step.env,PATH:bin+':'+process.env.PATH,RUNNER_TEMP:runner,GITHUB_WORKSPACE:checkout,BADGE_ACCEPTED_REF:'a'.repeat(40)}});
  const imported = JSON.parse(await readFile(join(checkout,'imported.json'),'utf8'));
  expect(imported.cwd).toBe(checkout);
  expect(imported.argv).toEqual(['import','--accepted-ref','a'.repeat(40),'--default-branch','trunk','--repository-id',options.repositoryId,'--repository-url',options.repositoryUrl]);
  await expect(readFile(join(checkout,'ROOT_LIFECYCLE_RAN'))).rejects.toThrow();
 } finally { await rm(root,{recursive:true,force:true}); }
});
test('rejects mutable releases, unsafe destinations and schedules and incomplete pins', async () => {
 for(const overrides of [{runtimeVersion:'latest'},{defaultBranch:'bad\nbranch'},{repositoryUrl:'https://user:secret@github.com/x/y'},{schedule:'\nrun: evil'},{pin:{...pin,lock:'{}'}}]) await expect(generateContributionWorkflow({...options,...overrides})).rejects.toThrow();
});


test('refuses a generated workflow over the hosted file limit before returning an unusable artifact', async () => {
 await expect(generateContributionWorkflow({...options, repositoryUrl:'https://github.com/example/'+ 'x'.repeat(500000)})).rejects.toThrow('object-too-large');
});
