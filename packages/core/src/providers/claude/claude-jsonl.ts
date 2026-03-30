import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";

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
  readonly relativePath: string;
  readonly projectKey: string;
  readonly rows: ClaudeProjectJsonlRow[];
}

export interface ClaudeProjectJsonlFile {
  readonly filePath: string;
  readonly relativePath: string;
  readonly projectKey: string;
  readonly fallbackSessionId: string;
  readonly modifiedAtMs: number;
  readonly size: number;
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

export async function listClaudeProjectJsonlFiles(
  claudeRoot: string
): Promise<ClaudeProjectJsonlFile[]> {
  const projectsRoot = join(claudeRoot, "projects");
  const jsonlFiles = await findJsonlFiles(projectsRoot);

  return Promise.all(
    jsonlFiles.map(async (filePath) => {
      const fileStat = await stat(filePath);
      const relativePath = relative(projectsRoot, filePath);
      const pathSegments = relativePath
        .split(sep)
        .filter((segment) => segment.length > 0);

      return {
        filePath,
        relativePath,
        projectKey: pathSegments[0] ?? basename(filePath, ".jsonl"),
        fallbackSessionId: basename(filePath, ".jsonl"),
        modifiedAtMs: fileStat.mtimeMs,
        size: fileStat.size
      };
    })
  );
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

export async function readClaudeProjectJsonlSessionsFromFiles(
  files: readonly ClaudeProjectJsonlFile[]
): Promise<ClaudeProjectJsonlSession[]> {
  return Promise.all(
    files.map(async (file) => {
      const content = await readFile(file.filePath, "utf8");
      const rows = content
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map((line) => parseClaudeJsonlLine(line, file.fallbackSessionId))
        .filter((row): row is ClaudeProjectJsonlRow => row !== null);

      return {
        sessionId: rows[0]?.sessionId ?? file.fallbackSessionId,
        filePath: file.filePath,
        relativePath: file.relativePath,
        projectKey: file.projectKey,
        rows
      };
    })
  );
}

export async function readClaudeProjectJsonlSessions(
  claudeRoot: string
): Promise<ClaudeProjectJsonlSession[]> {
  const files = await listClaudeProjectJsonlFiles(claudeRoot);

  return readClaudeProjectJsonlSessionsFromFiles(files);
}
