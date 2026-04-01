import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { z } from "zod";

import type { AttributionStatus } from "../attribution/attribution-types.js";
import type { NormalizedSessionSummary } from "../providers/session-summary.js";

export const REFRESH_CACHE_FILE = ".agent-badge/cache/session-index.json";

const refreshCacheEntrySchema = z
  .object({
    provider: z.enum(["codex", "claude"]),
    providerSessionId: z.string().min(1),
    updatedAt: z.string().min(1).nullable(),
    status: z.enum(["included", "ambiguous", "excluded"]),
    includedSessions: z.number().int().nonnegative(),
    includedTokens: z.number().int().nonnegative(),
    includedEstimatedCostUsdMicros: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .optional()
      .default(null)
  })
  .strict();

const refreshCacheSchema = z
  .object({
    version: z.literal(1),
    entries: z.record(z.string(), refreshCacheEntrySchema)
  })
  .strict();

export type RefreshCacheEntry = z.infer<typeof refreshCacheEntrySchema>;
export type RefreshCache = z.infer<typeof refreshCacheSchema>;

export interface ReadRefreshCacheOptions {
  readonly cwd: string;
}

export interface WriteRefreshCacheOptions {
  readonly cwd: string;
  readonly cache: RefreshCache;
}

export interface BuildRefreshCacheEntryOptions {
  readonly session: Pick<
    NormalizedSessionSummary,
    "provider" | "providerSessionId" | "updatedAt" | "tokenUsage"
  >;
  readonly status: AttributionStatus;
  readonly includedEstimatedCostUsdMicros: number | null;
}

export const defaultRefreshCache: RefreshCache = {
  version: 1,
  entries: {}
};

export function buildRefreshCacheKey(
  session: Pick<NormalizedSessionSummary, "provider" | "providerSessionId">
): string {
  const { provider, providerSessionId } = session;

  return `${provider}:${providerSessionId}`;
}

export function buildRefreshCacheEntry({
  session,
  status,
  includedEstimatedCostUsdMicros
}: BuildRefreshCacheEntryOptions): RefreshCacheEntry {
  return {
    provider: session.provider,
    providerSessionId: session.providerSessionId,
    updatedAt: session.updatedAt,
    status,
    includedSessions: status === "included" ? 1 : 0,
    includedTokens: status === "included" ? session.tokenUsage.total : 0,
    includedEstimatedCostUsdMicros:
      status === "included" ? includedEstimatedCostUsdMicros : null
  };
}

export async function readRefreshCache({
  cwd
}: ReadRefreshCacheOptions): Promise<RefreshCache | null> {
  try {
    const content = await readFile(join(cwd, REFRESH_CACHE_FILE), "utf8");

    return refreshCacheSchema.parse(JSON.parse(content));
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

export async function writeRefreshCache({
  cwd,
  cache
}: WriteRefreshCacheOptions): Promise<void> {
  const cachePath = join(cwd, REFRESH_CACHE_FILE);

  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(
    cachePath,
    `${JSON.stringify(refreshCacheSchema.parse(cache), null, 2)}\n`,
    "utf8"
  );
}
