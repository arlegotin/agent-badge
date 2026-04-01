import { describe, expect, it, vi } from "vitest";

import { defaultAgentBadgeConfig } from "../config/config-schema.js";
import { defaultAgentBadgeState } from "../state/state-schema.js";
import { AGENT_BADGE_GIST_FILE } from "./badge-url.js";
import { publishBadgeToGist } from "./publish-service.js";
import {
  AGENT_BADGE_OVERRIDES_GIST_FILE,
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
            content: createContributorRecord({
              publisherId: remotePublisherId,
              sessions: 2,
              tokens: 20,
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
          [buildContributorGistFileName(localPublisherId)]: {
            content: createContributorRecord({
              publisherId: localPublisherId,
              sessions: 3,
              tokens: 30,
              estimatedCostUsdMicros: null
            })
          },
          [buildContributorGistFileName(remotePublisherId)]: {
            content: createContributorRecord({
              publisherId: remotePublisherId,
              sessions: 2,
              tokens: 20,
              estimatedCostUsdMicros: null
            })
          },
          [AGENT_BADGE_OVERRIDES_GIST_FILE]: {
            content: `{
  "schemaVersion": 1,
  "overrides": {}
}
`
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
        [AGENT_BADGE_GIST_FILE]: {
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

  it("does not need the local includedTotals snapshot to contain every remote contributor", async () => {
    const localPublisherId = "publisher-local";
    const remotePublisherId = "publisher-remote";
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
          [buildContributorGistFileName(localPublisherId)]: {
            content: createContributorRecord({
              publisherId: localPublisherId,
              sessions: 1,
              tokens: 12,
              estimatedCostUsdMicros: null
            })
          },
          [buildContributorGistFileName(remotePublisherId)]: {
            content: createContributorRecord({
              publisherId: remotePublisherId,
              sessions: 4,
              tokens: 88,
              estimatedCostUsdMicros: null
            })
          },
          [AGENT_BADGE_OVERRIDES_GIST_FILE]: {
            content: `{
  "schemaVersion": 1,
  "overrides": {}
}
`
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
      includedTotals: {
        sessions: 1,
        tokens: 12,
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
        [AGENT_BADGE_GIST_FILE]: {
          content: `{
  "schemaVersion": 1,
  "label": "AI Usage",
  "message": "100 tokens",
  "color": "blue"
}
`
        }
      }
    });
  });
});
