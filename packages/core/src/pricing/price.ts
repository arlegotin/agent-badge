import { parseProtocol } from "../domain/capabilities.js";
import { meterSegmentSchema } from "../domain/usage.js";
import type { MeterSegment } from "../domain/usage.js";
import { catalogHash, parsePriceCatalog } from "./catalog.js";
import type { PriceCatalog } from "./catalog.js";
export interface PriceResult {
  /** Rounded once, half up, after adding all priced segment numerators. Decimal integer avoids overflow. */
  knownMicroUsd: string;
  /** In this API a unit is one supplied meter segment, not an accounting request. */
  pricedUnits: number;
  unpricedUnits: number;
  catalogHash: string;
}
function priceSegment(m: MeterSegment, card: PriceCatalog["cards"][number]): bigint | null {
  // Every required dimension must be measured. Zero is allowed with no tariff; null is never zero.
  const creation = Object.values(m.cacheCreation);
  if (m.uncachedInput === null || m.cachedInput === null || m.output === null || m.toolInput === null ||
    m.semantics.input === "unknown" || m.semantics.output === "unknown" ||
    (m.semantics.cacheCreation === "unknown" && creation.some((n) => n !== 0)) ||
    (m.semantics.toolInput === "unknown" && m.toolInput !== 0) || creation.some((n) => n === null)) return null;
  let ordinary = m.uncachedInput;
  if (m.semantics.cacheCreation === "included-in-input") {
    ordinary -= creation.reduce<number>((sum, n) => sum + n!, 0);
    if (ordinary < 0) return null;
  }
  // Reasoning already in output must not be charged twice. Separate reasoning uses output rate.
  if (m.semantics.output === "excludes-reasoning" && m.reasoningOutput === null) return null;
  const output = BigInt(m.output) + BigInt(m.semantics.output === "excludes-reasoning" ? m.reasoningOutput! : 0);
  const buckets: [bigint, number | null][] = [[BigInt(ordinary), card.input], [BigInt(m.cachedInput), card.cachedInput],
    [output, card.output], [BigInt(m.cacheCreation.fiveMinutes!), card.cacheCreation.fiveMinutes],
    [BigInt(m.cacheCreation.oneHour!), card.cacheCreation.oneHour], [BigInt(m.cacheCreation.other!), card.cacheCreation.other]];
  if (m.semantics.toolInput === "separate") buckets.push([BigInt(m.toolInput), card.toolInput]);
  if (buckets.some(([n, rate]) => n !== 0n && rate === null)) return null;
  return buckets.reduce((sum, [n, rate]) => sum + n * BigInt(rate ?? 0), 0n);
}
export function priceMeters(meters: readonly MeterSegment[], input: PriceCatalog): PriceResult {
  const catalog = parsePriceCatalog(input); const cards = new Map(catalog.cards.map((card) => [`${card.vendor}/${card.model}`, card]));
  let numerator = 0n; let pricedUnits = 0;
  for (const input of meters) {
    const meter = parseProtocol(meterSegmentSchema, input); const card = cards.get(`${meter.vendor}/${meter.model}`);
    const value = card ? priceSegment(meter, card) : null;
    if (value !== null) { numerator += value; pricedUnits++; }
  }
  return { knownMicroUsd: ((numerator + 500000n) / 1000000n).toString(), pricedUnits,
    unpricedUnits: meters.length - pricedUnits, catalogHash: catalogHash(catalog) };
}
