import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  AGENT_BADGE_GIST_FILE,
  AGENT_BADGE_README_END_MARKER,
  AGENT_BADGE_README_START_MARKER,
  buildStableBadgeUrl,
  defaultAgentBadgeConfig,
  defaultAgentBadgeState,
  type GitHubGistClient,
  type GitHubGist
} from "@legotin/agent-badge-core";
import { runDoctorCommand } from "./doctor.js";

const execFileAsync = promisify(execFile);

interface OutputCapture {
  readonly writer: {
    write(chunk: string): void;
  };
  read(): string;
}

interface Fixture {
  readonly repoRoot: string;
  readonly homeRoot: string;
  cleanup(): Promise<void>;
}

function createOutputCapture(): OutputCapture {
  let output = "";

  return {
    writer: {
      write(chunk: string) {
        output += chunk;
      }
    },
    read() {
      return output;
    }
  };
}

async function writeJsonFile(
  root: string,
  relativePath: string,
  value: unknown
): Promise<void> {
  const targetPath = join(root, relativePath);

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createFixture(options: {
  readonly withCodexProvider?: boolean;
  readonly withClaudeProvider?: boolean;
  readonly withManagedReadme?: boolean;
  readonly withManagedHook?: boolean;
  readonly withShieldsUrl?: boolean;
} = {}): Promise<Fixture> {
  const [repoRoot, homeRoot] = await Promise.all([
    mkdtemp(join(tmpdir(), "agent-badge-doctor-repo-")),
    mkdtemp(join(tmpdir(), "agent-badge-doctor-home-"))
  ]);

  const gistId = "doctorgist";
  const readmeContent = options.withManagedReadme ?? true
    ? `Repository\n${AGENT_BADGE_README_START_MARKER}\n![AI Usage](https://img.example.com/badge.svg)\n${AGENT_BADGE_README_END_MARKER}\n`
    : "Repository";

  await execFileAsync("git", ["init", "--quiet"], { cwd: repoRoot });
  await writeFile(join(repoRoot, "README.md"), readmeContent, "utf8");
  await writeJsonFile(repoRoot, ".agent-badge/config.json", {
    ...defaultAgentBadgeConfig,
    publish: {
      ...defaultAgentBadgeConfig.publish,
      gistId,
      badgeUrl: options.withShieldsUrl === false
        ? null
        : buildStableBadgeUrl({
            ownerLogin: "octocat",
            gistId
          })
    }
  });
  await writeJsonFile(repoRoot, ".agent-badge/state.json", defaultAgentBadgeState);

  if (options.withCodexProvider ?? true) {
    await mkdir(join(homeRoot, ".codex"), { recursive: true });
  }

  if (options.withClaudeProvider ?? true) {
    await mkdir(join(homeRoot, ".claude"), { recursive: true });
  }

  if (options.withManagedHook ?? true) {
    const hookBlock = [
      "# agent-badge:start",
      "agent-badge refresh --hook pre-push --fail-soft",
      "# agent-badge:end",
      ""
    ].join("\n");

    await mkdir(dirname(join(repoRoot, ".git/hooks/pre-push")), { recursive: true });
    await writeFile(join(repoRoot, ".git/hooks/pre-push"), `${hookBlock}\n`, "utf8");
  }

  return {
    repoRoot,
    homeRoot,
    async cleanup() {
      await Promise.all([
        rm(repoRoot, { recursive: true, force: true }),
        rm(homeRoot, { recursive: true, force: true })
      ]);
    }
  };
}

function buildGistClient(): GitHubGistClient {
  return {
    getGist: async (): Promise<GitHubGist> => ({
      id: "doctorgist",
      ownerLogin: "octocat",
      public: true,
      files: [AGENT_BADGE_GIST_FILE]
    }),
    createPublicGist: async () => {
      throw new Error("createPublicGist should not run.");
    },
    updateGistFile: async () => {
      return {
        id: "doctorgist",
        ownerLogin: "octocat",
        public: true,
        files: [AGENT_BADGE_GIST_FILE]
      };
    }
  };
}

describe("runDoctorCommand", () => {
  it("prints machine-readable JSON when requested", async () => {
    const fixture = await createFixture();
    const output = createOutputCapture();
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = async (input: RequestInfo | URL) => {
        if (String(input).includes(AGENT_BADGE_GIST_FILE)) {
          return new Response(
            '{"schemaVersion":1,"label":"AI Usage","message":"1 sessions","color":"brightgreen"}',
            { status: 200 }
          );
        }

        return new Response("ok", { status: 200 });
      };

      await runDoctorCommand({
        cwd: fixture.repoRoot,
        homeRoot: fixture.homeRoot,
        env: {
          GH_TOKEN: "token"
        },
        json: true,
        gistClient: buildGistClient(),
        stdout: output.writer
      });

      const parsed = JSON.parse(output.read()) as { checks: Array<{ id: string }> };

      expect(parsed.checks.map((check) => check.id)).toEqual([
        "git",
        "providers",
        "scan-access",
        "publish-auth",
        "publish-write",
        "publish-shields",
        "readme-badge",
        "pre-push-hook"
      ]);
      expect(parsed).toHaveProperty("overallStatus");
    } finally {
      globalThis.fetch = originalFetch;
      await fixture.cleanup();
    }
  });

  it("prints command output with required check IDs and fix guidance", async () => {
    const fixture = await createFixture({
      withCodexProvider: false,
      withClaudeProvider: false,
      withManagedReadme: false,
      withManagedHook: false
    });
    const output = createOutputCapture();
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = async () => new Response("ok", { status: 200 });

      await runDoctorCommand({
        cwd: fixture.repoRoot,
        homeRoot: fixture.homeRoot,
        env: {},
        gistClient: buildGistClient(),
        stdout: output.writer
      });

      const rendered = output.read();

      expect(rendered).toContain("- git:");
      expect(rendered).toContain("- providers:");
      expect(rendered).toContain("- scan-access:");
      expect(rendered).toContain("- publish-auth:");
      expect(rendered).toContain("- publish-write:");
      expect(rendered).toContain("- publish-shields:");
      expect(rendered).toContain("- readme-badge:");
      expect(rendered).toContain("- pre-push-hook:");
      expect(rendered).toContain("- Fix:");
      expect(rendered).toContain("agent-badge doctor");
    } finally {
      globalThis.fetch = originalFetch;
      await fixture.cleanup();
    }
  });
});
