import { describe, expect, it } from "vitest";

import {
  defaultAgentBadgeConfig,
  parseAgentBadgeConfig
} from "./config-schema.js";

describe("agentBadgeConfigSchema", () => {
  it("parses the default config shape", () => {
    expect(parseAgentBadgeConfig(defaultAgentBadgeConfig)).toEqual(
      defaultAgentBadgeConfig
    );
  });

  it("ships privacy-safe defaults", () => {
    expect(defaultAgentBadgeConfig.privacy.aggregateOnly).toBe(true);
    expect(defaultAgentBadgeConfig.privacy.output).toBe("standard");
    expect(defaultAgentBadgeConfig.badge.mode).toBe("combined");
    expect(defaultAgentBadgeConfig.badge.color).toBe("blue");
    expect(defaultAgentBadgeConfig.badge.colorZero).toBe("lightgrey");
    expect(defaultAgentBadgeConfig.badge.cacheSeconds).toBe(300);
    expect(defaultAgentBadgeConfig.publish.gistId).toBeNull();
    expect(defaultAgentBadgeConfig.publish.badgeUrl).toBeNull();
    expect(defaultAgentBadgeConfig.repo.aliases).toEqual({
      remotes: [],
      slugs: []
    });
  });

  it("keeps publish config aggregate-only", () => {
    expect(
      parseAgentBadgeConfig({
        ...defaultAgentBadgeConfig,
        publish: {
          provider: "github-gist",
          gistId: "gist_123",
          badgeUrl:
            "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_123%2Fraw%2Fagent-badge.json&cacheSeconds=300"
        }
      }).publish
    ).toEqual({
      provider: "github-gist",
      gistId: "gist_123",
      badgeUrl:
        "https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Foctocat%2Fgist_123%2Fraw%2Fagent-badge.json&cacheSeconds=300"
    });
  });

  it("rejects missing required keys", () => {
    expect(() =>
      parseAgentBadgeConfig({
        version: 1
      })
    ).toThrow();
  });

  it("parses privacy-safe repo aliases", () => {
    expect(
      parseAgentBadgeConfig({
        ...defaultAgentBadgeConfig,
        repo: {
          aliases: {
            remotes: ["https://github.com/openai/agent-badge"],
            slugs: ["openai/agent-badge"]
          }
        }
      })
    ).toMatchObject({
      repo: {
        aliases: {
          remotes: ["https://github.com/openai/agent-badge"],
          slugs: ["openai/agent-badge"]
        }
      }
    });
  });

  it("migrates legacy sessions badge mode to tokens", () => {
    expect(
      parseAgentBadgeConfig({
        ...defaultAgentBadgeConfig,
        badge: {
          ...defaultAgentBadgeConfig.badge,
          mode: "sessions"
        }
      }).badge.mode
    ).toBe("tokens");
  });

  it("allows badge colors and cacheSeconds to be configured", () => {
    expect(
      parseAgentBadgeConfig({
        ...defaultAgentBadgeConfig,
        badge: {
          ...defaultAgentBadgeConfig.badge,
          color: "orange",
          colorZero: "#cccccc",
          cacheSeconds: 900
        }
      }).badge
    ).toMatchObject({
      color: "orange",
      colorZero: "#cccccc",
      cacheSeconds: 900
    });
  });

  it("rejects path-like repo aliases", () => {
    expect(() =>
      parseAgentBadgeConfig({
        ...defaultAgentBadgeConfig,
        repo: {
          aliases: {
            remotes: [],
            slugs: [],
            paths: ["/Users/example/project"]
          }
        }
      })
    ).toThrowErrorMatchingInlineSnapshot(`
      [ZodError: [
        {
          "code": "unrecognized_keys",
          "keys": [
            "paths"
          ],
          "path": [
            "repo",
            "aliases"
          ],
          "message": "Unrecognized key: \\"paths\\""
        }
      ]]
    `);
  });

  it("rejects transcript-like publish fields", () => {
    expect(() =>
      parseAgentBadgeConfig({
        ...defaultAgentBadgeConfig,
        publish: {
          ...defaultAgentBadgeConfig.publish,
          transcript: "do not persist prompt text"
        }
      })
    ).toThrow();
  });

  it("rejects path-like publish fields", () => {
    expect(() =>
      parseAgentBadgeConfig({
        ...defaultAgentBadgeConfig,
        publish: {
          ...defaultAgentBadgeConfig.publish,
          localPath: "/Users/example/.codex/session.jsonl"
        }
      })
    ).toThrow();
  });

  it("allows privacy output to switch between standard and minimal", () => {
    expect(
      parseAgentBadgeConfig({
        ...defaultAgentBadgeConfig,
        privacy: {
          ...defaultAgentBadgeConfig.privacy,
          output: "minimal"
        }
      }).privacy
    ).toEqual({
      aggregateOnly: true,
      output: "minimal"
    });
  });
});
