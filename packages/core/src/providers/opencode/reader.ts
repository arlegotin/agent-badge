import { z } from "zod";
import {
  privateStringSchema,
  safeCounterSchema,
} from "../../domain/capabilities.js";
export const OPENCODE_READER_VERSION = "1";
export type OpenCodeExportFormat = "cli" | "api";
export interface OpenCodeInspection {
  accounting: "unsupported";
  schema:
    | "opencode-v1-export"
    | "opencode-v2-export"
    | "opencode-v2-api-export"
    | null;
  reason: "uncertain-lineage" | "unsupported-source";
}
const sessionId = privateStringSchema.refine((value) =>
  value.startsWith("ses_")
);
const messageId = privateStringSchema.refine((value) =>
  value.startsWith("msg_")
);
const tokens = z.object({
  input: safeCounterSchema,
  output: safeCounterSchema,
  reasoning: safeCounterSchema,
  cache: z.object({ read: safeCounterSchema, write: safeCounterSchema }),
  total: safeCounterSchema.optional(),
});
// These are recognition projections, not whole native schemas or accounting certification.
// Strip conversational payloads; retain nothing from them in the result/checkpoint.
const v1 = z.object({
  info: z.object({
    id: sessionId,
    projectID: privateStringSchema,
    directory: privateStringSchema,
  }),
  messages: z
    .array(
      z.object({
        info: z.object({
          id: messageId,
          sessionID: sessionId,
          role: z.enum(["assistant", "user"]),
          modelID: privateStringSchema.optional(),
          providerID: privateStringSchema.optional(),
          tokens: tokens.optional(),
          cost: z.number().finite().nonnegative().optional(),
        }),
        parts: z.array(z.unknown()).max(10000),
      })
    )
    .max(10000),
});
const v2 = z.object({
  info: z.object({
    id: sessionId,
    projectID: privateStringSchema,
    location: z.object({ directory: privateStringSchema }),
  }),
  messages: z
    .array(
      z.object({
        id: messageId,
        type: privateStringSchema,
        time: z.object({
          created: safeCounterSchema,
          completed: safeCounterSchema.optional(),
        }),
        model: z
          .object({ id: privateStringSchema, providerID: privateStringSchema })
          .optional(),
        tokens: tokens.optional(),
        cost: z.number().finite().nonnegative().optional(),
      })
    )
    .max(10000),
});
/** Version + transport + shape are all explicit. Never run an exporter or attach a server. */
export function inspectOpenCodeExport(
  bytes: Uint8Array,
  version: string,
  format: OpenCodeExportFormat
): OpenCodeInspection {
  const unsupported: OpenCodeInspection = {
    accounting: "unsupported",
    schema: null,
    reason: "unsupported-source",
  };
  if (bytes.byteLength > 16 * 1024 * 1024) return unsupported;
  try {
    const value: unknown = JSON.parse(Buffer.from(bytes).toString("utf8"));
    if (version === "1.19.3" && format === "cli" && v1.safeParse(value).success)
      return {
        accounting: "unsupported",
        schema: "opencode-v1-export",
        reason: "uncertain-lineage",
      };
    if (version === "2.1.2") {
      const schema = format === "api" ? z.object({ data: v2 }).strict() : v2;
      if (schema.safeParse(value).success)
        return {
          accounting: "unsupported",
          schema:
            format === "api" ? "opencode-v2-api-export" : "opencode-v2-export",
          reason: "uncertain-lineage",
        };
    }
  } catch {
    /* Sanitized diagnostics only. */
  }
  return unsupported;
}
