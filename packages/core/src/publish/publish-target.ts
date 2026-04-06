import type { AgentBadgeConfig } from "../config/config-schema.js";
import type { GitHubAuthStatus } from "../init/github-auth.js";
import type { AgentBadgeState } from "../state/state-schema.js";
import { AGENT_BADGE_GIST_FILE, buildStableBadgeUrl } from "./badge-url.js";
import {
  createGitHubGistClient,
  type GitHubGist,
  type GitHubGistClient
} from "./github-gist-client.js";

const AGENT_BADGE_GIST_DESCRIPTION = "agent-badge publish target";

export type PublishTargetStatus =
  | "created"
  | "connected"
  | "reused"
  | "deferred";

export interface PublishTargetResult {
  readonly status: PublishTargetStatus;
  readonly gistId: string | null;
  readonly badgeUrl: string | null;
  readonly reason?:
    | "auth-missing"
    | "gist-not-public"
    | "gist-missing-owner"
    | "gist-unreachable"
    | "gist-create-failed";
}

export interface EnsurePublishTargetOptions {
  readonly config: AgentBadgeConfig;
  readonly state: AgentBadgeState;
  readonly githubAuth: GitHubAuthStatus;
  readonly gistId?: string;
  readonly client?: GitHubGistClient;
}

export interface DeletePublishTargetOptions {
  readonly gistId: string;
  readonly client?: GitHubGistClient;
}

export interface DeletePublishTargetResult {
  readonly gistId: string;
  readonly deleted: boolean;
}

function normalizeGistId(value: string | null | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function buildPublishTargetResult(
  status: Exclude<PublishTargetStatus, "deferred">,
  gist: GitHubGist,
  config: AgentBadgeConfig
): PublishTargetResult {
  if (!gist.public) {
    return {
      status: "deferred",
      gistId: null,
      badgeUrl: null,
      reason: "gist-not-public"
    };
  }

  if (!gist.ownerLogin) {
    return {
      status: "deferred",
      gistId: null,
      badgeUrl: null,
      reason: "gist-missing-owner"
    };
  }

  return {
    status,
    gistId: gist.id,
    badgeUrl: buildStableBadgeUrl({
      ownerLogin: gist.ownerLogin,
      gistId: gist.id,
      cacheSeconds: config.badge.cacheSeconds
    })
  };
}

function buildPendingBadgeJson(config: AgentBadgeConfig): string {
  return JSON.stringify({
    schemaVersion: 1,
    label: config.badge.label,
    message: "pending",
    color: config.badge.colorZero
  });
}

function buildDeferredResult(
  reason: PublishTargetResult["reason"]
): PublishTargetResult {
  return {
    status: "deferred",
    gistId: null,
    badgeUrl: null,
    reason
  };
}

async function loadExistingGistTarget(
  gistId: string,
  status: Extract<PublishTargetStatus, "connected" | "reused">,
  config: AgentBadgeConfig,
  client: GitHubGistClient
): Promise<PublishTargetResult> {
  try {
    const gist = await client.getGist(gistId);
    return buildPublishTargetResult(status, gist, config);
  } catch {
    return buildDeferredResult("gist-unreachable");
  }
}

export async function ensurePublishTarget(
  options: EnsurePublishTargetOptions
): Promise<PublishTargetResult> {
  const explicitGistId = normalizeGistId(options.gistId);
  const configuredGistId = normalizeGistId(options.config.publish.gistId);

  if (!explicitGistId && !configuredGistId && !options.githubAuth.available) {
    return buildDeferredResult("auth-missing");
  }

  const client = options.client ?? createGitHubGistClient();

  if (explicitGistId) {
    return loadExistingGistTarget(explicitGistId, "connected", options.config, client);
  }

  if (configuredGistId) {
    return loadExistingGistTarget(configuredGistId, "reused", options.config, client);
  }

  try {
    const gist = await client.createPublicGist({
      description: AGENT_BADGE_GIST_DESCRIPTION,
      files: {
        [AGENT_BADGE_GIST_FILE]: {
          content: buildPendingBadgeJson(options.config)
        }
      }
    });

    return buildPublishTargetResult("created", gist, options.config);
  } catch {
    return buildDeferredResult("gist-create-failed");
  }
}

export async function deletePublishTarget(
  options: DeletePublishTargetOptions
): Promise<DeletePublishTargetResult> {
  const gistId = options.gistId.trim();

  if (gistId.length === 0) {
    return {
      gistId,
      deleted: false
    };
  }

  const client = options.client ?? createGitHubGistClient();

  try {
    await client.deleteGist({
      gistId
    });
  } catch {
    return {
      gistId,
      deleted: false
    };
  }

  return {
    gistId,
    deleted: true
  };
}
