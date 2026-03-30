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
  });

  it("rejects missing required keys", () => {
    expect(() =>
      parseAgentBadgeConfig({
        version: 1
      })
    ).toThrow();
  });
});
