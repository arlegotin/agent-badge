#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { setupOptions } from './setup-options.js';
import { assertSupportedNode, UnsupportedNodeError, UNSUPPORTED_NODE_MESSAGE } from '../integration/manifest.js';
import { formatPlaintext } from './format.js';
import type { CliResults } from './format.js';
import { CommandFailure } from '../commands/errors.js';

function version():string {try{return JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),'../../package.json'),'utf8')).version;}catch{return '0.0.0';}}
export interface CliOptions {cwd?:string;write?(line:string):void}
const collect=(value:string,previous:string[]=[])=>[...previous,value];
export function buildProgram(context:CliOptions={}):Command {
  const program=new Command().name('agent-badge').description('Record supported local AI usage in a repository-owned ledger.').version(version(),'--version');
  const cwd=context.cwd;
  function emit<C extends keyof CliResults>(command:C,value:CliResults[C],json?:boolean) {
    const result={schemaVersion:1,command,...value};
    const write=context.write??console.log;
    if(json)write(JSON.stringify(result));
    else for (const line of formatPlaintext(command,value)) write(line);
    const exit=(result as {exitCode?:number}).exitCode;if(exit!==undefined)process.exitCode=exit;
  }
  for(const name of ['init','setup'] as const) {
    const setup=program.command(name).description('Install and explicitly activate repository-owned setup.');
    for(const [flags,description] of setupOptions) setup.option(flags,description);
    setup.action(async options=>{const {runInitCommand}=await import('../commands/init.js');emit(name,await runInitCommand({cwd,newRepository:options.newRepository,target:options.target,declaredUrl:options.repositoryUrl,runtimeVersion:options.runtimeVersion,dryRun:options.dryRun,importWorkflow:options.importWorkflow}),options.json);});
  }
  program.command('collect').description('Capture/reproject local usage into the durable queue; no remote writes.').option('--full','Manual historical reconciliation.').option('--json','Print stable JSON.')
    .action(async options=>{const {runCollectCommand}=await import('../commands/collect.js');emit('collect',await runCollectCommand({cwd,full:options.full}),options.json);});
  program.command('sync').description('Incremental capture and bounded Git synchronization.').option('--json','Print stable JSON.')
    .action(async options=>{const {runSyncCommand}=await import('../commands/sync.js');emit('sync',await runSyncCommand({cwd}),options.json);});
  program.command('status').description('Read local totals, coverage, queue and accepted sync state without network.').option('--json','Print stable JSON.')
    .action(async options=>{const {runStatusCommand}=await import('../commands/status.js');emit('status',await runStatusCommand({cwd}),options.json);});
  program.command('doctor').description('Check setup and sources; optional read-only remote validation.').option('--remote','Explicit bounded remote read; does not prove write permission.').option('--json','Print stable JSON.')
    .action(async options=>{const {runDoctorCommand}=await import('../commands/doctor.js');emit('doctor',await runDoctorCommand({cwd,remote:options.remote}),options.json);});
  program.command('explain <local-id>').description('Explain private journal attribution using an opaque local ID; redacted.').option('--json','Print stable JSON.')
    .action(async(localId,options)=>{const {runExplainCommand}=await import('../commands/explain.js');emit('explain',await runExplainCommand({cwd,localId}),options.json);});
  for(const kind of ['include','exclude'] as const) program.command(`${kind} <local-id-or-unit-key>`).description('Persist an explicit opaque-key control against validated current accepted control heads.').option('--json','Print stable JSON.')
    .action(async(localId,options)=>{const {runControlCommand}=await import('../commands/controls.js');emit(kind,await runControlCommand({cwd,localId,kind}),options.json);});
  program.command('contribute').description('Write a sanitized immutable public contribution for normal PR staging.').option('--hash <digest>','Select public record and causal closure.',collect,[]).option('--json','Print stable JSON.')
    .action(async options=>{const {runContributeCommand}=await import('../commands/contribute.js');const result=await runContributeCommand({cwd,selectedHashes:options.hash.length?options.hash:undefined});emit('contribute',{status:'written',exitCode:0,path:result.path,records:result.envelope.records.length},options.json);});
  program.command('import').description('Import a strict public contribution or explicit private normalized source.').option('--file <path>','Managed public contribution envelope.').option('--normalized-source <path>','Explicit private normalized producer envelope; never a guessed native export.')
    .option('--accepted-ref <oid>','Accepted default-branch commit for trusted CI.').option('--default-branch <branch>','Actual trusted default branch.').option('--repository-id <uuid>','Pinned repository UUID for trusted CI.').option('--repository-url <url>','Pinned repository destination for trusted CI.').option('--json','Print stable JSON.')
    .action(async options=>{
      if(Number(!!options.file)+Number(!!options.normalizedSource)+Number(!!options.acceptedRef)!==1)throw new CommandFailure('invalid-input');
      if(options.normalizedSource){if(options.defaultBranch||options.repositoryId||options.repositoryUrl)throw new CommandFailure('invalid-input');const {runNormalizedImportCommand}=await import('../commands/normalized-import.js');emit('import',await runNormalizedImportCommand({cwd,file:options.normalizedSource}),options.json);return;}
      const {runImportCommand}=await import('../commands/import.js');const result=await runImportCommand({cwd,file:options.file,acceptedRef:options.acceptedRef,defaultBranch:options.defaultBranch,repositoryId:options.repositoryId,repositoryUrl:options.repositoryUrl});
      const {accepted:_,...summary}=result;emit('import',{...summary,exitCode:result.complete?0:result.failure==='conflict'?2:result.failure==='unsupported'?3:1},options.json);
    });
  program.command('configure').description('Explicit shared metadata/catalog revision-CAS change.').requiredOption('--from-file <path>','Validated configuration request.').option('--json','Print stable JSON.')
    .action(async options=>{const {runConfigureCommand}=await import('../commands/configure.js');emit('configure',await runConfigureCommand({cwd,fromFile:options.fromFile}),options.json);});
  program.command('upgrade').description('Deliberately approve an exact runtime and optional supported metadata/catalog update.').requiredOption('--runtime-version <version>','Exact runtime version.').option('--from-file <path>','Explicit configuration request.').option('--dry-run','Plan runtime changes only.').option('--json','Print stable JSON.')
    .action(async options=>{const {runUpgradeCommand}=await import('../commands/upgrade.js');emit('upgrade',await runUpgradeCommand({cwd,runtimeVersion:options.runtimeVersion,fromFile:options.fromFile,dryRun:options.dryRun}),options.json);});
  program.command('uninstall').description('Deactivate and remove owned integrations; retain unsynced private data and shared history.').option('--json','Print stable JSON.')
    .action(async options=>{const {runUninstallCommand}=await import('../commands/uninstall.js');emit('uninstall',await runUninstallCommand({cwd}),options.json);});
  return program;
}
export async function run(argv:string[]=process.argv,options:{nodeVersion?:string}={}):Promise<void>{
  try{assertSupportedNode(options.nodeVersion);}
  catch(error){
    if(!(error instanceof UnsupportedNodeError)||!argv.slice(2).includes('--json'))throw error;
    const command=buildProgram().commands.find(candidate=>candidate.name()===argv[2])?.name()??'unknown';
    console.log(JSON.stringify({schemaVersion:1,command,status:'unsupported-node',message:UNSUPPORTED_NODE_MESSAGE,exitCode:1}));process.exitCode=1;return;
  }
  const program=buildProgram().exitOverride();
  for(const command of program.commands) command.exitOverride();
  try{await program.parseAsync(argv);}
  catch(error){
    if((error as {code?:string})?.code?.startsWith('commander.')||!argv.slice(2).includes('--json'))throw error;
    const command=program.commands.find(candidate=>candidate.name()===argv[2])?.name()??'unknown';
    const status=error instanceof CommandFailure?error.reason:error instanceof Error&&error.name==='ProtocolError'?'unsupported-data':'operation-unavailable';
    const exitCode=status==='unsupported-data'?3:status==='invalid-input'?64:1;
    console.log(JSON.stringify({schemaVersion:1,command,status,exitCode}));process.exitCode=exitCode;
  }
}
export function handleRunError(error:unknown,stderr:Pick<typeof console,'error'>=console):void {
  const code=(error as {code?:string})?.code;
  if(code==='commander.helpDisplayed'||code==='commander.version')return;
  if(code?.startsWith('commander.')){process.exitCode=64;return;}
  stderr.error(error instanceof UnsupportedNodeError?UNSUPPORTED_NODE_MESSAGE:error instanceof CommandFailure?error.message:'agent-badge: operation unavailable; run doctor.');process.exitCode=1;
}
export function isDirectExecution(argv:readonly string[]=process.argv):boolean {try{return typeof argv[1]==='string'&&fileURLToPath(import.meta.url)===realpathSync(argv[1]);}catch{return false;}}
if(isDirectExecution())void run().catch(handleRunError);
