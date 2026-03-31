import { describe, expect, it } from "vitest";

import { deletePublishTarget } from "./publish-target.js";

describe("publish target deletion", () => {
  it("deletes a gist and returns deleted=true", async () => {
    const client = {
      getGist: async () => {
        throw new Error("get should not run");
      },
      createPublicGist: async () => {
        throw new Error("create should not run");
      },
      updateGistFile: async () => {
        throw new Error("update should not run");
      },
      deleteGist: async () => undefined
    };

    const result = await deletePublishTarget({
      gistId: "  gist_123  ",
      client
    });

    expect(result).toEqual({
      gistId: "gist_123",
      deleted: true
    });
  });

  it("returns deleted=false when gist deletion fails", async () => {
    const client = {
      getGist: async () => {
        throw new Error("get should not run");
      },
      createPublicGist: async () => {
        throw new Error("create should not run");
      },
      updateGistFile: async () => {
        throw new Error("update should not run");
      },
      deleteGist: async () => {
        throw new Error("delete failed");
      }
    };

    const result = await deletePublishTarget({
      gistId: "gist_404",
      client
    });

    expect(result).toEqual({
      gistId: "gist_404",
      deleted: false
    });
  });
});
