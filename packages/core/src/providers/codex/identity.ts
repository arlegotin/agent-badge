import { isDeepStrictEqual } from 'node:util';
import type { AccountingContract, CapabilityManifest } from '../../domain/capabilities.js';
import type { PublicObservation } from '../../domain/usage.js';
import { publicObservationSchema } from '../../domain/usage.js';

/** Original request owner, independent of file/installation/fork/session identity. */
export function codexRequestIdentity(thread: string, response: string): string {
  return JSON.stringify([thread, response]);
}
export const codexAccountingContract: AccountingContract = Object.freeze({
  provider:'codex', normalizationVersion:1, requestIdentity:'provider-wide-native-request',
  requestRevision:'immutable-final', cumulativeRevision:'uncertified', requestCoverage:'native-request',
  cumulativeCoverage:'native-stream',
  compareRevision(a: PublicObservation, b: PublicObservation) {
    const x = publicObservationSchema.safeParse(a); const y = publicObservationSchema.safeParse(b);
    if (!x.success || !y.success) return 'incomparable';
    if (x.data.provider !== 'codex' || y.data.provider !== 'codex' || x.data.repositoryId !== y.data.repositoryId ||
      x.data.unitKey !== y.data.unitKey || x.data.coverageKey !== y.data.coverageKey ||
      x.data.representation !== 'request' || y.data.representation !== 'request') return 'incomparable';
    return isDeepStrictEqual(x.data.meters, y.data.meters) ? 'equal' : 'incomparable';
  }
});
export const codexCapabilityManifest: CapabilityManifest = Object.freeze({
  provider:'codex',normalizationVersion:1,accounting:'fixture-certified',sourceSchemas:['codex-token-usage-record-source-pin-86e17e9'],
  fixtureReferences:['packages/core/src/providers/codex/adapter.test.ts','packages/testkit/src/codex-fixtures.ts'],
  identity:'provider-request',revision:'immutable-final',coverage:'request',forks:'stable-native-requests',modelSegmentation:'per-request'
});
