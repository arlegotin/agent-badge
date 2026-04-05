import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  detectGitHubAuth,
  type DetectGitHubAuthOptions,
  type GitHubAuthStatus
} from "./github-auth.js";
import {
  detectProviderAvailability,
  type DetectProviderAvailabilityOptions,
  type ProviderDetectionResult
} from "./provider-detection.js";
import {
  type GetGitContextOptions,
  getGitContext,
  type GitContext
} from "../repo/git-context.js";
import {
  detectPackageManager,
  type PackageManager
} from "../runtime/package-manager.js";

export interface ExistingScaffoldStatus {
  readonly exists: boolean;
  readonly root: boolean;
  readonly config: boolean;
  readonly state: boolean;
  readonly cache: boolean;
  readonly logs: boolean;
}

export interface InitReadmeStatus {
  readonly exists: boolean;
  readonly fileName: string | null;
}

export interface InitPackageManagerStatus {
  readonly name: PackageManager;
}

export interface InitPreflightResult {
  readonly cwd: string;
  readonly git: GitContext;
  readonly readme: InitReadmeStatus;
  readonly packageManager: InitPackageManagerStatus;
  readonly providers: ProviderDetectionResult;
  readonly githubAuth: GitHubAuthStatus;
  readonly existingScaffold: ExistingScaffoldStatus;
}

export interface RunInitPreflightOptions
  extends Pick<GetGitContextOptions, "allowGitInit">,
    DetectProviderAvailabilityOptions,
    DetectGitHubAuthOptions {
  readonly cwd?: string;
}

const preferredReadmeNames = [
  "README.md",
  "README.mdx",
  "README.markdown",
  "README.txt",
  "README"
] as const;

async function getReadmeStatus(cwd: string): Promise<InitReadmeStatus> {
  const entries = await readdir(cwd, { withFileTypes: true });
  const fileNames = new Set(
    entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
  );

  for (const fileName of preferredReadmeNames) {
    if (fileNames.has(fileName)) {
      return {
        exists: true,
        fileName
      };
    }
  }

  const fallback = entries.find(
    (entry) => entry.isFile() && /^README(\..+)?$/i.test(entry.name)
  );

  return {
    exists: fallback !== undefined,
    fileName: fallback?.name ?? null
  };
}

function getExistingScaffoldStatus(cwd: string): ExistingScaffoldStatus {
  const scaffoldRoot = join(cwd, ".agent-badge");
  const root = existsSync(scaffoldRoot);

  return {
    exists: root,
    root,
    config: existsSync(join(scaffoldRoot, "config.json")),
    state: existsSync(join(scaffoldRoot, "state.json")),
    cache: existsSync(join(scaffoldRoot, "cache")),
    logs: existsSync(join(scaffoldRoot, "logs"))
  };
}

export async function runInitPreflight(
  options: RunInitPreflightOptions = {}
): Promise<InitPreflightResult> {
  const cwd = options.cwd ?? process.cwd();
  const [git, readme, githubAuth] = await Promise.all([
    getGitContext({ cwd, allowGitInit: options.allowGitInit }),
    getReadmeStatus(cwd),
    detectGitHubAuth({
      env: options.env,
      checker: options.checker,
      ghCliTokenResolver: options.ghCliTokenResolver
    })
  ]);

  return {
    cwd,
    git,
    readme,
    packageManager: {
      name: detectPackageManager(cwd)
    },
    providers: detectProviderAvailability({
      homeRoot: options.homeRoot
    }),
    githubAuth,
    existingScaffold: getExistingScaffoldStatus(cwd)
  };
}
