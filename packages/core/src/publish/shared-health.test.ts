import { describe, expect, it } from "vitest";

import { defaultAgentBadgeState } from "../state/state-schema.js";
import { AGENT_BADGE_GIST_FILE } from "./badge-url.js";
import {
  AGENT_BADGE_OVERRIDES_GIST_FILE,
  buildContributorGistFileName,
  buildSharedOverrideDigest
} from "./shared-model.js";
import { inspectSharedPublishHealth } from "./shared-health.js";

function createGistFileMap(
  files: Record<
    string,
    {
      readonly content: string;
      readonly truncated?: boolean;
    }
  >
) {
  return Object.fromEntries(
    Object.entries(files).map(([filename, file]) => [
      filename,
      {
        filename,
        content: file.content,
        truncated: file.truncated ?? false
      }
    ])
  );
}

function createObservationContributorRecord(options: {
  readonly publisherId: string;
  readonly updatedAt?: string;
  readonly observations: Record<string, unknown>;
}) {
  return JSON.stringify(
    {
      schemaVersion: 2,
      publisherId: options.publisherId,
      updatedAt: options.updatedAt ?? "2026-03-30T11:00:00.000Z",
      observations: options.observations
    },
    null,
    2
  );
}

function createOverridesRecord(overrides: Record<string, unknown> = {}) {
  return JSON.stringify(
    {
      schemaVersion: 1,
      overrides
    },
    null,
    2
  );
}

describe("inspectSharedPublishHealth", () => {
  it("classifies a gist with badge payloads but no contributor files as legacy", () => {
    const health = inspectSharedPublishHealth({
      gist: {
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({
          [AGENT_BADGE_GIST_FILE]: {
            content: `{
  "schemaVersion": 1,
  "label": "AI Usage",
  "message": "42 tokens",
  "color": "#E8A515"
}
`
          }
        })
      },
      state: defaultAgentBadgeState,
      now: "2026-03-30T12:00:00.000Z"
    });

    expect(health).toMatchObject({
      mode: "legacy",
      status: "healthy",
      remoteContributorCount: 0,
      hasSharedOverrides: false,
      conflictingSessionCount: 0,
      orphanedLocalPublisher: false,
      stalePublisherIds: []
    });
    expect(health.issues).toContain("legacy-no-contributors");
  });

  it("classifies a healthy shared gist with two contributor files", () => {
    const health = inspectSharedPublishHealth({
      gist: {
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({
          [buildContributorGistFileName("publisher-a")]: {
            content: createObservationContributorRecord({
              publisherId: "publisher-a",
              observations: {
                [buildSharedOverrideDigest("codex:session-a")]: {
                  sessionUpdatedAt: "2026-03-30T10:00:00.000Z",
                  attributionStatus: "included",
                  overrideDecision: null,
                  tokens: 21,
                  estimatedCostUsdMicros: null
                }
              }
            })
          },
          [buildContributorGistFileName("publisher-b")]: {
            content: createObservationContributorRecord({
              publisherId: "publisher-b",
              observations: {
                [buildSharedOverrideDigest("codex:session-b")]: {
                  sessionUpdatedAt: "2026-03-30T10:05:00.000Z",
                  attributionStatus: "included",
                  overrideDecision: null,
                  tokens: 42,
                  estimatedCostUsdMicros: null
                }
              }
            })
          },
          [AGENT_BADGE_OVERRIDES_GIST_FILE]: {
            content: createOverridesRecord()
          }
        })
      },
      state: {
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          publisherId: "publisher-a",
          mode: "shared"
        }
      },
      now: "2026-03-30T12:00:00.000Z"
    });

    expect(health).toMatchObject({
      mode: "shared",
      status: "healthy",
      remoteContributorCount: 2,
      hasSharedOverrides: true,
      conflictingSessionCount: 0,
      orphanedLocalPublisher: false,
      stalePublisherIds: []
    });
    expect(health.issues).toEqual([]);
  });

  it("marks the local publisher as orphaned when its contributor file is missing", () => {
    const health = inspectSharedPublishHealth({
      gist: {
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({
          [buildContributorGistFileName("publisher-remote")]: {
            content: createObservationContributorRecord({
              publisherId: "publisher-remote",
              observations: {
                [buildSharedOverrideDigest("codex:remote-session")]: {
                  sessionUpdatedAt: "2026-03-30T10:05:00.000Z",
                  attributionStatus: "included",
                  overrideDecision: null,
                  tokens: 42,
                  estimatedCostUsdMicros: null
                }
              }
            })
          },
          [AGENT_BADGE_OVERRIDES_GIST_FILE]: {
            content: createOverridesRecord()
          }
        })
      },
      state: {
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          publisherId: "publisher-local",
          mode: "shared"
        }
      },
      now: "2026-03-30T12:00:00.000Z"
    });

    expect(health.status).toBe("orphaned");
    expect(health.orphanedLocalPublisher).toBe(true);
    expect(health.issues).toContain("missing-local-contributor");
  });

  it("marks contributors older than seven days as stale", () => {
    const health = inspectSharedPublishHealth({
      gist: {
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({
          [buildContributorGistFileName("publisher-stale")]: {
            content: createObservationContributorRecord({
              publisherId: "publisher-stale",
              updatedAt: "2026-03-22T11:59:59.999Z",
              observations: {
                [buildSharedOverrideDigest("codex:stale-session")]: {
                  sessionUpdatedAt: "2026-03-22T11:59:59.999Z",
                  attributionStatus: "included",
                  overrideDecision: null,
                  tokens: 42,
                  estimatedCostUsdMicros: null
                }
              }
            })
          },
          [AGENT_BADGE_OVERRIDES_GIST_FILE]: {
            content: createOverridesRecord()
          }
        })
      },
      state: {
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          mode: "shared"
        }
      },
      now: "2026-03-30T12:00:00.000Z"
    });

    expect(health.status).toBe("stale");
    expect(health.stalePublisherIds).toEqual(["publisher-stale"]);
    expect(health.issues).toContain("stale-contributor");
  });

  it("marks disagreeing shared observations as conflict", () => {
    const sharedDigest = buildSharedOverrideDigest("codex:shared-session");

    const health = inspectSharedPublishHealth({
      gist: {
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({
          [buildContributorGistFileName("publisher-a")]: {
            content: createObservationContributorRecord({
              publisherId: "publisher-a",
              observations: {
                [sharedDigest]: {
                  sessionUpdatedAt: "2026-03-30T10:00:00.000Z",
                  attributionStatus: "included",
                  overrideDecision: null,
                  tokens: 21,
                  estimatedCostUsdMicros: null
                }
              }
            })
          },
          [buildContributorGistFileName("publisher-b")]: {
            content: createObservationContributorRecord({
              publisherId: "publisher-b",
              observations: {
                [sharedDigest]: {
                  sessionUpdatedAt: "2026-03-30T10:05:00.000Z",
                  attributionStatus: "ambiguous",
                  overrideDecision: "exclude",
                  tokens: 42,
                  estimatedCostUsdMicros: null
                }
              }
            })
          },
          [AGENT_BADGE_OVERRIDES_GIST_FILE]: {
            content: createOverridesRecord()
          }
        })
      },
      state: {
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          mode: "shared"
        }
      },
      now: "2026-03-30T12:00:00.000Z"
    });

    expect(health.status).toBe("conflict");
    expect(health.conflictingSessionCount).toBe(1);
    expect(health.issues).toContain("conflicting-session-observations");
  });
});
