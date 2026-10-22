import { createHash } from "node:crypto";
import { z } from "zod";
import { modelIdSchema, parseProtocol, safeCounterSchema, vendorIdSchema } from "../domain/capabilities.js";

// A small audited text-token API-equivalent rate catalog; never fetched at runtime.
// Primary sources retrieved 2026-10-22:
// https://developers.openai.com/api/docs/models/gpt-5.4-mini
// https://openai.com/index/gpt-4-1/
// https://platform.claude.com/docs/en/models/sonnet-4-6/overview
const sources = ["https://developers.openai.com/api/docs/models/gpt-5.4-mini",
  "https://openai.com/index/gpt-4-1/", "https://platform.claude.com/docs/en/models/sonnet-4-6/overview"] as const;
const rate = safeCounterSchema.nullable();
export const priceCatalogSchema = z.object({ schemaVersion: z.literal(1), version: safeCounterSchema.refine((v) => v > 0),
  snapshotDate: z.iso.date(), currency: z.literal("USD"), unit: z.literal("micro-USD-per-million-tokens"),
  valuation: z.literal("current-catalog-api-equivalent"), cards: z.array(z.object({ vendor: vendorIdSchema,
    model: modelIdSchema, sourceUrl: z.enum(sources), tariff: z.literal("standard-text"),
    longContext: z.literal("same-rate"), input: rate, cachedInput: rate, output: rate, toolInput: rate,
    cacheCreation: z.object({ fiveMinutes: rate, oneHour: rate, other: rate }).strict()
  }).strict()).max(1000) }).strict().superRefine((catalog, ctx) => {
    const keys = new Set<string>();
    for (const card of catalog.cards) {
      const key = `${card.vendor}/${card.model}`;
      if (keys.has(key) || (card.model === "claude-sonnet-4-6" ? card.vendor !== "anthropic" : card.vendor !== "openai"))
        ctx.addIssue({ code: "custom", message: "invalid-catalog" });
      keys.add(key);
    }
  });
export type PriceCatalog = z.infer<typeof priceCatalogSchema>;
export function parsePriceCatalog(input: unknown): PriceCatalog { return parseProtocol(priceCatalogSchema, input); }
/** Deterministic structured JSON for metadata/catalog/artifacts, which contain no arbitrary keys. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function contentHash(value: unknown): string { return createHash("sha256").update(stableJson(value)).digest("hex"); }
export function catalogHash(catalog: PriceCatalog): string { return contentHash(parsePriceCatalog(catalog)); }
export const defaultCatalog: PriceCatalog = parsePriceCatalog({ schemaVersion: 1, version: 1, snapshotDate: "2026-10-22",
  currency: "USD", unit: "micro-USD-per-million-tokens", valuation: "current-catalog-api-equivalent", cards: [
    { vendor: "openai", model: "gpt-5.4-mini", sourceUrl: sources[0], tariff: "standard-text", longContext: "same-rate",
      input: 750000, cachedInput: 75000, output: 4500000, toolInput: null,
      cacheCreation: { fiveMinutes: null, oneHour: null, other: null } },
    { vendor: "openai", model: "gpt-4.1-mini", sourceUrl: sources[1], tariff: "standard-text", longContext: "same-rate",
      input: 400000, cachedInput: 100000, output: 1600000, toolInput: null,
      cacheCreation: { fiveMinutes: null, oneHour: null, other: null } },
    { vendor: "anthropic", model: "claude-sonnet-4-6", sourceUrl: sources[2], tariff: "standard-text", longContext: "same-rate",
      input: 3000000, cachedInput: 300000, output: 15000000, toolInput: null,
      cacheCreation: { fiveMinutes: 3750000, oneHour: 6000000, other: null } }
  ] });
