import { realpath } from "node:fs/promises";

import { attributeBackfillSessions } from "../attribution/attribution-engine.js";
import type { AttributedSession } from "../attribution/attribution-types.js";
import type { AgentBadgeConfig } from "../config/config-schema.js";
import {
  buildClaudeIncrementalCursorFromSource,
  scanClaudeSessionsIncremental
} from "../providers/claude/claude-adapter.js";
import {
  buildCodexIncrementalCursor,
  scanCodexSessionsIncremental
} from "../providers/codex/codex-adapter.js";
import {
  parseNormalizedSessionSummary,
  type NormalizedSessionSummary
} from "../providers/session-summary.js";
import {
  estimateSessionCostsUsdMicrosByKey,
  resolvePricingCatalog
} from "../pricing/estimate-cost.js";
import { resolveRepoFingerprint } from "../repo/repo-fingerprint.js";
import type {
  AgentBadgeRefreshSummary,
  AgentBadgeState
} from "../state/state-schema.js";
import { runFullBackfillScan } from "./full-backfill.js";
import {
  buildRefreshCacheEntry,
  buildRefreshCacheKey,
  defaultRefreshCache,
  readRefreshCache,
  type RefreshCache
} from "./refresh-cache.js";

type ProviderName = NormalizedSessionSummary["provider"];

interface ProviderIncrementalResult {
  readonly provider: ProviderName;
  readonly sessions: NormalizedSessionSummary[];
  readonly cursor: string;
  readonly mode: "incremental" | "full";
}

export interface RunIncrementalRefreshOptions {
  readonly cwd: string;
  readonly homeRoot: string;
  readonly config: Pick<AgentBadgeConfig, "providers" | "repo" | "badge">;
  readonly state: AgentBadgeState;
  readonly forceFull: boolean;
}

export interface RunIncrementalRefreshResult {
  readonly scanMode: "full" | "incremental";
  readonly summary: AgentBadgeRefreshSummary;
  readonly providerCursors: Partial<Record<ProviderName, string | null>>;
  readonly cache: RefreshCache;
}

function enabledProviders(
  config: Pick<AgentBadgeConfig, "providers">
): ProviderName[] {
  const providers: ProviderName[] = [];

  if (config.providers.codex.enabled) {
    providers.push("codex");
  }

  if (config.providers.claude.enabled) {
    providers.push("claude");
  }

  return providers;
}

function filterCacheByEnabledProviders(
  cache: RefreshCache,
  providers: readonly ProviderName[]
): RefreshCache {
  const enabledProviderSet = new Set(providers);

  return {
    ...cache,
    entries: Object.fromEntries(
      Object.entries(cache.entries).filter(([, entry]) =>
        enabledProviderSet.has(entry.provider)
      )
    )
  };
}

function summarizeRefreshCache(cache: RefreshCache): AgentBadgeRefreshSummary {
  const entries = Object.values(cache.entries);
  const hasEstimatedCost = entries.some(
    (entry) => entry.status === "included" && entry.estimatedCostUsdMicros !== null
  );

  return entries.reduce<AgentBadgeRefreshSummary>(
    (summary, entry) => ({
      includedSessions:
        summary.includedSessions + (entry.status === "included" ? 1 : 0),
      includedTokens:
        summary.includedTokens + (entry.status === "included" ? entry.tokens : 0),
      includedEstimatedCostUsdMicros: hasEstimatedCost
        ? (summary.includedEstimatedCostUsdMicros ?? 0) +
          (entry.status === "included" ? (entry.estimatedCostUsdMicros ?? 0) : 0)
        : null,
      ambiguousSessions:
        summary.ambiguousSessions + (entry.status === "ambiguous" ? 1 : 0),
      excludedSessions:
        summary.excludedSessions + (entry.status === "excluded" ? 1 : 0)
    }),
    {
      includedSessions: 0,
      includedTokens: 0,
      includedEstimatedCostUsdMicros: hasEstimatedCost ? 0 : null,
      ambiguousSessions: 0,
      excludedSessions: 0
    }
  );
}

async function mergeAttributedSessionsIntoCache(
  cache: RefreshCache,
  attributedSessions: readonly AttributedSession[],
  options: Pick<
    RunIncrementalRefreshOptions,
    "cwd" | "homeRoot" | "config" | "state"
  >
): Promise<RefreshCache> {
  const shouldEstimateCost =
    options.config.badge?.mode === "combined" ||
    options.config.badge?.mode === "cost";
  const observationSessions = attributedSessions.map(
    (attributedSession) => attributedSession.session
  );
  const estimatedCostBySessionKey = shouldEstimateCost
    ? new Map<string, number>()
    : new Map<string, number>();

  if (shouldEstimateCost && observationSessions.length > 0) {
    const pricingCatalog = await resolvePricingCatalog({ cwd: options.cwd });
    const estimatedCosts = await estimateSessionCostsUsdMicrosByKey({
      sessions: observationSessions,
      homeRoot: options.homeRoot,
      pricingCatalog
    });

    for (const [sessionKey, estimatedCostUsdMicros] of Object.entries(
      estimatedCosts
    )) {
      estimatedCostBySessionKey.set(sessionKey, estimatedCostUsdMicros);
    }
  }

  return {
    ...cache,
    entries: attributedSessions.reduce(
      (entries, attributedSession) => {
        const cacheKey = buildRefreshCacheKey(attributedSession.session);

        entries[cacheKey] =
          buildRefreshCacheEntry({
            session: attributedSession.session,
            status: attributedSession.status,
            overrideDecision:
              options.state.overrides.ambiguousSessions[cacheKey] ??
              attributedSession.overrideApplied,
            estimatedCostUsdMicros: shouldEstimateCost
              ? (estimatedCostBySessionKey.get(cacheKey) ?? 0)
              : null
          });

        return entries;
      },
      { ...cache.entries }
    )
  };
}

async function resolveCwdRealPath(
  session: NormalizedSessionSummary
): Promise<NormalizedSessionSummary> {
  if (session.cwd === null) {
    return session;
  }

  try {
    const cwdRealPath = await realpath(session.cwd);

    return parseNormalizedSessionSummary({
      ...session,
      attributionHints: {
        ...session.attributionHints,
        cwdRealPath
      }
    });
  } catch {
    return session;
  }
}

async function buildProviderCursorsFromSessions(
  homeRoot: string,
  sessions: readonly NormalizedSessionSummary[],
  providers: readonly ProviderName[]
): Promise<Partial<Record<ProviderName, string | null>>> {
  const providerSet = new Set(providers);
  const providerCursors: Partial<Record<ProviderName, string | null>> = {};

  if (providerSet.has("codex")) {
    providerCursors.codex = buildCodexIncrementalCursor(sessions);
  }

  if (providerSet.has("claude")) {
    providerCursors.claude = await buildClaudeIncrementalCursorFromSource(homeRoot);
  }

  return providerCursors;
}

async function runFullRefresh(
  options: RunIncrementalRefreshOptions,
  providers: readonly ProviderName[]
): Promise<RunIncrementalRefreshResult> {
  const fullScan = await runFullBackfillScan({
    cwd: options.cwd,
    homeRoot: options.homeRoot,
    config: options.config
  });
  const attribution = attributeBackfillSessions({
    repo: fullScan.repo,
    sessions: fullScan.sessions,
    overrides: options.state.overrides.ambiguousSessions
  });
  const cache = await mergeAttributedSessionsIntoCache(
    defaultRefreshCache,
    attribution.sessions,
    options
  );

  return {
    scanMode: "full",
    summary: summarizeRefreshCache(cache),
    providerCursors: await buildProviderCursorsFromSessions(
      options.homeRoot,
      fullScan.sessions,
      providers
    ),
    cache
  };
}

async function runProviderIncrementalScans(
  options: RunIncrementalRefreshOptions,
  providers: readonly ProviderName[]
): Promise<ProviderIncrementalResult[]> {
  const scans = await Promise.all(
    providers.map(async (provider): Promise<ProviderIncrementalResult> => {
      if (provider === "codex") {
        const result = await scanCodexSessionsIncremental({
          homeRoot: options.homeRoot,
          cursor: options.state.checkpoints.codex.cursor
        });

        return {
          provider,
          sessions: result.sessions,
          cursor: result.cursor,
          mode: result.mode
        };
      }

      const result = await scanClaudeSessionsIncremental({
        homeRoot: options.homeRoot,
        cursor: options.state.checkpoints.claude.cursor
      });

      return {
        provider,
        sessions: result.sessions,
        cursor: result.cursor,
        mode: result.mode
      };
    })
  );

  return scans;
}

export async function runIncrementalRefresh(
  options: RunIncrementalRefreshOptions
): Promise<RunIncrementalRefreshResult> {
  const providers = enabledProviders(options.config);

  if (options.forceFull || providers.length === 0) {
    return runFullRefresh(options, providers);
  }

  let cache: RefreshCache | null;

  try {
    cache = await readRefreshCache({ cwd: options.cwd });
  } catch {
    return runFullRefresh(options, providers);
  }

  if (cache === null) {
    return runFullRefresh(options, providers);
  }

  if (
    (options.config.badge?.mode === "combined" ||
      options.config.badge?.mode === "cost") &&
    Object.values(cache.entries).some(
      (entry) =>
        entry.status === "included" &&
        entry.estimatedCostUsdMicros === null
    )
  ) {
    return runFullRefresh(options, providers);
  }

  if (
    providers.some((provider) => options.state.checkpoints[provider].cursor === null)
  ) {
    return runFullRefresh(options, providers);
  }

  const providerScans = await runProviderIncrementalScans(options, providers);

  if (providerScans.some((scan) => scan.mode === "full")) {
    return runFullRefresh(options, providers);
  }

  cache = filterCacheByEnabledProviders(cache, providers);

  const repo = await resolveRepoFingerprint({
    cwd: options.cwd,
    config: options.config
  });
  const changedSessions = await Promise.all(
    providerScans.flatMap((scan) => scan.sessions).map(resolveCwdRealPath)
  );
  const attribution = attributeBackfillSessions({
    repo,
    sessions: changedSessions,
    overrides: options.state.overrides.ambiguousSessions
  });
  const nextCache = await mergeAttributedSessionsIntoCache(
    cache,
    attribution.sessions,
    options
  );

  return {
    scanMode: "incremental",
    summary: summarizeRefreshCache(nextCache),
    providerCursors: Object.fromEntries(
      providerScans.map((scan) => [scan.provider, scan.cursor])
    ),
    cache: nextCache
  };
}
