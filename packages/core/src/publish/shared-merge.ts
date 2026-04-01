import type { IncludedTotals } from "./badge-payload.js";
import type {
  SharedContributorRecord,
  SharedOverridesRecord
} from "./shared-model.js";

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

export function deriveSharedIncludedTotals(
  records: readonly SharedContributorRecord[]
): IncludedTotals {
  let sessions = 0;
  let tokens = 0;
  let estimatedCostUsdMicros = 0;
  let hasNonNullCost = false;

  for (const record of records) {
    sessions += record.totals.sessions;
    tokens += record.totals.tokens;

    if (record.totals.estimatedCostUsdMicros !== null) {
      estimatedCostUsdMicros += record.totals.estimatedCostUsdMicros;
      hasNonNullCost = true;
    }
  }

  return {
    sessions,
    tokens,
    estimatedCostUsdMicros: hasNonNullCost ? estimatedCostUsdMicros : null
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
