import { createHash } from "node:crypto";
import { isAbsolute, relative, sep } from "node:path";
import { z } from "zod";
import {
  parseProtocol,
  privateStringSchema,
  providerIdSchema,
  repositoryIdSchema,
} from "../domain/capabilities.js";
import { parseSharedPolicy } from "../domain/policy.js";
import type { SharedPolicy } from "../domain/policy.js";
import { parseObservation } from "../domain/usage.js";
import type { UsageObservation } from "../domain/usage.js";
import { canonicalRemoteUrl } from "../git/remote-binding.js";

function normalizedAlias(value: string): string {
  const canonical = canonicalRemoteUrl(value)!;
  if (canonical.startsWith("github.com/")) return "https://" + canonical;
  if (canonical.startsWith("ssh-home://"))
    return canonical.slice(11).replace("/", ":");
  return canonical;
}
function safeAlias(value: string): boolean {
  if (canonicalRemoteUrl(value) === null) return false;
  if (/^(https?|ssh):\/\//i.test(value))
    try {
      const url = new URL(value);
      if (url.password || (url.protocol !== "ssh:" && url.username))
        return false;
    } catch {
      return false;
    }
  return true;
}
const absolutePath = privateStringSchema.refine(
  (value) => isAbsolute(value) && !/[\x00-\x1f\x7f]/u.test(value)
);
export const privateAttributionPolicySchema = z
  .object({
    remoteAliases: z
      .array(privateStringSchema.refine(safeAlias))
      .max(1024)
      .default([]),
    mappings: z
      .array(
        z
          .object({ cwd: absolutePath, repositoryId: repositoryIdSchema })
          .strict()
      )
      .max(10000)
      .default([]),
    verifiedWorktrees: z
      .array(z.object({ path: absolutePath, commonDir: absolutePath }).strict())
      .max(10000)
      .default([]),
    overrides: z
      .array(
        z
          .object({
            provider: providerIdSchema,
            nativeUnitId: privateStringSchema,
            representation: z.enum(["request", "cumulative"]),
            decision: z.enum(["include", "exclude"]),
          })
          .strict()
      )
      .max(10000)
      .default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const keys of [
      value.mappings.map((mapping) => mapping.cwd),
      value.verifiedWorktrees.map((worktree) => worktree.path),
      value.overrides.map((override) =>
        JSON.stringify([
          override.provider,
          override.representation,
          override.nativeUnitId,
        ])
      ),
    ])
      if (new Set(keys).size !== keys.length)
        ctx.addIssue({ code: "custom", message: "invalid-record" });
  });
/** Private activation inputs. The caller persists verified enrollments; Git registrations alone are insufficient. */
export type PrivateAttributionPolicy = z.infer<
  typeof privateAttributionPolicySchema
>;
export function parsePrivateAttributionPolicy(
  input: unknown
): PrivateAttributionPolicy {
  const parsed = parseProtocol(privateAttributionPolicySchema, input);
  return {
    ...parsed,
    remoteAliases: [
      ...new Set(parsed.remoteAliases.map(normalizedAlias)),
    ].sort(),
    mappings: parsed.mappings.sort((a, b) => a.cwd.localeCompare(b.cwd)),
    verifiedWorktrees: parsed.verifiedWorktrees.sort((a, b) =>
      a.path.localeCompare(b.path)
    ),
    overrides: parsed.overrides.sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b))
    ),
  };
}
/** Display and price catalogs cannot invalidate source checkpoints. */
export function attributionPolicyHash(
  input: SharedPolicy,
  privateInput: PrivateAttributionPolicy
): string {
  const policy = parseSharedPolicy(input),
    privatePolicy = parsePrivateAttributionPolicy(privateInput);
  return createHash("sha256")
    .update(
      JSON.stringify([
        "agent-badge-attribution",
        1,
        policy.repositoryId,
        policy.normalizationVersion,
        [...policy.disabledProviders].sort(),
        privatePolicy,
      ])
    )
    .digest("hex");
}
export function containsPath(root: string, path: string): boolean {
  const suffix = relative(root, path);
  return (
    suffix === "" ||
    (suffix !== ".." && !suffix.startsWith(".." + sep) && !isAbsolute(suffix))
  );
}
export interface ResolvedAttributionEvidence {
  cwd: "resolved" | "missing" | "unavailable";
  commonDir: string | null;
  targetCommonDir: string;
  nested: boolean;
  remoteUrl: string | null;
  historicalMembership: boolean;
}
export interface AttributionContext {
  repositoryId: string;
  privatePolicy: PrivateAttributionPolicy;
  evidence: ResolvedAttributionEvidence;
}
export interface AttributionResult {
  status: "included" | "excluded" | "ambiguous";
  reason:
    | "user-override"
    | "repository-mismatch"
    | "invalid-cwd"
    | "nested-repository"
    | "remote-mismatch"
    | "git-membership"
    | "remote-alias"
    | "private-mapping"
    | "historical-membership"
    | "missing-evidence";
}
/** Pure precedence over already resolved private evidence; no transcript or filesystem access. */
export function attributeObservation(
  input: UsageObservation,
  context: AttributionContext
): AttributionResult {
  const observation = parseObservation(input),
    policy = parsePrivateAttributionPolicy(context.privatePolicy),
    evidence = context.evidence;
  const decide = (
    status: AttributionResult["status"],
    reason: AttributionResult["reason"]
  ): AttributionResult => ({ status, reason });
  const override = policy.overrides.find(
    (value) =>
      value.provider === observation.provider &&
      value.nativeUnitId === observation.nativeUnitId &&
      value.representation === observation.representation
  );
  if (override)
    return decide(
      override.decision === "include" ? "included" : "excluded",
      "user-override"
    );
  if (
    observation.execution.repositoryId !== null &&
    observation.execution.repositoryId !== context.repositoryId
  )
    return decide("excluded", "repository-mismatch");
  const cwd = observation.execution.cwd;
  if (cwd === null || !isAbsolute(cwd))
    return decide("ambiguous", "invalid-cwd");
  if (evidence.nested) return decide("excluded", "nested-repository");
  const aliases = policy.remoteAliases.map(
    (alias) => canonicalRemoteUrl(alias)!
  );
  const remote =
    observation.execution.remoteUrl === null
      ? null
      : canonicalRemoteUrl(observation.execution.remoteUrl);
  const currentRemote =
    evidence.remoteUrl === null ? null : canonicalRemoteUrl(evidence.remoteUrl);
  if (
    aliases.length &&
    ((remote !== null && !aliases.includes(remote)) ||
      (currentRemote !== null && !aliases.includes(currentRemote)))
  )
    return decide("excluded", "remote-mismatch");
  const mapping = policy.mappings
    .filter((value) => containsPath(value.cwd, cwd))
    .sort((a, b) => b.cwd.length - a.cwd.length)[0];
  if (mapping && mapping.repositoryId !== context.repositoryId)
    return decide("excluded", "repository-mismatch");
  if (
    evidence.cwd === "resolved" &&
    evidence.commonDir === evidence.targetCommonDir
  )
    return decide("included", "git-membership");
  if (
    evidence.cwd === "resolved" &&
    remote !== null &&
    aliases.includes(remote)
  )
    return decide("included", "remote-alias");
  if (mapping) return decide("included", "private-mapping");
  if (evidence.historicalMembership)
    return decide("included", "historical-membership");
  return decide("ambiguous", "missing-evidence");
}
