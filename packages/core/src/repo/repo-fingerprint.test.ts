import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { basename } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { defaultAgentBadgeConfig } from "../config/config-schema.js";
import {
  normalizeGitRemoteUrl,
  resolveRepoFingerprint
} from "./repo-fingerprint.js";

const execFileAsync = promisify(execFile);
const testkitModuleName = "@agent-badge/testkit";

interface GitRepoFixture {
  readonly root: string;
  cleanup(): Promise<void>;
}

async function createGitRepoFixture(): Promise<GitRepoFixture> {
  const testkitModule = (await import(testkitModuleName)) as {
    createGitRepoFixture(): Promise<GitRepoFixture>;
  };

  return testkitModule.createGitRepoFixture();
}

describe("normalizeGitRemoteUrl", () => {
  it("normalizes git@github.com:Owner/Repo.git", () => {
    expect(normalizeGitRemoteUrl("git@github.com:Owner/Repo.git")).toEqual({
      normalizedUrl: "https://github.com/owner/repo",
      host: "github.com",
      owner: "owner",
      repo: "repo",
      canonicalSlug: "owner/repo"
    });
  });

  it("normalizes ssh:// remotes to canonical HTTPS form", () => {
    expect(normalizeGitRemoteUrl("ssh://git@github.com/Owner/Repo.git/")).toEqual(
      {
        normalizedUrl: "https://github.com/owner/repo",
        host: "github.com",
        owner: "owner",
        repo: "repo",
        canonicalSlug: "owner/repo"
      }
    );
  });

  it("rejects multi-segment non-GitHub paths from canonical slug derivation", () => {
    expect(
      normalizeGitRemoteUrl("ssh://git@git.example.com/scm/Team/Repo.git")
    ).toEqual({
      normalizedUrl: "https://git.example.com/scm/Team/Repo",
      host: "git.example.com",
      owner: null,
      repo: "Repo",
      canonicalSlug: null
    });
  });
});

describe("resolveRepoFingerprint", () => {
  it("applies normalized alias remotes and slugs", async () => {
    const repo = await createGitRepoFixture();

    try {
      await execFileAsync(
        "git",
        ["remote", "add", "origin", "git@github.com:Owner/Repo.git"],
        { cwd: repo.root }
      );

      const fingerprint = await resolveRepoFingerprint({
        cwd: repo.root,
        config: {
          repo: {
            aliases: {
              remotes: [
                "ssh://git@github.com/Owner/Renamed.git/",
                "https://github.com/OWNER/REPO.git"
              ],
              slugs: ["Mirror/Repo", "OWNER/REPO"]
            }
          }
        }
      });
      const gitRoot = (
        await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
          cwd: repo.root
        })
      ).stdout.trim();

      expect(fingerprint).toMatchObject({
        gitRoot,
        gitRootBasename: basename(gitRoot),
        gitRootRealPath: await realpath(repo.root),
        originUrlRaw: "git@github.com:Owner/Repo.git",
        originUrlNormalized: "https://github.com/owner/repo",
        host: "github.com",
        owner: "owner",
        repo: "repo",
        canonicalSlug: "owner/repo",
        aliasRemoteUrlsNormalized: [
          "https://github.com/owner/renamed",
          "https://github.com/owner/repo"
        ],
        aliasSlugs: ["mirror/repo", "owner/repo"]
      });
    } finally {
      await repo.cleanup();
    }
  });

  it("supports no-origin repositories", async () => {
    const repo = await createGitRepoFixture();

    try {
      const fingerprint = await resolveRepoFingerprint({
        cwd: repo.root,
        config: defaultAgentBadgeConfig
      });
      const gitRoot = (
        await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
          cwd: repo.root
        })
      ).stdout.trim();

      expect(fingerprint).toEqual({
        gitRoot,
        gitRootRealPath: await realpath(repo.root),
        gitRootBasename: basename(gitRoot),
        originUrlRaw: null,
        originUrlNormalized: null,
        host: null,
        owner: null,
        repo: basename(gitRoot),
        canonicalSlug: null,
        aliasRemoteUrlsNormalized: [],
        aliasSlugs: []
      });
    } finally {
      await repo.cleanup();
    }
  });
});
