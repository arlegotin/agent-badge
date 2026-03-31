import { describe, expect, it, vi } from "vitest";

import { createGitHubGistClient } from "./github-gist-client.js";

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
    const client = createGitHubGistClient({
      octokit: {
        rest: {
          gists: {
            get,
            create: vi.fn(),
            update: vi.fn(),
            remove: vi.fn()
          }
        }
      }
    });

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
    const client = createGitHubGistClient({
      octokit: {
        rest: {
          gists: {
            get: vi.fn(),
            create,
            update: vi.fn(),
            remove: vi.fn()
          }
        }
      }
    });

    await client.createPublicGist({
      description: "agent-badge publish target",
      files: {
        "agent-badge.json": {
          content: '{"schemaVersion":1}'
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
            filename: "agent-badge.json"
          }
        }
      }
    });
    const client = createGitHubGistClient({
      octokit: {
        rest: {
          gists: {
            get: vi.fn(),
            create: vi.fn(),
            update,
            remove: vi.fn()
          }
        }
      }
    });

    await client.updateGistFile({
      gistId: "gist_123",
      files: {
        "agent-badge.json": {
          content: '{"schemaVersion":1,"message":"updated"}'
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
    const client = createGitHubGistClient({
      octokit: {
        rest: {
          gists: {
            get: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            remove
          }
        }
      }
    });

    await client.deleteGist({
      gistId: "gist_123"
    });

    expect(remove).toHaveBeenCalledWith({
      gist_id: "gist_123"
    });
  });
});
