import { describe, expect, it } from "vitest";

import {
  AGENT_BADGE_README_END_MARKER,
  AGENT_BADGE_README_START_MARKER,
  buildReadmeBadgeMarkdown,
  buildReadmeBadgeSnippet,
  upsertReadmeBadge
} from "./readme-badge.js";

describe("upsertReadmeBadge", () => {
  it("inserts one managed badge block", () => {
    const badgeMarkdown = buildReadmeBadgeMarkdown({
      label: "AI Usage",
      badgeUrl: "https://img.shields.io/endpoint?url=https%3A%2F%2Fexample.com"
    });

    expect(upsertReadmeBadge("# agent-badge\n", badgeMarkdown)).toBe(`${
      AGENT_BADGE_README_START_MARKER
    }
![AI Usage](https://img.shields.io/endpoint?url=https%3A%2F%2Fexample.com)
${AGENT_BADGE_README_END_MARKER}

# agent-badge
`);
  });

  it("reuses the managed block on re-run", () => {
    const firstBadgeMarkdown = buildReadmeBadgeMarkdown({
      label: "AI Usage",
      badgeUrl: "https://img.shields.io/endpoint?url=https%3A%2F%2Fexample.com%2Fold"
    });
    const secondBadgeMarkdown = buildReadmeBadgeMarkdown({
      label: "AI Usage",
      badgeUrl: "https://img.shields.io/endpoint?url=https%3A%2F%2Fexample.com%2Fnew"
    });
    const firstPass = upsertReadmeBadge("# agent-badge\n", firstBadgeMarkdown);
    const secondPass = upsertReadmeBadge(firstPass, secondBadgeMarkdown);

    expect(secondPass).toBe(`${
      AGENT_BADGE_README_START_MARKER
    }
![AI Usage](https://img.shields.io/endpoint?url=https%3A%2F%2Fexample.com%2Fnew)
${AGENT_BADGE_README_END_MARKER}

# agent-badge
`);
    expect(
      secondPass.match(
        new RegExp(AGENT_BADGE_README_START_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")
      )
    ).toHaveLength(1);
  });

  it("supports linking the badge image to the repository", () => {
    const badgeMarkdown = buildReadmeBadgeMarkdown({
      label: "AI Usage",
      badgeUrl: "https://img.shields.io/endpoint?url=https%3A%2F%2Fexample.com",
      linkUrl: "https://github.com/octocat/hello-world"
    });

    expect(upsertReadmeBadge("# agent-badge\n", badgeMarkdown)).toBe(`${
      AGENT_BADGE_README_START_MARKER
    }
[![AI Usage](https://img.shields.io/endpoint?url=https%3A%2F%2Fexample.com)](https://github.com/octocat/hello-world)
${AGENT_BADGE_README_END_MARKER}

# agent-badge
`);
  });
});

describe("buildReadmeBadgeSnippet", () => {
  it("builds a pasteable snippet when no README exists", () => {
    expect(
      buildReadmeBadgeSnippet({
        label: "AI Usage",
        badgeUrl: "https://img.shields.io/endpoint?url=https%3A%2F%2Fexample.com"
      })
    ).toBe("![AI Usage](https://img.shields.io/endpoint?url=https%3A%2F%2Fexample.com)");
  });

  it("builds a linked snippet when a repository URL is provided", () => {
    expect(
      buildReadmeBadgeSnippet({
        label: "AI Usage",
        badgeUrl: "https://img.shields.io/endpoint?url=https%3A%2F%2Fexample.com",
        linkUrl: "https://github.com/octocat/hello-world"
      })
    ).toBe(
      "[![AI Usage](https://img.shields.io/endpoint?url=https%3A%2F%2Fexample.com)](https://github.com/octocat/hello-world)"
    );
  });
});
