import { z } from "zod";

export const normalizedSessionSummarySchema = z
  .object({
    provider: z.enum(["codex", "claude"]),
    providerSessionId: z.string().min(1),
    startedAt: z.string().min(1).nullable(),
    updatedAt: z.string().min(1).nullable(),
    cwd: z.string().min(1).nullable(),
    gitBranch: z.string().min(1).nullable(),
    observedRemoteUrl: z.string().min(1).nullable(),
    observedRemoteUrlNormalized: z.string().min(1).nullable(),
    attributionHints: z
      .object({
        cwdRealPath: z.string().min(1).nullable(),
        transcriptProjectKey: z.string().min(1).nullable()
      })
      .strict(),
    tokenUsage: z
      .object({
        total: z.number().int().nonnegative(),
        input: z.number().int().nonnegative().nullable(),
        output: z.number().int().nonnegative().nullable(),
        cacheCreation: z.number().int().nonnegative().nullable(),
        cacheRead: z.number().int().nonnegative().nullable(),
        reasoningOutput: z.number().int().nonnegative().nullable()
      })
      .strict(),
    lineage: z
      .object({
        parentSessionId: z.string().min(1).nullable(),
        kind: z.enum(["root", "child", "unknown"])
      })
      .strict(),
    metadata: z
      .object({
        model: z.string().min(1).nullable(),
        modelProvider: z.string().min(1).nullable(),
        sourceKind: z.string().min(1).nullable(),
        cliVersion: z.string().min(1).nullable()
      })
      .strict()
  })
  .strict();

export type NormalizedSessionSummary = z.infer<
  typeof normalizedSessionSummarySchema
>;

export function parseNormalizedSessionSummary(
  input: unknown
): NormalizedSessionSummary {
  return normalizedSessionSummarySchema.parse(input);
}
