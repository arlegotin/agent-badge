export const AGENT_BADGE_GIST_FILE = "agent-badge.json";
export const AGENT_BADGE_COMBINED_GIST_FILE = "agent-badge-combined.json";
export const AGENT_BADGE_TOKENS_GIST_FILE = "agent-badge-tokens.json";
export const AGENT_BADGE_COST_GIST_FILE = "agent-badge-cost.json";

const BADGE_ENDPOINT_URL = "https://img.shields.io/endpoint";
const DEFAULT_BADGE_CACHE_SECONDS = 300;

export interface StableBadgeUrlInput {
  readonly ownerLogin: string;
  readonly gistId: string;
  readonly fileName?: string;
  readonly cacheSeconds?: number;
}

export function buildStableBadgeUrl({
  ownerLogin,
  gistId,
  fileName = AGENT_BADGE_GIST_FILE,
  cacheSeconds = DEFAULT_BADGE_CACHE_SECONDS
}: StableBadgeUrlInput): string {
  const rawUrl = `https://gist.githubusercontent.com/${encodeURIComponent(
    ownerLogin
  )}/${encodeURIComponent(gistId)}/raw/${encodeURIComponent(fileName)}`;

  return `${BADGE_ENDPOINT_URL}?url=${encodeURIComponent(
    rawUrl
  )}&cacheSeconds=${cacheSeconds}`;
}
