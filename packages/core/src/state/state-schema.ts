import { z } from "zod";

const isoDateTimeSchema = z.string().datetime({ offset: true });
const checkpointSchema = z
  .object({
    cursor: z.string().min(1).nullable(),
    lastScannedAt: isoDateTimeSchema.nullable()
  })
  .strict();

const publishStatusSchema = z.enum([
  "idle",
  "deferred",
  "pending",
  "published",
  "error"
]);
const publishAttemptOutcomeSchema = z.enum([
  "not-attempted",
  "published",
  "unchanged",
  "failed"
]);
const publishAttemptChangedBadgeSchema = z.enum(["yes", "no", "unknown"]);
const publishFailureCodeSchema = z.enum([
  "not-configured",
  "deferred",
  "remote-write-failed",
  "remote-inspection-failed",
  "unknown"
]);
const publishModeSchema = z.enum(["legacy", "shared"]);
const refreshScanModeSchema = z.enum(["full", "incremental"]);
const refreshPublishDecisionSchema = z.enum([
  "published",
  "skipped",
  "deferred",
  "not-configured",
  "failed"
]);
const refreshSummarySchema = z
  .object({
    includedSessions: z.number().int().nonnegative(),
    includedTokens: z.number().int().nonnegative(),
    includedEstimatedCostUsdMicros: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .optional()
      .default(null),
    ambiguousSessions: z.number().int().nonnegative(),
    excludedSessions: z.number().int().nonnegative()
  })
  .strict();
const ambiguousSessionOverrideSchema = z.enum(["include", "exclude"]);

export const agentBadgeStateSchema = z
  .object({
    version: z.literal(1),
    init: z
      .object({
        initialized: z.boolean(),
        scaffoldVersion: z.number().int().positive(),
        lastInitializedAt: isoDateTimeSchema.nullable()
      })
      .strict(),
    checkpoints: z
      .object({
        codex: checkpointSchema,
        claude: checkpointSchema
      })
      .strict(),
    publish: z
      .object({
        status: publishStatusSchema,
        gistId: z.string().min(1).nullable(),
        lastPublishedHash: z.string().min(1).nullable(),
        lastPublishedAt: isoDateTimeSchema.nullable(),
        lastAttemptedAt: isoDateTimeSchema.nullable().optional().default(null),
        lastAttemptOutcome: publishAttemptOutcomeSchema
          .optional()
          .default("not-attempted"),
        lastSuccessfulSyncAt: isoDateTimeSchema.nullable().optional().default(null),
        lastAttemptCandidateHash: z.string().min(1).nullable().optional().default(null),
        lastAttemptChangedBadge: publishAttemptChangedBadgeSchema
          .optional()
          .default("unknown"),
        lastFailureCode: publishFailureCodeSchema.nullable().optional().default(null),
        publisherId: z.string().min(1).nullable().optional().default(null),
        mode: publishModeSchema.optional().default("legacy")
      })
      .strict(),
    refresh: z
      .object({
        lastRefreshedAt: isoDateTimeSchema.nullable(),
        lastScanMode: refreshScanModeSchema.nullable(),
        lastPublishDecision: refreshPublishDecisionSchema.nullable(),
        summary: refreshSummarySchema.nullable()
      })
      .strict(),
    overrides: z
      .object({
        ambiguousSessions: z.record(z.string(), ambiguousSessionOverrideSchema)
      })
      .strict()
  })
  .strict();

export type AgentBadgeState = z.infer<typeof agentBadgeStateSchema>;
export type AgentBadgePublishStatus = z.infer<typeof publishStatusSchema>;
export type AgentBadgePublishAttemptOutcome = z.infer<
  typeof publishAttemptOutcomeSchema
>;
export type AgentBadgePublishAttemptChangedBadge = z.infer<
  typeof publishAttemptChangedBadgeSchema
>;
export type AgentBadgePublishFailureCode = z.infer<typeof publishFailureCodeSchema>;
export type AgentBadgePublishMode = z.infer<typeof publishModeSchema>;
export type AgentBadgeRefreshScanMode = z.infer<typeof refreshScanModeSchema>;
export type AgentBadgeRefreshPublishDecision = z.infer<
  typeof refreshPublishDecisionSchema
>;
export type AgentBadgeRefreshSummary = z.infer<typeof refreshSummarySchema>;
export type AgentBadgeAmbiguousSessionOverride = z.infer<
  typeof ambiguousSessionOverrideSchema
>;

export const defaultAgentBadgeState: AgentBadgeState = {
  version: 1,
  init: {
    initialized: false,
    scaffoldVersion: 1,
    lastInitializedAt: null
  },
  checkpoints: {
    codex: {
      cursor: null,
      lastScannedAt: null
    },
    claude: {
      cursor: null,
      lastScannedAt: null
    }
  },
  publish: {
    status: "idle",
    gistId: null,
    lastPublishedHash: null,
    lastPublishedAt: null,
    lastAttemptedAt: null,
    lastAttemptOutcome: "not-attempted",
    lastSuccessfulSyncAt: null,
    lastAttemptCandidateHash: null,
    lastAttemptChangedBadge: "unknown",
    lastFailureCode: null,
    publisherId: null,
    mode: "legacy"
  },
  refresh: {
    lastRefreshedAt: null,
    lastScanMode: null,
    lastPublishDecision: null,
    summary: null
  },
  overrides: {
    ambiguousSessions: {}
  }
};

export function parseAgentBadgeState(input: unknown): AgentBadgeState {
  return agentBadgeStateSchema.parse(input);
}
