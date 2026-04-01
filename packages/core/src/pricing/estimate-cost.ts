import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { z } from "zod";

import type { NormalizedSessionSummary } from "../providers/session-summary.js";
import {
  findLatestCodexStateDatabase,
  loadCodexThreadRolloutRowsByIds
} from "../providers/codex/codex-sql.js";

export const PRICING_CACHE_FILE = ".agent-badge/cache/pricing.json";
const PRICING_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const OPENAI_PRICING_URL = "https://openai.com/api/pricing";
const ANTHROPIC_PRICING_URL =
  "https://docs.anthropic.com/en/docs/about-claude/pricing";
const ROLLOUT_USAGE_TAIL_BYTES = 256 * 1024;

export interface ModelRateCard {
  readonly inputUsdPerMillion: number;
  readonly cachedInputUsdPerMillion: number | null;
  readonly cacheWriteUsdPerMillion: number | null;
  readonly outputUsdPerMillion: number;
}

export interface PricingCatalog {
  readonly fetchedAt: string | null;
  readonly sources: {
    readonly openai: string;
    readonly anthropic: string;
  };
  readonly providers: {
    readonly openai: Readonly<Record<string, ModelRateCard>>;
    readonly anthropic: Readonly<Record<string, ModelRateCard>>;
  };
}

export interface ResolvePricingCatalogOptions {
  readonly cwd: string;
  readonly now?: Date;
  readonly fetchImpl?: typeof fetch;
}

export interface EstimateIncludedCostOptions {
  readonly sessions: readonly NormalizedSessionSummary[];
  readonly homeRoot: string;
  readonly pricingCatalog: PricingCatalog;
}

export interface EstimateSessionCostsOptions
  extends EstimateIncludedCostOptions {}

interface CodexRolloutUsage {
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly reasoningOutputTokens: number;
  readonly totalTokens: number;
}

const modelRateCardSchema = z
  .object({
    inputUsdPerMillion: z.number().nonnegative(),
    cachedInputUsdPerMillion: z.number().nonnegative().nullable(),
    cacheWriteUsdPerMillion: z.number().nonnegative().nullable(),
    outputUsdPerMillion: z.number().nonnegative()
  })
  .strict();

const pricingCatalogSchema = z
  .object({
    fetchedAt: z.string().datetime({ offset: true }).nullable(),
    sources: z
      .object({
        openai: z.string().url(),
        anthropic: z.string().url()
      })
      .strict(),
    providers: z
      .object({
        openai: z.record(z.string(), modelRateCardSchema),
        anthropic: z.record(z.string(), modelRateCardSchema)
      })
      .strict()
  })
  .strict();

const fallbackPricingCatalog: PricingCatalog = {
  fetchedAt: null,
  sources: {
    openai: OPENAI_PRICING_URL,
    anthropic: ANTHROPIC_PRICING_URL
  },
  providers: {
    openai: {
      "gpt-5": {
        inputUsdPerMillion: 1.25,
        cachedInputUsdPerMillion: 0.125,
        cacheWriteUsdPerMillion: null,
        outputUsdPerMillion: 10
      },
      "gpt-5-mini": {
        inputUsdPerMillion: 0.25,
        cachedInputUsdPerMillion: 0.025,
        cacheWriteUsdPerMillion: null,
        outputUsdPerMillion: 2
      },
      "gpt-5-nano": {
        inputUsdPerMillion: 0.05,
        cachedInputUsdPerMillion: 0.005,
        cacheWriteUsdPerMillion: null,
        outputUsdPerMillion: 0.4
      },
      "gpt-5-pro": {
        inputUsdPerMillion: 15,
        cachedInputUsdPerMillion: null,
        cacheWriteUsdPerMillion: null,
        outputUsdPerMillion: 120
      },
      "gpt-5.4": {
        inputUsdPerMillion: 2.5,
        cachedInputUsdPerMillion: 0.25,
        cacheWriteUsdPerMillion: null,
        outputUsdPerMillion: 15
      },
      "gpt-5.4-mini": {
        inputUsdPerMillion: 0.25,
        cachedInputUsdPerMillion: 0.025,
        cacheWriteUsdPerMillion: null,
        outputUsdPerMillion: 2
      }
    },
    anthropic: {
      "claude-sonnet-4": {
        inputUsdPerMillion: 3,
        cachedInputUsdPerMillion: 0.3,
        cacheWriteUsdPerMillion: 3.75,
        outputUsdPerMillion: 15
      },
      "claude-sonnet-3.7": {
        inputUsdPerMillion: 3,
        cachedInputUsdPerMillion: 0.3,
        cacheWriteUsdPerMillion: 3.75,
        outputUsdPerMillion: 15
      },
      "claude-sonnet-3.5": {
        inputUsdPerMillion: 3,
        cachedInputUsdPerMillion: 0.3,
        cacheWriteUsdPerMillion: 3.75,
        outputUsdPerMillion: 15
      },
      "claude-opus-4.1": {
        inputUsdPerMillion: 15,
        cachedInputUsdPerMillion: 1.5,
        cacheWriteUsdPerMillion: 18.75,
        outputUsdPerMillion: 75
      },
      "claude-opus-4": {
        inputUsdPerMillion: 15,
        cachedInputUsdPerMillion: 1.5,
        cacheWriteUsdPerMillion: 18.75,
        outputUsdPerMillion: 75
      },
      "claude-opus-3": {
        inputUsdPerMillion: 15,
        cachedInputUsdPerMillion: 1.5,
        cacheWriteUsdPerMillion: 18.75,
        outputUsdPerMillion: 75
      },
      "claude-haiku-3.5": {
        inputUsdPerMillion: 0.8,
        cachedInputUsdPerMillion: 0.08,
        cacheWriteUsdPerMillion: 1,
        outputUsdPerMillion: 4
      },
      "claude-haiku-3": {
        inputUsdPerMillion: 0.25,
        cachedInputUsdPerMillion: 0.03,
        cacheWriteUsdPerMillion: 0.3,
        outputUsdPerMillion: 1.25
      }
    }
  }
};

function sanitizePricingPage(content: string): string {
  return content
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x2F;/g, "/")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(value: string): number | null {
  const normalized = value.replace(/,/g, "").trim();
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function parseOpenAIRateCard(
  content: string,
  modelLabel: string
): ModelRateCard | null {
  const escapedLabel = modelLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `${escapedLabel}[\\s\\S]{0,400}?Input:\\s*\\$([0-9.,]+)\\s*/\\s*1M tokens[\\s\\S]{0,200}?Cached input:\\s*(?:\\$([0-9.,]+)\\s*/\\s*1M tokens|-)[\\s\\S]{0,200}?Output:\\s*\\$([0-9.,]+)\\s*/\\s*1M tokens`,
    "i"
  );
  const match = pattern.exec(content);

  if (!match) {
    return null;
  }

  const input = parseNumber(match[1] ?? "");
  const cachedInput =
    typeof match[2] === "string" ? parseNumber(match[2]) : null;
  const output = parseNumber(match[3] ?? "");

  if (input === null || output === null) {
    return null;
  }

  return {
    inputUsdPerMillion: input,
    cachedInputUsdPerMillion: cachedInput,
    cacheWriteUsdPerMillion: null,
    outputUsdPerMillion: output
  };
}

function parseAnthropicRateCard(
  content: string,
  modelLabel: string
): ModelRateCard | null {
  const escapedLabel = modelLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `${escapedLabel}\\s*\\|\\s*\\$([0-9.,]+)\\s*/\\s*MTok\\s*\\|\\s*\\$([0-9.,]+)\\s*/\\s*MTok\\s*\\|\\s*\\$([0-9.,]+)\\s*/\\s*MTok\\s*\\|\\s*\\$([0-9.,]+)\\s*/\\s*MTok\\s*\\|\\s*\\$([0-9.,]+)\\s*/\\s*MTok`,
    "i"
  );
  const match = pattern.exec(content);

  if (!match) {
    return null;
  }

  const input = parseNumber(match[1] ?? "");
  const cacheWrite = parseNumber(match[2] ?? "");
  const cachedInput = parseNumber(match[4] ?? "");
  const output = parseNumber(match[5] ?? "");

  if (
    input === null ||
    cacheWrite === null ||
    cachedInput === null ||
    output === null
  ) {
    return null;
  }

  return {
    inputUsdPerMillion: input,
    cachedInputUsdPerMillion: cachedInput,
    cacheWriteUsdPerMillion: cacheWrite,
    outputUsdPerMillion: output
  };
}

async function fetchPricingPage(
  url: string,
  fetchImpl: typeof fetch
): Promise<string | null> {
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        "user-agent": "agent-badge/1"
      }
    });

    if (!response.ok) {
      return null;
    }

    return sanitizePricingPage(await response.text());
  } catch {
    return null;
  }
}

async function fetchOpenAIPricingCatalog(
  fetchImpl: typeof fetch
): Promise<Readonly<Record<string, ModelRateCard>> | null> {
  const content = await fetchPricingPage(OPENAI_PRICING_URL, fetchImpl);

  if (content === null) {
    return null;
  }

  const parsed = {
    "gpt-5": parseOpenAIRateCard(content, "GPT-5"),
    "gpt-5-mini": parseOpenAIRateCard(content, "GPT-5 mini"),
    "gpt-5-nano": parseOpenAIRateCard(content, "GPT-5 nano"),
    "gpt-5-pro": parseOpenAIRateCard(content, "GPT-5 pro"),
    "gpt-5.4": parseOpenAIRateCard(content, "GPT-5.4"),
    "gpt-5.4-mini": parseOpenAIRateCard(content, "GPT-5.4 mini")
  };

  const entries = Object.entries(parsed).filter(
    (entry): entry is [string, ModelRateCard] => entry[1] !== null
  );

  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

async function fetchAnthropicPricingCatalog(
  fetchImpl: typeof fetch
): Promise<Readonly<Record<string, ModelRateCard>> | null> {
  const content = await fetchPricingPage(ANTHROPIC_PRICING_URL, fetchImpl);

  if (content === null) {
    return null;
  }

  const parsed = {
    "claude-sonnet-4": parseAnthropicRateCard(content, "Claude Sonnet 4"),
    "claude-sonnet-3.7": parseAnthropicRateCard(content, "Claude Sonnet 3.7"),
    "claude-sonnet-3.5": parseAnthropicRateCard(
      content,
      "Claude Sonnet 3.5 (deprecated)"
    ),
    "claude-opus-4.1": parseAnthropicRateCard(content, "Claude Opus 4.1"),
    "claude-opus-4": parseAnthropicRateCard(content, "Claude Opus 4"),
    "claude-opus-3": parseAnthropicRateCard(content, "Claude Opus 3 (deprecated)"),
    "claude-haiku-3.5": parseAnthropicRateCard(content, "Claude Haiku 3.5"),
    "claude-haiku-3": parseAnthropicRateCard(content, "Claude Haiku 3")
  };

  const entries = Object.entries(parsed).filter(
    (entry): entry is [string, ModelRateCard] => entry[1] !== null
  );

  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

async function readCachedPricingCatalog(
  cwd: string,
  now: Date
): Promise<PricingCatalog | null> {
  try {
    const parsed = pricingCatalogSchema.parse(
      JSON.parse(await readFile(join(cwd, PRICING_CACHE_FILE), "utf8"))
    );

    if (parsed.fetchedAt === null) {
      return parsed;
    }

    if (now.getTime() - Date.parse(parsed.fetchedAt) > PRICING_CACHE_TTL_MS) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

async function writeCachedPricingCatalog(
  cwd: string,
  catalog: PricingCatalog
): Promise<void> {
  const cachePath = join(cwd, PRICING_CACHE_FILE);

  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(
    cachePath,
    `${JSON.stringify(pricingCatalogSchema.parse(catalog), null, 2)}\n`,
    "utf8"
  );
}

export async function resolvePricingCatalog({
  cwd,
  now = new Date(),
  fetchImpl = fetch
}: ResolvePricingCatalogOptions): Promise<PricingCatalog> {
  const cached = await readCachedPricingCatalog(cwd, now);

  if (cached !== null) {
    return cached;
  }

  const [openai, anthropic] = await Promise.all([
    fetchOpenAIPricingCatalog(fetchImpl),
    fetchAnthropicPricingCatalog(fetchImpl)
  ]);
  const catalog: PricingCatalog = {
    fetchedAt:
      openai !== null || anthropic !== null ? now.toISOString() : null,
    sources: fallbackPricingCatalog.sources,
    providers: {
      openai: {
        ...fallbackPricingCatalog.providers.openai,
        ...(openai ?? {})
      },
      anthropic: {
        ...fallbackPricingCatalog.providers.anthropic,
        ...(anthropic ?? {})
      }
    }
  };

  if (catalog.fetchedAt !== null) {
    await writeCachedPricingCatalog(cwd, catalog).catch(() => {
      // Pricing cache is a best-effort optimization.
    });
  }

  return catalog;
}

function normalizeOpenAIModel(model: string): string | null {
  const normalized = model.trim().toLowerCase();

  if (normalized.length === 0) {
    return null;
  }

  if (normalized.startsWith("gpt-5.4-mini")) {
    return "gpt-5.4-mini";
  }

  if (normalized.startsWith("gpt-5.4")) {
    return "gpt-5.4";
  }

  if (normalized.includes("mini")) {
    return "gpt-5-mini";
  }

  if (normalized.includes("nano")) {
    return "gpt-5-nano";
  }

  if (normalized.includes("pro")) {
    return "gpt-5-pro";
  }

  if (normalized.startsWith("gpt-5")) {
    return "gpt-5";
  }

  return null;
}

function normalizeAnthropicModel(model: string): string | null {
  const normalized = model.trim().toLowerCase();

  if (normalized.length === 0) {
    return null;
  }

  if (normalized.includes("sonnet-4") || normalized.includes("sonnet 4")) {
    return "claude-sonnet-4";
  }

  if (normalized.includes("3-7-sonnet") || normalized.includes("sonnet 3.7")) {
    return "claude-sonnet-3.7";
  }

  if (normalized.includes("3-5-sonnet") || normalized.includes("sonnet 3.5")) {
    return "claude-sonnet-3.5";
  }

  if (normalized.includes("opus-4.1") || normalized.includes("opus 4.1")) {
    return "claude-opus-4.1";
  }

  if (normalized.includes("opus-4") || normalized.includes("opus 4")) {
    return "claude-opus-4";
  }

  if (normalized.includes("opus-3") || normalized.includes("opus 3")) {
    return "claude-opus-3";
  }

  if (normalized.includes("haiku-3.5") || normalized.includes("haiku 3.5")) {
    return "claude-haiku-3.5";
  }

  if (normalized.includes("haiku-3") || normalized.includes("haiku 3")) {
    return "claude-haiku-3";
  }

  return null;
}

function toUsdMicros(
  tokenCount: number,
  usdPerMillion: number | null
): number {
  if (usdPerMillion === null || tokenCount <= 0) {
    return 0;
  }

  return Math.round(tokenCount * usdPerMillion);
}

function estimateClaudeSessionCostUsdMicros(
  session: NormalizedSessionSummary,
  rateCard: ModelRateCard
): number {
  return (
    toUsdMicros(session.tokenUsage.input ?? 0, rateCard.inputUsdPerMillion) +
    toUsdMicros(
      session.tokenUsage.cacheCreation ?? 0,
      rateCard.cacheWriteUsdPerMillion
    ) +
    toUsdMicros(
      session.tokenUsage.cacheRead ?? 0,
      rateCard.cachedInputUsdPerMillion
    ) +
    toUsdMicros(session.tokenUsage.output ?? 0, rateCard.outputUsdPerMillion)
  );
}

function estimateOpenAISessionCostUsdMicros(
  usage: {
    readonly uncachedInputTokens: number;
    readonly cachedInputTokens: number;
    readonly outputTokens: number;
  },
  rateCard: ModelRateCard
): number {
  return (
    toUsdMicros(usage.uncachedInputTokens, rateCard.inputUsdPerMillion) +
    toUsdMicros(usage.cachedInputTokens, rateCard.cachedInputUsdPerMillion) +
    toUsdMicros(usage.outputTokens, rateCard.outputUsdPerMillion)
  );
}

function parseCodexRolloutUsageLine(line: string): CodexRolloutUsage | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(line) as unknown;
  } catch {
    return null;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("type" in parsed) ||
    parsed.type !== "event_msg" ||
    !("payload" in parsed)
  ) {
    return null;
  }

  const payload = parsed.payload;

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("type" in payload) ||
    payload.type !== "token_count" ||
    !("info" in payload)
  ) {
    return null;
  }

  const info = payload.info;

  if (
    typeof info !== "object" ||
    info === null ||
    !("total_token_usage" in info)
  ) {
    return null;
  }

  const totalTokenUsage = info.total_token_usage as Record<string, unknown>;

  if (typeof totalTokenUsage !== "object" || totalTokenUsage === null) {
    return null;
  }

  const inputTokens =
    typeof totalTokenUsage.input_tokens === "number"
      ? totalTokenUsage.input_tokens
      : null;
  const cachedInputTokens =
    typeof totalTokenUsage.cached_input_tokens === "number"
      ? totalTokenUsage.cached_input_tokens
      : null;
  const outputTokens =
    typeof totalTokenUsage.output_tokens === "number"
      ? totalTokenUsage.output_tokens
      : null;
  const reasoningOutputTokens =
    typeof totalTokenUsage.reasoning_output_tokens === "number"
      ? totalTokenUsage.reasoning_output_tokens
      : null;
  const totalTokens =
    typeof totalTokenUsage.total_tokens === "number"
      ? totalTokenUsage.total_tokens
      : null;

  if (
    inputTokens === null ||
    cachedInputTokens === null ||
    outputTokens === null ||
    reasoningOutputTokens === null ||
    totalTokens === null
  ) {
    return null;
  }

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
    totalTokens
  };
}

async function readTail(path: string, bytes: number): Promise<string | null> {
  let handle: Awaited<ReturnType<typeof open>> | null = null;

  try {
    handle = await open(path, "r");
    const stats = await handle.stat();
    const length = Math.min(bytes, stats.size);
    const start = Math.max(0, stats.size - length);
    const buffer = Buffer.alloc(length);

    await handle.read(buffer, 0, length, start);

    return buffer.toString("utf8");
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {
      // Ignore close failures.
    });
  }
}

function parseLatestCodexRolloutUsage(content: string): CodexRolloutUsage | null {
  let latest: CodexRolloutUsage | null = null;

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const usage = parseCodexRolloutUsageLine(line);

    if (usage !== null) {
      latest = usage;
    }
  }

  return latest;
}

async function readLatestCodexRolloutUsage(
  rolloutPath: string
): Promise<CodexRolloutUsage | null> {
  const tail = await readTail(rolloutPath, ROLLOUT_USAGE_TAIL_BYTES);

  if (tail !== null) {
    const fromTail = parseLatestCodexRolloutUsage(tail);

    if (fromTail !== null) {
      return fromTail;
    }
  }

  try {
    return parseLatestCodexRolloutUsage(await readFile(rolloutPath, "utf8"));
  } catch {
    return null;
  }
}

async function hydrateCodexRolloutUsageBySessionId(
  homeRoot: string,
  sessionIds: readonly string[]
): Promise<Readonly<Record<string, CodexRolloutUsage>>> {
  if (sessionIds.length === 0) {
    return {};
  }

  const dbPath = await findLatestCodexStateDatabase(join(homeRoot, ".codex"));

  if (dbPath === null) {
    return {};
  }

  const rolloutRows = await loadCodexThreadRolloutRowsByIds(dbPath, sessionIds);
  const entries = await Promise.all(
    rolloutRows.map(async (row) => {
      if (row.rolloutPath === null) {
        return null;
      }

      const usage = await readLatestCodexRolloutUsage(row.rolloutPath);

      return usage === null ? null : ([row.id, usage] as const);
    })
  );

  return Object.fromEntries(
    entries.filter((entry): entry is readonly [string, CodexRolloutUsage] => entry !== null)
  );
}

export async function estimateSessionCostsUsdMicrosByKey({
  sessions,
  homeRoot,
  pricingCatalog
}: EstimateSessionCostsOptions): Promise<Readonly<Record<string, number>>> {
  const codexSessionIds = sessions
    .filter(
      (session) =>
        session.provider === "codex" &&
        session.tokenUsage.input === null &&
        session.metadata.model !== null
    )
    .map((session) => session.providerSessionId);
  const codexUsageBySessionId = await hydrateCodexRolloutUsageBySessionId(
    homeRoot,
    codexSessionIds
  );

  return Object.fromEntries(
    sessions.map((session) => {
      let estimatedCostUsdMicros = 0;
      const model = session.metadata.model;

      if (model === null) {
        return [`${session.provider}:${session.providerSessionId}`, 0] as const;
      }

      if (session.metadata.modelProvider === "anthropic") {
        const normalizedModel = normalizeAnthropicModel(model);
        const rateCard =
          normalizedModel === null
            ? null
            : pricingCatalog.providers.anthropic[normalizedModel] ?? null;

        if (rateCard === null) {
          return [`${session.provider}:${session.providerSessionId}`, 0] as const;
        }

        estimatedCostUsdMicros = estimateClaudeSessionCostUsdMicros(
          session,
          rateCard
        );
        return [
          `${session.provider}:${session.providerSessionId}`,
          estimatedCostUsdMicros
        ] as const;
      }

      if (session.metadata.modelProvider === "openai") {
        const normalizedModel = normalizeOpenAIModel(model);
        const rateCard =
          normalizedModel === null
            ? null
            : pricingCatalog.providers.openai[normalizedModel] ?? null;

        if (rateCard === null) {
          return [`${session.provider}:${session.providerSessionId}`, 0] as const;
        }

        const hydratedUsage = codexUsageBySessionId[session.providerSessionId];
        const cachedInputTokens =
          hydratedUsage?.cachedInputTokens ?? session.tokenUsage.cacheRead ?? 0;
        const inputTokens =
          hydratedUsage === undefined
            ? session.tokenUsage.input ?? 0
            : Math.max(
                hydratedUsage.inputTokens - hydratedUsage.cachedInputTokens,
                0
              );
        const outputTokens =
          hydratedUsage?.outputTokens ?? session.tokenUsage.output ?? 0;

        estimatedCostUsdMicros = estimateOpenAISessionCostUsdMicros(
          {
            uncachedInputTokens: inputTokens,
            cachedInputTokens,
            outputTokens
          },
          rateCard
        );
        return [
          `${session.provider}:${session.providerSessionId}`,
          estimatedCostUsdMicros
        ] as const;
      }

      return [`${session.provider}:${session.providerSessionId}`, 0] as const;
    })
  );
}

export async function estimateIncludedCostUsdMicros(
  options: EstimateIncludedCostOptions
): Promise<number> {
  const byKey = await estimateSessionCostsUsdMicrosByKey(options);

  return Object.values(byKey).reduce((sum, value) => sum + value, 0);
}

export function formatEstimatedCostUsd(micros: number): string {
  const usd = micros / 1_000_000;

  if (Math.abs(usd) < 1_000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(usd);
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1
  })
    .format(usd)
    .replace(/\.0(?=[A-Za-z])/g, "")
    .replace(/K\b/g, "k");
}
