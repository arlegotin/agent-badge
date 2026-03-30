import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

export interface ClaudeUsage {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly cacheCreationInputTokens: number | null;
  readonly cacheReadInputTokens: number | null;
}

export interface ClaudeProjectJsonlRow {
  readonly sessionId: string;
  readonly timestamp: string | null;
  readonly type: string | null;
  readonly cwd: string | null;
  readonly gitBranch: string | null;
  readonly gitOriginUrl: string | null;
  readonly messageId: string | null;
  readonly messageRole: string | null;
  readonly model: string | null;
  readonly usage: ClaudeUsage | null;
}

export interface ClaudeProjectJsonlSession {
  readonly sessionId: string;
  readonly filePath: string;
  readonly rows: ClaudeProjectJsonlRow[];
}

interface ClaudeJsonlMessage {
  readonly role?: unknown;
  readonly id?: unknown;
  readonly model?: unknown;
  readonly usage?: {
    readonly input_tokens?: unknown;
    readonly output_tokens?: unknown;
    readonly cache_creation_input_tokens?: unknown;
    readonly cache_read_input_tokens?: unknown;
  };
}

interface RawClaudeJsonlRow {
  readonly sessionId?: unknown;
  readonly timestamp?: unknown;
  readonly type?: unknown;
  readonly cwd?: unknown;
  readonly gitBranch?: unknown;
  readonly gitOriginUrl?: unknown;
  readonly message?: ClaudeJsonlMessage;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

async function findJsonlFiles(root: string): Promise<string[]> {
  let entries;

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(root, entry.name);

      if (entry.isDirectory()) {
        return findJsonlFiles(entryPath);
      }

      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        return [entryPath];
      }

      return [];
    })
  );

  return nestedFiles.flat().sort();
}

function parseClaudeJsonlLine(
  line: string,
  fallbackSessionId: string
): ClaudeProjectJsonlRow | null {
  let parsed: RawClaudeJsonlRow;

  try {
    parsed = JSON.parse(line) as RawClaudeJsonlRow;
  } catch {
    return null;
  }

  const usage = parsed.message?.usage;

  return {
    sessionId: asString(parsed.sessionId) ?? fallbackSessionId,
    timestamp: asString(parsed.timestamp),
    type: asString(parsed.type),
    cwd: asString(parsed.cwd),
    gitBranch: asString(parsed.gitBranch),
    gitOriginUrl: asString(parsed.gitOriginUrl),
    messageId: asString(parsed.message?.id),
    messageRole: asString(parsed.message?.role),
    model: asString(parsed.message?.model),
    usage:
      usage === undefined
        ? null
        : {
            inputTokens: asInteger(usage.input_tokens),
            outputTokens: asInteger(usage.output_tokens),
            cacheCreationInputTokens: asInteger(
              usage.cache_creation_input_tokens
            ),
            cacheReadInputTokens: asInteger(usage.cache_read_input_tokens)
          }
  };
}

export async function readClaudeProjectJsonlSessions(
  claudeRoot: string
): Promise<ClaudeProjectJsonlSession[]> {
  const jsonlFiles = await findJsonlFiles(join(claudeRoot, "projects"));

  return Promise.all(
    jsonlFiles.map(async (filePath) => {
      const content = await readFile(filePath, "utf8");
      const fallbackSessionId = basename(filePath, ".jsonl");
      const rows = content
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map((line) => parseClaudeJsonlLine(line, fallbackSessionId))
        .filter((row): row is ClaudeProjectJsonlRow => row !== null);

      return {
        sessionId: rows[0]?.sessionId ?? fallbackSessionId,
        filePath,
        rows
      };
    })
  );
}
