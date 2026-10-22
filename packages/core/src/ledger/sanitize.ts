import { createHash } from "node:crypto";
import { ProtocolError } from "../domain/capabilities.js";
import { parseSharedPolicy } from "../domain/policy.js";
import type { SharedPolicy } from "../domain/policy.js";
import { parseObservation, parsePublicObservation } from "../domain/usage.js";
import type { PublicObservation, UsageObservation } from "../domain/usage.js";
import { canonicalJson } from "./canonical-json.js";

/** JSON tuple framing prevents delimiter collisions. UUID is a namespace, not a secret. */
function scopedDigest(domain: string, repositoryId: string, provider: string, nativeId: string): string {
  return createHash("sha256").update(JSON.stringify(["agent-badge", 2, domain, repositoryId, provider, nativeId]), "utf8").digest("hex");
}
export function sanitizeObservation(input: UsageObservation, policy: SharedPolicy): PublicObservation {
  const observation = parseObservation(input);
  const shared = parseSharedPolicy(policy);
  if (observation.identity !== "provider-native") throw new ProtocolError("unsupported-identity");
  if (observation.execution.repositoryId !== null && observation.execution.repositoryId !== shared.repositoryId)
    throw new ProtocolError("repository-mismatch");
  if (observation.representation === "cumulative" && observation.lineage.inherited === "uncertain")
    throw new ProtocolError("uncertain-lineage");
  // A copied request has the same coverage even when its containing stream changes.
  const coverageIdentity = observation.coverage === "native-request" ? observation.nativeUnitId : observation.nativeCoverageId;
  const revision = observation.revision.kind === "final" ? "final" :
    `${observation.revision.kind}:${scopedDigest("revision", shared.repositoryId, observation.provider, observation.revision.evidence)}` +
      (observation.revision.kind === "certified" ? `:${observation.revision.sequence}` : "");
  const output = parsePublicObservation({ schemaVersion: 2, repositoryId: shared.repositoryId, normalizationVersion: 1,
    provider: observation.provider, representation: observation.representation,
    unitKey: scopedDigest(`unit:${observation.representation}`, shared.repositoryId, observation.provider, observation.nativeUnitId),
    coverageKey: scopedDigest("coverage", shared.repositoryId, observation.provider, coverageIdentity),
    revision,
    supersedes: [...new Set(observation.supersedes)].sort(), meters: observation.meters,
    quality: observation.quality === "partial" || observation.revision.kind === "unordered" ||
      observation.meters.some((meter) => meter.model === null ||
      meter.vendor === null || meter.total === null) ? "partial" : "exact" });
  canonicalJson(output); // Enforce the byte limit before an object can reach the outbox.
  return output;
}
