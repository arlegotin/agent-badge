import { z } from "zod";

export const providerSchema = z.enum(["codex", "claude"]);

export const configModuleSchema = z.object({
  scope: z.literal("workspace-foundation"),
  providers: z.array(providerSchema)
});

export type ConfigModule = z.infer<typeof configModuleSchema>;

export function createConfigModule(): ConfigModule {
  return {
    scope: "workspace-foundation",
    providers: ["codex", "claude"]
  };
}
