import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { basename } from "node:path";
import { promisify } from "node:util";

import type { AgentBadgeConfig } from "../config/config-schema.js";

const execFileAsync = promisify(execFile);

export interface NormalizedGitRemoteUrl {
  readonly normalizedUrl: string;
  readonly host: string;
  readonly owner: string | null;
  readonly repo: string | null;
  readonly canonicalSlug: string | null;
}

export interface RepoFingerprint {
  readonly gitRoot: string;
  readonly gitRootRealPath: string;
  readonly gitRootBasename: string;
  readonly originUrlRaw: string | null;
  readonly originUrlNormalized: string | null;
  readonly host: string | null;
  readonly owner: string | null;
  readonly repo: string;
  readonly canonicalSlug: string | null;
  readonly aliasRemoteUrlsNormalized: string[];
  readonly aliasSlugs: string[];
}

export interface ResolveRepoFingerprintOptions {
  readonly cwd: string;
  readonly config?: Pick<AgentBadgeConfig, "repo">;
}

function trimOneTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function trimOneTrailingDotGit(value: string): string {
  return value.endsWith(".git") ? value.slice(0, -4) : value;
}

function toUrlLikeRemote(input: string): string | null {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  const scpStyleMatch =
    /^(?<user>[^@/\s]+)@(?<host>[^:/\s]+):(?<path>.+)$/.exec(trimmed);

  if (scpStyleMatch?.groups) {
    return `ssh://${scpStyleMatch.groups.user}@${scpStyleMatch.groups.host}/${scpStyleMatch.groups.path}`;
  }

  return trimmed;
}

function normalizeRepoPathname(pathname: string): string[] {
  const withoutLeadingSlash = pathname.replace(/^\/+/, "");
  const withoutTrailingSlash = trimOneTrailingSlash(withoutLeadingSlash);
  const withoutTrailingDotGit = trimOneTrailingDotGit(withoutTrailingSlash);
  const normalized = trimOneTrailingSlash(withoutTrailingDotGit);

  return normalized.split("/").filter(Boolean);
}

function normalizeSlugAlias(input: string): string | null {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  const remote = normalizeGitRemoteUrl(trimmed);

  if (remote?.canonicalSlug) {
    return remote.canonicalSlug;
  }

  const segments = normalizeRepoPathname(trimmed);

  if (segments.length !== 2) {
    return null;
  }

  return `${segments[0]!.toLowerCase()}/${segments[1]!.toLowerCase()}`;
}

function dedupe(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

async function execGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function getOriginUrl(cwd: string): Promise<string | null> {
  try {
    const originUrl = await execGit(cwd, ["remote", "get-url", "origin"]);
    return originUrl || null;
  } catch {
    return null;
  }
}

export function normalizeGitRemoteUrl(input: string): NormalizedGitRemoteUrl | null {
  const urlLikeRemote = toUrlLikeRemote(input);

  if (!urlLikeRemote) {
    return null;
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(urlLikeRemote);
  } catch {
    return null;
  }

  if (!["http:", "https:", "ssh:"].includes(parsedUrl.protocol)) {
    return null;
  }

  const host = parsedUrl.hostname.toLowerCase();
  const authority = parsedUrl.port ? `${host}:${parsedUrl.port}` : host;
  const pathSegments = normalizeRepoPathname(parsedUrl.pathname);

  if (pathSegments.length === 0) {
    return null;
  }

  const supportsCanonicalSlug =
    host === "github.com" ? pathSegments.length === 2 : pathSegments.length === 2;
  const owner = supportsCanonicalSlug ? pathSegments[0]!.toLowerCase() : null;
  const repo = supportsCanonicalSlug
    ? pathSegments[1]!.toLowerCase()
    : (pathSegments.at(-1) ?? null);
  const canonicalSlug =
    owner && repo ? `${owner}/${repo}` : null;
  const normalizedPath = canonicalSlug ?? pathSegments.join("/");

  return {
    normalizedUrl: `https://${authority}/${normalizedPath}`,
    host,
    owner,
    repo,
    canonicalSlug
  };
}

export async function resolveRepoFingerprint(
  options: ResolveRepoFingerprintOptions
): Promise<RepoFingerprint> {
  const gitRoot = await execGit(options.cwd, ["rev-parse", "--show-toplevel"]);
  const gitRootRealPath = await realpath(gitRoot);
  const gitRootBasename = basename(gitRootRealPath);
  const originUrlRaw = await getOriginUrl(options.cwd);
  const normalizedOrigin = originUrlRaw
    ? normalizeGitRemoteUrl(originUrlRaw)
    : null;

  return {
    gitRoot,
    gitRootRealPath,
    gitRootBasename,
    originUrlRaw,
    originUrlNormalized: normalizedOrigin?.normalizedUrl ?? null,
    host: normalizedOrigin?.host ?? null,
    owner: normalizedOrigin?.owner ?? null,
    repo: normalizedOrigin?.repo ?? gitRootBasename,
    canonicalSlug: normalizedOrigin?.canonicalSlug ?? null,
    aliasRemoteUrlsNormalized: dedupe(
      (options.config?.repo.aliases.remotes ?? [])
        .map((remoteUrl) => normalizeGitRemoteUrl(remoteUrl)?.normalizedUrl ?? null)
        .filter((remoteUrl): remoteUrl is string => remoteUrl !== null)
    ),
    aliasSlugs: dedupe(
      (options.config?.repo.aliases.slugs ?? [])
        .map((slug) => normalizeSlugAlias(slug))
        .filter((slug): slug is string => slug !== null)
    )
  };
}
