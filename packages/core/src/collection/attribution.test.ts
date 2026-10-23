import { describe, expect, it } from "vitest";
import { protocolObservationFixture } from "@agent-badge/testkit";
import {
  attributeObservation,
  parsePrivateAttributionPolicy,
  attributionPolicyHash,
} from "./attribution.js";
import type { AttributionContext } from "./attribution.js";

const repositoryId = "12345678-1234-4234-8234-123456789abc";
const policy = {
  schemaVersion: 1 as const,
  repositoryId,
  normalizationVersion: 1 as const,
  discovery: "auto" as const,
  disabledProviders: [],
  badge: { label: "AI usage", metric: "tokens" as const },
};
function context(): AttributionContext {
  return {
    repositoryId,
    privatePolicy: parsePrivateAttributionPolicy({}),
    evidence: {
      cwd: "resolved",
      commonDir: "/repo/.git",
      targetCommonDir: "/repo/.git",
      nested: false,
      remoteUrl: null,
      historicalMembership: false,
    },
  };
}

describe("pure observation attribution", () => {
  it("requires verified nearest membership rather than a cwd prefix", () => {
    const observation = protocolObservationFixture();
    const ctx = context();
    expect(attributeObservation(observation, ctx).status).toBe("included");
    expect(
      attributeObservation(observation, {
        ...ctx,
        evidence: {
          ...ctx.evidence,
          commonDir: "/repo/nested/.git",
          nested: true,
        },
      }).status
    ).toBe("excluded");
    expect(
      attributeObservation(
        {
          ...observation,
          execution: { ...observation.execution, cwd: "relative/path" },
        },
        ctx
      ).status
    ).toBe("ambiguous");
    expect(
      attributeObservation(
        { ...observation, execution: { ...observation.execution, cwd: null } },
        ctx
      ).status
    ).toBe("ambiguous");
  });
  it("applies per-unit decisions before every contradictory heuristic", () => {
    const observation = protocolObservationFixture();
    observation.execution.repositoryId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const ctx = context();
    const override = {
      provider: observation.provider,
      nativeUnitId: observation.nativeUnitId,
      representation: observation.representation,
      decision: "include" as const,
    };
    expect(
      attributeObservation(observation, {
        ...ctx,
        privatePolicy: parsePrivateAttributionPolicy({ overrides: [override] }),
      })
    ).toMatchObject({ status: "included", reason: "user-override" });
    expect(
      attributeObservation(observation, {
        ...ctx,
        privatePolicy: parsePrivateAttributionPolicy({
          overrides: [{ ...override, decision: "exclude" }],
        }),
      }).status
    ).toBe("excluded");
    expect(attributeObservation(observation, ctx).status).toBe("excluded");
  });
  it("blocks nested, submodule, and strong remote contradictions before aliases", () => {
    const observation = protocolObservationFixture();
    observation.execution.remoteUrl = "git@github.com:team/repo.git";
    const ctx = context();
    ctx.privatePolicy = parsePrivateAttributionPolicy({
      remoteAliases: ["https://github.com/team/repo"],
    });
    expect(
      attributeObservation(observation, {
        ...ctx,
        evidence: {
          ...ctx.evidence,
          commonDir: "/other/.git",
          remoteUrl: "https://github.com/team/repo",
        },
      }).status
    ).toBe("included");
    expect(
      attributeObservation(observation, {
        ...ctx,
        evidence: {
          ...ctx.evidence,
          commonDir: "/other/.git",
          remoteUrl: "https://github.com/team/different",
        },
      }).status
    ).toBe("excluded");
    expect(
      attributeObservation(observation, {
        ...ctx,
        evidence: {
          ...ctx.evidence,
          nested: true,
          commonDir: "/repo/module/.git",
        },
      }).status
    ).toBe("excluded");
    observation.execution.remoteUrl = "https://github.com/team/different";
    expect(attributeObservation(observation, ctx).status).toBe("excluded");
  });
  it("needs explicit mappings or verified enrollment for missing historical worktrees", () => {
    const observation = protocolObservationFixture();
    observation.execution.cwd = "/deleted/worktree/subdir";
    observation.execution.remoteUrl = "https://github.com/team/repo";
    const ctx = context();
    ctx.privatePolicy = parsePrivateAttributionPolicy({
      remoteAliases: ["https://github.com/team/repo"],
    });
    ctx.evidence = { ...ctx.evidence, cwd: "missing", commonDir: null };
    expect(attributeObservation(observation, ctx).status).toBe("ambiguous");
    expect(
      attributeObservation(observation, {
        ...ctx,
        evidence: { ...ctx.evidence, historicalMembership: true },
      }).status
    ).toBe("included");
    ctx.privatePolicy = parsePrivateAttributionPolicy({
      mappings: [{ cwd: "/deleted/worktree", repositoryId }],
    });
    expect(attributeObservation(observation, ctx).status).toBe("included");
    expect(
      attributeObservation(
        {
          ...observation,
          execution: {
            ...observation.execution,
            cwd: "/deleted/worktree-sibling",
          },
        },
        ctx
      ).status
    ).toBe("ambiguous");
  });
  it("validates private inputs strictly and hashes attribution semantics only", () => {
    expect(() =>
      parsePrivateAttributionPolicy({
        mappings: [{ cwd: "relative", repositoryId }],
      })
    ).toThrow("invalid-record");
    expect(() => parsePrivateAttributionPolicy({ notes: "private" })).toThrow(
      "invalid-record"
    );
    expect(() =>
      parsePrivateAttributionPolicy({
        overrides: [
          {
            provider: "codex",
            nativeUnitId: "a",
            representation: "request",
            decision: "exclude",
          },
          {
            provider: "codex",
            nativeUnitId: "a",
            representation: "request",
            decision: "include",
          },
        ],
      })
    ).toThrow("invalid-record");
    const empty = parsePrivateAttributionPolicy({});
    const hash = attributionPolicyHash(policy, empty);
    expect(
      attributionPolicyHash(
        { ...policy, badge: { label: "Different", metric: "estimated-cost" } },
        empty
      )
    ).toBe(hash);
    for (const input of [
      { remoteAliases: ["https://github.com/team/repo"] },
      { mappings: [{ cwd: "/old", repositoryId }] },
      { verifiedWorktrees: [{ path: "/old", commonDir: "/repo/.git" }] },
      {
        overrides: [
          {
            provider: "codex",
            nativeUnitId: "a",
            representation: "request",
            decision: "exclude",
          },
        ],
      },
    ])
      expect(
        attributionPolicyHash(policy, parsePrivateAttributionPolicy(input))
      ).not.toBe(hash);
    expect(
      attributionPolicyHash({ ...policy, disabledProviders: ["claude"] }, empty)
    ).not.toBe(hash);
  });
});
