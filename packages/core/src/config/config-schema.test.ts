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
    expect(defaultAgentBadgeConfig.publish.gistId).toBeNull();
    expect(defaultAgentBadgeConfig.publish.badgeUrl).toBeNull();
    expect(defaultAgentBadgeConfig.repo.aliases).toEqual({
      remotes: [],
      slugs: []
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
});
