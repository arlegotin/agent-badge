import { describe, expect, it, vi } from "vitest";

import { createGitHubGistClient } from "./github-gist-client.js";

function createTransportClient(overrides: Partial<{
  get: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
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
    }
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
            filename: "agent-badge.json"
          },
          "README.md": {
            filename: "README.md"
          }
        }
      }
    });
    const client = createTransportClient({ get });

    await expect(client.getGist("gist_123")).resolves.toEqual({
      id: "gist_123",
      ownerLogin: "octocat",
      public: true,
      files: ["agent-badge.json", "README.md"]
    });
    expect(get).toHaveBeenCalledWith({
      gist_id: "gist_123"
    });
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
            filename: "agent-badge.json"
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
      files: ["agent-badge.json"]
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
            filename: "agent-badge.json"
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
      files: ["agent-badge.json"]
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
