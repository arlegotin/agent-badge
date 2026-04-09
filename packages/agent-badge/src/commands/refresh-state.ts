import {
  applyCompletedScanState,
  buildSharedOverrideDigest,
  type AgentBadgeConfig,
  type AgentBadgeState,
  type RefreshCache,
  type RunIncrementalRefreshResult,
  type SharedContributorObservationMap
} from "@legotin/agent-badge-core";

type ProviderName = keyof AgentBadgeState["checkpoints"];

export function getConfiguredProviders(
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

export function applyRefreshResultToState(options: {
  readonly previousState: AgentBadgeState;
  readonly config: Pick<AgentBadgeConfig, "providers" | "publish">;
  readonly refresh: Pick<
    RunIncrementalRefreshResult,
    "scanMode" | "summary" | "providerCursors"
  >;
  readonly now: string;
}): AgentBadgeState {
  const scanState = applyCompletedScanState({
    previousState: options.previousState,
    scanResult: {
      scannedProviders: getConfiguredProviders(options.config),
      providerCursors: options.refresh.providerCursors
    },
    now: options.now
  });

  return {
    ...scanState,
    publish: {
      ...scanState.publish,
      gistId: options.config.publish.gistId
    },
    refresh: {
      lastRefreshedAt: options.now,
      lastScanMode: options.refresh.scanMode,
      lastPublishDecision: null,
      summary: options.refresh.summary
    }
  };
}

export function buildPublisherObservationsFromRefreshCache(
  cache: RefreshCache
): SharedContributorObservationMap {
  return Object.fromEntries(
    Object.entries(cache.entries).map(([sessionKey, entry]) => [
      buildSharedOverrideDigest(sessionKey),
      {
        sessionUpdatedAt: entry.sessionUpdatedAt,
        attributionStatus: entry.status,
        overrideDecision: entry.overrideDecision,
        tokens: entry.tokens,
        estimatedCostUsdMicros: entry.estimatedCostUsdMicros
      }
    ])
  );
}
