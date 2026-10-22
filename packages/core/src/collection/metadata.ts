import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import { z } from "zod";
import { digestSchema, privateStringSchema } from "../domain/capabilities.js";
import { parseObservation } from "../domain/usage.js";
import type { UsageObservation } from "../domain/usage.js";
import { privateAttributionPolicySchema } from "./attribution.js";

/** One complete private envelope, checked on commit and durable replay. */
export const ATTRIBUTION_METADATA_MAX_BYTES = 4 * 1024 * 1024;
export const attributionDecisionSchema = z
  .object({
    observationHash: digestSchema,
    status: z.enum(["included", "excluded", "ambiguous"]),
    reason: z.enum([
      "user-override",
      "repository-mismatch",
      "invalid-cwd",
      "nested-repository",
      "remote-mismatch",
      "git-membership",
      "remote-alias",
      "private-mapping",
      "historical-membership",
      "missing-evidence",
    ]),
    verifiedCommonDir: privateStringSchema.refine(isAbsolute).nullable(),
  })
  .strict()
  .refine(
    (value) =>
      value.verifiedCommonDir === null ||
      (value.status === "included" &&
        (value.reason === "git-membership" ||
          value.reason === "historical-membership"))
  );
export const attributionMetadataSchema = z
  .object({
    schemaVersion: z.literal(1),
    policyHash: digestSchema,
    // Verification is per observation. Do not repeat an unbounded historical enrollment inventory.
    policy: z
      .object({
        remoteAliases: privateAttributionPolicySchema.shape.remoteAliases,
        mappings: privateAttributionPolicySchema.shape.mappings,
        overrides: privateAttributionPolicySchema.shape.overrides,
      })
      .strict()
      .refine(
        (value) => privateAttributionPolicySchema.safeParse(value).success
      ),
    decisions: z.array(attributionDecisionSchema).max(10000),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.decisions.map((decision) => decision.observationHash))
        .size === value.decisions.length &&
      Buffer.byteLength(JSON.stringify(value), "utf8") <=
        ATTRIBUTION_METADATA_MAX_BYTES
  );
export type AttributionMetadata = z.infer<typeof attributionMetadataSchema>;
export type AttributionDecision = z.infer<typeof attributionDecisionSchema>;
/** Private association, never an outbound usage identity. Includes source/cwd evidence. */
export function observationEvidenceHash(observation: UsageObservation): string {
  return createHash("sha256")
    .update(JSON.stringify(parseObservation(observation)))
    .digest("hex");
}
