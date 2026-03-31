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

const preflight = await import("./preflight.ts");

function missingPackageError(packageName: string): Error & {
  readonly stderr: string;
  readonly stdout: string;
} {
  const error = new Error(`npm ERR! 404 '${packageName}' is not in this registry.`);

  return Object.assign(error, {
    stderr: `npm ERR! code E404\nnpm ERR! 404 Not Found - GET https://registry.npmjs.org/${packageName}`,
    stdout: ""
  });
}

function mockRegistryJson(response: unknown): void {
  execFileAsyncMock.mockResolvedValueOnce({
    stdout: JSON.stringify(response),
    stderr: ""
  });
}

function mockMissingPackage(packageName: string): void {
  execFileAsyncMock.mockRejectedValueOnce(missingPackageError(packageName));
}

function mockNpmPing(): void {
  execFileAsyncMock.mockResolvedValueOnce({
    stdout: "pong",
    stderr: ""
  });
}

function mockNpmWhoami(identity = "agent-badge-publisher"): void {
  execFileAsyncMock.mockResolvedValueOnce({
    stdout: `${identity}\n`,
    stderr: ""
  });
}

function authError(command: string): Error & {
  readonly stderr: string;
  readonly stdout: string;
} {
  const error = new Error(`${command} requires authentication.`);

  return Object.assign(error, {
    stderr: `npm ERR! code ENEEDAUTH\nnpm ERR! need auth ${command}`,
    stdout: ""
  });
}

describe("release preflight", () => {
  beforeEach(() => {
    execFileAsyncMock.mockReset();
    execFileMock.mockReset();
  });

  it("returns overall safe when all publishable packages are missing from the registry", async () => {
    mockMissingPackage("@agent-badge/core");
    mockMissingPackage("agent-badge");
    mockMissingPackage("create-agent-badge");
    mockNpmPing();
    mockNpmWhoami();

    const report = await preflight.runReleasePreflight(process.cwd());

    expect(report.overallStatus).toBe("safe");
    expect(report.packages).toHaveLength(3);
    expect(report.packages.map((entry: { packageName: string; status: string }) => entry.packageName)).toEqual([
      "@agent-badge/core",
      "agent-badge",
      "create-agent-badge"
    ]);
    expect(report.packages.every((entry: { status: string }) => entry.status === "safe")).toBe(true);
  });

  it("returns overall blocked when a publish target already exposes the intended version", async () => {
    mockMissingPackage("@agent-badge/core");
    mockRegistryJson({
      name: "agent-badge",
      version: "1.1.0",
      "dist-tags.latest": "1.1.0"
    });
    mockMissingPackage("create-agent-badge");
    mockNpmPing();
    mockNpmWhoami();

    const report = await preflight.runReleasePreflight(process.cwd());
    const blockedEntry = report.packages.find(
      (entry: { packageName: string }) => entry.packageName === "agent-badge"
    );

    expect(report.overallStatus).toBe("blocked");
    expect(blockedEntry?.status).toBe("blocked");
    expect(blockedEntry?.summary).toContain("1.1.0");
  });

  it("returns overall warn when the registry metadata is partial or ambiguous", async () => {
    mockRegistryJson({
      name: "@agent-badge/core"
    });
    mockMissingPackage("agent-badge");
    mockMissingPackage("create-agent-badge");
    mockNpmPing();
    mockNpmWhoami();

    const report = await preflight.runReleasePreflight(process.cwd());
    const warnEntry = report.packages.find(
      (entry: { packageName: string }) => entry.packageName === "@agent-badge/core"
    );

    expect(report.overallStatus).toBe("warn");
    expect(warnEntry?.status).toBe("warn");
    expect(warnEntry?.summary).toContain("partial metadata");
  });

  it("loads the exact manifest-derived publishable package inventory", async () => {
    const inventory = await preflight.loadPublishablePackageInventory(process.cwd());

    expect(inventory.map((entry: { name: string }) => entry.name)).toEqual([
      "@agent-badge/core",
      "agent-badge",
      "create-agent-badge"
    ]);
  });

  it("blocks when the npm-auth check cannot confirm the maintainer identity", async () => {
    mockMissingPackage("@agent-badge/core");
    mockMissingPackage("agent-badge");
    mockMissingPackage("create-agent-badge");
    mockNpmPing();
    execFileAsyncMock.mockRejectedValueOnce(authError("npm whoami"));

    const report = await preflight.runReleasePreflight(process.cwd());
    const authCheck = report.checks.find((entry: { id: string }) => entry.id === "npm-auth");

    expect(report.overallStatus).toBe("blocked");
    expect(authCheck).toMatchObject({
      id: "npm-auth",
      status: "blocked"
    });
  });

  it("blocks when the workflow-contract check loses required release markers", () => {
    const workflowContract = preflight.evaluateWorkflowContract("name: Release\n");
    const overall = preflight.determineOverallStatus([{ status: "safe" }, workflowContract]);

    expect(workflowContract).toMatchObject({
      id: "workflow-contract",
      status: "blocked"
    });
    expect(overall).toBe("blocked");
  });

  it("blocks when the release-inputs check finds an inconsistent publish configuration", () => {
    const releaseInputs = preflight.evaluateReleaseInputs({
      manifests: [
        {
          manifestPath: "packages/core/package.json",
          name: "@agent-badge/core",
          version: "1.1.0"
        },
        {
          manifestPath: "packages/agent-badge/package.json",
          name: "agent-badge",
          version: "1.2.0"
        },
        {
          manifestPath: "packages/create-agent-badge/package.json",
          name: "create-agent-badge",
          version: "1.1.0"
        }
      ],
      changesetConfig: { access: "private" },
      rootPackage: {
        scripts: {
          release: "changeset publish",
          "release:preflight": "tsx scripts/release/preflight.ts"
        }
      },
      coreManifest: {
        publishConfig: { access: "restricted" }
      }
    });
    const overall = preflight.determineOverallStatus([{ status: "safe" }, releaseInputs]);

    expect(releaseInputs).toMatchObject({
      id: "release-inputs",
      status: "blocked"
    });
    expect(overall).toBe("blocked");
  });
});
