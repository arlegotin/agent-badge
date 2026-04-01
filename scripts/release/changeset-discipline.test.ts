import { describe, expect, it } from "vitest";

import {
  evaluateChangesetDiscipline,
  parseChangesetDisciplineArgs
} from "./changeset-discipline.ts";

describe("changeset discipline", () => {
  it("passes when no publishable workspace files changed", () => {
    const report = evaluateChangesetDiscipline(["README.md", "docs/RELEASE.md"]);

    expect(report).toMatchObject({
      status: "pass"
    });
    expect(report.changedPublishableFiles).toEqual([]);
  });

  it("ignores test-only changes inside publishable workspaces", () => {
    const report = evaluateChangesetDiscipline([
      "packages/agent-badge/src/commands/publish.test.ts"
    ]);

    expect(report).toMatchObject({
      status: "pass"
    });
    expect(report.changedPublishableFiles).toEqual([]);
  });

  it("fails when publishable workspace files changed without a changeset", () => {
    const report = evaluateChangesetDiscipline([
      "packages/core/src/publish/badge-payload.ts",
      "README.md"
    ]);

    expect(report).toMatchObject({
      status: "fail"
    });
    expect(report.summary).toContain(".changeset/*.md");
  });

  it("passes when publishable workspace files changed with a real changeset file", () => {
    const report = evaluateChangesetDiscipline([
      "packages/agent-badge/src/commands/init.ts",
      ".changeset/release-runtime.patch.md"
    ]);

    expect(report).toMatchObject({
      status: "pass"
    });
    expect(report.changedChangesetFiles).toEqual([".changeset/release-runtime.patch.md"]);
  });

  it("ignores .changeset metadata files that are not release notes", () => {
    const report = evaluateChangesetDiscipline([
      "packages/create-agent-badge/src/index.ts",
      ".changeset/config.json"
    ]);

    expect(report).toMatchObject({
      status: "fail"
    });
    expect(report.changedChangesetFiles).toEqual([]);
  });

  it("parses required cli arguments", () => {
    expect(
      parseChangesetDisciplineArgs(["--base", "abc123", "--head", "def456"])
    ).toEqual({
      base: "abc123",
      head: "def456"
    });
  });
});
