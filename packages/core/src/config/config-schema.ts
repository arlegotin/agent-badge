import { z } from "zod";

const providerConfigSchema = z
  .object({
    enabled: z.boolean()
  })
  .strict();

const badgeModeSchema = z.preprocess(
  (input) => (input === "sessions" ? "tokens" : input),
  z.enum(["combined", "tokens", "cost"])
);
const badgeColorSchema = z.string().min(1);
const publishProviderSchema = z.enum(["github-gist"]);
const refreshModeSchema = z.enum(["fail-soft", "strict"]);

export const agentBadgeConfigSchema = z
  .object({
    version: z.literal(1),
    providers: z
      .object({
        codex: providerConfigSchema,
        claude: providerConfigSchema
      })
      .strict(),
    repo: z
      .object({
        aliases: z
          .object({
            remotes: z.array(z.string().min(1)),
            slugs: z.array(z.string().min(1))
          })
          .strict()
      })
      .strict(),
    badge: z
      .object({
        label: z.string().min(1),
        mode: badgeModeSchema,
        color: badgeColorSchema.default("blue"),
        colorZero: badgeColorSchema.default("lightgrey"),
        cacheSeconds: z.number().int().positive().default(300)
      })
      .strict(),
    publish: z
      .object({
        provider: publishProviderSchema,
        gistId: z.string().min(1).nullable(),
        badgeUrl: z.string().url().nullable()
      })
      .strict(),
    refresh: z
      .object({
        prePush: z
          .object({
            enabled: z.boolean(),
            mode: refreshModeSchema
          })
          .strict()
      })
      .strict(),
    privacy: z
      .object({
        aggregateOnly: z.literal(true),
        output: z.enum(["standard", "minimal"])
      })
      .strict()
  })
  .strict();

export type AgentBadgeConfig = z.infer<typeof agentBadgeConfigSchema>;
export type AgentBadgeBadgeMode = z.infer<typeof badgeModeSchema>;
export type AgentBadgePublishProvider = z.infer<typeof publishProviderSchema>;
export type AgentBadgeRefreshMode = z.infer<typeof refreshModeSchema>;
export type AgentBadgePrivacyOutput = AgentBadgeConfig["privacy"]["output"];

export const defaultAgentBadgeConfig: AgentBadgeConfig = {
  version: 1,
  providers: {
    codex: {
      enabled: true
    },
    claude: {
      enabled: true
    }
  },
  repo: {
    aliases: {
      remotes: [],
      slugs: []
    }
  },
  badge: {
    label: "Vibe budget",
    mode: "combined",
    color: "blue",
    colorZero: "lightgrey",
    cacheSeconds: 300
  },
  publish: {
    provider: "github-gist",
    gistId: null,
    badgeUrl: null
  },
  refresh: {
    prePush: {
      enabled: true,
      mode: "fail-soft"
    }
  },
  privacy: {
    aggregateOnly: true,
    output: "standard"
  }
};

export function parseAgentBadgeConfig(input: unknown): AgentBadgeConfig {
  return agentBadgeConfigSchema.parse(input);
}
