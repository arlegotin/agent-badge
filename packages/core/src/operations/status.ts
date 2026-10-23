import type { LedgerMeta } from '../domain/ledger.js';
import type { RepositoryContext } from '../git/context.js';
import { readLedgerCommit } from '../git/data-transport.js';
import type { AcceptedLedger } from '../git/data-transport.js';
import { runGit } from '../git/process.js';
import { readStoreMetadata, StoreError } from '../storage/store.js';
import type { StoreSnapshot } from '../storage/store.js';
import { StoreIndex, fingerprint } from '../storage/index-cache.js';
import { AcceptedIndex } from '../storage/accepted-index.js';
import { readPrivateFile } from '../storage/atomic-file.js';
import { join, resolve } from 'node:path';
import fs from 'node:fs/promises';
import { runReportingTask } from './report-supervisor.js';
import type { CapabilityReport } from '../providers/capability-report.js';
import { staticCapabilities } from '../providers/capability-report.js';
import type { IntegrationInspection } from './integration-port.js';
import { reduceLedger } from '../ledger/reduce.js';
import type { ReducedLedger } from '../ledger/reduce.js';
import { catalogHash, contentHash, defaultCatalog } from '../pricing/catalog.js';
import { renderArtifacts } from '../render/summary.js';
import { ProtocolError } from '../domain/capabilities.js';

export type StatusState = 'recorded' | 'pending' | 'synced' | 'partial' | 'conflicted' | 'unavailable' | 'unsupported';
export interface StatusReport {
  schemaVersion: 1;
  failure: 'unsupported-data' | 'repository-mismatch' | 'local-data-unavailable' | 'reporting-index-unavailable' | null;
  state: StatusState;
  states: StatusState[];
  exitCode: 0 | 1 | 2 | 3 | 4;
  setup: IntegrationInspection['setup'];
  configuration: 'current' | 'drift' | 'uncertain' | 'absent' | 'not-inspected';
  queuedRecords: number | null;
  lastConfirmedSync: string | null;
  metadataRevision: string | null;
  pendingReconciliation: boolean;
  totals: Pick<ReducedLedger, 'recordedUnits' | 'includedUnits' | 'excludedUnits' | 'conflictingUnits' | 'partialUnits' | 'knownTokens' | 'unknownTokenUnits' | 'repositoryCompleteness'> | null;
  valuation: { kind: 'current-catalog-estimate'; catalogAuthority: 'accepted' | 'bootstrap'; catalogVersion: number; catalogSnapshotDate: string; price: unknown } | null;
  localUnits: { localId: string; provider: string }[];
  capabilities?: CapabilityReport;
  providers: { provider: string; outcome: string; diagnostics: string[] }[];
}
/** Compare actual declaration with validated authority; a pending request proves no acceptance. */
export function configurationState(meta: LedgerMeta | null, inspection: IntegrationInspection | undefined, pending: boolean): StatusReport['configuration'] {
  if (!inspection) return 'not-inspected';
  if (!inspection.policy) return 'absent';
  if (meta && contentHash(meta.policy) !== contentHash(inspection.policy)) return 'drift';
  return pending ? 'uncertain' : 'current';
}
export async function loadLocalAccepted(ctx: RepositoryContext, snapshot: StoreSnapshot, signal: AbortSignal, deadline: number): Promise<AcceptedLedger | null> {
  const commit = snapshot.transport?.commit;
  if (!commit) return null;
  const anchor = await runGit(['--no-replace-objects', 'rev-parse', '--verify', `refs/agent-badge/accepted/${commit}`], { cwd: ctx.worktreeRoot, signal, timeoutMs: Math.max(1, deadline - Date.now()) });
  if (anchor.status !== 'ok' || anchor.stdout.trim() !== commit) throw new StoreError('invalid-durable-data');
  const accepted = await readLedgerCommit(ctx, commit, { signal, deadline });
  if (accepted.meta.repositoryId !== snapshot.transport!.repositoryId) throw new ProtocolError('repository-mismatch');
  return accepted;
}
export interface StatusOptions { inspection?: IntegrationInspection; capabilities?: CapabilityReport; integrationModule?: string; signal?: AbortSignal; deadline?: number }
export function unavailableStatus(options: StatusOptions = {}): StatusReport {
 const inspection=options.inspection,conflict=inspection?.checks.some(check=>check.code==='remote-route'&&check.status==='fail');
 return {schemaVersion:1,failure:conflict?'repository-mismatch':'reporting-index-unavailable',state:conflict?'conflicted':'unavailable',states:conflict?['conflicted']:[],exitCode:conflict?2:1,setup:inspection?.setup??'not-inspected',configuration:inspection?inspection.policy?'uncertain':'absent':'not-inspected',queuedRecords:null,lastConfirmedSync:null,metadataRevision:null,pendingReconciliation:false,totals:null,valuation:null,providers:[],localUnits:[],capabilities:options.capabilities??staticCapabilities()};
}
/** No provider discovery, network, lease, installation, chmod or repair. */
export async function getStatus(ctx:RepositoryContext,options:StatusOptions={}):Promise<StatusReport> {
 const {signal,...serializable}=options,deadline=options.deadline??Date.now()+10000;
 try{return await runReportingTask<StatusReport>(new URL('./status.js',import.meta.url),{ctx,options:serializable},deadline,signal);}
 catch{return unavailableStatus(options);}
}
export async function runReport(input:{ctx:RepositoryContext;options:StatusOptions},context:{signal:AbortSignal;deadline:number}) {
 const inspection=input.options.integrationModule?await (await import(input.options.integrationModule)).repositoryIntegrations.inspect(input.ctx,context.signal):input.options.inspection;
 return getIndexedStatus(input.ctx,{...input.options,...context,inspection});
}
export async function getIndexedStatus(ctx:RepositoryContext,options:StatusOptions={}):Promise<StatusReport> {
 const inspection=options.inspection, report=unavailableStatus(options), deadline=options.deadline??Date.now()+10000, signal=options.signal??AbortSignal.timeout(Math.max(1,deadline-Date.now()));
 try {
  if(resolve(ctx.privateDir)!==join(await fs.realpath(ctx.commonDir),'agent-badge'))throw new StoreError('unsafe-store-path');
  return await StoreIndex.readOnly(ctx.privateDir,async index=>{
   const metadata=await readStoreMetadata(ctx),metadataProof=JSON.stringify(metadata);
   let accepted:AcceptedIndex|null=null,proof:string|null=null,database:string|null=null;
   const anchor=async()=>{
    if(!metadata.transport?.commit)return;
    const commit=metadata.transport.commit;
    const result=await runGit(['--no-replace-objects','rev-parse','--verify',`refs/agent-badge/accepted/${commit}^{commit}`],{cwd:ctx.worktreeRoot,signal,timeoutMs:Math.max(1,deadline-Date.now())});
    if(result.status!=='ok'||result.stdout.trim()!==commit)throw new StoreError('invalid-durable-data');
   };
   try {
    if(metadata.transport?.commit){
     await anchor();
     proof=await readPrivateFile(join(ctx.privateDir,'cache/accepted.json'),256*1024,true);
     accepted=await AcceptedIndex.load(ctx.privateDir,metadata.transport.commit);
     if(!accepted)throw new StoreError('store-busy');
     database=fingerprint(accepted.databasePath,true);
     if(JSON.parse(proof).database!==database)throw new StoreError('store-busy');
     if(accepted.validatedState.meta.repositoryId!==metadata.transport.repositoryId)throw new ProtocolError('repository-mismatch');
    }
    if(metadata.transport&&inspection?.repositoryId&&metadata.transport.repositoryId!==inspection.repositoryId)throw new ProtocolError('repository-mismatch');
    if(metadata.transport&&inspection?.binding?.status==='bound'&&(metadata.transport.canonicalPushUrl!==inspection.binding.canonicalPushUrl||metadata.transport.dataRef!==inspection.binding.dataRef))throw new ProtocolError('repository-mismatch');
    const local=index.reporting(accepted??undefined);
    const state=accepted?.validatedState;
    const repositoryId=state?.meta.repositoryId??inspection?.repositoryId??local.repositoryId;
    if(!repositoryId){
     if(local.records.length||local.localUnits.length)throw new StoreError('store-busy');
     if(JSON.stringify(await readStoreMetadata(ctx))!==metadataProof)throw new StoreError('store-busy');
     return {...report,failure:null,queuedRecords:local.pendingCount,pendingReconciliation:metadata.reconciliationPending};
    }
    const policy=inspection?.policy??{schemaVersion:1 as const,repositoryId,normalizationVersion:1 as const,discovery:'auto' as const,disabledProviders:[],badge:{label:'AI usage',metric:'tokens' as const}};
    const meta=state?.meta??{schemaVersion:2 as const,protocolVersion:1 as const,repositoryId,normalizationVersion:1 as const,catalogVersion:defaultCatalog.version,catalogHash:catalogHash(defaultCatalog),policy};
    if(inspection?.repositoryId&&meta.repositoryId!==inspection.repositoryId)throw new ProtocolError('repository-mismatch');
    const catalog=state?.catalog??defaultCatalog;
    // Exact accepted membership, not local acknowledgement, determines the overlay.
    const additions=local.records;
    let ledger,artifacts;
    if(accepted){const extension=accepted.extend(additions);ledger=extension.summary;artifacts=extension.artifacts;}
    else {ledger=reduceLedger(additions,meta);artifacts=renderArtifacts(ledger,meta,catalog);}
    const {recordedUnits,includedUnits,excludedUnits,conflictingUnits,partialUnits,knownTokens,unknownTokenUnits,repositoryCompleteness}=ledger;
    report.totals={recordedUnits,includedUnits,excludedUnits,conflictingUnits,partialUnits,knownTokens,unknownTokenUnits,repositoryCompleteness};
    report.valuation={kind:'current-catalog-estimate',catalogAuthority:accepted?'accepted':'bootstrap',catalogVersion:catalog.version,catalogSnapshotDate:catalog.snapshotDate,price:JSON.parse(Buffer.from(artifacts.get('summary.json')!).toString('utf8')).price};
    report.failure=null;report.queuedRecords=local.pendingCount;report.localUnits=local.localUnits;report.providers=local.providers;report.lastConfirmedSync=state?.commit??null;report.metadataRevision=state?contentHash(state.meta):null;report.pendingReconciliation=metadata.reconciliationPending;
    report.configuration=configurationState(state?.meta??null,inspection,metadata.pendingConfiguration!==null);
    if(recordedUnits)report.states.push('recorded');
    if(local.pendingCount)report.states.push('pending');else if(accepted)report.states.push('synced');
    if(metadata.reconciliationPending||partialUnits||report.providers.some(p=>p.outcome!=='complete'))report.states.push('partial');
    const routeConflict=inspection?.checks.some(check=>check.code==='remote-route'&&check.status==='fail');
    if(conflictingUnits||routeConflict)report.states.push('conflicted');
    report.state=conflictingUnits||routeConflict?'conflicted':report.states.includes('partial')?'partial':local.pendingCount?'pending':accepted?'synced':'recorded';
    report.exitCode=conflictingUnits||routeConflict?2:report.configuration==='drift'?4:inspection?.setup!=='approved'?1:0;
    await anchor();
    if(JSON.stringify(await readStoreMetadata(ctx))!==metadataProof)throw new StoreError('store-busy');
    if(accepted&&(await readPrivateFile(join(ctx.privateDir,'cache/accepted.json'),256*1024,true)!==proof||fingerprint(accepted.databasePath,true)!==database))throw new StoreError('store-busy');
    signal.throwIfAborted();return report;
   } finally {await accepted?.close();}
  });
 } catch(error) {
  const result=unavailableStatus(options);
  if(error instanceof ProtocolError&&error.message==='repository-mismatch')return {...result,failure:'repository-mismatch',state:'conflicted',exitCode:2};
  if(error instanceof ProtocolError||error instanceof StoreError&&error.code==='unsupported-durable-schema')return {...result,failure:'unsupported-data',state:'unsupported',exitCode:3};
  return result;
 }
}
