export const AGENT_BADGE_GIST_FILE = "agent-badge.json";

const BADGE_ENDPOINT_URL = "https://img.shields.io/endpoint";
const BADGE_CACHE_QUERY = "cacheSeconds=3600";

export interface StableBadgeUrlInput {
  readonly ownerLogin: string;
  readonly gistId: string;
}

export function buildStableBadgeUrl({
  ownerLogin,
  gistId
}: StableBadgeUrlInput): string {
  const rawUrl = `https://gist.githubusercontent.com/${encodeURIComponent(
    ownerLogin
  )}/${encodeURIComponent(gistId)}/raw/${AGENT_BADGE_GIST_FILE}`;

  return `${BADGE_ENDPOINT_URL}?url=${encodeURIComponent(rawUrl)}&${BADGE_CACHE_QUERY}`;
}
