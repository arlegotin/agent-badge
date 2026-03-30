import { describe, expect, it } from "vitest";

import { createDefaultAgentBadgeConfig } from "./default-config.js";

describe("createDefaultAgentBadgeConfig", () => {
  it("enables only detected providers by default", () => {
    const config = createDefaultAgentBadgeConfig({
      providers: {
        codex: {
          available: true,
          homeLabel: "~/.codex"
        },
        claude: {
          available: false,
          homeLabel: "~/.claude"
        }
      }
    });

    expect(config.providers).toEqual({
      codex: {
        enabled: true
      },
      claude: {
        enabled: false
      }
    });
  });

  it.each([
    {
      codex: true,
      claude: true
    },
    {
      codex: true,
      claude: false
    },
    {
      codex: false,
      claude: true
    },
    {
      codex: false,
      claude: false
    }
  ])(
    "maps detected provider availability into config defaults (%j)",
    ({ codex, claude }) => {
      const config = createDefaultAgentBadgeConfig({
        providers: {
          codex: {
            available: codex,
            homeLabel: "~/.codex"
          },
          claude: {
            available: claude,
            homeLabel: "~/.claude"
          }
        }
      });

      expect(config.providers.codex.enabled).toBe(codex);
      expect(config.providers.claude.enabled).toBe(claude);
    }
  );
});
