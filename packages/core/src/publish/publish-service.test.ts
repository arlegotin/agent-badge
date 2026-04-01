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
    const updateGistFile = vi.fn().mockResolvedValue({
      id: "gist_123",
      ownerLogin: "octocat",
      public: true,
      files: [AGENT_BADGE_GIST_FILE]
    });

    const nextState = await publishBadgeToGist({
      config: createPublishConfig({
        label: "AI Usage",
        mode: "tokens"
      }),
      state: defaultAgentBadgeState,
      includedTotals: {
        sessions: 1,
        tokens: includedSession.tokenUsage.total,
        estimatedCostUsdMicros: null
      },
      client: {
        getGist: vi.fn(),
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

    expect(updateGistFile).toHaveBeenCalledWith({
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
      lastPublishedAt: "2026-03-30T12:00:00.000Z"
    });
  });

  it("publishes live preview payloads for every badge mode when cost totals are available", async () => {
    const updateGistFile = vi.fn().mockResolvedValue({
      id: "gist_123",
      ownerLogin: "octocat",
      public: true,
      files: [
        AGENT_BADGE_GIST_FILE,
        AGENT_BADGE_COMBINED_GIST_FILE,
        AGENT_BADGE_TOKENS_GIST_FILE,
        AGENT_BADGE_COST_GIST_FILE
      ]
    });

    await publishBadgeToGist({
      config: createPublishConfig({
        label: "AI Usage",
        mode: "combined"
      }),
      state: defaultAgentBadgeState,
      includedTotals: {
        sessions: 1,
        tokens: 42,
        estimatedCostUsdMicros: 57_500_000
      },
      client: {
        getGist: vi.fn(),
        createPublicGist: vi.fn(),
        updateGistFile
      }
    });

    expect(updateGistFile).toHaveBeenCalledWith({
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
        includedTotals: {
          sessions: 0,
          tokens: 0,
          estimatedCostUsdMicros: null
        },
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
            content: createContributorRecord({
              publisherId,
              sessions: 1,
              tokens: 10,
              estimatedCostUsdMicros: null
            })
          },
          [otherContributorFile]: {
            content: createContributorRecord({
              publisherId: "publisher-remote",
              sessions: 2,
              tokens: 20,
              estimatedCostUsdMicros: null
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
            content: createContributorRecord({
              publisherId,
              updatedAt: "2026-03-30T12:00:00.000Z",
              sessions: 3,
              tokens: 30,
              estimatedCostUsdMicros: null
            })
          },
          [otherContributorFile]: {
            content: createContributorRecord({
              publisherId: "publisher-remote",
              sessions: 2,
              tokens: 20,
              estimatedCostUsdMicros: null
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
      includedTotals: {
        sessions: 3,
        tokens: 30,
        estimatedCostUsdMicros: null
      },
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
            content: createContributorRecord({
              publisherId,
              sessions: 1,
              tokens: 10,
              estimatedCostUsdMicros: null
            })
          },
          [otherContributorFile]: {
            content: createContributorRecord({
              publisherId: "publisher-remote",
              sessions: 2,
              tokens: 20,
              estimatedCostUsdMicros: null
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
            content: createContributorRecord({
              publisherId,
              updatedAt: "2026-03-30T12:00:00.000Z",
              sessions: 3,
              tokens: 30,
              estimatedCostUsdMicros: null
            })
          },
          [otherContributorFile]: {
            content: createContributorRecord({
              publisherId: "publisher-remote",
              sessions: 2,
              tokens: 20,
              estimatedCostUsdMicros: null
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
      includedTotals: {
        sessions: 3,
        tokens: 30,
        estimatedCostUsdMicros: null
      },
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
          content: `{
  "schemaVersion": 1,
  "publisherId": "publisher-local",
  "updatedAt": "2026-03-30T12:00:00.000Z",
  "totals": {
    "sessions": 3,
    "tokens": 30,
    "estimatedCostUsdMicros": null
  }
}
`
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
        includedTotals: {
          sessions: 3,
          tokens: 30,
          estimatedCostUsdMicros: null
        },
        client: {
          getGist,
          createPublicGist: vi.fn(),
          updateGistFile
        }
      })
    ).rejects.toThrow("Shared gist files cannot be loaded from truncated content.");

    expect(updateGistFile).not.toHaveBeenCalled();
  });
});

describe("publishBadgeIfChanged", () => {
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
          lastPublishedAt: "2026-03-30T10:00:00Z"
        }
      },
      includedTotals: {
        sessions: 1,
        tokens: 42,
        estimatedCostUsdMicros: null
      },
      client: {
        getGist: vi.fn(),
        createPublicGist: vi.fn(),
        updateGistFile
      },
      now: "2026-03-30T12:05:00Z",
      skipIfUnchanged: true
    });

    expect(updateGistFile).not.toHaveBeenCalled();
    expect(result).toEqual({
      decision: "skipped",
      state: {
        ...defaultAgentBadgeState,
        publish: {
          status: "published",
          gistId: "gist_123",
          lastPublishedHash: existingHash,
          lastPublishedAt: "2026-03-30T10:00:00Z"
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
    const updateGistFile = vi.fn().mockResolvedValue({
      id: "gist_123",
      ownerLogin: "octocat",
      public: true,
      files: [AGENT_BADGE_GIST_FILE]
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
          lastPublishedAt: "2026-03-30T10:00:00Z"
        }
      },
      includedTotals: {
        sessions: 1,
        tokens: 42,
        estimatedCostUsdMicros: null
      },
      client: {
        getGist: vi.fn(),
        createPublicGist: vi.fn(),
        updateGistFile
      },
      now: "2026-03-30T12:05:00Z",
      skipIfUnchanged: true
    });

    expect(updateGistFile).toHaveBeenCalledWith({
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
  });
});
