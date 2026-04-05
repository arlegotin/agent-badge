import { execFile } from "node:child_process";
import { promisify } from "node:util";

export type GitHubAuthSource =
  | "env:GH_TOKEN"
  | "env:GITHUB_TOKEN"
  | "env:GITHUB_PAT"
  | "gh-cli"
  | "checker"
  | "none";

export interface GitHubAuthStatus {
  readonly available: boolean;
  readonly source: GitHubAuthSource;
}

export interface DetectGitHubAuthOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly checker?: () => boolean | Promise<boolean>;
  readonly ghCliTokenResolver?: GhCliTokenResolver;
}

const githubTokenEnvVars = ["GH_TOKEN", "GITHUB_TOKEN", "GITHUB_PAT"] as const;
const execFileAsync = promisify(execFile);

function hasValue(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export type GhCliTokenResolver = (
  env: NodeJS.ProcessEnv
) => string | Promise<string | undefined> | undefined;

export async function resolveGitHubCliToken(
  env: NodeJS.ProcessEnv
): Promise<string | undefined> {
  const candidateExecutables = [
    "gh",
    "/opt/homebrew/bin/gh",
    "/usr/local/bin/gh",
    "/usr/bin/gh"
  ];

  for (const executable of candidateExecutables) {
    try {
      const { stdout } = await execFileAsync(executable, ["auth", "token"], {
        env,
        encoding: "utf8",
        timeout: 3000,
        windowsHide: true,
        maxBuffer: 1024 * 1024
      });
      const token = stdout.trim();

      if (hasValue(token)) {
        return token;
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

export interface ResolveGitHubAuthTokenOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly ghCliTokenResolver?: GhCliTokenResolver;
}

export interface ResolvedGitHubAuthToken {
  readonly token: string | undefined;
  readonly source: GitHubAuthSource;
}

export async function resolveGitHubAuthToken(
  options: ResolveGitHubAuthTokenOptions = {}
): Promise<ResolvedGitHubAuthToken> {
  const env = options.env ?? process.env;

  for (const envVar of githubTokenEnvVars) {
    if (hasValue(env[envVar])) {
      return {
        token: env[envVar],
        source: `env:${envVar}` as GitHubAuthSource
      };
    }
  }

  const ghCliToken = options.ghCliTokenResolver
    ? await options.ghCliTokenResolver(env)
    : undefined;

  if (hasValue(ghCliToken)) {
    return {
      token: ghCliToken,
      source: "gh-cli"
    };
  }

  return {
    token: undefined,
    source: "none"
  };
}

export async function detectGitHubAuth(
  options: DetectGitHubAuthOptions = {}
): Promise<GitHubAuthStatus> {
  const resolved = await resolveGitHubAuthToken({
    env: options.env,
    ghCliTokenResolver: options.ghCliTokenResolver
  });

  if (resolved.source !== "none") {
    return {
      available: true,
      source: resolved.source
    };
  }

  if (options.checker && (await options.checker())) {
    return {
      available: true,
      source: "checker"
    };
  }

  return {
    available: false,
    source: "none"
  };
}
