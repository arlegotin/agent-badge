import { z } from "zod";
import { parseProtocol, providerIdSchema, repositoryIdSchema } from "./capabilities.js";

/** XML text is escaped by the renderer; invalid XML scalar values never reach it. */
export const svgLabelSchema = z.string().min(1).refine((label) => Array.from(label).length <= 64 &&
  Array.from(label).every((character) => {
    const point = character.codePointAt(0)!;
    return point === 9 || point === 10 || point === 13 || (point >= 32 && point <= 0xd7ff) ||
      (point >= 0xe000 && point <= 0xfffd) || (point >= 0x10000 && point <= 0x10ffff);
  }));
export const sharedPolicySchema = z.object({ schemaVersion: z.literal(1), repositoryId: repositoryIdSchema,
  normalizationVersion: z.literal(1), discovery: z.literal("auto"),
  disabledProviders: z.array(providerIdSchema).max(providerIdSchema.options.length).refine((providers) => new Set(providers).size === providers.length),
  badge: z.object({ label: svgLabelSchema, metric: z.enum(["tokens", "estimated-cost"]) }).strict()
}).strict();
export type SharedPolicy = z.infer<typeof sharedPolicySchema>;
export function parseSharedPolicy(input: unknown): SharedPolicy { return parseProtocol(sharedPolicySchema, input); }
