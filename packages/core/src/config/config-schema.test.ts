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

  it("rejects missing required keys", () => {
    expect(() =>
      parseAgentBadgeConfig({
        version: 1
      })
    ).toThrow();
  });
});
