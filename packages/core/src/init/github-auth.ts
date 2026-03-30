export type GitHubAuthSource =
  | "env:GH_TOKEN"
  | "env:GITHUB_TOKEN"
  | "env:GITHUB_PAT"
  | "checker"
  | "none";

export interface GitHubAuthStatus {
  readonly available: boolean;
  readonly source: GitHubAuthSource;
}

export interface DetectGitHubAuthOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly checker?: () => boolean | Promise<boolean>;
}

const githubTokenEnvVars = ["GH_TOKEN", "GITHUB_TOKEN", "GITHUB_PAT"] as const;

function hasValue(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function detectGitHubAuth(
  options: DetectGitHubAuthOptions = {}
): Promise<GitHubAuthStatus> {
  const env = options.env ?? process.env;

  for (const envVar of githubTokenEnvVars) {
    if (hasValue(env[envVar])) {
      return {
        available: true,
        source: `env:${envVar}` as GitHubAuthSource
      };
    }
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
