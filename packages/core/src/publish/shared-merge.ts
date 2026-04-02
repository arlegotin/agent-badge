import type { IncludedTotals } from "./badge-payload.js";
import type {
  SharedContributorObservation,
  SharedContributorRecord,
  SharedOverridesRecord
} from "./shared-model.js";

export interface SharedObservationWithPublisher {
  readonly sessionDigest: string;
  readonly publisherId: string;
  readonly recordUpdatedAt: string;
  readonly observation: SharedContributorObservation;
}

export function replaceContributorRecord(
  records: readonly SharedContributorRecord[],
  nextRecord: SharedContributorRecord
): SharedContributorRecord[] {
  const existingIndex = records.findIndex(
    (record) => record.publisherId === nextRecord.publisherId
  );

  if (existingIndex === -1) {
    return [...records, nextRecord];
  }

  return records.map((record, index) =>
    index === existingIndex ? nextRecord : record
  );
}

export function flattenSharedContributorObservations(
  records: readonly SharedContributorRecord[]
): SharedObservationWithPublisher[] {
  return records.flatMap((record) =>
    Object.entries(record.observations).map(([sessionDigest, observation]) => ({
      sessionDigest,
      publisherId: record.publisherId,
      recordUpdatedAt: record.updatedAt,
      observation
    }))
  );
}

function compareNullableIsoDateDesc(
  left: string | null,
  right: string | null
): number {
  if (left === right) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (leftTime === rightTime) {
    return 0;
  }

  return leftTime > rightTime ? -1 : 1;
}

function compareNumberDesc(left: number, right: number): number {
  if (left === right) {
    return 0;
  }

  return left > right ? -1 : 1;
}

function compareNullableNumberDesc(
  left: number | null,
  right: number | null
): number {
  if (left === right) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return compareNumberDesc(left, right);
}

export function compareSharedObservationWatermark(
  left: SharedObservationWithPublisher,
  right: SharedObservationWithPublisher
): number {
  return (
    compareNullableIsoDateDesc(
      left.observation.sessionUpdatedAt,
      right.observation.sessionUpdatedAt
    ) ||
    compareNumberDesc(left.observation.tokens, right.observation.tokens) ||
    compareNullableNumberDesc(
      left.observation.estimatedCostUsdMicros,
      right.observation.estimatedCostUsdMicros
    ) ||
    left.publisherId.localeCompare(right.publisherId)
  );
}

function groupSharedObservationsByDigest(
  records: readonly SharedContributorRecord[]
): Map<string, SharedObservationWithPublisher[]> {
  const grouped = new Map<string, SharedObservationWithPublisher[]>();

  for (const observation of flattenSharedContributorObservations(records)) {
    const existing = grouped.get(observation.sessionDigest);

    if (existing === undefined) {
      grouped.set(observation.sessionDigest, [observation]);
      continue;
    }

    existing.push(observation);
  }

  return grouped;
}

function pickCanonicalSharedObservation(
  observations: readonly SharedObservationWithPublisher[]
): SharedObservationWithPublisher {
  const [winner] = [...observations].sort(compareSharedObservationWatermark);

  return winner;
}

function resolveSharedObservationDecision(
  observations: readonly SharedObservationWithPublisher[]
): "include" | "exclude" {
  if (
    observations.some(
      ({ observation }) => observation.attributionStatus === "included"
    )
  ) {
    return "include";
  }

  if (
    observations.some(
      ({ observation }) =>
        observation.attributionStatus === "excluded" ||
        observation.overrideDecision === "exclude"
    )
  ) {
    return "exclude";
  }

  if (
    observations.some(
      ({ observation }) => observation.overrideDecision === "include"
    )
  ) {
    return "include";
  }

  return "exclude";
}

export function deriveSharedIncludedTotals(
  records: readonly SharedContributorRecord[]
): IncludedTotals {
  let sessions = 0;
  let tokens = 0;
  let estimatedCostUsdMicros = 0;
  let hasNonNullCost = false;

  for (const observations of groupSharedObservationsByDigest(records).values()) {
    if (resolveSharedObservationDecision(observations) !== "include") {
      continue;
    }

    const winner = pickCanonicalSharedObservation(observations);

    sessions += 1;
    tokens += winner.observation.tokens;

    if (winner.observation.estimatedCostUsdMicros !== null) {
      estimatedCostUsdMicros += winner.observation.estimatedCostUsdMicros;
      hasNonNullCost = true;
    }
  }

  return {
    sessions,
    tokens,
    estimatedCostUsdMicros: hasNonNullCost ? estimatedCostUsdMicros : null
  };
}

export function deriveResolvedSharedOverrides(
  records: readonly SharedContributorRecord[]
): SharedOverridesRecord {
  const overrides: SharedOverridesRecord["overrides"] = {};

  for (const [sessionDigest, observations] of groupSharedObservationsByDigest(
    records
  )) {
    if (
      !observations.some(
        ({ observation }) =>
          observation.attributionStatus !== "included" ||
          observation.overrideDecision !== null
      )
    ) {
      continue;
    }

    const winner = pickCanonicalSharedObservation(observations);

    overrides[sessionDigest] = {
      decision: resolveSharedObservationDecision(observations),
      updatedAt: winner.observation.sessionUpdatedAt ?? winner.recordUpdatedAt,
      updatedByPublisherId: winner.publisherId
    };
  }

  return {
    schemaVersion: 1,
    overrides
  };
}

export function mergeSharedOverrides(
  baseOverrides: SharedOverridesRecord,
  nextOverrides: SharedOverridesRecord
): SharedOverridesRecord {
  return {
    schemaVersion: 1,
    overrides: {
      ...baseOverrides.overrides,
      ...nextOverrides.overrides
    }
  };
}
