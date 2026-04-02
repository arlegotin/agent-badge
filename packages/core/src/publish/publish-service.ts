import { createHash, randomUUID } from "node:crypto";

import type { AttributeBackfillSessionsResult } from "../attribution/attribution-types.js";
import type { AgentBadgeConfig } from "../config/config-schema.js";
import type { NormalizedSessionSummary } from "../providers/session-summary.js";
import type { RunFullBackfillScanResult } from "../scan/full-backfill.js";
import type {
  AgentBadgePublishFailureCode,
  AgentBadgeState
} from "../state/state-schema.js";
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
import type { SharedPublishHealthReport } from "./shared-health.js";
import {
  inspectSharedPublishHealth,
  loadRemoteSharedRecords
} from "./shared-health.js";
import {
  AGENT_BADGE_OVERRIDES_GIST_FILE,
  buildContributorGistFileName,
  type SharedContributorObservationMap,
  type SharedContributorRecord,
  type SharedOverridesRecord
} from "./shared-model.js";
import {
  deriveResolvedSharedOverrides,
  deriveSharedIncludedTotals,
  replaceContributorRecord
} from "./shared-merge.js";
import {
  applySuccessfulPublishAttempt,
  toPublishAttemptChangedBadge
} from "./publish-state.js";

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
  readonly candidateHash: string;
  readonly changedBadge: boolean;
  readonly healthBeforePublish: SharedPublishHealthReport;
  readonly healthAfterPublish: SharedPublishHealthReport;
  readonly migrationPerformed: boolean;
}

export type PublishBadgeToGistResult = PublishBadgeIfChangedResult;

interface SharedPublishStateSnapshot {
  readonly publisherId?: string | null;
  readonly mode?: "legacy" | "shared";
}

export interface PublishBadgeErrorOptions {
  readonly cause?: unknown;
  readonly attemptedAt: string;
  readonly failureCode: AgentBadgePublishFailureCode;
  readonly candidateHash?: string | null;
  readonly changedBadge?: boolean | null;
}

export class PublishBadgeError extends Error {
  readonly cause?: unknown;
  readonly attemptedAt: string;
  readonly failureCode: AgentBadgePublishFailureCode;
  readonly candidateHash: string | null;
  readonly changedBadge: boolean | null;

  constructor(message: string, options: PublishBadgeErrorOptions) {
    super(message);
    this.name = "PublishBadgeError";
    this.cause = options.cause;
    this.attemptedAt = options.attemptedAt;
    this.failureCode = options.failureCode;
    this.candidateHash = options.candidateHash ?? null;
    this.changedBadge = options.changedBadge ?? null;
  }
}

export function isPublishBadgeError(
  error: unknown
): error is PublishBadgeError {
  return error instanceof PublishBadgeError;
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

function buildStateForSharedHealth(options: {
  readonly state: AgentBadgeState;
  readonly gistId: string;
  readonly publisherId: string;
}): AgentBadgeState {
  return {
    ...options.state,
    publish: {
      ...options.state.publish,
      gistId: options.gistId,
      publisherId: options.publisherId,
      mode: "shared"
    }
  };
}

function buildPostPublishHealthGist(options: {
  readonly gist: Awaited<ReturnType<GitHubGistClient["getGist"]>>;
  readonly contributorFileName: string;
  readonly contributorRecord: SharedContributorRecord;
  readonly overrides: SharedOverridesRecord;
}): Awaited<ReturnType<GitHubGistClient["getGist"]>> {
  return {
    ...options.gist,
    files: {
      ...options.gist.files,
      [options.contributorFileName]: {
        filename: options.contributorFileName,
        content: serializeJsonFile(options.contributorRecord),
        truncated: false
      },
      [AGENT_BADGE_OVERRIDES_GIST_FILE]: {
        filename: AGENT_BADGE_OVERRIDES_GIST_FILE,
        content: serializeJsonFile(options.overrides),
        truncated: false
      }
    }
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
  let candidateHash: string | null = null;
  let changedBadge: boolean | null = null;

  const wrapError = (
    error: unknown,
    failureCode: AgentBadgePublishFailureCode
  ): PublishBadgeError => {
    if (isPublishBadgeError(error)) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);

    return new PublishBadgeError(message, {
      cause: error,
      attemptedAt: now,
      failureCode,
      candidateHash,
      changedBadge
    });
  };

  let existingGist: Awaited<ReturnType<GitHubGistClient["getGist"]>>;

  try {
    existingGist = await client.getGist(config.publish.gistId);
  } catch (error) {
    throw wrapError(error, "remote-inspection-failed");
  }

  let existingSharedState: ReturnType<typeof loadRemoteSharedRecords>;

  try {
    existingSharedState = loadRemoteSharedRecords(existingGist);
    assertOpaqueSharedOverrideKeys(existingSharedState.overrides);
  } catch (error) {
    throw wrapError(error, "remote-inspection-failed");
  }

  const healthBeforePublish = inspectSharedPublishHealth({
    gist: existingGist,
    state,
    now
  });
  const localContributorFileName = buildContributorGistFileName(publisherId);
  const contributorRecord = buildLocalContributorRecord({
    publisherId,
    publisherObservations,
    now
  });
  const authoritativeContributors = replaceContributorRecord(
    existingSharedState.contributors,
    contributorRecord
  );
  const authoritativeTotals = deriveSharedIncludedTotals(
    authoritativeContributors
  );
  const authoritativeOverrides = deriveResolvedSharedOverrides(
    authoritativeContributors
  );

  try {
    assertOpaqueSharedOverrideKeys(authoritativeOverrides);
  } catch (error) {
    throw wrapError(error, "remote-inspection-failed");
  }

  const publishableTotals = normalizeIncludedTotalsForBadgeMode(
    config.badge.mode,
    authoritativeTotals
  );
  const serializedFiles = buildSerializedBadgeFiles({
    config,
    includedTotals: publishableTotals
  });
  const serializedPayload = serializedFiles[AGENT_BADGE_GIST_FILE].content;

  candidateHash = buildPayloadHash(serializedPayload);
  changedBadge = candidateHash !== state.publish.lastPublishedHash;

  const healthAfterPublish = inspectSharedPublishHealth({
    gist: buildPostPublishHealthGist({
      gist: existingGist,
      contributorFileName: localContributorFileName,
      contributorRecord,
      overrides: authoritativeOverrides
    }),
    state: buildStateForSharedHealth({
      state,
      gistId: config.publish.gistId,
      publisherId
    }),
    now
  });
  const migrationPerformed =
    healthBeforePublish.mode === "legacy" && healthAfterPublish.mode === "shared";

  if (skipIfUnchanged && changedBadge === false) {
    try {
      await client.updateGistFile({
        gistId: config.publish.gistId,
        files: {
          [localContributorFileName]: {
            content: serializeJsonFile(contributorRecord)
          }
        }
      });
      await client.updateGistFile({
        gistId: config.publish.gistId,
        files: {
          [AGENT_BADGE_OVERRIDES_GIST_FILE]: {
            content: serializeJsonFile(authoritativeOverrides)
          }
        }
      });
    } catch (error) {
      throw wrapError(error, "remote-write-failed");
    }

    return {
      decision: "skipped",
      candidateHash,
      changedBadge,
      state: applySuccessfulPublishAttempt({
        state,
        at: now,
        gistId: config.publish.gistId,
        hash: candidateHash,
        publisherId,
        changedBadge
      }),
      healthBeforePublish,
      healthAfterPublish,
      migrationPerformed
    };
  }

  try {
    await client.updateGistFile({
      gistId: config.publish.gistId,
      files: serializedFiles
    });
  } catch (error) {
    throw wrapError(error, "remote-write-failed");
  }

  try {
    await client.updateGistFile({
      gistId: config.publish.gistId,
      files: {
        [localContributorFileName]: {
          content: serializeJsonFile(contributorRecord)
        }
      }
    });
  } catch (error) {
    throw wrapError(error, "remote-write-failed");
  }

  try {
    await client.updateGistFile({
      gistId: config.publish.gistId,
      files: {
        [AGENT_BADGE_OVERRIDES_GIST_FILE]: {
          content: serializeJsonFile(authoritativeOverrides)
        }
      }
    });
  } catch (error) {
    throw wrapError(error, "remote-write-failed");
  }

  return {
    decision: "published",
    candidateHash,
    changedBadge,
    state: applySuccessfulPublishAttempt({
      state,
      at: now,
      gistId: config.publish.gistId,
      hash: candidateHash,
      publisherId,
      changedBadge
    }),
    healthBeforePublish,
    healthAfterPublish,
    migrationPerformed
  };
}

export async function publishBadgeToGist({
  config,
  state,
  publisherObservations,
  client
}: PublishBadgeToGistOptions): Promise<PublishBadgeToGistResult> {
  return publishBadgeIfChanged({
    config,
    state,
    publisherObservations,
    client,
    now: new Date().toISOString(),
    skipIfUnchanged: false
  });
}
