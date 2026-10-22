import { isDeepStrictEqual } from 'node:util';
import type { AccountingContract, CapabilityManifest } from '../../domain/capabilities.js';
import type { PublicObservation } from '../../domain/usage.js';
import { publicObservationSchema } from '../../domain/usage.js';
/** Native response identity survives content-block duplication and the pinned SDK fork transform. */
export function claudeResponseIdentity(messageId:string):string {return JSON.stringify(['message',messageId]);}
export const claudeAccountingContract:AccountingContract=Object.freeze({
  provider:'claude',normalizationVersion:1,requestIdentity:'provider-wide-native-request',requestRevision:'immutable-final',
  cumulativeRevision:'uncertified',requestCoverage:'native-request',cumulativeCoverage:'native-stream',
  compareRevision(a:PublicObservation,b:PublicObservation) {
    const x=publicObservationSchema.safeParse(a),y=publicObservationSchema.safeParse(b);
    if(!x.success||!y.success)return 'incomparable';
    if(x.data.provider!=='claude'||y.data.provider!=='claude'||x.data.repositoryId!==y.data.repositoryId||x.data.unitKey!==y.data.unitKey||
      x.data.coverageKey!==y.data.coverageKey||x.data.representation!=='request'||y.data.representation!=='request')return 'incomparable';
    return isDeepStrictEqual(x.data.meters,y.data.meters)?'equal':'incomparable';
  }
});
/** Structural identity fixtures certify coverage only; native numeric accounting remains unsupported. */
export const claudeCapabilityManifest:CapabilityManifest=Object.freeze({provider:'claude',normalizationVersion:1,
  accounting:'unsupported',sourceSchemas:['claude-native-jsonl-identity-v1'],fixtureReferences:['packages/core/src/providers/claude/adapter.test.ts'],
  identity:'provider-request',revision:'immutable-final',coverage:'request',forks:'stable-native-requests',modelSegmentation:'unknown'});
