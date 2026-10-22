import { isDeepStrictEqual } from "node:util";
import { ProtocolError, providerIdSchema } from "../domain/capabilities.js";
import type { AccountingContract, AccountingRegistry, ProviderId } from "../domain/capabilities.js";
import { publicObservationSchema } from "../domain/usage.js";
import type { PublicObservation } from "../domain/usage.js";

/**
 * Normalization v1 baseline, not a claim of adapter support.
 * Requests: provider-wide finalized request IDs survive copies/resumes/forks;
 * request-only formats use native-request coverage, independent of conversation.
 * Formats supporting both representations MUST instead use stable origin-stream
 * coverage for requests AND snapshots; unknown origin stays partial/unsupported.
 * Identical finalized meters are equal; disagreements are conflicts, never LWW.
 * Cumulative: requires stable native stream boundaries and isolated inheritance.
 * No provider revision is certified here: mtime, byte offsets, scan clocks, and
 * arbitrary revision strings cannot establish order. Adapter tasks must extend
 * this registry only with fixture-certified public revision/meter evidence.
 * Model segments preserve exact allowlisted identity and overlapping dimensions.
 */
function baselineContract(provider: ProviderId): AccountingContract {
  return Object.freeze({ provider, normalizationVersion: 1, requestIdentity: "provider-wide-native-request",
    requestRevision: "immutable-final", cumulativeRevision: "uncertified", requestCoverage: "native-request",
    cumulativeCoverage: "native-stream",
    compareRevision(a: PublicObservation, b: PublicObservation) {
      const left = publicObservationSchema.safeParse(a);
      const right = publicObservationSchema.safeParse(b);
      if (!left.success || !right.success) return "incomparable";
      const x = left.data; const y = right.data;
      if (x.provider !== provider || y.provider !== provider || x.repositoryId !== y.repositoryId ||
        x.unitKey !== y.unitKey || x.coverageKey !== y.coverageKey ||
        x.representation !== "request" || y.representation !== "request") return "incomparable";
      return isDeepStrictEqual(x.meters, y.meters) ? "equal" : "incomparable";
    }
  });
}
const contracts = new Map(providerIdSchema.options.map((provider) => [provider, baselineContract(provider)]));
export function getAccountingContract(provider: string, normalizationVersion: number): AccountingContract {
  const parsed = providerIdSchema.safeParse(provider);
  if (!parsed.success || normalizationVersion !== 1) throw new ProtocolError("unsupported-contract");
  return contracts.get(parsed.data)!;
}

/**
 * Pure, code-owned override seam for fixture-certified adapters and reducer tests.
 * No global registration or data-driven plugin loading. A reducer can receive
 * registry.getAccountingContract as its resolver; ordinary callers use defaults.
 * Certified comparators must reject different provider/unit/repo/coverage/epoch
 * evidence and same-sequence meter disagreement, and never order by file mtime.
 */
export function createAccountingRegistry(overrides: readonly AccountingContract[]): AccountingRegistry {
  const selected = new Map<ProviderId, AccountingContract>();
  for (const contract of overrides) {
    const provider = providerIdSchema.safeParse(contract.provider);
    if (!provider.success || contract.normalizationVersion !== 1 || selected.has(provider.data) ||
      (contract.cumulativeRevision === "provider-certified" && contract.requestCoverage !== "origin-stream"))
      throw new ProtocolError("unsupported-contract");
    selected.set(provider.data, Object.freeze({ ...contract }));
  }
  return Object.freeze({ getAccountingContract(provider: string, normalizationVersion: number) {
    const fallback = getAccountingContract(provider, normalizationVersion);
    return selected.get(fallback.provider) ?? fallback;
  } });
}
