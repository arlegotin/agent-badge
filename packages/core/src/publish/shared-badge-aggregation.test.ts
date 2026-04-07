import { describe, expect, it, vi } from "vitest";

import { defaultAgentBadgeConfig } from "../config/config-schema.js";
import { defaultAgentBadgeState } from "../state/state-schema.js";
import { AGENT_BADGE_GIST_FILE } from "./badge-url.js";
import { publishBadgeToGist } from "./publish-service.js";
import {
  AGENT_BADGE_OVERRIDES_GIST_FILE,
  buildSharedOverrideDigest,
  buildContributorGistFileName
} from "./shared-model.js";

function createPublishConfig() {
  return {
    ...defaultAgentBadgeConfig,
    badge: {
      ...defaultAgentBadgeConfig.badge,
      label: "AI Usage",
      mode: "tokens" as const
    },
    publish: {
      ...defaultAgentBadgeConfig.publish,
      gistId: "gist_123"
    }
  };
}

function createContributorRecord(options: {
  readonly publisherId: string;
  readonly updatedAt?: string;
  readonly sessions: number;
  readonly tokens: number;
  readonly estimatedCostUsdMicros: number | null;
}): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      publisherId: options.publisherId,
      updatedAt: options.updatedAt ?? "2026-03-30T12:00:00.000Z",
      totals: {
        sessions: options.sessions,
        tokens: options.tokens,
        estimatedCostUsdMicros: options.estimatedCostUsdMicros
      }
    },
    null,
    2
  )}\n`;
}

function createObservationContributorRecord(options: {
  readonly publisherId: string;
  readonly updatedAt?: string;
  readonly observations: Record<string, unknown>;
}): string {
  return `${JSON.stringify(
    {
      schemaVersion: 2,
      publisherId: options.publisherId,
      updatedAt: options.updatedAt ?? "2026-03-30T12:00:00.000Z",
      observations: options.observations
    },
    null,
    2
  )}\n`;
}

function createPublisherObservations(options: {
  readonly sessionPrefix: string;
  readonly sessions: number;
  readonly tokens: number;
  readonly estimatedCostUsdMicros: number | null;
}) {
  const sessions = Math.max(options.sessions, 1);
  const baseTokens = Math.floor(options.tokens / sessions);
  const remainderTokens = options.tokens % sessions;

  return Object.fromEntries(
    Array.from({ length: sessions }, (_, index) => [
      buildSharedOverrideDigest(`codex:${options.sessionPrefix}-${index + 1}`),
      {
        sessionUpdatedAt: "2026-03-30T10:05:00.000Z",
        attributionStatus: "included",
        overrideDecision: null,
        tokens: baseTokens + (index === 0 ? remainderTokens : 0),
        estimatedCostUsdMicros:
          index === 0 ? options.estimatedCostUsdMicros : null
      }
    ])
  );
}

function createGistFileMap(
  files: Record<string, { readonly content: string; readonly truncated?: boolean }>
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

function createOverridesRecord(): string {
  return `{
  "schemaVersion": 1,
  "overrides": {}
}
`;
}

function expectSharedPublishSequence(options: {
  readonly gistId: string;
  readonly updateGistFile: ReturnType<typeof vi.fn>;
  readonly localPublisherId: string;
  readonly expectedBadgeTokens: number;
  readonly expectedObservations: Record<string, unknown>;
}) {
  const writtenCalls = options.updateGistFile.mock.calls.map(
    ([call]) => call as { gistId: string; files: Record<string, { content: string }> }
  );
  const localContributorFileName = buildContributorGistFileName(
    options.localPublisherId
  );

  expect(writtenCalls).toHaveLength(3);
  expect(
    writtenCalls.map((call) => Object.keys(call.files))
  ).toEqual([
    [AGENT_BADGE_GIST_FILE],
    [localContributorFileName],
    [AGENT_BADGE_OVERRIDES_GIST_FILE]
  ]);
  expect(writtenCalls[0]).toEqual({
    gistId: options.gistId,
    files: {
      [AGENT_BADGE_GIST_FILE]: {
        content: `{
  "schemaVersion": 1,
  "label": "AI Usage",
  "message": "${options.expectedBadgeTokens} tokens",
  "color": "#D9A520"
}
`
      }
    }
  });
  expect(writtenCalls[1]?.gistId).toBe(options.gistId);
  expect(
    JSON.parse(writtenCalls[1]?.files?.[localContributorFileName]?.content ?? "")
  ).toEqual({
    schemaVersion: 2,
    publisherId: options.localPublisherId,
    updatedAt: expect.any(String),
    observations: options.expectedObservations
  });
  expect(writtenCalls[2]).toEqual({
    gistId: options.gistId,
    files: {
      [AGENT_BADGE_OVERRIDES_GIST_FILE]: {
        content: createOverridesRecord()
      }
    }
  });
}

describe("shared badge aggregation", () => {
  it("derives the badge payload from remote contributor totals", async () => {
    const localPublisherId = "publisher-local";
    const remotePublisherId = "publisher-remote";
    const getGist = vi
      .fn()
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({
          [buildContributorGistFileName(remotePublisherId)]: {
            content: createObservationContributorRecord({
              publisherId: remotePublisherId,
              observations: createPublisherObservations({
                sessionPrefix: "remote",
                sessions: 2,
                tokens: 20,
                estimatedCostUsdMicros: null
              })
            })
          }
        })
      })
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({
          [buildContributorGistFileName(localPublisherId)]: {
            content: createObservationContributorRecord({
              publisherId: localPublisherId,
              observations: createPublisherObservations({
                sessionPrefix: "local",
                sessions: 3,
                tokens: 30,
                estimatedCostUsdMicros: null
              })
            })
          },
          [buildContributorGistFileName(remotePublisherId)]: {
            content: createObservationContributorRecord({
              publisherId: remotePublisherId,
              observations: createPublisherObservations({
                sessionPrefix: "remote",
                sessions: 2,
                tokens: 20,
                estimatedCostUsdMicros: null
              })
            })
          },
          [AGENT_BADGE_OVERRIDES_GIST_FILE]: {
            content: createOverridesRecord()
          }
        })
      });
    const updateGistFile = vi.fn().mockResolvedValue({
      id: "gist_123",
      ownerLogin: "octocat",
      public: true,
      files: {}
    });

    await publishBadgeToGist({
      config: createPublishConfig(),
      state: {
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          gistId: "gist_123",
          publisherId: localPublisherId
        }
      },
      publisherObservations: createPublisherObservations({
        sessionPrefix: "local",
        sessions: 3,
        tokens: 30,
        estimatedCostUsdMicros: null
      }),
      client: {
        getGist,
        createPublicGist: vi.fn(),
        updateGistFile
      }
    });

    expectSharedPublishSequence({
      gistId: "gist_123",
      updateGistFile,
      localPublisherId,
      expectedBadgeTokens: 50,
      expectedObservations: createPublisherObservations({
        sessionPrefix: "local",
        sessions: 3,
        tokens: 30,
        estimatedCostUsdMicros: null
      })
    });
  });

  it("does not need the local includedTotals snapshot to contain every remote contributor", async () => {
    const localPublisherId = "publisher-local";
    const remotePublisherId = "publisher-remote";
    const getGist = vi
      .fn()
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({
          [buildContributorGistFileName(remotePublisherId)]: {
            content: createObservationContributorRecord({
              publisherId: remotePublisherId,
              observations: createPublisherObservations({
                sessionPrefix: "remote",
                sessions: 4,
                tokens: 88,
                estimatedCostUsdMicros: null
              })
            })
          }
        })
      })
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({
          [buildContributorGistFileName(localPublisherId)]: {
            content: createObservationContributorRecord({
              publisherId: localPublisherId,
              observations: createPublisherObservations({
                sessionPrefix: "local",
                sessions: 1,
                tokens: 12,
                estimatedCostUsdMicros: null
              })
            })
          },
          [buildContributorGistFileName(remotePublisherId)]: {
            content: createObservationContributorRecord({
              publisherId: remotePublisherId,
              observations: createPublisherObservations({
                sessionPrefix: "remote",
                sessions: 4,
                tokens: 88,
                estimatedCostUsdMicros: null
              })
            })
          },
          [AGENT_BADGE_OVERRIDES_GIST_FILE]: {
            content: createOverridesRecord()
          }
        })
      });
    const updateGistFile = vi.fn().mockResolvedValue({
      id: "gist_123",
      ownerLogin: "octocat",
      public: true,
      files: {}
    });

    await publishBadgeToGist({
      config: createPublishConfig(),
      state: {
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          gistId: "gist_123",
          publisherId: localPublisherId
        }
      },
      publisherObservations: createPublisherObservations({
        sessionPrefix: "local",
        sessions: 1,
        tokens: 12,
        estimatedCostUsdMicros: null
      }),
      client: {
        getGist,
        createPublicGist: vi.fn(),
        updateGistFile
      }
    });

    expectSharedPublishSequence({
      gistId: "gist_123",
      updateGistFile,
      localPublisherId,
      expectedBadgeTokens: 100,
      expectedObservations: createPublisherObservations({
        sessionPrefix: "local",
        sessions: 1,
        tokens: 12,
        estimatedCostUsdMicros: null
      })
    });
  });

  it("higher-watermark duplicate session is counted once", async () => {
    const sharedDigest = buildSharedOverrideDigest("codex:shared-session");
    const localPublisherId = "publisher-local";
    const remotePublisherId = "publisher-remote";
    const getGist = vi
      .fn()
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({
          [buildContributorGistFileName(remotePublisherId)]: {
            content: createObservationContributorRecord({
              publisherId: remotePublisherId,
              observations: {
                [sharedDigest]: {
                  sessionUpdatedAt: "2026-03-30T10:04:00.000Z",
                  attributionStatus: "included",
                  overrideDecision: null,
                  tokens: 18,
                  estimatedCostUsdMicros: null
                }
              }
            })
          }
        })
      })
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({
          [buildContributorGistFileName(localPublisherId)]: {
            content: createObservationContributorRecord({
              publisherId: localPublisherId,
              updatedAt: "2026-03-30T12:00:00.000Z",
              observations: {
                [sharedDigest]: {
                  sessionUpdatedAt: "2026-03-30T10:05:00.000Z",
                  attributionStatus: "included",
                  overrideDecision: null,
                  tokens: 30,
                  estimatedCostUsdMicros: null
                }
              }
            })
          },
          [buildContributorGistFileName(remotePublisherId)]: {
            content: createObservationContributorRecord({
              publisherId: remotePublisherId,
              observations: {
                [sharedDigest]: {
                  sessionUpdatedAt: "2026-03-30T10:04:00.000Z",
                  attributionStatus: "included",
                  overrideDecision: null,
                  tokens: 18,
                  estimatedCostUsdMicros: null
                }
              }
            })
          },
          [AGENT_BADGE_OVERRIDES_GIST_FILE]: {
            content: createOverridesRecord()
          }
        })
      });
    const updateGistFile = vi.fn().mockResolvedValue({
      id: "gist_123",
      ownerLogin: "octocat",
      public: true,
      files: {}
    });

    await publishBadgeToGist({
      config: createPublishConfig(),
      state: {
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          gistId: "gist_123",
          publisherId: localPublisherId
        }
      },
      publisherObservations: {
        [sharedDigest]: {
          sessionUpdatedAt: "2026-03-30T10:05:00.000Z",
          attributionStatus: "included",
          overrideDecision: null,
          tokens: 30,
          estimatedCostUsdMicros: null
        }
      },
      client: {
        getGist,
        createPublicGist: vi.fn(),
        updateGistFile
      }
    });

    expectSharedPublishSequence({
      gistId: "gist_123",
      updateGistFile,
      localPublisherId,
      expectedBadgeTokens: 30,
      expectedObservations: {
        [sharedDigest]: {
          sessionUpdatedAt: "2026-03-30T10:05:00.000Z",
          attributionStatus: "included",
          overrideDecision: null,
          tokens: 30,
          estimatedCostUsdMicros: null
        }
      }
    });
  });
});
