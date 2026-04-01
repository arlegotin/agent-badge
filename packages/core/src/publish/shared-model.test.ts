import { describe, expect, it } from "vitest";

import {
  AGENT_BADGE_CONTRIB_GIST_FILE_PREFIX,
  AGENT_BADGE_OVERRIDES_GIST_FILE,
  buildContributorGistFileName,
  buildSharedOverrideDigest,
  isContributorGistFileName,
  parseSharedContributorRecord,
  parseSharedOverridesRecord
} from "./shared-model.js";

describe("shared-model", () => {
  it("builds deterministic contributor gist file names", () => {
    expect(AGENT_BADGE_CONTRIB_GIST_FILE_PREFIX).toBe("agent-badge-contrib-");
    expect(buildContributorGistFileName("abc123")).toBe(
      "agent-badge-contrib-abc123.json"
    );
    expect(isContributorGistFileName("agent-badge-contrib-abc123.json")).toBe(
      true
    );
    expect(isContributorGistFileName(AGENT_BADGE_OVERRIDES_GIST_FILE)).toBe(
      false
    );
  });

  it("builds opaque shared override digests", () => {
    const digest = buildSharedOverrideDigest("codex:session-1");

    expect(digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(digest).toContain("sha256:");
    expect(digest).not.toContain("codex:session-1");
  });

  it("parses shared contributor records and rejects privacy-sensitive fields", () => {
    expect(
      parseSharedContributorRecord({
        schemaVersion: 1,
        publisherId: "pub-1",
        updatedAt: "2026-04-01T12:00:00.000Z",
        totals: {
          sessions: 2,
          tokens: 150,
          estimatedCostUsdMicros: null
        }
      })
    ).toEqual({
      schemaVersion: 1,
      publisherId: "pub-1",
      updatedAt: "2026-04-01T12:00:00.000Z",
      totals: {
        sessions: 2,
        tokens: 150,
        estimatedCostUsdMicros: null
      }
    });

    expect(() =>
      parseSharedContributorRecord({
        schemaVersion: 1,
        publisherId: "pub-1",
        updatedAt: "2026-04-01T12:00:00.000Z",
        totals: {
          sessions: 2,
          tokens: 150,
          estimatedCostUsdMicros: 99
        },
        cwd: "/Users/example/project",
        transcriptProjectKey: "Users-example-project",
        fileName: "session.jsonl",
        prompt: "secret",
        localPath: "/Users/example/project/session.jsonl"
      })
    ).toThrow();
  });

  it("parses shared overrides records and rejects privacy-sensitive fields", () => {
    expect(
      parseSharedOverridesRecord({
        schemaVersion: 1,
        overrides: {
          "sha256:abcd": {
            decision: "include",
            updatedAt: "2026-04-01T12:00:00.000Z",
            updatedByPublisherId: "pub-1"
          }
        }
      })
    ).toEqual({
      schemaVersion: 1,
      overrides: {
        "sha256:abcd": {
          decision: "include",
          updatedAt: "2026-04-01T12:00:00.000Z",
          updatedByPublisherId: "pub-1"
        }
      }
    });

    expect(() =>
      parseSharedOverridesRecord({
        schemaVersion: 1,
        overrides: {
          "sha256:abcd": {
            decision: "exclude",
            updatedAt: "2026-04-01T12:00:00.000Z",
            updatedByPublisherId: "pub-1",
            cwd: "/Users/example/project",
            transcriptProjectKey: "Users-example-project",
            fileName: "session.jsonl",
            prompt: "secret",
            localPath: "/Users/example/project/session.jsonl"
          }
        }
      })
    ).toThrow();
  });
});
