import { resolveRepository, readStoreSnapshot } from '@legotin/agent-badge-core';
import { observationEvidenceHash } from '@legotin/agent-badge-core';
import { CommandFailure } from './context.js';
export async function runExplainCommand(options:{cwd?:string;localId:string}) {
  if(!/^[a-f0-9]{64}$/.test(options.localId))throw new CommandFailure('invalid-input');
  const repository=await resolveRepository(options.cwd??process.cwd()),snapshot=await readStoreSnapshot(repository);
  const observation=snapshot.entries.flatMap(e=>e.observations).find(o=>observationEvidenceHash(o)===options.localId);
  if(!observation)throw new CommandFailure('unknown-local-id');
  const decision=snapshot.entries.flatMap(e=>e.attribution?.decisions??[]).filter(d=>d.observationHash===options.localId).at(-1);
  return {schemaVersion:1 as const,status:'explained',exitCode:0,localId:options.localId,redacted:true,provider:observation.provider,representation:observation.representation,
    attribution:decision?{status:decision.status,reason:decision.reason,historicalProof:decision.verifiedCommonDir!==null}:null,
    quality:observation.quality,lineage:observation.lineage.kind,diagnostics:observation.diagnostics.map(d=>d.code)};
}
