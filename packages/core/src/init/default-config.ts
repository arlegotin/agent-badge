import {
  defaultAgentBadgeConfig,
  parseAgentBadgeConfig,
  type AgentBadgeConfig
} from "../config/config-schema.js";
import type { ProviderDetectionResult } from "./provider-detection.js";

export interface CreateDefaultAgentBadgeConfigOptions {
  readonly providers?: ProviderDetectionResult;
}

export function createDefaultAgentBadgeConfig(
  options: CreateDefaultAgentBadgeConfigOptions = {}
): AgentBadgeConfig {
  return parseAgentBadgeConfig({
    ...defaultAgentBadgeConfig,
    providers: {
      codex: {
        enabled:
          options.providers?.codex.available ??
          defaultAgentBadgeConfig.providers.codex.enabled
      },
      claude: {
        enabled:
          options.providers?.claude.available ??
          defaultAgentBadgeConfig.providers.claude.enabled
      }
    },
    repo: {
      aliases: {
        remotes: [...defaultAgentBadgeConfig.repo.aliases.remotes],
        slugs: [...defaultAgentBadgeConfig.repo.aliases.slugs]
      }
    }
  });
}
