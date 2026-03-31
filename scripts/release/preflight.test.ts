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

describe("release preflight", () => {
  beforeEach(() => {
    execFileAsyncMock.mockReset();
    execFileMock.mockReset();
  });

  it("returns overall safe when all publishable packages are missing from the registry", async () => {
    mockMissingPackage("@agent-badge/core");
    mockMissingPackage("agent-badge");
    mockMissingPackage("create-agent-badge");

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
});
