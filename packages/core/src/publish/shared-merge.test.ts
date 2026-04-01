import { describe, expect, it } from "vitest";

import type {
  SharedContributorRecord,
  SharedOverridesRecord
} from "./shared-model.js";
import {
  deriveSharedIncludedTotals,
  mergeSharedOverrides,
  replaceContributorRecord
} from "./shared-merge.js";

function createContributor(
  publisherId: string,
  totals: SharedContributorRecord["totals"]
): SharedContributorRecord {
  return {
    schemaVersion: 1,
    publisherId,
    updatedAt: "2026-04-01T12:00:00.000Z",
    totals
  };
}

function createOverrides(
  overrides: SharedOverridesRecord["overrides"]
): SharedOverridesRecord {
  return {
    schemaVersion: 1,
    overrides
  };
}

describe("shared-merge", () => {
  it("replaces an existing contributor record with the same publisherId", () => {
    const records = [
      createContributor("pub-1", {
        sessions: 1,
        tokens: 100,
        estimatedCostUsdMicros: 10
      }),
      createContributor("pub-2", {
        sessions: 3,
        tokens: 300,
        estimatedCostUsdMicros: 30
      })
    ];

    const nextRecords = replaceContributorRecord(
      records,
      createContributor("pub-1", {
        sessions: 2,
        tokens: 250,
        estimatedCostUsdMicros: 25
      })
    );

    expect(nextRecords).toEqual([
      createContributor("pub-1", {
        sessions: 2,
        tokens: 250,
        estimatedCostUsdMicros: 25
      }),
      createContributor("pub-2", {
        sessions: 3,
        tokens: 300,
        estimatedCostUsdMicros: 30
      })
    ]);
  });

  it("preserves a second contributor record", () => {
    const records = [
      createContributor("pub-1", {
        sessions: 1,
        tokens: 100,
        estimatedCostUsdMicros: 10
      })
    ];

    expect(
      replaceContributorRecord(
        records,
        createContributor("pub-2", {
          sessions: 3,
          tokens: 300,
          estimatedCostUsdMicros: 30
        })
      )
    ).toEqual([
      createContributor("pub-1", {
        sessions: 1,
        tokens: 100,
        estimatedCostUsdMicros: 10
      }),
      createContributor("pub-2", {
        sessions: 3,
        tokens: 300,
        estimatedCostUsdMicros: 30
      })
    ]);
  });

  it("sums two contributors into one derived total", () => {
    expect(
      deriveSharedIncludedTotals([
        createContributor("pub-1", {
          sessions: 1,
          tokens: 100,
          estimatedCostUsdMicros: 10
        }),
        createContributor("pub-2", {
          sessions: 3,
          tokens: 300,
          estimatedCostUsdMicros: 30
        })
      ])
    ).toEqual({
      sessions: 4,
      tokens: 400,
      estimatedCostUsdMicros: 40
    });
  });

  it("preserves null estimatedCostUsdMicros when every contributor is null", () => {
    expect(
      deriveSharedIncludedTotals([
        createContributor("pub-1", {
          sessions: 1,
          tokens: 100,
          estimatedCostUsdMicros: null
        }),
        createContributor("pub-2", {
          sessions: 3,
          tokens: 300,
          estimatedCostUsdMicros: null
        })
      ])
    ).toEqual({
      sessions: 4,
      tokens: 400,
      estimatedCostUsdMicros: null
    });
  });

  it("overwrites only the matching shared override digest", () => {
    const baseOverrides = createOverrides({
      "sha256:match": {
        decision: "include",
        updatedAt: "2026-04-01T12:00:00.000Z",
        updatedByPublisherId: "pub-1"
      },
      "sha256:keep": {
        decision: "exclude",
        updatedAt: "2026-04-01T12:05:00.000Z",
        updatedByPublisherId: "pub-2"
      }
    });
    const nextOverrides = createOverrides({
      "sha256:match": {
        decision: "exclude",
        updatedAt: "2026-04-01T12:10:00.000Z",
        updatedByPublisherId: "pub-3"
      }
    });

    expect(mergeSharedOverrides(baseOverrides, nextOverrides)).toEqual({
      schemaVersion: 1,
      overrides: {
        "sha256:match": {
          decision: "exclude",
          updatedAt: "2026-04-01T12:10:00.000Z",
          updatedByPublisherId: "pub-3"
        },
        "sha256:keep": {
          decision: "exclude",
          updatedAt: "2026-04-01T12:05:00.000Z",
          updatedByPublisherId: "pub-2"
        }
      }
    });
  });
});
