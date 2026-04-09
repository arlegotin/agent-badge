export const AGENT_BADGE_README_START_MARKER = "<!-- agent-badge:start -->";
export const AGENT_BADGE_README_END_MARKER = "<!-- agent-badge:end -->";
export const AGENT_BADGE_PROJECT_URL =
  "https://github.com/arlegotin/agent-badge";

export interface ReadmeBadgeMarkupOptions {
  readonly label: string;
  readonly badgeUrl: string;
  readonly linkUrl?: string | null;
}

const README_BADGE_BLOCK_PATTERN =
  /(?:^|\n)<!-- agent-badge:start -->\n[\s\S]*?\n<!-- agent-badge:end -->\n*/g;

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function buildManagedBadgeBlock(badgeMarkdown: string): string {
  return `${AGENT_BADGE_README_START_MARKER}
${badgeMarkdown}
${AGENT_BADGE_README_END_MARKER}
`;
}

export function buildReadmeBadgeMarkdown({
  label,
  badgeUrl,
  linkUrl = null
}: ReadmeBadgeMarkupOptions): string {
  const imageMarkdown = `![${label}](${badgeUrl})`;

  return linkUrl === null ? imageMarkdown : `[${imageMarkdown}](${linkUrl})`;
}

export function buildReadmeBadgeSnippet(
  options: ReadmeBadgeMarkupOptions
): string {
  return buildReadmeBadgeMarkdown(options);
}

export function upsertReadmeBadge(
  content: string,
  badgeMarkdown: string
): string {
  const managedBlock = buildManagedBadgeBlock(badgeMarkdown);
  const withoutManagedBlock = content.replace(README_BADGE_BLOCK_PATTERN, "");
  const normalizedContent = withoutManagedBlock.replace(/^\n+/, "");

  if (normalizedContent.length === 0) {
    return managedBlock;
  }

  return ensureTrailingNewline(`${managedBlock}\n${normalizedContent}`);
}
