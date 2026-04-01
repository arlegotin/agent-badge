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
