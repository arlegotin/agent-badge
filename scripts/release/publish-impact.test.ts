import { describe, expect, it } from "vitest";

import {
  evaluatePublishImpact,
  parsePublishImpactArgs
} from "./publish-impact.ts";

describe("publish impact", () => {
  it("reports no impact when only docs changed", () => {
    const report = evaluatePublishImpact(["README.md", "docs/RELEASE.md"]);

    expect(report).toMatchObject({
      impacted: false
    });
    expect(report.changedPublishableFiles).toEqual([]);
  });

  it("reports impact for publishable workspace source changes", () => {
    const report = evaluatePublishImpact(["packages/core/src/publish/badge-payload.ts"]);

    expect(report).toMatchObject({
      impacted: true
    });
    expect(report.changedPublishableFiles).toEqual([
      "packages/core/src/publish/badge-payload.ts"
    ]);
  });

  it("ignores test-only changes inside publishable workspaces", () => {
    const report = evaluatePublishImpact([
      "packages/agent-badge/src/commands/publish.test.ts"
    ]);

    expect(report).toMatchObject({
      impacted: false
    });
  });

  it("reports impact for root build inputs", () => {
    const report = evaluatePublishImpact(["tsconfig.base.json"]);

    expect(report).toMatchObject({
      impacted: true
    });
    expect(report.changedPublishableFiles).toEqual(["tsconfig.base.json"]);
  });

  it("parses required cli arguments", () => {
    expect(
      parsePublishImpactArgs(["--base", "abc123", "--head", "def456", "--json"])
    ).toEqual({
      base: "abc123",
      head: "def456",
      json: true,
      githubOutputPath: null
    });
  });
});
