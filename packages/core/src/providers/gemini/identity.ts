import { isDeepStrictEqual } from "node:util";
import type {
  AccountingContract,
  CapabilityManifest,
} from "../../domain/capabilities.js";
import type { PublicObservation } from "../../domain/usage.js";
import { publicObservationSchema } from "../../domain/usage.js";

/** Durable writer UUID, independent of session, inherited copies and rotation. */
export function geminiRequestIdentity(message: string): string {
  return JSON.stringify(["message", message]);
}
export const geminiAccountingContract: AccountingContract = Object.freeze({
  provider: "gemini",
  normalizationVersion: 1,
  requestIdentity: "provider-wide-native-request",
  requestRevision: "immutable-final",
  cumulativeRevision: "uncertified",
  requestCoverage: "native-request",
  cumulativeCoverage: "native-stream",
  compareRevision(a: PublicObservation, b: PublicObservation) {
    const x = publicObservationSchema.safeParse(a);
    const y = publicObservationSchema.safeParse(b);
    if (!x.success || !y.success) return "incomparable";
    if (
      x.data.provider !== "gemini" ||
      y.data.provider !== "gemini" ||
      x.data.repositoryId !== y.data.repositoryId ||
      x.data.unitKey !== y.data.unitKey ||
      x.data.coverageKey !== y.data.coverageKey ||
      x.data.representation !== "request" ||
      y.data.representation !== "request"
    )
      return "incomparable";
    return isDeepStrictEqual(x.data.meters, y.data.meters)
      ? "equal"
      : "incomparable";
  },
});
export const geminiCapabilityManifest: CapabilityManifest = Object.freeze({
  provider: "gemini",
  normalizationVersion: 1,
  accounting: "fixture-certified",
  sourceSchemas: [
    "gemini-saved-jsonl-pin-09d81bf",
    "gemini-saved-json-pin-09d81bf",
  ],
  fixtureReferences: [
    "packages/core/src/providers/gemini/adapter.test.ts",
    "packages/testkit/src/gemini-fixtures.ts",
  ],
  identity: "provider-request",
  revision: "immutable-final",
  coverage: "request",
  forks: "stable-native-requests",
  modelSegmentation: "per-request",
});
