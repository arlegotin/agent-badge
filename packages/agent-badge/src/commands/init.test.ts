import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { runInitCommand } from "./init.js";

const execFileAsync = promisify(execFile);

interface Fixture {
  readonly root: string;
  cleanup(): Promise<void>;
}

interface OutputCapture {
  readonly writer: {
    write(chunk: string): void;
  };
  read(): string;
}

async function createRepoFixture(options: {
  readonly git?: boolean;
  readonly readme?: boolean;
  readonly files?: Record<string, string>;
} = {}): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "agent-badge-command-"));

  if (options.git ?? true) {
    await execFileAsync("git", ["init", "--quiet"], { cwd: root });
  }

  if (options.readme ?? true) {
    await writeFile(join(root, "README.md"), "# Fixture Repo\n", "utf8");
  }

  for (const [relativePath, content] of Object.entries(options.files ?? {})) {
    const targetPath = join(root, relativePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content, "utf8");
  }

  return {
    root,
    cleanup() {
      return rm(root, { recursive: true, force: true });
    }
  };
}

async function createProviderHome(options: {
  readonly codex?: boolean;
  readonly claude?: boolean;
} = {}): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "agent-badge-command-home-"));

  if (options.codex ?? true) {
    await mkdir(join(root, ".codex"), { recursive: true });
  }

  if (options.claude ?? true) {
    await mkdir(join(root, ".claude"), { recursive: true });
  }

  return {
    root,
    cleanup() {
      return rm(root, { recursive: true, force: true });
    }
  };
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

describe("runInitCommand", () => {
  it("runs the shared init flow end to end for a repository", async () => {
    const repo = await createRepoFixture({
      files: {
        "package-lock.json": "{}"
      }
    });
    const providers = await createProviderHome({
      claude: false
    });
    const output = createOutputCapture();

    try {
      const result = await runInitCommand({
        cwd: repo.root,
        homeRoot: providers.root,
        env: {
          GITHUB_TOKEN: "test-token"
        },
        stdout: output.writer
      });

      expect(result.preflight.git.isRepo).toBe(true);
      expect(result.scaffold.created).toEqual(
        expect.arrayContaining([
          ".agent-badge/config.json",
          ".agent-badge/state.json"
        ])
      );
      expect(existsSync(join(repo.root, ".agent-badge/config.json"))).toBe(true);
      expect(output.read()).toContain("agent-badge init preflight");
      expect(output.read()).toContain("agent-badge init scaffold");
      expect(output.read()).toContain("GitHub auth: env:GITHUB_TOKEN");
    } finally {
      await Promise.all([repo.cleanup(), providers.cleanup()]);
    }
  });

  it("bootstraps git before scaffolding when non-git initialization is allowed", async () => {
    const repo = await createRepoFixture({
      git: false,
      files: {
        "package-lock.json": "{}"
      }
    });
    const output = createOutputCapture();

    try {
      const result = await runInitCommand({
        cwd: repo.root,
        allowGitInit: true,
        stdout: output.writer
      });

      expect(result.preflight.git.isRepo).toBe(true);
      expect(existsSync(join(repo.root, ".git"))).toBe(true);
      expect(existsSync(join(repo.root, ".agent-badge/config.json"))).toBe(true);
      expect(output.read()).toContain("Git bootstrap: running");
      expect(output.read()).toContain("Git bootstrap: repository initialized");
    } finally {
      await repo.cleanup();
    }
  });

  it("blocks a non-git directory when non-git initialization is disabled", async () => {
    const repo = await createRepoFixture({
      git: false
    });
    const output = createOutputCapture();

    try {
      await expect(
        runInitCommand({
          cwd: repo.root,
          allowGitInit: false,
          stdout: output.writer
        })
      ).rejects.toThrow(/non-git workspace/i);

      expect(output.read()).toContain("non-git directory");
      expect(output.read()).toContain("Git bootstrap: blocked");
      expect(output.read()).toContain("Blocked:");
      expect(existsSync(join(repo.root, ".git"))).toBe(false);
      expect(existsSync(join(repo.root, ".agent-badge"))).toBe(false);
    } finally {
      await repo.cleanup();
    }
  });
});
