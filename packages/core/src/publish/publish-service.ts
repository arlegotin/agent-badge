import { createHash } from "node:crypto";

import type { AttributeBackfillSessionsResult } from "../attribution/attribution-types.js";
import type { AgentBadgeConfig } from "../config/config-schema.js";
import type { RunFullBackfillScanResult } from "../scan/full-backfill.js";
import type { AgentBadgeState } from "../state/state-schema.js";
import { AGENT_BADGE_GIST_FILE } from "./badge-url.js";
import {
  buildEndpointBadgePayload,
  type IncludedTotals
} from "./badge-payload.js";
import type { GitHubGistClient } from "./github-gist-client.js";

export interface PublishBadgeToGistOptions {
  readonly config: Pick<AgentBadgeConfig, "badge" | "publish">;
  readonly state: AgentBadgeState;
  readonly scan: RunFullBackfillScanResult;
  readonly attribution: AttributeBackfillSessionsResult;
  readonly client: GitHubGistClient;
}

function buildSessionKey(
  session: { readonly provider: string; readonly providerSessionId: string }
): string {
  return `${session.provider}:${session.providerSessionId}`;
}

function collectIncludedTotals(
  scan: RunFullBackfillScanResult,
  attribution: AttributeBackfillSessionsResult
): IncludedTotals {
  const scannedSessionKeys = new Set(
    scan.sessions.map((session) => buildSessionKey(session))
  );
  let sessions = 0;
  let tokens = 0;

  for (const attributedSession of attribution.sessions) {
    if (attributedSession.status !== "included") {
      continue;
    }

    if (!scannedSessionKeys.has(buildSessionKey(attributedSession.session))) {
      continue;
    }

    sessions += 1;
    tokens += attributedSession.session.tokenUsage.total;
  }

  return {
    sessions,
    tokens
  };
}

export async function publishBadgeToGist({
  config,
  state,
  scan,
  attribution,
  client
}: PublishBadgeToGistOptions): Promise<AgentBadgeState> {
  if (config.publish.gistId === null) {
    throw new Error("Cannot publish badge JSON without a configured gist id.");
  }

  const includedTotals = collectIncludedTotals(scan, attribution);
  const payload = buildEndpointBadgePayload({
    label: config.badge.label,
    mode: config.badge.mode,
    includedTotals
  });
  const serializedPayload = `${JSON.stringify(payload, null, 2)}\n`;

  // Publish always overwrites the deterministic agent-badge.json file in place.
  await client.updateGistFile({
    gistId: config.publish.gistId,
    files: {
      [AGENT_BADGE_GIST_FILE]: {
        content: serializedPayload
      }
    }
  });

  return {
    ...state,
    publish: {
      ...state.publish,
      status: "published",
      gistId: config.publish.gistId,
      lastPublishedHash: createHash("sha256")
        .update(serializedPayload)
        .digest("hex")
    }
  };
}
