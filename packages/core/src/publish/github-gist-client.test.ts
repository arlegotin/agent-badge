import { describe, expect, it, vi } from "vitest";

import { createGitHubGistClient } from "./github-gist-client.js";

function createTransportClient(overrides: Partial<{
  get: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  fetchImpl: typeof fetch;
}> = {}) {
  return createGitHubGistClient({
    octokit: {
      rest: {
        gists: {
          get: overrides.get ?? vi.fn(),
          create: overrides.create ?? vi.fn(),
          update: overrides.update ?? vi.fn(),
          remove: overrides.remove ?? vi.fn()
        }
      }
    },
    fetchImpl: overrides.fetchImpl
  });
}

describe("createGitHubGistClient", () => {
  it("maps gist metadata from the get endpoint", async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        id: "gist_123",
        public: true,
        owner: {
          login: "octocat"
        },
        files: {
          "agent-badge.json": {
            filename: "agent-badge.json",
            content: '{"schemaVersion":1}',
            truncated: false
          },
          "README.md": {
            filename: "README.md",
            content: "# Badge",
            truncated: true
          }
        }
      }
    });
    const client = createTransportClient({ get });

    await expect(client.getGist("gist_123")).resolves.toEqual({
      id: "gist_123",
      ownerLogin: "octocat",
      public: true,
      files: {
        "agent-badge.json": {
          filename: "agent-badge.json",
          content: '{"schemaVersion":1}',
          truncated: false
        },
        "README.md": {
          filename: "README.md",
          content: "# Badge",
          truncated: true
        }
      }
    });
    expect(get).toHaveBeenCalledWith({
      gist_id: "gist_123"
    });
  });

  it("loads truncated gist file content from raw_url", async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        id: "gist_123",
        public: true,
        owner: {
          login: "octocat"
        },
        files: {
          "agent-badge-state.json": {
            filename: "agent-badge-state.json",
            content: '{"partial":true}',
            truncated: true,
            raw_url: "https://gist.githubusercontent.com/octocat/gist_123/raw/agent-badge-state.json"
          }
        }
      }
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '{"full":true}\n'
    } satisfies Pick<Response, "ok" | "text">);
    const client = createTransportClient({ get, fetchImpl: fetchImpl as typeof fetch });

    await expect(client.getGist("gist_123")).resolves.toEqual({
      id: "gist_123",
      ownerLogin: "octocat",
      public: true,
      files: {
        "agent-badge-state.json": {
          filename: "agent-badge-state.json",
          content: '{"full":true}\n',
          truncated: false
        }
      }
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://gist.githubusercontent.com/octocat/gist_123/raw/agent-badge-state.json"
    );
  });

  it("creates public gists through the transport seam", async () => {
    const create = vi.fn().mockResolvedValue({
      data: {
        id: "gist_123",
        public: true,
        owner: {
          login: "octocat"
        },
        files: {
          "agent-badge.json": {
            filename: "agent-badge.json",
            content: '{"schemaVersion":1}',
            truncated: false
          }
        }
      }
    });
    const client = createTransportClient({ create });

    await expect(
      client.createPublicGist({
        description: "agent-badge publish target",
        files: {
          "agent-badge.json": {
            content: '{"schemaVersion":1}'
          }
        }
      })
    ).resolves.toEqual({
      id: "gist_123",
      ownerLogin: "octocat",
      public: true,
      files: {
        "agent-badge.json": {
          filename: "agent-badge.json",
          content: '{"schemaVersion":1}',
          truncated: false
        }
      }
    });

    expect(create).toHaveBeenCalledWith({
      description: "agent-badge publish target",
      public: true,
      files: {
        "agent-badge.json": {
          content: '{"schemaVersion":1}'
        }
      }
    });
  });

  it("updates a single gist file by gist id", async () => {
    const update = vi.fn().mockResolvedValue({
      data: {
        id: "gist_123",
        public: true,
        owner: {
          login: "octocat"
        },
        files: {
          "agent-badge.json": {
            filename: "agent-badge.json",
            content: '{"schemaVersion":1,"message":"updated"}',
            truncated: false
          }
        }
      }
    });
    const client = createTransportClient({ update });

    await expect(
      client.updateGistFile({
        gistId: "gist_123",
        files: {
          "agent-badge.json": {
            content: '{"schemaVersion":1,"message":"updated"}'
          }
        }
      })
    ).resolves.toEqual({
      id: "gist_123",
      ownerLogin: "octocat",
      public: true,
      files: {
        "agent-badge.json": {
          filename: "agent-badge.json",
          content: '{"schemaVersion":1,"message":"updated"}',
          truncated: false
        }
      }
    });

    expect(update).toHaveBeenCalledWith({
      gist_id: "gist_123",
      files: {
        "agent-badge.json": {
          content: '{"schemaVersion":1,"message":"updated"}'
        }
      }
    });
  });

  it("deletes a gist through the transport seam", async () => {
    const remove = vi.fn().mockResolvedValue({
      data: {
        id: null
      }
    });
    const client = createTransportClient({ remove });

    await client.deleteGist({
      gistId: "gist_123"
    });

    expect(remove).toHaveBeenCalledWith({
      gist_id: "gist_123"
    });
  });
});
