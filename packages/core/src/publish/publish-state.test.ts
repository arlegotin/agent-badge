import { describe, expect, it, vi } from "vitest";

import { defaultAgentBadgeConfig } from "../config/config-schema.js";
import { defaultAgentBadgeState } from "../state/state-schema.js";
import {
  AGENT_BADGE_COST_GIST_FILE,
  AGENT_BADGE_GIST_FILE,
  buildStableBadgeUrl
} from "./badge-url.js";
import {
  applyPublishAttemptFailure,
  applyPublishTargetResult
} from "./publish-state.js";
import { ensurePublishTarget } from "./publish-target.js";

describe("buildStableBadgeUrl", () => {
  it("derives the Shields endpoint from gist identity and the fixed filename", () => {
    expect(
      buildStableBadgeUrl({
        ownerLogin: "octocat",
        gistId: "gist_123"
      })
    ).toBe(
      "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_123%2Fraw%2Fagent-badge.json&cacheSeconds=300"
    );
  });

  it("derives the Shields endpoint for alternate deterministic gist files", () => {
    expect(
      buildStableBadgeUrl({
        ownerLogin: "octocat",
        gistId: "gist_123",
        fileName: AGENT_BADGE_COST_GIST_FILE
      })
    ).toBe(
      "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_123%2Fraw%2Fagent-badge-cost.json&cacheSeconds=300"
    );
  });

  it("derives the Shields endpoint with a custom cacheSeconds value", () => {
    expect(
      buildStableBadgeUrl({
        ownerLogin: "octocat",
        gistId: "gist_123",
        cacheSeconds: 900
      })
    ).toBe(
      "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_123%2Fraw%2Fagent-badge.json&cacheSeconds=900"
    );
  });

  it("derives the Shields endpoint with a custom style value", () => {
    expect(
      buildStableBadgeUrl({
        ownerLogin: "octocat",
        gistId: "gist_123",
        style: "for-the-badge"
      })
    ).toBe(
      "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_123%2Fraw%2Fagent-badge.json&cacheSeconds=300&style=for-the-badge"
    );
  });
});

describe("applyPublishTargetResult", () => {
  it("updates config and pending state atomically", () => {
    expect(
      applyPublishTargetResult({
        config: defaultAgentBadgeConfig,
        state: {
          ...defaultAgentBadgeState,
          publish: {
            ...defaultAgentBadgeState.publish,
            lastPublishedHash: "hash_123"
          }
        },
        target: {
          status: "connected",
          gistId: "gist_123",
          badgeUrl:
            "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_123%2Fraw%2Fagent-badge.json&cacheSeconds=300"
        }
      })
    ).toEqual({
      config: {
        ...defaultAgentBadgeConfig,
        publish: {
          ...defaultAgentBadgeConfig.publish,
          gistId: "gist_123",
          badgeUrl:
            "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_123%2Fraw%2Fagent-badge.json&cacheSeconds=300"
        }
      },
      state: {
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          status: "pending",
          gistId: "gist_123",
          lastPublishedHash: "hash_123",
          lastPublishedAt: null,
          publisherId: null,
          mode: "legacy"
        }
      }
    });
  });

  it("clears broken targets into explicit deferred mode", () => {
    expect(
      applyPublishTargetResult({
        config: {
          ...defaultAgentBadgeConfig,
          publish: {
            ...defaultAgentBadgeConfig.publish,
            gistId: "stale_gist",
            badgeUrl:
              "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fstale_gist%2Fraw%2Fagent-badge.json&cacheSeconds=300"
          }
        },
        state: {
          ...defaultAgentBadgeState,
          publish: {
            ...defaultAgentBadgeState.publish,
            status: "pending",
            gistId: "stale_gist",
            lastPublishedHash: "hash_123"
          }
        },
        target: {
          status: "deferred",
          gistId: null,
          badgeUrl: null,
          reason: "gist-unreachable"
        }
      })
    ).toEqual({
      config: defaultAgentBadgeConfig,
      state: {
        ...defaultAgentBadgeState,
        publish: {
          ...defaultAgentBadgeState.publish,
          status: "deferred",
          gistId: null,
          lastPublishedHash: "hash_123",
          lastPublishedAt: null,
          publisherId: null,
          mode: "legacy"
        }
      }
    });
  });
});

describe("applyPublishAttemptFailure", () => {
  it("persists auth-missing without raw error detail", () => {
    const nextState = applyPublishAttemptFailure({
      state: defaultAgentBadgeState,
      at: "2026-03-30T12:00:00.000Z",
      failureCode: "auth-missing"
    });

    expect(nextState.publish.lastFailureCode).toBe("auth-missing");
    expect(
      "errorMessage" in (nextState.publish as Record<string, unknown>)
    ).toBe(false);
    expect("stack" in (nextState.publish as Record<string, unknown>)).toBe(false);
  });
});

describe("ensurePublishTarget", () => {
  it("connects an explicit gist id before any create flow", async () => {
    const getGist = vi.fn().mockResolvedValue({
      id: "gist_connected",
      ownerLogin: "octocat",
      public: true,
      files: [AGENT_BADGE_GIST_FILE]
    });
    const createPublicGist = vi.fn();

    await expect(
      ensurePublishTarget({
        config: defaultAgentBadgeConfig,
        state: defaultAgentBadgeState,
        githubAuth: {
          available: true,
          source: "env:GH_TOKEN"
        },
        gistId: "gist_connected",
        client: {
          getGist,
          createPublicGist,
          updateGistFile: vi.fn()
        }
      })
    ).resolves.toEqual({
      status: "connected",
      gistId: "gist_connected",
      badgeUrl:
        "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_connected%2Fraw%2Fagent-badge.json&cacheSeconds=300"
    });
    expect(createPublicGist).not.toHaveBeenCalled();
  });

  it("reuses an already configured gist instead of creating another", async () => {
    const getGist = vi.fn().mockResolvedValue({
      id: "gist_existing",
      ownerLogin: "octocat",
      public: true,
      files: [AGENT_BADGE_GIST_FILE]
    });
    const createPublicGist = vi.fn();

    await expect(
      ensurePublishTarget({
        config: {
          ...defaultAgentBadgeConfig,
          badge: {
            ...defaultAgentBadgeConfig.badge,
            cacheSeconds: 900
          },
          publish: {
            ...defaultAgentBadgeConfig.publish,
            gistId: "gist_existing"
          }
        },
        state: defaultAgentBadgeState,
        githubAuth: {
          available: true,
          source: "checker"
        },
        client: {
          getGist,
          createPublicGist,
          updateGistFile: vi.fn()
        }
      })
    ).resolves.toEqual({
      status: "reused",
      gistId: "gist_existing",
      badgeUrl:
        "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_existing%2Fraw%2Fagent-badge.json&cacheSeconds=900"
    });
    expect(createPublicGist).not.toHaveBeenCalled();
  });

  it("builds style-aware badge URLs for configured publish targets", async () => {
    const getGist = vi.fn().mockResolvedValue({
      id: "gist_styled",
      ownerLogin: "octocat",
      public: true,
      files: [AGENT_BADGE_GIST_FILE]
    });

    await expect(
      ensurePublishTarget({
        config: {
          ...defaultAgentBadgeConfig,
          badge: {
            ...defaultAgentBadgeConfig.badge,
            style: "plastic"
          },
          publish: {
            ...defaultAgentBadgeConfig.publish,
            gistId: "gist_styled"
          }
        },
        state: defaultAgentBadgeState,
        githubAuth: {
          available: true,
          source: "checker"
        },
        client: {
          getGist,
          createPublicGist: vi.fn(),
          updateGistFile: vi.fn()
        }
      })
    ).resolves.toEqual({
      status: "reused",
      gistId: "gist_styled",
      badgeUrl:
        "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_styled%2Fraw%2Fagent-badge.json&cacheSeconds=300&style=plastic"
    });
  });

  it("creates one public gist with the deterministic pending payload", async () => {
    const createPublicGist = vi.fn().mockResolvedValue({
      id: "gist_created",
      ownerLogin: "octocat",
      public: true,
      files: [AGENT_BADGE_GIST_FILE]
    });

    await expect(
      ensurePublishTarget({
        config: defaultAgentBadgeConfig,
        state: defaultAgentBadgeState,
        githubAuth: {
          available: true,
          source: "env:GH_TOKEN"
        },
        client: {
          getGist: vi.fn(),
          createPublicGist,
          updateGistFile: vi.fn()
        }
      })
    ).resolves.toEqual({
      status: "created",
      gistId: "gist_created",
      badgeUrl:
        "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_created%2Fraw%2Fagent-badge.json&cacheSeconds=300"
    });
    expect(createPublicGist).toHaveBeenCalledWith({
      description: "agent-badge publish target",
      files: {
        "agent-badge.json": {
          content:
            '{"schemaVersion":1,"label":"AI burn","message":"pending","color":"lightgrey"}'
        }
      }
    });
  });

  it("uses configured zero color in the initial pending gist payload", async () => {
    const createPublicGist = vi.fn().mockResolvedValue({
      id: "gist_created",
      ownerLogin: "octocat",
      public: true,
      files: [AGENT_BADGE_GIST_FILE]
    });

    await ensurePublishTarget({
      config: {
        ...defaultAgentBadgeConfig,
        badge: {
          ...defaultAgentBadgeConfig.badge,
          label: "AI Receipt",
          colorZero: "silver"
        }
      },
      state: defaultAgentBadgeState,
      githubAuth: {
        available: true,
        source: "env:GH_TOKEN"
      },
      client: {
        getGist: vi.fn(),
        createPublicGist,
        updateGistFile: vi.fn()
      }
    });

    expect(createPublicGist).toHaveBeenCalledWith({
      description: "agent-badge publish target",
      files: {
        "agent-badge.json": {
          content:
            '{"schemaVersion":1,"label":"AI Receipt","message":"pending","color":"silver"}'
        }
      }
    });
  });

  it("returns deferred when auth is unavailable and no gist is configured", async () => {
    await expect(
      ensurePublishTarget({
        config: defaultAgentBadgeConfig,
        state: defaultAgentBadgeState,
        githubAuth: {
          available: false,
          source: "none"
        },
        client: {
          getGist: vi.fn(),
          createPublicGist: vi.fn(),
          updateGistFile: vi.fn()
        }
      })
    ).resolves.toEqual({
      status: "deferred",
      gistId: null,
      badgeUrl: null,
      reason: "auth-missing"
    });
  });

  it("returns deferred instead of persisting an unreachable configured gist", async () => {
    await expect(
      ensurePublishTarget({
        config: {
          ...defaultAgentBadgeConfig,
          publish: {
            ...defaultAgentBadgeConfig.publish,
            gistId: "stale_gist"
          }
        },
        state: defaultAgentBadgeState,
        githubAuth: {
          available: true,
          source: "checker"
        },
        client: {
          getGist: vi.fn().mockRejectedValue(new Error("404")),
          createPublicGist: vi.fn(),
          updateGistFile: vi.fn()
        }
      })
    ).resolves.toEqual({
      status: "deferred",
      gistId: null,
      badgeUrl: null,
      reason: "gist-unreachable"
    });
  });
});
