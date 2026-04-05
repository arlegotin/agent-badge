import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileAsyncMock = vi.fn();
const execFileMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: execFileMock
}));

vi.mock("node:util", async () => {
  const actual = await vi.importActual<typeof import("node:util")>("node:util");

  return {
    ...actual,
    promisify: vi.fn((value: unknown) => {
      if (value === execFileMock) {
        return execFileAsyncMock;
      }

      return actual.promisify(value as Parameters<typeof actual.promisify>[0]);
    })
  };
});

const captureEvidence = await import("./capture-publish-evidence.ts");

function mockRegistryAndGitResponses(inputs: {
  readonly gitSha: string;
  readonly registry: ReadonlyArray<{ packageName: string; payload: unknown }>;
}): void {
  execFileAsyncMock.mockImplementation(async (command: string, args: readonly string[]) => {
    if (command === "git") {
      return { stdout: `${inputs.gitSha}\n`, stderr: "" };
    }

    if (command === "npm") {
      const packageName = args[1] as string;
      const payload = inputs.registry.find((entry) => entry.packageName === packageName);

      if (!payload) {
        throw new Error(`No mocked response for npm package: ${packageName}`);
      }

      return { stdout: JSON.stringify(payload.payload), stderr: "" };
    }

    throw new Error(`Unexpected command invocation: ${command}`);
  });
}

async function writeFixturePreflight(phaseDir: string, status: string): Promise<string> {
  const preflightPath = resolve(phaseDir, "12-preflight.json");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(preflightPath, JSON.stringify({ overallStatus: status }));
  return preflightPath;
}

function buildTempDir(): Promise<string> {
  return mkdtemp(resolve(tmpdir(), "agent-badge-release-evidence-"));
}

describe("capture publish evidence", () => {
  beforeEach(() => {
    execFileAsyncMock.mockReset();
    execFileMock.mockReset();
  });

  it("parses artifact-prefix and published-git-sha while keeping backward-compatible defaults", () => {
    expect(
      captureEvidence.parseEvidenceArgs([
        "--phase-dir",
        ".planning/phases/12-production-publish-execution",
        "--publish-path",
        "github-actions",
        "--preflight-json",
        ".planning/phases/12-production-publish-execution/12-preflight.json",
        "--workflow-run-url",
        "https://github.com/example/repo/actions/runs/1",
        "--workflow-run-id",
        "1",
        "--workflow-run-conclusion",
        "success",
        "--published-at",
        "2026-03-31T00:00:00Z",
        "--artifact-prefix",
        "22-PUBLISH-EVIDENCE",
        "--published-git-sha",
        "db3ff4fa76905fac713a3ee7677d143de25e2b2c"
      ])
    ).toEqual({
      phaseDir: ".planning/phases/12-production-publish-execution",
      publishPath: "github-actions",
      preflightJson: ".planning/phases/12-production-publish-execution/12-preflight.json",
      artifactPrefix: "22-PUBLISH-EVIDENCE",
      workflowRunUrl: "https://github.com/example/repo/actions/runs/1",
      workflowRunId: "1",
      workflowRunConclusion: "success",
      publishedAt: "2026-03-31T00:00:00Z",
      publishedGitSha: "db3ff4fa76905fac713a3ee7677d143de25e2b2c",
      fallbackReason: undefined
    });

    expect(
      captureEvidence.parseEvidenceArgs([
        "--phase-dir",
        ".planning/phases/12-production-publish-execution",
        "--publish-path",
        "local-cli",
        "--preflight-json",
        ".planning/phases/12-production-publish-execution/12-preflight.json",
        "--published-at",
        "2026-03-31T00:00:00Z",
        "--fallback-reason",
        "workflow unavailable"
      ])
    ).toEqual({
      phaseDir: ".planning/phases/12-production-publish-execution",
      publishPath: "local-cli",
      preflightJson: ".planning/phases/12-production-publish-execution/12-preflight.json",
      artifactPrefix: "12-PUBLISH-EVIDENCE",
      workflowRunUrl: undefined,
      workflowRunId: undefined,
      workflowRunConclusion: undefined,
      publishedAt: "2026-03-31T00:00:00Z",
      publishedGitSha: undefined,
      fallbackReason: "workflow unavailable"
    });
  });

  it("captures workflow evidence with required manifest and workflow fields", async () => {
    mockRegistryAndGitResponses({
      gitSha: "deadbeefcafebabe",
      registry: [
        { packageName: "@legotin/agent-badge-core", payload: { version: "1.0.0", "dist-tags.latest": "1.0.0" } },
        { packageName: "@legotin/agent-badge", payload: { version: "1.0.0", "dist-tags.latest": "1.0.0" } },
        { packageName: "create-agent-badge", payload: { version: "1.0.0", "dist-tags": { latest: "1.0.0" } } }
      ]
    });

    const phaseDir = await buildTempDir();
    const preflightPath = await writeFixturePreflight(phaseDir, "safe");

    const evidence = await captureEvidence.runCaptureEvidence({
      phaseDir,
      publishPath: "github-actions",
      preflightJson: preflightPath,
      workflowRunUrl: "https://github.com/example/repo/actions/runs/1",
      workflowRunId: "1",
      workflowRunConclusion: "success",
      publishedAt: "2026-03-31T00:00:00Z"
    }, process.cwd());

    expect(evidence.publishPath).toBe("github-actions");
    expect(evidence.gitSha).toBe("deadbeefcafebabe");
    expect(evidence.packages.map((entry: { name: string }) => entry.name)).toEqual([
      "@legotin/agent-badge",
      "@legotin/agent-badge-core",
      "create-agent-badge"
    ]);
    expect(evidence.workflowRunUrl).toBe("https://github.com/example/repo/actions/runs/1");
    expect(evidence.workflowRunId).toBe("1");
    expect(evidence.workflowRunConclusion).toBe("success");
    expect(evidence.fallbackReason).toBeUndefined();
    expect(evidence.preflightPath).toBe(preflightPath);
    expect(evidence.registryResults).toHaveLength(3);
  });

  it("writes both evidence files for github-actions mode", async () => {
    mockRegistryAndGitResponses({
      gitSha: "cafebabe",
      registry: [
        { packageName: "@legotin/agent-badge-core", payload: { version: "1.1.1", "dist-tags.latest": "1.1.1" } },
        { packageName: "@legotin/agent-badge", payload: { version: "1.1.1", "dist-tags.latest": "1.1.1" } },
        { packageName: "create-agent-badge", payload: { version: "1.1.1", "dist-tags": { latest: "1.1.1" } } }
      ]
    });

    const phaseDir = await buildTempDir();
    const preflightPath = await writeFixturePreflight(phaseDir, "safe");

    const evidence = await captureEvidence.runCaptureEvidence({
      phaseDir,
      publishPath: "github-actions",
      preflightJson: preflightPath,
      workflowRunUrl: "https://github.com/example/repo/actions/runs/2",
      workflowRunId: "2",
      workflowRunConclusion: "success",
      publishedAt: "2026-03-31T00:00:00Z"
    }, process.cwd());

    const jsonPath = resolve(phaseDir, "12-PUBLISH-EVIDENCE.json");
    const mdPath = resolve(phaseDir, "12-PUBLISH-EVIDENCE.md");

    const jsonText = await readFile(jsonPath, "utf8");
    const markdownText = await readFile(mdPath, "utf8");

    expect(JSON.parse(jsonText)).toEqual(expect.objectContaining({
      publishPath: "github-actions",
      gitSha: evidence.gitSha,
      preflightPath,
      publishedAt: "2026-03-31T00:00:00Z",
      packages: evidence.packages
    }));
    expect(markdownText).toContain("Publish path:");
    expect(markdownText).toContain("Published commit:");
    expect(markdownText).toContain("Preflight file:");
    expect(markdownText).toContain("Workflow run:");
    expect(markdownText).toContain("Registry results:");
  });

  it("writes phase-owned evidence files and honors explicit published git sha", async () => {
    mockRegistryAndGitResponses({
      gitSha: "should-not-be-read",
      registry: [
        { packageName: "@legotin/agent-badge-core", payload: { version: "1.1.3", "dist-tags.latest": "1.1.3" } },
        { packageName: "@legotin/agent-badge", payload: { version: "1.1.3", "dist-tags.latest": "1.1.3" } },
        { packageName: "create-agent-badge", payload: { version: "1.1.3", "dist-tags": { latest: "1.1.3" } } }
      ]
    });

    const phaseDir = await buildTempDir();
    const preflightPath = await writeFixturePreflight(phaseDir, "blocked");

    const evidence = await captureEvidence.runCaptureEvidence({
      phaseDir,
      publishPath: "github-actions",
      preflightJson: preflightPath,
      artifactPrefix: "22-PUBLISH-EVIDENCE",
      workflowRunUrl: "https://github.com/example/repo/actions/runs/24005943027",
      workflowRunId: "24005943027",
      workflowRunConclusion: "success",
      publishedAt: "2026-04-05T16:46:35Z",
      publishedGitSha: "db3ff4fa76905fac713a3ee7677d143de25e2b2c"
    }, process.cwd());

    const jsonPath = resolve(phaseDir, "22-PUBLISH-EVIDENCE.json");
    const mdPath = resolve(phaseDir, "22-PUBLISH-EVIDENCE.md");

    expect(evidence.gitSha).toBe("db3ff4fa76905fac713a3ee7677d143de25e2b2c");
    expect(await readFile(jsonPath, "utf8")).toContain("\"gitSha\": \"db3ff4fa76905fac713a3ee7677d143de25e2b2c\"");
    expect(await readFile(mdPath, "utf8")).toContain("Published commit: db3ff4fa76905fac713a3ee7677d143de25e2b2c");
    expect(execFileAsyncMock.mock.calls.filter(([command]) => command === "git")).toHaveLength(0);
  });

  it("writes fallback evidence with fallback reason and omits workflow fields", async () => {
    mockRegistryAndGitResponses({
      gitSha: "beadfeed",
      registry: [
        { packageName: "@legotin/agent-badge-core", payload: { version: "1.0.0", "dist-tags.latest": "1.0.0" } },
        { packageName: "@legotin/agent-badge", payload: { version: "1.0.0", "dist-tags.latest": "1.0.0" } },
        { packageName: "create-agent-badge", payload: { version: "1.0.0", "dist-tags": { latest: "1.0.0" } } }
      ]
    });

    const phaseDir = await buildTempDir();
    const preflightPath = await writeFixturePreflight(phaseDir, "warn");

    const evidence = await captureEvidence.runCaptureEvidence({
      phaseDir,
      publishPath: "local-cli",
      preflightJson: preflightPath,
      artifactPrefix: "12-PUBLISH-EVIDENCE",
      fallbackReason: "workflow_dispatch unavailable",
      publishedAt: "2026-03-31T00:00:00Z"
    }, process.cwd());

    const payload = JSON.parse(
      await readFile(resolve(phaseDir, "12-PUBLISH-EVIDENCE.json"), "utf8")
    ) as { workflowRunUrl?: string; fallbackReason?: string };

    expect(evidence.fallbackReason).toBe("workflow_dispatch unavailable");
    expect(payload.workflowRunUrl).toBeUndefined();
    expect(payload.fallbackReason).toBe("workflow_dispatch unavailable");
    expect(payload).not.toHaveProperty("workflowRunId");
    expect(payload).not.toHaveProperty("workflowRunConclusion");
  });
});
