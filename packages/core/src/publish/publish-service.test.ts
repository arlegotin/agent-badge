import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defaultAgentBadgeConfig } from "../config/config-schema.js";
import { parseNormalizedSessionSummary } from "../providers/session-summary.js";
import { defaultAgentBadgeState } from "../state/state-schema.js";
import {
  AGENT_BADGE_COMBINED_GIST_FILE,
  AGENT_BADGE_COST_GIST_FILE,
  AGENT_BADGE_GIST_FILE,
  AGENT_BADGE_TOKENS_GIST_FILE
} from "./badge-url.js";
import {
  AGENT_BADGE_OVERRIDES_GIST_FILE,
  buildContributorGistFileName,
  buildSharedOverrideDigest
} from "./shared-model.js";
import {
  publishBadgeIfChanged,
  publishBadgeToGist
} from "./publish-service.js";

function createSession(options: {
  readonly provider: "codex" | "claude";
  readonly providerSessionId: string;
  readonly cwd?: string | null;
  readonly tokenTotal: number;
}) {
  return parseNormalizedSessionSummary({
    provider: options.provider,
    providerSessionId: options.providerSessionId,
    startedAt: "2026-03-30T10:00:00Z",
    updatedAt: "2026-03-30T10:05:00Z",
    cwd: options.cwd ?? "/Users/example/project",
    gitBranch: "main",
    observedRemoteUrl: "git@github.com:example/agent-badge.git",
    observedRemoteUrlNormalized: "https://github.com/example/agent-badge",
    attributionHints: {
      cwdRealPath: options.cwd ?? "/Users/example/project",
      transcriptProjectKey: "Users-example-project"
    },
    tokenUsage: {
      total: options.tokenTotal,
      input: options.tokenTotal,
      output: 0,
      cacheCreation: null,
      cacheRead: null,
      reasoningOutput: null
    },
    lineage: {
      parentSessionId: null,
      kind: "root"
    },
    metadata: {
      model: "gpt-5",
      modelProvider: "openai",
      sourceKind: "sqlite",
      cliVersion: "1.0.0"
    }
  });
}

function createPublishConfig(overrides?: Partial<typeof defaultAgentBadgeConfig.badge>) {
  return {
    ...defaultAgentBadgeConfig,
    badge: {
      ...defaultAgentBadgeConfig.badge,
      ...overrides
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
}) {
  return JSON.stringify(
    {
      schemaVersion: 1,
      publisherId: options.publisherId,
      updatedAt: options.updatedAt ?? "2026-03-30T11:00:00.000Z",
      totals: {
        sessions: options.sessions,
        tokens: options.tokens,
        estimatedCostUsdMicros: options.estimatedCostUsdMicros
      }
    },
    null,
    2
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

function createPublisherObservations(options: {
  readonly sessionPrefix: string;
  readonly sessions: number;
  readonly tokens: number;
  readonly estimatedCostUsdMicros: number | null;
  readonly updatedAt?: string;
  readonly status?: "included" | "ambiguous" | "excluded";
  readonly overrideDecision?: "include" | "exclude" | null;
}) {
  const sessions = Math.max(options.sessions, 1);
  const baseTokens = Math.floor(options.tokens / sessions);
  const remainderTokens = options.tokens % sessions;

  return Object.fromEntries(
    Array.from({ length: sessions }, (_, index) => {
      const digest = buildSharedOverrideDigest(
        `codex:${options.sessionPrefix}-${index + 1}`
      );

      return [
        digest,
        {
          sessionUpdatedAt: options.updatedAt ?? "2026-03-30T10:05:00.000Z",
          attributionStatus: options.status ?? "included",
          overrideDecision: options.overrideDecision ?? null,
          tokens: baseTokens + (index === 0 ? remainderTokens : 0),
          estimatedCostUsdMicros:
            index === 0 ? options.estimatedCostUsdMicros : null
        }
      ];
    })
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

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-30T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("publishBadgeToGist", () => {
  it("publishes an aggregate-only badge payload to the deterministic gist file", async () => {
    const includedSession = createSession({
      provider: "codex",
      providerSessionId: "included-1",
      cwd: "/Users/example/project",
      tokenTotal: 42
    });
    const publisherId = "publisher-local";
    const getGist = vi
      .fn()
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({})
      })
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({
          [buildContributorGistFileName(publisherId)]: {
            content: createObservationContributorRecord({
              publisherId,
              updatedAt: "2026-03-30T12:00:00.000Z",
              observations: createPublisherObservations({
                sessionPrefix: "included",
                sessions: 1,
                tokens: includedSession.tokenUsage.total,
                estimatedCostUsdMicros: null,
                updatedAt: "2026-03-30T10:05:00.000Z"
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

    const nextState = await publishBadgeToGist({
      config: createPublishConfig({
        label: "AI Usage",
        mode: "tokens"
      }),
      state: {
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          publisherId
        }
      } as typeof defaultAgentBadgeState,
      publisherObservations: createPublisherObservations({
        sessionPrefix: "included",
        sessions: 1,
        tokens: includedSession.tokenUsage.total,
        estimatedCostUsdMicros: null,
        updatedAt: "2026-03-30T10:05:00.000Z"
      }),
      client: {
        getGist,
        createPublicGist: vi.fn(),
        updateGistFile
      }
    });

    const serializedPayload = `{
  "schemaVersion": 1,
  "label": "AI Usage",
  "message": "42 tokens",
  "color": "blue"
}
`;

    expect(updateGistFile).toHaveBeenLastCalledWith({
      gistId: "gist_123",
      files: {
        "agent-badge.json": {
          content: serializedPayload
        }
      }
    });
    const parsedPayload = JSON.parse(serializedPayload) as Record<string, unknown>;
    expect(Object.keys(parsedPayload).sort()).toEqual([
      "color",
      "label",
      "message",
      "schemaVersion"
    ]);
    expect(serializedPayload).not.toContain("included-1");
    expect(serializedPayload).not.toContain("/Users/example/project");
    expect(serializedPayload).not.toContain("prompt");
    expect(serializedPayload).not.toContain("transcript");
    expect(serializedPayload).not.toContain("cwd");
    expect(serializedPayload).not.toContain("path");
    expect(serializedPayload).not.toContain("reason");
    expect(nextState.publish).toEqual({
      status: "published",
      gistId: "gist_123",
      lastPublishedHash: createHash("sha256")
        .update(serializedPayload)
        .digest("hex"),
      lastPublishedAt: "2026-03-30T12:00:00.000Z",
      publisherId,
      mode: "shared"
    });
  });

  it("publishes live preview payloads for every badge mode when cost totals are available", async () => {
    const publisherId = "publisher-local";
    const getGist = vi
      .fn()
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({})
      })
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({
          [buildContributorGistFileName(publisherId)]: {
            content: createObservationContributorRecord({
              publisherId,
              updatedAt: "2026-03-30T12:00:00.000Z",
              observations: createPublisherObservations({
                sessionPrefix: "combined",
                sessions: 1,
                tokens: 42,
                estimatedCostUsdMicros: 57_500_000,
                updatedAt: "2026-03-30T10:05:00.000Z"
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
      config: createPublishConfig({
        label: "AI Usage",
        mode: "combined"
      }),
      state: {
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          publisherId
        }
      } as typeof defaultAgentBadgeState,
      publisherObservations: createPublisherObservations({
        sessionPrefix: "combined",
        sessions: 1,
        tokens: 42,
        estimatedCostUsdMicros: 57_500_000,
        updatedAt: "2026-03-30T10:05:00.000Z"
      }),
      client: {
        getGist,
        createPublicGist: vi.fn(),
        updateGistFile
      }
    });

    expect(updateGistFile).toHaveBeenLastCalledWith({
      gistId: "gist_123",
      files: {
        [AGENT_BADGE_GIST_FILE]: {
          content: `{
  "schemaVersion": 1,
  "label": "AI Usage",
  "message": "42 tokens | $57.5",
  "color": "blue"
}
`
        },
        [AGENT_BADGE_COMBINED_GIST_FILE]: {
          content: `{
  "schemaVersion": 1,
  "label": "AI Usage",
  "message": "42 tokens | $57.5",
  "color": "blue"
}
`
        },
        [AGENT_BADGE_TOKENS_GIST_FILE]: {
          content: `{
  "schemaVersion": 1,
  "label": "AI Usage",
  "message": "42 tokens",
  "color": "blue"
}
`
        },
        [AGENT_BADGE_COST_GIST_FILE]: {
          content: `{
  "schemaVersion": 1,
  "label": "AI Usage",
  "message": "$57.5",
  "color": "blue"
}
`
        }
      }
    });
  });

  it("fails when a gist target is not configured", async () => {
    await expect(
      publishBadgeToGist({
        config: defaultAgentBadgeConfig,
        state: defaultAgentBadgeState,
        publisherObservations: {},
        client: {
          getGist: vi.fn(),
          createPublicGist: vi.fn(),
          updateGistFile: vi.fn()
        }
      })
    ).rejects.toThrow(
      "Cannot publish badge JSON without a configured gist id."
    );
  });

  it("derives shared totals from two remote contributor files", async () => {
    const publisherId = "publisher-local";
    const contributorFile = buildContributorGistFileName(publisherId);
    const otherContributorFile = buildContributorGistFileName("publisher-remote");
    const overridesFile = AGENT_BADGE_OVERRIDES_GIST_FILE;
    const getGist = vi
      .fn()
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({
          [contributorFile]: {
            content: createObservationContributorRecord({
              publisherId,
              observations: createPublisherObservations({
                sessionPrefix: "local",
                sessions: 1,
                tokens: 10,
                estimatedCostUsdMicros: null
              })
            })
          },
          [otherContributorFile]: {
            content: createObservationContributorRecord({
              publisherId: "publisher-remote",
              observations: createPublisherObservations({
                sessionPrefix: "remote",
                sessions: 2,
                tokens: 20,
                estimatedCostUsdMicros: null
              })
            })
          },
          [overridesFile]: {
            content: createOverridesRecord()
          }
        })
      })
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({
          [contributorFile]: {
            content: createObservationContributorRecord({
              publisherId,
              updatedAt: "2026-03-30T12:00:00.000Z",
              observations: createPublisherObservations({
                sessionPrefix: "local",
                sessions: 3,
                tokens: 30,
                estimatedCostUsdMicros: null
              })
            })
          },
          [otherContributorFile]: {
            content: createObservationContributorRecord({
              publisherId: "publisher-remote",
              observations: createPublisherObservations({
                sessionPrefix: "remote",
                sessions: 2,
                tokens: 20,
                estimatedCostUsdMicros: null
              })
            })
          },
          [overridesFile]: {
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
      config: createPublishConfig({
        label: "AI Usage",
        mode: "tokens"
      }),
      state: {
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          gistId: "gist_123",
          publisherId
        }
      } as typeof defaultAgentBadgeState,
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

    expect(updateGistFile).toHaveBeenLastCalledWith({
      gistId: "gist_123",
      files: {
        "agent-badge.json": {
          content: `{
  "schemaVersion": 1,
  "label": "AI Usage",
  "message": "50 tokens",
  "color": "blue"
}
`
        }
      }
    });
  });

  it("replaces the local publisher contribution without deleting another publisher file", async () => {
    const publisherId = "publisher-local";
    const localContributorFile = buildContributorGistFileName(publisherId);
    const otherContributorFile = buildContributorGistFileName("publisher-remote");
    const sharedOverrideKey = buildSharedOverrideDigest("codex:session-1");
    const getGist = vi
      .fn()
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({
          [localContributorFile]: {
            content: createObservationContributorRecord({
              publisherId,
              observations: createPublisherObservations({
                sessionPrefix: "local",
                sessions: 1,
                tokens: 10,
                estimatedCostUsdMicros: null
              })
            })
          },
          [otherContributorFile]: {
            content: createObservationContributorRecord({
              publisherId: "publisher-remote",
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
      })
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({
          [localContributorFile]: {
            content: createObservationContributorRecord({
              publisherId,
              updatedAt: "2026-03-30T12:00:00.000Z",
              observations: createPublisherObservations({
                sessionPrefix: "local",
                sessions: 3,
                tokens: 30,
                estimatedCostUsdMicros: null
              })
            })
          },
          [otherContributorFile]: {
            content: createObservationContributorRecord({
              publisherId: "publisher-remote",
              observations: createPublisherObservations({
                sessionPrefix: "remote",
                sessions: 2,
                tokens: 20,
                estimatedCostUsdMicros: null
              })
            })
          },
          [AGENT_BADGE_OVERRIDES_GIST_FILE]: {
            content: createOverridesRecord({
              [sharedOverrideKey]: {
                decision: "include",
                updatedAt: "2026-03-30T12:00:00.000Z",
                updatedByPublisherId: publisherId
              }
            })
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
      config: createPublishConfig({
        label: "AI Usage",
        mode: "tokens"
      }),
      state: {
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          gistId: "gist_123",
          publisherId
        },
        overrides: {
          ambiguousSessions: {
            "codex:session-1": "include"
          }
        }
      } as typeof defaultAgentBadgeState,
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

    expect(updateGistFile).toHaveBeenCalledWith({
      gistId: "gist_123",
      files: {
        [localContributorFile]: {
          content: createObservationContributorRecord({
            publisherId,
            updatedAt: "2026-03-30T12:00:00.000Z",
            observations: createPublisherObservations({
              sessionPrefix: "local",
              sessions: 3,
              tokens: 30,
              estimatedCostUsdMicros: null
            })
          }) + "\n"
        }
      }
    });
    expect(updateGistFile).not.toHaveBeenCalledWith({
      gistId: "gist_123",
      files: expect.objectContaining({
        [otherContributorFile]: expect.anything()
      })
    });
  });

  it("rejects truncated shared contributor or overrides files", async () => {
    const getGist = vi.fn().mockResolvedValue({
      id: "gist_123",
      ownerLogin: "octocat",
      public: true,
      files: createGistFileMap({
        [buildContributorGistFileName("publisher-remote")]: {
          content: createContributorRecord({
            publisherId: "publisher-remote",
            sessions: 2,
            tokens: 20,
            estimatedCostUsdMicros: null
          }),
          truncated: true
        },
        [AGENT_BADGE_OVERRIDES_GIST_FILE]: {
          content: createOverridesRecord(),
          truncated: true
        }
      })
    });
    const updateGistFile = vi.fn();

    await expect(
      publishBadgeToGist({
        config: createPublishConfig({
          label: "AI Usage",
          mode: "tokens"
        }),
        state: {
          ...defaultAgentBadgeState,
          publish: {
            ...defaultAgentBadgeState.publish,
            gistId: "gist_123",
            publisherId: "publisher-local"
          }
        } as typeof defaultAgentBadgeState,
        publisherObservations: createPublisherObservations({
          sessionPrefix: "truncated",
          sessions: 3,
          tokens: 30,
          estimatedCostUsdMicros: null
        }),
        client: {
          getGist,
          createPublicGist: vi.fn(),
          updateGistFile
        }
      })
    ).rejects.toThrow("Shared gist files cannot be loaded from truncated content.");

    expect(updateGistFile).not.toHaveBeenCalled();
  });

  it("rejects a shared overrides file that contains a raw provider session key", async () => {
    const getGist = vi.fn().mockResolvedValue({
      id: "gist_123",
      ownerLogin: "octocat",
      public: true,
      files: createGistFileMap({
        [AGENT_BADGE_OVERRIDES_GIST_FILE]: {
          content: createOverridesRecord({
            "codex:session-1": {
              decision: "include",
              updatedAt: "2026-03-30T12:00:00.000Z",
              updatedByPublisherId: "publisher-remote"
            }
          })
        }
      })
    });
    const updateGistFile = vi.fn();

    await expect(
      publishBadgeToGist({
        config: createPublishConfig({
          label: "AI Usage",
          mode: "tokens"
        }),
        state: {
          ...defaultAgentBadgeState,
          publish: {
            ...defaultAgentBadgeState.publish,
            gistId: "gist_123",
            publisherId: "publisher-local"
          }
        } as typeof defaultAgentBadgeState,
        publisherObservations: createPublisherObservations({
          sessionPrefix: "invalid-override",
          sessions: 1,
          tokens: 42,
          estimatedCostUsdMicros: null
        }),
        client: {
          getGist,
          createPublicGist: vi.fn(),
          updateGistFile
        }
      })
    ).rejects.toThrow(
      "Shared overrides file contained a raw or invalid session key."
    );

    expect(updateGistFile).not.toHaveBeenCalled();
  });
});

describe("publishBadgeIfChanged", () => {
  it("writes the local publisher observation map with schemaVersion 2", async () => {
    const publisherId = "publisher-local";
    const sessionDigest = buildSharedOverrideDigest("codex:included-1");
    const getGist = vi
      .fn()
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({})
      })
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({
          [buildContributorGistFileName(publisherId)]: {
            content: createObservationContributorRecord({
              publisherId,
              updatedAt: "2026-03-30T12:00:00.000Z",
              observations: {
                [sessionDigest]: {
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
      });
    const updateGistFile = vi.fn().mockResolvedValue({
      id: "gist_123",
      ownerLogin: "octocat",
      public: true,
      files: {}
    });

    await publishBadgeIfChanged({
      config: createPublishConfig({
        label: "AI Usage",
        mode: "tokens"
      }),
      state: {
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          publisherId
        }
      } as typeof defaultAgentBadgeState,
      publisherObservations: {
        [sessionDigest]: {
          sessionUpdatedAt: "2026-03-30T10:05:00.000Z",
          attributionStatus: "included",
          overrideDecision: null,
          tokens: 42,
          estimatedCostUsdMicros: null
        }
      },
      client: {
        getGist,
        createPublicGist: vi.fn(),
        updateGistFile
      },
      now: "2026-03-30T12:00:00.000Z",
      skipIfUnchanged: false
    });

    const contributorContent = updateGistFile.mock.calls[0]?.[0]?.files?.[
      buildContributorGistFileName(publisherId)
    ]?.content;

    expect(JSON.parse(contributorContent)).toEqual({
      schemaVersion: 2,
      publisherId,
      updatedAt: "2026-03-30T12:00:00.000Z",
      observations: {
        [sessionDigest]: {
          sessionUpdatedAt: "2026-03-30T10:05:00.000Z",
          attributionStatus: "included",
          overrideDecision: null,
          tokens: 42,
          estimatedCostUsdMicros: null
        }
      }
    });
  });

  it("uses the local publisher observations when the follow-up gist read is stale", async () => {
    const publisherId = "publisher-local";
    const getGist = vi
      .fn()
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({})
      })
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({})
      });
    const updateGistFile = vi.fn().mockResolvedValue({
      id: "gist_123",
      ownerLogin: "octocat",
      public: true,
      files: {}
    });

    const result = await publishBadgeIfChanged({
      config: createPublishConfig({
        label: "AI Usage",
        mode: "combined"
      }),
      state: {
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          publisherId
        }
      } as typeof defaultAgentBadgeState,
      publisherObservations: createPublisherObservations({
        sessionPrefix: "stale-read",
        sessions: 1,
        tokens: 42,
        estimatedCostUsdMicros: 0,
        updatedAt: "2026-03-30T10:05:00.000Z"
      }),
      client: {
        getGist,
        createPublicGist: vi.fn(),
        updateGistFile
      },
      now: "2026-03-30T12:00:00.000Z",
      skipIfUnchanged: false
    });

    expect(result.state.publish).toMatchObject({
      status: "published",
      gistId: "gist_123",
      publisherId,
      mode: "shared"
    });
    expect(updateGistFile).toHaveBeenLastCalledWith({
      gistId: "gist_123",
      files: {
        [AGENT_BADGE_GIST_FILE]: {
          content: `{
  "schemaVersion": 1,
  "label": "AI Usage",
  "message": "42 tokens | $0",
  "color": "blue"
}
`
        },
        [AGENT_BADGE_COMBINED_GIST_FILE]: {
          content: `{
  "schemaVersion": 1,
  "label": "AI Usage",
  "message": "42 tokens | $0",
  "color": "blue"
}
`
        },
        [AGENT_BADGE_TOKENS_GIST_FILE]: {
          content: `{
  "schemaVersion": 1,
  "label": "AI Usage",
  "message": "42 tokens",
  "color": "blue"
}
`
        },
        [AGENT_BADGE_COST_GIST_FILE]: {
          content: `{
  "schemaVersion": 1,
  "label": "AI Usage",
  "message": "$0",
  "color": "lightgrey"
}
`
        }
      }
    });
  });

  it("publishes zero-cost combined payloads when no included usage exists yet", async () => {
    const publisherId = "publisher-local";
    const getGist = vi
      .fn()
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({})
      })
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({})
      });
    const updateGistFile = vi.fn().mockResolvedValue({
      id: "gist_123",
      ownerLogin: "octocat",
      public: true,
      files: {}
    });

    const result = await publishBadgeIfChanged({
      config: createPublishConfig({
        label: "AI Usage",
        mode: "combined"
      }),
      state: {
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          publisherId
        }
      } as typeof defaultAgentBadgeState,
      publisherObservations: {},
      client: {
        getGist,
        createPublicGist: vi.fn(),
        updateGistFile
      },
      now: "2026-03-30T12:00:00.000Z",
      skipIfUnchanged: false
    });

    expect(result.state.publish).toMatchObject({
      status: "published",
      gistId: "gist_123",
      publisherId,
      mode: "shared"
    });
    expect(updateGistFile).toHaveBeenLastCalledWith({
      gistId: "gist_123",
      files: {
        [AGENT_BADGE_GIST_FILE]: {
          content: `{
  "schemaVersion": 1,
  "label": "AI Usage",
  "message": "0 tokens | $0",
  "color": "lightgrey"
}
`
        },
        [AGENT_BADGE_COMBINED_GIST_FILE]: {
          content: `{
  "schemaVersion": 1,
  "label": "AI Usage",
  "message": "0 tokens | $0",
  "color": "lightgrey"
}
`
        },
        [AGENT_BADGE_TOKENS_GIST_FILE]: {
          content: `{
  "schemaVersion": 1,
  "label": "AI Usage",
  "message": "0 tokens",
  "color": "lightgrey"
}
`
        },
        [AGENT_BADGE_COST_GIST_FILE]: {
          content: `{
  "schemaVersion": 1,
  "label": "AI Usage",
  "message": "$0",
  "color": "lightgrey"
}
`
        }
      }
    });
  });

  it("schema-version-1 contributor files are ignored for authoritative totals", async () => {
    const publisherId = "publisher-local";
    const legacyPublisherId = "publisher-legacy";
    const sessionDigest = buildSharedOverrideDigest("codex:included-1");
    const getGist = vi
      .fn()
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({
          [buildContributorGistFileName(legacyPublisherId)]: {
            content: createContributorRecord({
              publisherId: legacyPublisherId,
              sessions: 9,
              tokens: 900,
              estimatedCostUsdMicros: null
            })
          }
        })
      })
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({
          [buildContributorGistFileName(legacyPublisherId)]: {
            content: createContributorRecord({
              publisherId: legacyPublisherId,
              sessions: 9,
              tokens: 900,
              estimatedCostUsdMicros: null
            })
          },
          [buildContributorGistFileName(publisherId)]: {
            content: createObservationContributorRecord({
              publisherId,
              updatedAt: "2026-03-30T12:00:00.000Z",
              observations: {
                [sessionDigest]: {
                  sessionUpdatedAt: "2026-03-30T10:05:00.000Z",
                  attributionStatus: "included",
                  overrideDecision: null,
                  tokens: 12,
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

    await publishBadgeIfChanged({
      config: createPublishConfig({
        label: "AI Usage",
        mode: "tokens"
      }),
      state: {
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          publisherId
        }
      } as typeof defaultAgentBadgeState,
      publisherObservations: {
        [sessionDigest]: {
          sessionUpdatedAt: "2026-03-30T10:05:00.000Z",
          attributionStatus: "included",
          overrideDecision: null,
          tokens: 12,
          estimatedCostUsdMicros: null
        }
      },
      client: {
        getGist,
        createPublicGist: vi.fn(),
        updateGistFile
      },
      now: "2026-03-30T12:00:00.000Z",
      skipIfUnchanged: false
    });

    expect(updateGistFile).toHaveBeenLastCalledWith({
      gistId: "gist_123",
      files: {
        [AGENT_BADGE_GIST_FILE]: {
          content: `{
  "schemaVersion": 1,
  "label": "AI Usage",
  "message": "12 tokens",
  "color": "blue"
}
`
        }
      }
    });
  });

  it("skips remote update when the payload hash matches", async () => {
    const serializedPayload = `{
  "schemaVersion": 1,
  "label": "AI Usage",
  "message": "42 tokens",
  "color": "blue"
}
`;
    const existingHash = createHash("sha256")
      .update(serializedPayload)
      .digest("hex");
    const publisherId = "publisher-local";
    const getGist = vi
      .fn()
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({})
      })
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({
          [buildContributorGistFileName(publisherId)]: {
            content: createObservationContributorRecord({
              publisherId,
              updatedAt: "2026-03-30T12:05:00Z",
              observations: createPublisherObservations({
                sessionPrefix: "skip",
                sessions: 1,
                tokens: 42,
                estimatedCostUsdMicros: null,
                updatedAt: "2026-03-30T10:05:00.000Z"
              })
            })
          },
          [AGENT_BADGE_OVERRIDES_GIST_FILE]: {
            content: createOverridesRecord()
          }
        })
      });
    const updateGistFile = vi.fn();

    const result = await publishBadgeIfChanged({
      config: createPublishConfig({
        label: "AI Usage",
        mode: "tokens"
      }),
      state: {
        ...defaultAgentBadgeState,
        publish: {
          status: "published",
          gistId: "gist_123",
          lastPublishedHash: existingHash,
          lastPublishedAt: "2026-03-30T10:00:00Z",
          publisherId
        }
      } as typeof defaultAgentBadgeState,
      publisherObservations: createPublisherObservations({
        sessionPrefix: "skip",
        sessions: 1,
        tokens: 42,
        estimatedCostUsdMicros: null,
        updatedAt: "2026-03-30T10:05:00.000Z"
      }),
      client: {
        getGist,
        createPublicGist: vi.fn(),
        updateGistFile
      },
      now: "2026-03-30T12:05:00Z",
      skipIfUnchanged: true
    });

    expect(updateGistFile).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      decision: "skipped",
      state: {
        ...defaultAgentBadgeState,
        publish: {
          status: "published",
          gistId: "gist_123",
          lastPublishedHash: existingHash,
          lastPublishedAt: "2026-03-30T10:00:00Z",
          publisherId,
          mode: "shared"
        }
      }
    });
  });

  it("publishes when the label changes", async () => {
    const previousPayload = `{
  "schemaVersion": 1,
  "label": "AI Usage",
  "message": "42 tokens",
  "color": "blue"
}
`;
    const publisherId = "publisher-local";
    const getGist = vi
      .fn()
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({})
      })
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({
          [buildContributorGistFileName(publisherId)]: {
            content: createObservationContributorRecord({
              publisherId,
              updatedAt: "2026-03-30T12:05:00Z",
              observations: createPublisherObservations({
                sessionPrefix: "label",
                sessions: 1,
                tokens: 42,
                estimatedCostUsdMicros: null,
                updatedAt: "2026-03-30T10:05:00.000Z"
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

    const result = await publishBadgeIfChanged({
      config: createPublishConfig({
        label: "Agent Usage",
        mode: "tokens"
      }),
      state: {
        ...defaultAgentBadgeState,
        publish: {
          status: "published",
          gistId: "gist_123",
          lastPublishedHash: createHash("sha256")
            .update(previousPayload)
            .digest("hex"),
          lastPublishedAt: "2026-03-30T10:00:00Z",
          publisherId
        }
      } as typeof defaultAgentBadgeState,
      publisherObservations: createPublisherObservations({
        sessionPrefix: "label",
        sessions: 1,
        tokens: 42,
        estimatedCostUsdMicros: null,
        updatedAt: "2026-03-30T10:05:00.000Z"
      }),
      client: {
        getGist,
        createPublicGist: vi.fn(),
        updateGistFile
      },
      now: "2026-03-30T12:05:00Z",
      skipIfUnchanged: true
    });

    expect(updateGistFile).toHaveBeenLastCalledWith({
      gistId: "gist_123",
      files: {
        "agent-badge.json": {
          content: `{
  "schemaVersion": 1,
  "label": "Agent Usage",
  "message": "42 tokens",
  "color": "blue"
}
`
        }
      }
    });
    expect(result.decision).toBe("published");
    expect(result.state.publish.lastPublishedAt).toBe("2026-03-30T12:05:00Z");
    expect(result.state.publish).toMatchObject({
      publisherId,
      mode: "shared"
    });
  });

  it("repeated publishes converge to the same badge payload", async () => {
    const sharedDigest = buildSharedOverrideDigest("codex:shared-session");
    const buildClient = (publisherId: string, firstRemotePublisherId: string) => {
      const updateGistFile = vi.fn().mockResolvedValue({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: {}
      });
      const getGist = vi
        .fn()
        .mockResolvedValueOnce({
          id: "gist_123",
          ownerLogin: "octocat",
          public: true,
          files: createGistFileMap({
            [buildContributorGistFileName(firstRemotePublisherId)]: {
              content: createObservationContributorRecord({
                publisherId: firstRemotePublisherId,
                observations: {
                  [sharedDigest]: {
                    sessionUpdatedAt: "2026-03-30T10:05:00.000Z",
                    attributionStatus: "included",
                    overrideDecision: null,
                    tokens: 42,
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
            [buildContributorGistFileName(firstRemotePublisherId)]: {
              content: createObservationContributorRecord({
                publisherId: firstRemotePublisherId,
                observations: {
                  [sharedDigest]: {
                    sessionUpdatedAt: "2026-03-30T10:05:00.000Z",
                    attributionStatus: "included",
                    overrideDecision: null,
                    tokens: 42,
                    estimatedCostUsdMicros: null
                  }
                }
              })
            },
            [buildContributorGistFileName(publisherId)]: {
              content: createObservationContributorRecord({
                publisherId,
                updatedAt: "2026-03-30T12:00:00.000Z",
                observations: {
                  [sharedDigest]: {
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
        });

      return { getGist, updateGistFile };
    };

    const first = buildClient("publisher-a", "publisher-b");
    await publishBadgeIfChanged({
      config: createPublishConfig({
        label: "AI Usage",
        mode: "tokens"
      }),
      state: {
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          publisherId: "publisher-a"
        }
      } as typeof defaultAgentBadgeState,
      publisherObservations: {
        [sharedDigest]: {
          sessionUpdatedAt: "2026-03-30T10:05:00.000Z",
          attributionStatus: "included",
          overrideDecision: null,
          tokens: 42,
          estimatedCostUsdMicros: null
        }
      },
      client: {
        getGist: first.getGist,
        createPublicGist: vi.fn(),
        updateGistFile: first.updateGistFile
      },
      now: "2026-03-30T12:00:00.000Z",
      skipIfUnchanged: false
    });

    const second = buildClient("publisher-b", "publisher-a");
    await publishBadgeIfChanged({
      config: createPublishConfig({
        label: "AI Usage",
        mode: "tokens"
      }),
      state: {
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          publisherId: "publisher-b"
        }
      } as typeof defaultAgentBadgeState,
      publisherObservations: {
        [sharedDigest]: {
          sessionUpdatedAt: "2026-03-30T10:05:00.000Z",
          attributionStatus: "included",
          overrideDecision: null,
          tokens: 42,
          estimatedCostUsdMicros: null
        }
      },
      client: {
        getGist: second.getGist,
        createPublicGist: vi.fn(),
        updateGistFile: second.updateGistFile
      },
      now: "2026-03-30T12:00:00.000Z",
      skipIfUnchanged: false
    });

    const firstPayload =
      first.updateGistFile.mock.calls.at(-1)?.[0]?.files?.[AGENT_BADGE_GIST_FILE]
        ?.content;
    const secondPayload =
      second.updateGistFile.mock.calls.at(-1)?.[0]?.files?.[AGENT_BADGE_GIST_FILE]
        ?.content;

    expect(firstPayload).toBe(secondPayload);
  });

  it("duplicate sessions from two publishers are counted once", async () => {
    const sharedDigest = buildSharedOverrideDigest("codex:shared-session");
    const publisherId = "publisher-local";
    const getGist = vi
      .fn()
      .mockResolvedValueOnce({
        id: "gist_123",
        ownerLogin: "octocat",
        public: true,
        files: createGistFileMap({
          [buildContributorGistFileName("publisher-remote")]: {
            content: createObservationContributorRecord({
              publisherId: "publisher-remote",
              observations: {
                [sharedDigest]: {
                  sessionUpdatedAt: "2026-03-30T10:04:00.000Z",
                  attributionStatus: "included",
                  overrideDecision: null,
                  tokens: 21,
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
          [buildContributorGistFileName("publisher-remote")]: {
            content: createObservationContributorRecord({
              publisherId: "publisher-remote",
              observations: {
                [sharedDigest]: {
                  sessionUpdatedAt: "2026-03-30T10:04:00.000Z",
                  attributionStatus: "included",
                  overrideDecision: null,
                  tokens: 21,
                  estimatedCostUsdMicros: null
                }
              }
            })
          },
          [buildContributorGistFileName(publisherId)]: {
            content: createObservationContributorRecord({
              publisherId,
              updatedAt: "2026-03-30T12:00:00.000Z",
              observations: {
                [sharedDigest]: {
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
      });
    const updateGistFile = vi.fn().mockResolvedValue({
      id: "gist_123",
      ownerLogin: "octocat",
      public: true,
      files: {}
    });

    await publishBadgeIfChanged({
      config: createPublishConfig({
        label: "AI Usage",
        mode: "tokens"
      }),
      state: {
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          publisherId
        }
      } as typeof defaultAgentBadgeState,
      publisherObservations: {
        [sharedDigest]: {
          sessionUpdatedAt: "2026-03-30T10:05:00.000Z",
          attributionStatus: "included",
          overrideDecision: null,
          tokens: 42,
          estimatedCostUsdMicros: null
        }
      },
      client: {
        getGist,
        createPublicGist: vi.fn(),
        updateGistFile
      },
      now: "2026-03-30T12:00:00.000Z",
      skipIfUnchanged: false
    });

    expect(updateGistFile).toHaveBeenLastCalledWith({
      gistId: "gist_123",
      files: {
        [AGENT_BADGE_GIST_FILE]: {
          content: `{
  "schemaVersion": 1,
  "label": "AI Usage",
  "message": "42 tokens",
  "color": "blue"
}
`
        }
      }
    });
  });
});
