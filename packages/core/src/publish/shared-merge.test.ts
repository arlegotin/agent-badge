import { describe, expect, it } from "vitest";

import type {
  SharedContributorRecord,
  SharedOverridesRecord
} from "./shared-model.js";
import {
  compareSharedObservationWatermark,
  deriveSharedIncludedTotals,
  deriveResolvedSharedOverrides,
  replaceContributorRecord
} from "./shared-merge.js";
import { buildSharedOverrideDigest } from "./shared-model.js";

function createContributor(
  publisherId: string,
  observations: SharedContributorRecord["observations"]
): SharedContributorRecord {
  return {
    schemaVersion: 2,
    publisherId,
    updatedAt: "2026-04-01T12:00:00.000Z",
    observations
  };
}

function createObservation(
  digest: string,
  observation: SharedContributorRecord["observations"][string]
): SharedContributorRecord["observations"] {
  return {
    [digest]: observation
  };
}

describe("shared-merge", () => {
  const digestA = buildSharedOverrideDigest("codex:session-a");
  const digestB = buildSharedOverrideDigest("claude:session-b");

  it("replaces an existing contributor record with the same publisherId", () => {
    const records = [
      createContributor(
        "pub-1",
        createObservation(digestA, {
          sessionUpdatedAt: "2026-04-01T10:00:00.000Z",
          attributionStatus: "included",
          overrideDecision: null,
          tokens: 100,
          estimatedCostUsdMicros: 10
        })
      ),
      createContributor(
        "pub-2",
        createObservation(digestB, {
          sessionUpdatedAt: "2026-04-01T11:00:00.000Z",
          attributionStatus: "included",
          overrideDecision: null,
          tokens: 300,
          estimatedCostUsdMicros: 30
        })
      )
    ];

    const nextRecords = replaceContributorRecord(
      records,
      createContributor(
        "pub-1",
        createObservation(digestA, {
          sessionUpdatedAt: "2026-04-01T12:00:00.000Z",
          attributionStatus: "included",
          overrideDecision: null,
          tokens: 250,
          estimatedCostUsdMicros: 25
        })
      )
    );

    expect(nextRecords).toEqual([
      createContributor(
        "pub-1",
        createObservation(digestA, {
          sessionUpdatedAt: "2026-04-01T12:00:00.000Z",
          attributionStatus: "included",
          overrideDecision: null,
          tokens: 250,
          estimatedCostUsdMicros: 25
        })
      ),
      createContributor(
        "pub-2",
        createObservation(digestB, {
          sessionUpdatedAt: "2026-04-01T11:00:00.000Z",
          attributionStatus: "included",
          overrideDecision: null,
          tokens: 300,
          estimatedCostUsdMicros: 30
        })
      )
    ]);
  });

  it("preserves a second contributor record", () => {
    const records = [createContributor("pub-1", createObservation(digestA, {
      sessionUpdatedAt: "2026-04-01T10:00:00.000Z",
      attributionStatus: "included",
      overrideDecision: null,
      tokens: 100,
      estimatedCostUsdMicros: 10
    }))];

    expect(
      replaceContributorRecord(
        records,
        createContributor(
          "pub-2",
          createObservation(digestB, {
            sessionUpdatedAt: "2026-04-01T11:00:00.000Z",
            attributionStatus: "included",
            overrideDecision: null,
            tokens: 300,
            estimatedCostUsdMicros: 30
          })
        )
      )
    ).toEqual([
      createContributor("pub-1", createObservation(digestA, {
        sessionUpdatedAt: "2026-04-01T10:00:00.000Z",
        attributionStatus: "included",
        overrideDecision: null,
        tokens: 100,
        estimatedCostUsdMicros: 10
      })),
      createContributor("pub-2", createObservation(digestB, {
        sessionUpdatedAt: "2026-04-01T11:00:00.000Z",
        attributionStatus: "included",
        overrideDecision: null,
        tokens: 300,
        estimatedCostUsdMicros: 30
      }))
    ]);
  });

  it("chooses the latest sessionUpdatedAt before token count", () => {
    expect(
      deriveSharedIncludedTotals([
        createContributor("pub-newer", createObservation(digestA, {
          sessionUpdatedAt: "2026-04-01T13:00:00.000Z",
          attributionStatus: "included",
          overrideDecision: null,
          tokens: 100,
          estimatedCostUsdMicros: 10
        })),
        createContributor("pub-older-more-tokens", createObservation(digestA, {
          sessionUpdatedAt: "2026-04-01T12:00:00.000Z",
          attributionStatus: "included",
          overrideDecision: null,
          tokens: 300,
          estimatedCostUsdMicros: 30
        }))
      ])
    ).toEqual({
      sessions: 1,
      tokens: 100,
      estimatedCostUsdMicros: 10
    });
  });

  it("equal timestamps fall back to higher tokens", () => {
    expect(
      deriveSharedIncludedTotals([
        createContributor("pub-lower-tokens", createObservation(digestA, {
          sessionUpdatedAt: "2026-04-01T12:00:00.000Z",
          attributionStatus: "included",
          overrideDecision: null,
          tokens: 100,
          estimatedCostUsdMicros: 10
        })),
        createContributor("pub-higher-tokens", createObservation(digestA, {
          sessionUpdatedAt: "2026-04-01T12:00:00.000Z",
          attributionStatus: "included",
          overrideDecision: null,
          tokens: 140,
          estimatedCostUsdMicros: 8
        }))
      ])
    ).toEqual({
      sessions: 1,
      tokens: 140,
      estimatedCostUsdMicros: 8
    });
  });

  it("exact ties fall back to the lexicographically smaller publisherId", () => {
    expect(
      compareSharedObservationWatermark(
        {
          publisherId: "pub-b",
          sessionDigest: digestA,
          recordUpdatedAt: "2026-04-01T12:00:00.000Z",
          observation: {
            sessionUpdatedAt: "2026-04-01T12:00:00.000Z",
            attributionStatus: "included",
            overrideDecision: null,
            tokens: 100,
            estimatedCostUsdMicros: 10
          }
        },
        {
          publisherId: "pub-a",
          sessionDigest: digestA,
          recordUpdatedAt: "2026-04-01T12:00:00.000Z",
          observation: {
            sessionUpdatedAt: "2026-04-01T12:00:00.000Z",
            attributionStatus: "included",
            overrideDecision: null,
            tokens: 100,
            estimatedCostUsdMicros: 10
          }
        }
      )
    ).toBeGreaterThan(0);
  });

  it("derives badge totals from canonical included sessions only", () => {
    expect(
      deriveSharedIncludedTotals([
        createContributor("pub-1", {
          ...createObservation(digestA, {
            sessionUpdatedAt: "2026-04-01T12:00:00.000Z",
            attributionStatus: "included",
            overrideDecision: null,
            tokens: 100,
            estimatedCostUsdMicros: null
          }),
          ...createObservation(digestB, {
            sessionUpdatedAt: "2026-04-01T12:05:00.000Z",
            attributionStatus: "ambiguous",
            overrideDecision: null,
            tokens: 300,
            estimatedCostUsdMicros: null
          })
        }),
        createContributor("pub-2", createObservation(digestB, {
          sessionUpdatedAt: "2026-04-01T12:06:00.000Z",
          attributionStatus: "ambiguous",
          overrideDecision: "include",
          tokens: 310,
          estimatedCostUsdMicros: null
        }))
      ])
    ).toEqual({
      sessions: 2,
      tokens: 410,
      estimatedCostUsdMicros: null
    });
  });

  it("resolves shared ambiguous include and exclude order-independently", () => {
    const records = [
      createContributor("pub-include", {
        ...createObservation(digestA, {
          sessionUpdatedAt: "2026-04-01T12:00:00.000Z",
          attributionStatus: "ambiguous",
          overrideDecision: "include",
          tokens: 100,
          estimatedCostUsdMicros: 10
        }),
        ...createObservation(digestB, {
          sessionUpdatedAt: "2026-04-01T12:01:00.000Z",
          attributionStatus: "ambiguous",
          overrideDecision: null,
          tokens: 200,
          estimatedCostUsdMicros: 20
        })
      }),
      createContributor("pub-exclude", {
        ...createObservation(digestA, {
          sessionUpdatedAt: "2026-04-01T12:02:00.000Z",
          attributionStatus: "ambiguous",
          overrideDecision: null,
          tokens: 120,
          estimatedCostUsdMicros: 12
        }),
        ...createObservation(digestB, {
          sessionUpdatedAt: "2026-04-01T12:03:00.000Z",
          attributionStatus: "ambiguous",
          overrideDecision: "exclude",
          tokens: 220,
          estimatedCostUsdMicros: 22
        })
      })
    ];

    const expected: SharedOverridesRecord = {
      schemaVersion: 1,
      overrides: {
        [digestA]: {
          decision: "include",
          updatedAt: "2026-04-01T12:02:00.000Z",
          updatedByPublisherId: "pub-exclude"
        },
        [digestB]: {
          decision: "exclude",
          updatedAt: "2026-04-01T12:03:00.000Z",
          updatedByPublisherId: "pub-exclude"
        }
      }
    };

    expect(deriveResolvedSharedOverrides(records)).toEqual(expected);
    expect(deriveResolvedSharedOverrides([...records].reverse())).toEqual(
      expected
    );
  });
});
