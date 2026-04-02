import { createHash, randomUUID } from "node:crypto";

import type { AttributeBackfillSessionsResult } from "../attribution/attribution-types.js";
import type { AgentBadgeConfig } from "../config/config-schema.js";
import type { NormalizedSessionSummary } from "../providers/session-summary.js";
import type { RunFullBackfillScanResult } from "../scan/full-backfill.js";
import type { AgentBadgeState } from "../state/state-schema.js";
import {
  estimateIncludedCostUsdMicros,
  resolvePricingCatalog
} from "../pricing/estimate-cost.js";
import {
  AGENT_BADGE_COMBINED_GIST_FILE,
  AGENT_BADGE_COST_GIST_FILE,
  AGENT_BADGE_GIST_FILE,
  AGENT_BADGE_TOKENS_GIST_FILE
} from "./badge-url.js";
import {
  buildEndpointBadgePayload,
  type IncludedTotals
} from "./badge-payload.js";
import type { GitHubGistClient } from "./github-gist-client.js";
import {
  AGENT_BADGE_OVERRIDES_GIST_FILE,
  buildContributorGistFileName,
  isContributorGistFileName,
  parseSharedContributorRecord,
  parseSharedOverridesRecord,
  type SharedContributorObservationMap,
  type SharedContributorRecord,
  type SharedOverridesRecord
} from "./shared-model.js";
import {
  deriveResolvedSharedOverrides,
  deriveSharedIncludedTotals,
  replaceContributorRecord
} from "./shared-merge.js";

export interface PublishBadgeToGistOptions {
  readonly config: Pick<AgentBadgeConfig, "badge" | "publish">;
  readonly state: AgentBadgeState;
  readonly publisherObservations: SharedContributorObservationMap;
  readonly client: GitHubGistClient;
}

export interface PublishBadgeIfChangedOptions {
  readonly config: Pick<AgentBadgeConfig, "badge" | "publish">;
  readonly state: AgentBadgeState;
  readonly publisherObservations: SharedContributorObservationMap;
  readonly client: GitHubGistClient;
  readonly now: string;
  readonly skipIfUnchanged: boolean;
}

export interface PublishBadgeIfChangedResult {
  readonly state: AgentBadgeState;
  readonly decision: "published" | "skipped";
}

interface SharedPublishStateSnapshot {
  readonly publisherId?: string | null;
  readonly mode?: "legacy" | "shared";
}

const sharedOverrideDigestPattern = /^sha256:[a-f0-9]{64}$/;

function buildSessionKey(
  session: { readonly provider: string; readonly providerSessionId: string }
): string {
  return `${session.provider}:${session.providerSessionId}`;
}

export async function collectIncludedTotals(
  scan: RunFullBackfillScanResult,
  attribution: AttributeBackfillSessionsResult,
  options?: {
    readonly cwd?: string;
    readonly homeRoot?: string;
    readonly includeEstimatedCost: boolean;
  }
): Promise<IncludedTotals> {
  const scannedSessionKeys = new Set(
    scan.sessions.map((session) => buildSessionKey(session))
  );
  let sessions = 0;
  let tokens = 0;
  const includedSessions: NormalizedSessionSummary[] = [];

  for (const attributedSession of attribution.sessions) {
    if (attributedSession.status !== "included") {
      continue;
    }

    if (!scannedSessionKeys.has(buildSessionKey(attributedSession.session))) {
      continue;
    }

    sessions += 1;
    tokens += attributedSession.session.tokenUsage.total;
    includedSessions.push(attributedSession.session);
  }

  const estimatedCostUsdMicros =
    options?.includeEstimatedCost === true &&
    typeof options.cwd === "string" &&
    typeof options.homeRoot === "string"
      ? await estimateIncludedCostUsdMicros({
          sessions: includedSessions,
          homeRoot: options.homeRoot,
          pricingCatalog: await resolvePricingCatalog({ cwd: options.cwd })
        })
      : null;

  return {
    sessions,
    tokens,
    estimatedCostUsdMicros
  };
}

function buildSerializedBadgePayload(options: {
  readonly label: string;
  readonly mode: AgentBadgeConfig["badge"]["mode"];
  readonly includedTotals: IncludedTotals;
}): string {
  const payload = buildEndpointBadgePayload({
    label: options.label,
    mode: options.mode,
    includedTotals: options.includedTotals
  });

  return `${JSON.stringify(payload, null, 2)}\n`;
}

function buildSerializedBadgeFiles(
  options: {
    readonly config: Pick<AgentBadgeConfig, "badge">;
    readonly includedTotals: IncludedTotals;
  }
): Record<string, { readonly content: string }> {
  const files: Record<string, { readonly content: string }> = {
    [AGENT_BADGE_GIST_FILE]: {
      content: buildSerializedBadgePayload({
        label: options.config.badge.label,
        mode: options.config.badge.mode,
        includedTotals: options.includedTotals
      })
    }
  };

  if (options.includedTotals.estimatedCostUsdMicros === null) {
    return files;
  }

  files[AGENT_BADGE_COMBINED_GIST_FILE] = {
    content: buildSerializedBadgePayload({
      label: options.config.badge.label,
      mode: "combined",
      includedTotals: options.includedTotals
    })
  };
  files[AGENT_BADGE_TOKENS_GIST_FILE] = {
    content: buildSerializedBadgePayload({
      label: options.config.badge.label,
      mode: "tokens",
      includedTotals: options.includedTotals
    })
  };
  files[AGENT_BADGE_COST_GIST_FILE] = {
    content: buildSerializedBadgePayload({
      label: options.config.badge.label,
      mode: "cost",
      includedTotals: options.includedTotals
    })
  };

  return files;
}

function normalizeIncludedTotalsForBadgeMode(
  mode: AgentBadgeConfig["badge"]["mode"],
  includedTotals: IncludedTotals
): IncludedTotals {
  if (
    (mode === "combined" || mode === "cost") &&
    includedTotals.sessions === 0 &&
    includedTotals.tokens === 0 &&
    includedTotals.estimatedCostUsdMicros === null
  ) {
    return {
      ...includedTotals,
      estimatedCostUsdMicros: 0
    };
  }

  return includedTotals;
}

function buildPayloadHash(serializedPayload: string): string {
  return createHash("sha256").update(serializedPayload).digest("hex");
}

function resolveSharedPublishSnapshot(
  state: AgentBadgeState
): SharedPublishStateSnapshot {
  return state.publish as AgentBadgeState["publish"] & SharedPublishStateSnapshot;
}

function resolvePublisherId(state: AgentBadgeState): string {
  const publishState = resolveSharedPublishSnapshot(state);

  return typeof publishState.publisherId === "string" &&
    publishState.publisherId.length > 0
    ? publishState.publisherId
    : randomUUID();
}

function serializeJsonFile(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertOpaqueSharedOverrideKeys(overrides: SharedOverridesRecord): void {
  for (const key of Object.keys(overrides.overrides)) {
    if (!sharedOverrideDigestPattern.test(key)) {
      throw new Error(
        "Shared overrides file contained a raw or invalid session key."
      );
    }
  }
}

function loadRemoteSharedRecords(
  gist: Awaited<ReturnType<GitHubGistClient["getGist"]>>
): {
  readonly contributors: SharedContributorRecord[];
  readonly overrides: SharedOverridesRecord;
} {
  const contributors: SharedContributorRecord[] = [];
  let overrides: SharedOverridesRecord = {
    schemaVersion: 1,
    overrides: {}
  };

  for (const file of Object.values(gist.files)) {
    if (
      typeof file !== "object" ||
      file === null ||
      typeof file.filename !== "string"
    ) {
      continue;
    }

    if (file.truncated || file.content === null) {
      if (
        isContributorGistFileName(file.filename) ||
        file.filename === AGENT_BADGE_OVERRIDES_GIST_FILE
      ) {
        throw new Error(
          "Shared gist files cannot be loaded from truncated content."
        );
      }

      continue;
    }

    if (isContributorGistFileName(file.filename)) {
      const parsedContent = JSON.parse(file.content) as
        | { readonly schemaVersion?: number }
        | null;

      if (parsedContent?.schemaVersion === 1) {
        continue;
      }

      contributors.push(parseSharedContributorRecord(parsedContent));
      continue;
    }

    if (file.filename === AGENT_BADGE_OVERRIDES_GIST_FILE) {
      overrides = parseSharedOverridesRecord(JSON.parse(file.content));
      assertOpaqueSharedOverrideKeys(overrides);
    }
  }

  return {
    contributors,
    overrides
  };
}

function buildLocalContributorRecord(options: {
  readonly publisherId: string;
  readonly publisherObservations: SharedContributorObservationMap;
  readonly now: string;
}): SharedContributorRecord {
  return {
    schemaVersion: 2,
    publisherId: options.publisherId,
    updatedAt: options.now,
    observations: options.publisherObservations
  };
}

function buildNextPublishedState(options: {
  readonly state: AgentBadgeState;
  readonly gistId: string;
  readonly hash: string;
  readonly now?: string;
  readonly publisherId: string;
}): AgentBadgeState {
  const nextPublish = {
    ...options.state.publish,
    status: "published",
    gistId: options.gistId,
    lastPublishedHash: options.hash,
    lastPublishedAt:
      options.now === undefined ? options.state.publish.lastPublishedAt : options.now,
    publisherId: options.publisherId,
    mode: "shared"
  } as AgentBadgeState["publish"];

  return {
    ...options.state,
    publish: nextPublish
  };
}

export async function publishBadgeIfChanged({
  config,
  state,
  publisherObservations,
  client,
  now,
  skipIfUnchanged
}: PublishBadgeIfChangedOptions): Promise<PublishBadgeIfChangedResult> {
  if (config.publish.gistId === null) {
    throw new Error("Cannot publish badge JSON without a configured gist id.");
  }

  const publisherId = resolvePublisherId(state);
  const existingGist = await client.getGist(config.publish.gistId);
  loadRemoteSharedRecords(existingGist);
  const localContributorFileName = buildContributorGistFileName(publisherId);
  const contributorRecord = buildLocalContributorRecord({
    publisherId,
    publisherObservations,
    now
  });

  await client.updateGistFile({
    gistId: config.publish.gistId,
    files: {
      [localContributorFileName]: {
        content: serializeJsonFile(contributorRecord)
      }
    }
  });

  const authoritativeGist = await client.getGist(config.publish.gistId);
  const authoritativeSharedState = loadRemoteSharedRecords(authoritativeGist);
  const authoritativeContributors = replaceContributorRecord(
    authoritativeSharedState.contributors,
    contributorRecord
  );
  const authoritativeTotals = deriveSharedIncludedTotals(
    authoritativeContributors
  );
  const authoritativeOverrides = deriveResolvedSharedOverrides(
    authoritativeContributors
  );
  assertOpaqueSharedOverrideKeys(authoritativeOverrides);

  await client.updateGistFile({
    gistId: config.publish.gistId,
    files: {
      [AGENT_BADGE_OVERRIDES_GIST_FILE]: {
        content: serializeJsonFile(authoritativeOverrides)
      }
    }
  });

  const publishableTotals = normalizeIncludedTotalsForBadgeMode(
    config.badge.mode,
    authoritativeTotals
  );
  const serializedFiles = buildSerializedBadgeFiles({
    config,
    includedTotals: publishableTotals
  });
  const serializedPayload = serializedFiles[AGENT_BADGE_GIST_FILE].content;
  const nextHash = buildPayloadHash(serializedPayload);

  if (skipIfUnchanged && nextHash === state.publish.lastPublishedHash) {
    return {
      decision: "skipped",
      state: buildNextPublishedState({
        state,
        gistId: config.publish.gistId,
        hash: nextHash,
        publisherId
      })
    };
  }

  await client.updateGistFile({
    gistId: config.publish.gistId,
    files: serializedFiles
  });

  return {
    decision: "published",
    state: buildNextPublishedState({
      state,
      gistId: config.publish.gistId,
      hash: nextHash,
      now,
      publisherId
    })
  };
}

export async function publishBadgeToGist({
  config,
  state,
  publisherObservations,
  client
}: PublishBadgeToGistOptions): Promise<AgentBadgeState> {
  const result = await publishBadgeIfChanged({
    config,
    state,
    publisherObservations,
    client,
    now: new Date().toISOString(),
    skipIfUnchanged: false
  });

  return result.state;
}
