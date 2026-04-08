import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

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
import { type GitHubGist } from "./github-gist-client.js";

export interface PublishBadgeToGistOptions {
  readonly config: Pick<AgentBadgeConfig, "badge" | "publish">;
  readonly state: AgentBadgeState;
  readonly publisherObservations: SharedContributorObservationMap;
  readonly client: GitHubGistClient;
  readonly remoteReadbackRetryDelayMs?: readonly number[];
}

export interface PublishBadgeIfChangedOptions {
  readonly config: Pick<AgentBadgeConfig, "badge" | "publish">;
  readonly state: AgentBadgeState;
  readonly publisherObservations: SharedContributorObservationMap;
  readonly client: GitHubGistClient;
  readonly now: string;
  readonly skipIfUnchanged: boolean;
  readonly remoteReadbackRetryDelayMs?: readonly number[];
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
const GITHUB_AUTH_MISSING_ERROR_MESSAGE =
  "GitHub authentication missing or invalid.";
const UNREADABLE_SHARED_PUBLISH_FILES_ERROR_MESSAGE =
  "Remote gist contained unreadable shared publish files.";
const REMOTE_READBACK_HASH_MISMATCH_ERROR_MESSAGE =
  "Remote badge payload hash did not match the candidate hash.";
const REMOTE_READBACK_RETRY_FAILED_ERROR_MESSAGE =
  "Remote gist readback retry failed.";
const defaultRemoteReadbackRetryDelayMs = [250, 500, 1_000, 2_000, 3_000] as const;

function buildSessionKey(
  session: { readonly provider: string; readonly providerSessionId: string }
): string {
  return `${session.provider}:${session.providerSessionId}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const candidate = error as {
    readonly status?: unknown;
    readonly response?: {
      readonly status?: unknown;
    };
  };

  if (typeof candidate.status === "number") {
    return candidate.status;
  }

  if (typeof candidate.response?.status === "number") {
    return candidate.response.status;
  }

  return null;
}

function isGitHubAuthenticationError(error: unknown): boolean {
  const status = getErrorStatus(error);

  if (status === 401) {
    return true;
  }

  const normalizedMessage = getErrorMessage(error).toLowerCase();

  return (
    normalizedMessage.includes("requires authentication") ||
    normalizedMessage.includes("bad credentials") ||
    normalizedMessage.includes("authentication failed") ||
    normalizedMessage.includes("unauthorized")
  );
}

function normalizePublishBadgeError(error: PublishBadgeError): PublishBadgeError {
  if (
    error.failureCode !== "auth-missing" ||
    error.message === GITHUB_AUTH_MISSING_ERROR_MESSAGE
  ) {
    return error;
  }

  return new PublishBadgeError(GITHUB_AUTH_MISSING_ERROR_MESSAGE, {
    cause: error.cause ?? error,
    attemptedAt: error.attemptedAt,
    failureCode: "auth-missing",
    candidateHash: error.candidateHash,
    changedBadge: error.changedBadge
  });
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
  readonly color: string;
  readonly colorZero: string;
  readonly includedTotals: IncludedTotals;
}): string {
  const payload = buildEndpointBadgePayload({
    label: options.label,
    mode: options.mode,
    color: options.color,
    colorZero: options.colorZero,
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
        color: options.config.badge.color,
        colorZero: options.config.badge.colorZero,
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
      color: options.config.badge.color,
      colorZero: options.config.badge.colorZero,
      includedTotals: options.includedTotals
    })
  };
  files[AGENT_BADGE_TOKENS_GIST_FILE] = {
    content: buildSerializedBadgePayload({
      label: options.config.badge.label,
      mode: "tokens",
      color: options.config.badge.color,
      colorZero: options.config.badge.colorZero,
      includedTotals: options.includedTotals
    })
  };
  files[AGENT_BADGE_COST_GIST_FILE] = {
    content: buildSerializedBadgePayload({
      label: options.config.badge.label,
      mode: "cost",
      color: options.config.badge.color,
      colorZero: options.config.badge.colorZero,
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

function buildExpectedRemoteGist(options: {
  readonly gist: Awaited<ReturnType<GitHubGistClient["getGist"]>>;
  readonly serializedFiles: Record<string, { readonly content: string }>;
  readonly contributorFileName: string;
  readonly contributorRecord: SharedContributorRecord;
  readonly overrides: SharedOverridesRecord;
}): Awaited<ReturnType<GitHubGistClient["getGist"]>> {
  return {
    ...options.gist,
    files: {
      ...options.gist.files,
      ...Object.fromEntries(
        Object.entries(options.serializedFiles).map(([filename, file]) => [
          filename,
          {
            filename,
            content: file.content,
            truncated: false
          }
        ])
      ),
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

function readRemoteFile(
  gist: GitHubGist,
  filename: string
):
  | { readonly status: "missing" }
  | { readonly status: "invalid" }
  | { readonly status: "ok"; readonly content: string } {
  const file = gist.files[filename];

  if (!file) {
    return {
      status: "missing"
    };
  }

  if (file.truncated || file.content === null) {
    return {
      status: "invalid"
    };
  }

  return {
    status: "ok",
    content: file.content
  };
}

function isUnreadableSharedPublishFilesError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === UNREADABLE_SHARED_PUBLISH_FILES_ERROR_MESSAGE
  );
}

function isRemoteReadbackHashMismatchError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === REMOTE_READBACK_HASH_MISMATCH_ERROR_MESSAGE
  );
}

function isRetryableRemoteReadbackError(error: unknown): boolean {
  return (
    isUnreadableSharedPublishFilesError(error) ||
    isRemoteReadbackHashMismatchError(error)
  );
}

function resolveVerifiedRemoteState(options: {
  readonly readbackGist: GitHubGist;
  readonly fallbackGist: GitHubGist;
  readonly candidateHash: string;
  readonly contributorFileName: string;
}): GitHubGist {
  const badgeFile = readRemoteFile(options.readbackGist, AGENT_BADGE_GIST_FILE);
  const contributorFile = readRemoteFile(
    options.readbackGist,
    options.contributorFileName
  );
  const overridesFile = readRemoteFile(
    options.readbackGist,
    AGENT_BADGE_OVERRIDES_GIST_FILE
  );

  if (badgeFile.status === "missing") {
    return options.fallbackGist;
  }

  if (
    badgeFile.status === "invalid" ||
    contributorFile.status === "invalid" ||
    overridesFile.status === "invalid"
  ) {
    throw new Error(UNREADABLE_SHARED_PUBLISH_FILES_ERROR_MESSAGE);
  }

  if (contributorFile.status === "missing" || overridesFile.status === "missing") {
    return options.fallbackGist;
  }

  const remoteSharedState = loadRemoteSharedRecords(options.readbackGist);
  assertOpaqueSharedOverrideKeys(remoteSharedState.overrides);

  const hasLocalContributor = remoteSharedState.contributors.some(
    (contributor) =>
      buildContributorGistFileName(contributor.publisherId) ===
      options.contributorFileName
  );

  if (
    buildPayloadHash(badgeFile.content) !== options.candidateHash &&
    hasLocalContributor
  ) {
    throw new Error(REMOTE_READBACK_HASH_MISMATCH_ERROR_MESSAGE);
  }

  if (!hasLocalContributor) {
    return options.fallbackGist;
  }

  return options.readbackGist;
}

async function resolveVerifiedRemoteStateWithRetry(options: {
  readonly readbackGist: GitHubGist;
  readonly fallbackGist: GitHubGist;
  readonly candidateHash: string;
  readonly contributorFileName: string;
  readonly reloadGist: () => Promise<GitHubGist>;
  readonly remoteReadbackRetryDelayMs?: readonly number[];
}): Promise<GitHubGist> {
  let currentReadbackGist = options.readbackGist;
  const retryDelayMsByAttempt =
    options.remoteReadbackRetryDelayMs ?? defaultRemoteReadbackRetryDelayMs;
  const totalAttempts = retryDelayMsByAttempt.length + 1;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      return resolveVerifiedRemoteState({
        readbackGist: currentReadbackGist,
        fallbackGist: options.fallbackGist,
        candidateHash: options.candidateHash,
        contributorFileName: options.contributorFileName
      });
    } catch (error) {
      if (
        !isRetryableRemoteReadbackError(error) ||
        attempt === totalAttempts
      ) {
        throw error;
      }
    }

    const retryDelayMs = retryDelayMsByAttempt[attempt - 1] ?? 0;

    if (retryDelayMs > 0) {
      await delay(retryDelayMs);
    }

    try {
      currentReadbackGist = await options.reloadGist();
    } catch (error) {
      const detail = getErrorMessage(error);

      throw new Error(
        `${REMOTE_READBACK_RETRY_FAILED_ERROR_MESSAGE} ${detail}`
      );
    }
  }

  throw new Error(UNREADABLE_SHARED_PUBLISH_FILES_ERROR_MESSAGE);
}

export async function publishBadgeIfChanged({
  config,
  state,
  publisherObservations,
  client,
  now,
  skipIfUnchanged,
  remoteReadbackRetryDelayMs
}: PublishBadgeIfChangedOptions): Promise<PublishBadgeIfChangedResult> {
  if (config.publish.gistId === null) {
    throw new Error("Cannot publish badge JSON without a configured gist id.");
  }

  const gistId = config.publish.gistId;

  const publisherId = resolvePublisherId(state);
  let candidateHash: string | null = null;
  let changedBadge: boolean | null = null;

  const wrapError = (
    error: unknown,
    failureCode: AgentBadgePublishFailureCode
  ): PublishBadgeError => {
    if (isPublishBadgeError(error)) {
      return normalizePublishBadgeError(error);
    }

    const normalizedFailureCode = isGitHubAuthenticationError(error)
      ? "auth-missing"
      : failureCode;
    const message =
      normalizedFailureCode === "auth-missing"
        ? GITHUB_AUTH_MISSING_ERROR_MESSAGE
        : getErrorMessage(error);

    return new PublishBadgeError(message, {
      cause: error,
      attemptedAt: now,
      failureCode: normalizedFailureCode,
      candidateHash,
      changedBadge
    });
  };

  let existingGist: Awaited<ReturnType<GitHubGistClient["getGist"]>>;

  try {
    existingGist = await client.getGist(config.publish.gistId);
  } catch (error) {
    throw wrapError(error, "gist-unreachable");
  }

  let existingSharedState: ReturnType<typeof loadRemoteSharedRecords>;

  try {
    existingSharedState = loadRemoteSharedRecords(existingGist);
    assertOpaqueSharedOverrideKeys(existingSharedState.overrides);
  } catch (error) {
    throw wrapError(error, "remote-state-invalid");
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
    throw wrapError(error, "remote-state-invalid");
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
  const serializedContributorRecord = serializeJsonFile(contributorRecord);
  const serializedOverrides = serializeJsonFile(authoritativeOverrides);

  candidateHash = buildPayloadHash(serializedPayload);
  changedBadge = candidateHash !== state.publish.lastPublishedHash;
  const fallbackGist = buildExpectedRemoteGist({
    gist: existingGist,
    serializedFiles,
    contributorFileName: localContributorFileName,
    contributorRecord,
    overrides: authoritativeOverrides
  });

  if (skipIfUnchanged && changedBadge === false) {
    try {
      await client.updateGistFile({
        gistId,
        files: {
          [localContributorFileName]: {
            content: serializedContributorRecord
          },
          [AGENT_BADGE_OVERRIDES_GIST_FILE]: {
            content: serializedOverrides
          }
        }
      });
    } catch (error) {
      throw wrapError(error, "remote-write-failed");
    }

    let readbackGist: Awaited<ReturnType<GitHubGistClient["getGist"]>>;

    try {
      readbackGist = await client.getGist(gistId);
    } catch (error) {
      throw wrapError(error, "remote-readback-failed");
    }

    let verifiedGist: GitHubGist;

    try {
      verifiedGist = await resolveVerifiedRemoteStateWithRetry({
        readbackGist,
        fallbackGist,
        candidateHash,
        contributorFileName: localContributorFileName,
        reloadGist: () => client.getGist(gistId),
        remoteReadbackRetryDelayMs
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failureCode = message.includes("candidate hash")
        ? "remote-readback-mismatch"
        : message.includes(REMOTE_READBACK_RETRY_FAILED_ERROR_MESSAGE)
          ? "remote-readback-failed"
          : "remote-state-invalid";

      throw wrapError(error, failureCode);
    }

    const healthAfterPublish = inspectSharedPublishHealth({
      gist: verifiedGist,
      state: buildStateForSharedHealth({
        state,
        gistId,
        publisherId
      }),
      now
    });
    const migrationPerformed =
      healthBeforePublish.mode === "legacy" && healthAfterPublish.mode === "shared";

    return {
      decision: "skipped",
      candidateHash,
      changedBadge,
      state: applySuccessfulPublishAttempt({
        state,
        at: now,
        gistId,
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
      gistId,
      files: {
        ...serializedFiles,
        [localContributorFileName]: {
          content: serializedContributorRecord
        },
        [AGENT_BADGE_OVERRIDES_GIST_FILE]: {
          content: serializedOverrides
        }
      }
    });
  } catch (error) {
    throw wrapError(error, "remote-write-failed");
  }

  let readbackGist: Awaited<ReturnType<GitHubGistClient["getGist"]>>;

  try {
    readbackGist = await client.getGist(gistId);
  } catch (error) {
    throw wrapError(error, "remote-readback-failed");
  }

  let verifiedGist: GitHubGist;

  try {
    verifiedGist = await resolveVerifiedRemoteStateWithRetry({
      readbackGist,
      fallbackGist,
      candidateHash,
      contributorFileName: localContributorFileName,
      reloadGist: () => client.getGist(gistId),
      remoteReadbackRetryDelayMs
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failureCode = message.includes("candidate hash")
      ? "remote-readback-mismatch"
      : message.includes(REMOTE_READBACK_RETRY_FAILED_ERROR_MESSAGE)
        ? "remote-readback-failed"
        : "remote-state-invalid";

    throw wrapError(error, failureCode);
  }

  const healthAfterPublish = inspectSharedPublishHealth({
    gist: verifiedGist,
    state: buildStateForSharedHealth({
      state,
      gistId,
      publisherId
    }),
    now
  });
  const migrationPerformed =
    healthBeforePublish.mode === "legacy" && healthAfterPublish.mode === "shared";

  return {
    decision: "published",
    candidateHash,
    changedBadge,
    state: applySuccessfulPublishAttempt({
      state,
      at: now,
      gistId,
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
  client,
  remoteReadbackRetryDelayMs
}: PublishBadgeToGistOptions): Promise<PublishBadgeToGistResult> {
  return publishBadgeIfChanged({
    config,
    state,
    publisherObservations,
    client,
    now: new Date().toISOString(),
    skipIfUnchanged: false,
    remoteReadbackRetryDelayMs
  });
}
