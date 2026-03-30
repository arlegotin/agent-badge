import { z } from "zod";

const aggregateCountsSchema = z
  .object({
    scannedSessions: z.number().int().nonnegative(),
    attributedSessions: z.number().int().nonnegative(),
    ambiguousSessions: z.number().int().nonnegative(),
    publishedRecords: z.number().int().nonnegative()
  })
  .strict();

const logStatusSchema = z.enum(["success", "failure", "skipped"]);

export const agentBadgeLogEntrySchema = z
  .object({
    timestamp: z.string().datetime({ offset: true }),
    operation: z.string().min(1),
    status: logStatusSchema,
    durationMs: z.number().int().nonnegative(),
    counts: aggregateCountsSchema
  })
  .strict();

export type AgentBadgeLogEntry = z.infer<typeof agentBadgeLogEntrySchema>;
export type AgentBadgeLogStatus = z.infer<typeof logStatusSchema>;
export type AgentBadgeLogCounts = z.infer<typeof aggregateCountsSchema>;
