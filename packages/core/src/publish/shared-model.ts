import { createHash } from "node:crypto";

import { z } from "zod";

const isoDateTimeSchema = z.string().datetime({ offset: true });
const nonnegativeIntSchema = z.number().int().nonnegative();
const sharedObservationDigestPattern = /^sha256:[a-f0-9]{64}$/;

export const AGENT_BADGE_CONTRIB_GIST_FILE_PREFIX = "agent-badge-contrib-";
export const AGENT_BADGE_OVERRIDES_GIST_FILE = "agent-badge-overrides.json";

export function buildContributorGistFileName(publisherId: string): string {
  return `${AGENT_BADGE_CONTRIB_GIST_FILE_PREFIX}${publisherId}.json`;
}

export function isContributorGistFileName(fileName: string): boolean {
  return (
    fileName.startsWith(AGENT_BADGE_CONTRIB_GIST_FILE_PREFIX) &&
    fileName.endsWith(".json") &&
    fileName.length >
      AGENT_BADGE_CONTRIB_GIST_FILE_PREFIX.length + ".json".length
  );
}

export function buildSharedOverrideDigest(sessionKey: string): string {
  return `sha256:${createHash("sha256").update(sessionKey).digest("hex")}`;
}

const sharedObservationDigestSchema = z
  .string()
  .regex(sharedObservationDigestPattern);

const sharedContributorObservationSchema = z
  .object({
    sessionUpdatedAt: isoDateTimeSchema.nullable(),
    attributionStatus: z.enum(["included", "ambiguous", "excluded"]),
    overrideDecision: z.enum(["include", "exclude"]).nullable(),
    tokens: nonnegativeIntSchema,
    estimatedCostUsdMicros: nonnegativeIntSchema.nullable()
  })
  .strict();

export const sharedContributorRecordSchema = z
  .object({
    schemaVersion: z.literal(2),
    publisherId: z.string(),
    updatedAt: isoDateTimeSchema,
    observations: z.record(
      sharedObservationDigestSchema,
      sharedContributorObservationSchema
    )
  })
  .strict();

const sharedOverrideDecisionSchema = z
  .object({
    decision: z.enum(["include", "exclude"]),
    updatedAt: isoDateTimeSchema,
    updatedByPublisherId: z.string()
  })
  .strict();

export const sharedOverridesRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    overrides: z.record(z.string(), sharedOverrideDecisionSchema)
  })
  .strict();

export type SharedContributorRecord = z.infer<typeof sharedContributorRecordSchema>;
export type SharedContributorObservation = z.infer<
  typeof sharedContributorObservationSchema
>;
export type SharedContributorObservationMap =
  SharedContributorRecord["observations"];
export type SharedOverridesRecord = z.infer<typeof sharedOverridesRecordSchema>;
export type SharedOverrideDecision = z.infer<typeof sharedOverrideDecisionSchema>;

export function parseSharedContributorRecord(
  input: unknown
): SharedContributorRecord {
  return sharedContributorRecordSchema.parse(input);
}

export function parseSharedOverridesRecord(input: unknown): SharedOverridesRecord {
  return sharedOverridesRecordSchema.parse(input);
}
