import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  AGENT_BADGE_GIST_FILE,
  buildStableBadgeUrl,
  defaultAgentBadgeConfig,
  parseAgentBadgeConfig,
  parseAgentBadgeState,
  type RunDoctorChecksResult
} from "@agent-badge/core";
import {
  AGENT_BADGE_README_END_MARKER,
  AGENT_BADGE_README_START_MARKER
} from "../publish/readme-badge.js";
import {
  agentBadgeHookEndMarker,
  agentBadgeHookStartMarker
} from "../init/runtime-wiring.js";
import { runDoctorChecks } from "./index.js";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

interface RepoFixture {
  readonly root: string;
  cleanup(): Promise<void>;
}

interface DoctorFixture {
  readonly repo: RepoFixture;
  readonly home: RepoFixture;
}

async function writeJsonFile(
  root: string,
  relativePath: string,
  value: unknown
): Promise<void> {
  const target = join(root, relativePath);

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createRepoFixture(options: {
  readonly withReadme?: boolean;
  readonly withManagedReadme?: boolean;
  readonly withManagedHook?: boolean;
  readonly withCodexProvider?: boolean;
  readonly withClaudeProvider?: boolean;
  readonly gistId?: string;
  readonly withShieldsMarker?: boolean;
} = {}): Promise<DoctorFixture> {
  const repoRoot = await mkdtemp(join(tmpdir(), "agent-badge-doctor-"));
  const homeRoot = await mkdtemp(join(tmpdir(), "agent-badge-doctor-home-"));

  await execFileAsync("git", ["init", "--quiet"], { cwd: repoRoot });

  if (options.withReadme ?? true) {
    const readmeContent = options.withManagedReadme
      ? `Repository\n${AGENT_BADGE_README_START_MARKER}\n![AI Usage](https://example.com/badge.svg)\n${AGENT_BADGE_README_END_MARKER}\n`
      : "Repository";
    await writeFile(join(repoRoot, "README.md"), readmeContent, "utf8");
  }

  if (options.withManagedHook ?? true) {
    await mkdir(dirname(join(repoRoot, ".git/hooks/pre-push")), { recursive: true });
    const hookBlock = [
      agentBadgeHookStartMarker,
      "agent-badge refresh --hook pre-push --fail-soft",
      agentBadgeHookEndMarker,
      ""
    ].join("\n");
    await writeFile(join(repoRoot, ".git/hooks/pre-push"), `${hookBlock}\n`, "utf8");
  }

  const gistId = options.gistId ?? "doctorgist";
  const badgeUrl = buildStableBadgeUrl({
    ownerLogin: "octocat",
    gistId
  });
  const config = {
    ...defaultAgentBadgeConfig,
    publish: {
      ...defaultAgentBadgeConfig.publish,
      gistId,
      badgeUrl: options.withShieldsMarker === false ? null : badgeUrl
    }
  };

  await Promise.all([
    writeJsonFile(repoRoot, ".agent-badge/config.json", config),
    writeJsonFile(
      repoRoot,
      ".agent-badge/state.json",
      parseAgentBadgeState({
        ...parseAgentBadgeConfig(config),
        publish: {
          status: "deferred",
          gistId,
          lastPublishedHash: null,
          lastPublishedAt: null
        }
      })
    )
  ]);

  if (options.withCodexProvider ?? true) {
    await mkdir(join(homeRoot, ".codex"), { recursive: true });
  }

  if (options.withClaudeProvider ?? true) {
    await mkdir(join(homeRoot, ".claude"), { recursive: true });
  }

  return {
    repo: {
      root: repoRoot,
      async cleanup() {
        await rm(repoRoot, { recursive: true, force: true });
      }
    },
    home: {
      root: homeRoot,
      async cleanup() {
        await rm(homeRoot, { recursive: true, force: true });
      }
    }
  };
}

function asRunResult(input: RunDoctorChecksResult): RunDoctorChecksResult {
  return input;
}

describe("runDoctorChecks", () => {
  it("reports required check IDs and pass state for a healthy repository", async () => {
    const fixture = await createRepoFixture();
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = async (input: RequestInfo | URL) => {
        return new Response("ok", { status: 200 });
      };

      const result = asRunResult(
        await runDoctorChecks({
          cwd: fixture.repo.root,
          homeRoot: fixture.home.root,
          env: {
            GH_TOKEN: "token"
          },
          gistClient: {
            getGist: async () => ({
              id: "doctorgist",
              ownerLogin: "octocat",
              public: true,
              files: [AGENT_BADGE_GIST_FILE]
            }),
            createPublicGist: async () => {
              throw new Error("createPublicGist should not run");
            },
            updateGistFile: async () => {
              throw new Error("updateGistFile should not run");
            }
          }
        })
      );

      const ids = result.checks.map((check) => check.id);

      expect(ids).toEqual([
        "git",
        "providers",
        "scan-access",
        "publish-auth",
        "publish-write",
        "publish-shields",
        "readme-badge",
        "pre-push-hook"
      ]);
      expect(result.overallStatus).toBe("pass");
      expect(result.total).toBe(8);
      expect(result.passCount).toBe(8);
      expect(
        result.checks.some((check) =>
          check.message.includes(AGENT_BADGE_README_START_MARKER)
        )
      ).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      await fixture.repo.cleanup();
      await fixture.home.cleanup();
    }
  });

  it("warns when GitHub auth is not detected", async () => {
    const fixture = await createRepoFixture();
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = async () => new Response("ok", { status: 200 });

      const result = asRunResult(
        await runDoctorChecks({
          cwd: fixture.repo.root,
          homeRoot: fixture.home.root,
          env: {},
          gistClient: {
            getGist: async () => ({
              id: "doctorgist",
              ownerLogin: "octocat",
              public: true,
              files: [AGENT_BADGE_GIST_FILE]
            }),
            createPublicGist: async () => {
              throw new Error("createPublicGist should not run");
            },
            updateGistFile: async () => {
              throw new Error("updateGistFile should not run");
            }
          }
        })
      );

      const publishAuth = result.checks.find((check) => check.id === "publish-auth");

      expect(publishAuth?.status).toBe("warn");
      expect(publishAuth?.fix[0]).toContain("GH_TOKEN");
    } finally {
      globalThis.fetch = originalFetch;
      await fixture.repo.cleanup();
      await fixture.home.cleanup();
    }
  });

  it("performs publish write probe when requested", async () => {
    const fixture = await createRepoFixture({
      withCodexProvider: false,
      withManagedReadme: false,
      withManagedHook: false
    });
    const updateCalls: string[] = [];
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = async (input: RequestInfo | URL) => {
        if (String(input).includes("agent-badge.json")) {
          return new Response(
            '{"schemaVersion":1,"label":"AI Usage","message":"1 sessions","color":"brightgreen"}',
            { status: 200 }
          );
        }

        return new Response("ok", { status: 200 });
      };

      const result = asRunResult(
        await runDoctorChecks({
          cwd: fixture.repo.root,
          homeRoot: fixture.home.root,
          env: {
            GH_TOKEN: "token"
          },
          runProbeWrite: true,
          gistClient: {
            getGist: async () => ({
              id: "doctorgist",
              ownerLogin: "octocat",
              public: true,
              files: [AGENT_BADGE_GIST_FILE]
            }),
            createPublicGist: async () => {
              throw new Error("createPublicGist should not run");
            },
            updateGistFile: async () => {
              updateCalls.push("updated");

              return {
                id: "doctorgist",
                ownerLogin: "octocat",
                public: true,
                files: [AGENT_BADGE_GIST_FILE]
              };
            }
          }
        })
      );

      expect(updateCalls).toHaveLength(1);
      expect(result.checks.find((check) => check.id === "publish-write")?.status).toBe(
        "pass"
      );
    } finally {
      globalThis.fetch = originalFetch;
      await fixture.repo.cleanup();
      await fixture.home.cleanup();
    }
  });
});

