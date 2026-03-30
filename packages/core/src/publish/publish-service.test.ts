import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defaultAgentBadgeConfig } from "../config/config-schema.js";
import { parseNormalizedSessionSummary } from "../providers/session-summary.js";
import { defaultAgentBadgeState } from "../state/state-schema.js";
import { AGENT_BADGE_GIST_FILE } from "./badge-url.js";
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
    const excludedSession = createSession({
      provider: "claude",
      providerSessionId: "excluded-1",
      cwd: "/Users/example/other-project",
      tokenTotal: 200
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
        mode: "sessions"
      }),
      state: defaultAgentBadgeState,
      scan: {
        repo: {
          gitRoot: "/Users/example/project",
          gitRootRealPath: "/Users/example/project",
          gitRootBasename: "project",
          originUrlRaw: "git@github.com:example/agent-badge.git",
          originUrlNormalized: "https://github.com/example/agent-badge",
          host: "github.com",
          owner: "example",
          repo: "agent-badge",
          canonicalSlug: "example/agent-badge",
          aliasRemoteUrlsNormalized: [],
          aliasSlugs: []
        },
        sessions: [includedSession, excludedSession],
        scannedProviders: ["codex", "claude"],
        counts: {
          scannedSessions: 2,
          dedupedSessions: 2,
          byProvider: {
            codex: {
              scannedSessions: 1,
              dedupedSessions: 1
            },
            claude: {
              scannedSessions: 1,
              dedupedSessions: 1
            }
          }
        }
      },
      attribution: {
        sessions: [
          {
            session: includedSession,
            status: "included",
            evidence: [
              {
                kind: "repo-root",
                matched: true,
                detail:
                  "cwd realpath exactly matches repo.gitRootRealPath"
              }
            ],
            reason:
              "Included because cwdRealPath exactly matches repo.gitRootRealPath",
            overrideApplied: null
          },
          {
            session: excludedSession,
            status: "excluded",
            evidence: [
              {
                kind: "normalized-cwd",
                matched: false,
                detail:
                  "cwd realpath does not resolve inside the current repo"
              }
            ],
            reason:
              "Excluded because no attribution evidence matched the current repo",
            overrideApplied: null
          }
        ],
        counts: {
          included: 1,
          ambiguous: 0,
          excluded: 1
        }
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
  "message": "1 sessions",
  "color": "brightgreen"
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
    expect(serializedPayload).not.toContain("included-1");
    expect(serializedPayload).not.toContain("/Users/example/project");
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

  it("fails when a gist target is not configured", async () => {
    await expect(
      publishBadgeToGist({
        config: defaultAgentBadgeConfig,
        state: defaultAgentBadgeState,
        scan: {
          repo: {
            gitRoot: "/Users/example/project",
            gitRootRealPath: "/Users/example/project",
            gitRootBasename: "project",
            originUrlRaw: null,
            originUrlNormalized: null,
            host: null,
            owner: null,
            repo: "project",
            canonicalSlug: null,
            aliasRemoteUrlsNormalized: [],
            aliasSlugs: []
          },
          sessions: [],
          scannedProviders: [],
          counts: {
            scannedSessions: 0,
            dedupedSessions: 0,
            byProvider: {
              codex: {
                scannedSessions: 0,
                dedupedSessions: 0
              },
              claude: {
                scannedSessions: 0,
                dedupedSessions: 0
              }
            }
          }
        },
        attribution: {
          sessions: [],
          counts: {
            included: 0,
            ambiguous: 0,
            excluded: 0
          }
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
});

describe("publishBadgeIfChanged", () => {
  it("skips remote update when the payload hash matches", async () => {
    const serializedPayload = `{
  "schemaVersion": 1,
  "label": "AI Usage",
  "message": "1 sessions",
  "color": "brightgreen"
}
`;
    const existingHash = createHash("sha256")
      .update(serializedPayload)
      .digest("hex");
    const updateGistFile = vi.fn();

    const result = await publishBadgeIfChanged({
      config: createPublishConfig({
        label: "AI Usage",
        mode: "sessions"
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
        tokens: 42
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
  "message": "1 sessions",
  "color": "brightgreen"
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
        mode: "sessions"
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
        tokens: 42
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
  "message": "1 sessions",
  "color": "brightgreen"
}
`
        }
      }
    });
    expect(result.decision).toBe("published");
    expect(result.state.publish.lastPublishedAt).toBe("2026-03-30T12:05:00Z");
  });
});
