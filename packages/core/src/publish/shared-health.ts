import type { AgentBadgeState } from "../state/state-schema.js";
import type { GitHubGist } from "./github-gist-client.js";
import { flattenSharedContributorObservations } from "./shared-merge.js";
import {
  AGENT_BADGE_OVERRIDES_GIST_FILE,
  isContributorGistFileName,
  parseSharedContributorRecord,
  parseSharedOverridesRecord,
  type SharedContributorRecord,
  type SharedOverridesRecord
} from "./shared-model.js";

export type SharedPublishHealthMode = "legacy" | "shared";
export type SharedPublishHealthStatus =
  | "healthy"
  | "stale"
  | "conflict"
  | "partial"
  | "orphaned";
export type SharedPublishIssueId =
  | "legacy-no-contributors"
  | "missing-shared-overrides"
  | "missing-local-contributor"
  | "stale-contributor"
  | "conflicting-session-observations";

export interface SharedPublishHealthReport {
  readonly mode: SharedPublishHealthMode;
  readonly status: SharedPublishHealthStatus;
  readonly remoteContributorCount: number;
  readonly hasSharedOverrides: boolean;
  readonly conflictingSessionCount: number;
  readonly stalePublisherIds: string[];
  readonly orphanedLocalPublisher: boolean;
  readonly issues: SharedPublishIssueId[];
}

export interface InspectSharedPublishHealthOptions {
  readonly gist: GitHubGist;
  readonly state: AgentBadgeState;
  readonly now: string;
}

export interface LoadedRemoteSharedRecords {
  readonly contributors: SharedContributorRecord[];
  readonly overrides: SharedOverridesRecord;
  readonly hasSharedOverrides: boolean;
}

const staleContributorWindowMs = 7 * 24 * 60 * 60 * 1000;

function loadJsonFile(filename: string, content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    throw new Error(`Unable to parse shared gist file ${filename}: ${detail}`);
  }
}

export function loadRemoteSharedRecords(gist: GitHubGist): LoadedRemoteSharedRecords {
  const contributors: SharedContributorRecord[] = [];
  let overrides: SharedOverridesRecord = {
    schemaVersion: 1,
    overrides: {}
  };
  let hasSharedOverrides = false;

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
      const parsedContent = loadJsonFile(file.filename, file.content) as
        | { readonly schemaVersion?: number }
        | null;

      if (parsedContent?.schemaVersion === 1) {
        continue;
      }

      contributors.push(parseSharedContributorRecord(parsedContent));
      continue;
    }

    if (file.filename === AGENT_BADGE_OVERRIDES_GIST_FILE) {
      hasSharedOverrides = true;
      overrides = parseSharedOverridesRecord(loadJsonFile(file.filename, file.content));
    }
  }

  return {
    contributors,
    overrides,
    hasSharedOverrides
  };
}

function countConflictingSessions(
  contributors: readonly SharedContributorRecord[]
): number {
  const observationsByDigest = new Map<
    string,
    Array<{
      readonly attributionStatus: SharedContributorRecord["observations"][string]["attributionStatus"];
      readonly overrideDecision: SharedContributorRecord["observations"][string]["overrideDecision"];
    }>
  >();

  for (const observation of flattenSharedContributorObservations(contributors)) {
    const existing = observationsByDigest.get(observation.sessionDigest);
    const nextValue = {
      attributionStatus: observation.observation.attributionStatus,
      overrideDecision: observation.observation.overrideDecision
    };

    if (existing === undefined) {
      observationsByDigest.set(observation.sessionDigest, [nextValue]);
      continue;
    }

    existing.push(nextValue);
  }

  let conflicts = 0;

  for (const observations of observationsByDigest.values()) {
    if (observations.length < 2) {
      continue;
    }

    const attributionStatuses = new Set(
      observations.map((observation) => observation.attributionStatus)
    );
    const overrideDecisions = new Set(
      observations.map((observation) => observation.overrideDecision)
    );

    if (attributionStatuses.size > 1 || overrideDecisions.size > 1) {
      conflicts += 1;
    }
  }

  return conflicts;
}

function findStalePublisherIds(
  contributors: readonly SharedContributorRecord[],
  now: string
): string[] {
  const nowMs = Date.parse(now);

  return contributors
    .filter((contributor) => {
      const updatedAtMs = Date.parse(contributor.updatedAt);
      return nowMs - updatedAtMs > staleContributorWindowMs;
    })
    .map((contributor) => contributor.publisherId)
    .sort();
}

function resolveLocalPublisherId(state: AgentBadgeState): string | null {
  return typeof state.publish.publisherId === "string" &&
    state.publish.publisherId.length > 0
    ? state.publish.publisherId
    : null;
}

function resolveStatus(options: {
  readonly mode: SharedPublishHealthMode;
  readonly hasSharedOverrides: boolean;
  readonly orphanedLocalPublisher: boolean;
  readonly conflictingSessionCount: number;
  readonly stalePublisherIds: readonly string[];
}): SharedPublishHealthStatus {
  if (options.mode === "legacy") {
    return "healthy";
  }

  if (!options.hasSharedOverrides) {
    return "partial";
  }

  if (options.orphanedLocalPublisher) {
    return "orphaned";
  }

  if (options.conflictingSessionCount > 0) {
    return "conflict";
  }

  if (options.stalePublisherIds.length > 0) {
    return "stale";
  }

  return "healthy";
}

export function inspectSharedPublishHealth({
  gist,
  state,
  now
}: InspectSharedPublishHealthOptions): SharedPublishHealthReport {
  const remoteSharedState = loadRemoteSharedRecords(gist);
  const remoteContributorCount = remoteSharedState.contributors.length;
  const mode: SharedPublishHealthMode =
    remoteContributorCount > 0 ? "shared" : "legacy";
  const stalePublisherIds = findStalePublisherIds(
    remoteSharedState.contributors,
    now
  );
  const conflictingSessionCount = countConflictingSessions(
    remoteSharedState.contributors
  );
  const localPublisherId = resolveLocalPublisherId(state);
  const orphanedLocalPublisher =
    mode === "shared" &&
    localPublisherId !== null &&
    !remoteSharedState.contributors.some(
      (contributor) => contributor.publisherId === localPublisherId
    );
  const issues: SharedPublishIssueId[] = [];

  if (mode === "legacy") {
    issues.push("legacy-no-contributors");
  } else {
    if (!remoteSharedState.hasSharedOverrides) {
      issues.push("missing-shared-overrides");
    }

    if (orphanedLocalPublisher) {
      issues.push("missing-local-contributor");
    }

    if (stalePublisherIds.length > 0) {
      issues.push("stale-contributor");
    }

    if (conflictingSessionCount > 0) {
      issues.push("conflicting-session-observations");
    }
  }

  return {
    mode,
    status: resolveStatus({
      mode,
      hasSharedOverrides: remoteSharedState.hasSharedOverrides,
      orphanedLocalPublisher,
      conflictingSessionCount,
      stalePublisherIds
    }),
    remoteContributorCount,
    hasSharedOverrides: remoteSharedState.hasSharedOverrides,
    conflictingSessionCount,
    stalePublisherIds,
    orphanedLocalPublisher,
    issues
  };
}
