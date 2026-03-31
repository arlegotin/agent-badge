export interface GitHubGist {
  readonly id: string;
  readonly ownerLogin: string | null;
  readonly public: boolean;
  readonly files: string[];
}

export interface CreatePublicGistInput {
  readonly description: string;
  readonly files: Record<string, { readonly content: string }>;
}

export interface UpdateGistFileInput {
  readonly gistId: string;
  readonly files: Record<string, { readonly content: string }>;
}

export interface GitHubGistClient {
  getGist(gistId: string): Promise<GitHubGist>;
  createPublicGist(input: CreatePublicGistInput): Promise<GitHubGist>;
  updateGistFile(input: UpdateGistFileInput): Promise<GitHubGist>;
  deleteGist(input: { readonly gistId: string }): Promise<void>;
}

interface OctokitGistPayload {
  readonly id?: string | null;
  readonly public?: boolean | null;
  readonly owner?: {
    readonly login?: string | null;
  } | null;
  readonly files?:
    | Record<
        string,
        {
          readonly filename?: string | null;
        } | null
      >
    | null;
}

interface GitHubGistsApi {
  get(input: { readonly gist_id: string }): Promise<{ readonly data: unknown }>;
  create(input: {
    readonly description: string;
    readonly public: true;
    readonly files: Record<string, { readonly content: string }>;
  }): Promise<{ readonly data: unknown }>;
  update(input: {
    readonly gist_id: string;
    readonly files: Record<string, { readonly content: string }>;
  }): Promise<{ readonly data: unknown }>;
  remove(input: { readonly gist_id: string }): Promise<{ readonly data: unknown }>;
}

interface OctokitLike {
  readonly rest: {
    readonly gists: GitHubGistsApi;
  };
}

export interface CreateGitHubGistClientOptions {
  readonly authToken?: string;
  readonly octokit?: OctokitLike;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeGist(payload: unknown): GitHubGist {
  if (!isRecord(payload)) {
    throw new Error("GitHub Gist response was not an object.");
  }

  const gistPayload = payload as OctokitGistPayload;

  if (typeof gistPayload.id !== "string" || gistPayload.id.length === 0) {
    throw new Error("GitHub Gist response did not include an id.");
  }

  const files = isRecord(gistPayload.files)
    ? Object.values(gistPayload.files).flatMap((entry) =>
        entry && typeof entry.filename === "string" ? [entry.filename] : []
      )
    : [];

  return {
    id: gistPayload.id,
    ownerLogin:
      gistPayload.owner && typeof gistPayload.owner.login === "string"
        ? gistPayload.owner.login
        : null,
    public: gistPayload.public === true,
    files
  };
}

async function loadOctokit(
  authToken?: string
): Promise<OctokitLike> {
  const octokitModule = (await import("octokit")) as {
    readonly Octokit: new (options?: { readonly auth?: string }) => OctokitLike;
  };

  return new octokitModule.Octokit(
    authToken ? { auth: authToken } : undefined
  );
}

export function createGitHubGistClient(
  options: CreateGitHubGistClientOptions = {}
): GitHubGistClient {
  let octokitPromise: Promise<OctokitLike> | undefined;

  const getOctokit = (): Promise<OctokitLike> => {
    if (options.octokit) {
      return Promise.resolve(options.octokit);
    }

    octokitPromise ??= loadOctokit(options.authToken);
    return octokitPromise;
  };

  return {
    async getGist(gistId) {
      const octokit = await getOctokit();
      const response = await octokit.rest.gists.get({
        gist_id: gistId
      });

      return normalizeGist(response.data);
    },
    async createPublicGist(input) {
      const octokit = await getOctokit();
      const response = await octokit.rest.gists.create({
        description: input.description,
        public: true,
        files: input.files
      });

      return normalizeGist(response.data);
    },
    async updateGistFile(input) {
      const octokit = await getOctokit();
      const response = await octokit.rest.gists.update({
        gist_id: input.gistId,
        files: input.files
      });

      return normalizeGist(response.data);
    },
    async deleteGist(input) {
      const octokit = await getOctokit();

      await octokit.rest.gists.remove({
        gist_id: input.gistId
      });
    }
  };
}
