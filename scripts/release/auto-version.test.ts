import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyAutoVersion,
  bumpPatch,
  parseAutoVersionArgs,
  resolveNextVersion
} from "./auto-version.ts";

const createdDirs: string[] = [];

async function writeManifest(
  root: string,
  relativePath: string,
  content: Record<string, unknown>
): Promise<void> {
  const absolutePath = join(root, relativePath);
  await writeFile(absolutePath, `${JSON.stringify(content, null, 2)}\n`, "utf8");
}

afterEach(async () => {
  for (const directory of createdDirs.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("auto version", () => {
  it("bumps a patch version", () => {
    expect(bumpPatch("1.1.2")).toBe("1.1.3");
  });

  it("prefers the higher registry version before bumping", () => {
    expect(resolveNextVersion(["1.1.2"], "1.1.4")).toEqual({
      previousVersion: "1.1.4",
      nextVersion: "1.1.5"
    });
  });

  it("parses supported cli arguments", () => {
    expect(
      parseAutoVersionArgs(["--registry-version", "1.1.2", "--write", "--github-output", "/tmp/out"])
    ).toEqual({
      registryVersion: "1.1.2",
      write: true,
      githubOutputPath: "/tmp/out"
    });
  });

  it("updates package manifests and lockfile in lockstep", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-badge-auto-version-"));
    createdDirs.push(root);

    await Promise.all([
      mkdir(join(root, "packages", "core"), { recursive: true }),
      mkdir(join(root, "packages", "agent-badge"), { recursive: true }),
      mkdir(join(root, "packages", "create-agent-badge"), { recursive: true })
    ]);

    await writeManifest(root, "packages/core/package.json", {
      name: "@legotin/agent-badge-core",
      version: "1.1.2"
    });
    await writeManifest(root, "packages/agent-badge/package.json", {
      name: "@legotin/agent-badge",
      version: "1.1.2",
      dependencies: {
        "@legotin/agent-badge-core": "^1.1.2"
      }
    });
    await writeManifest(root, "packages/create-agent-badge/package.json", {
      name: "create-agent-badge",
      version: "1.1.2",
      dependencies: {
        "@legotin/agent-badge": "^1.1.2"
      }
    });
    await writeFile(
      join(root, "package-lock.json"),
      `${JSON.stringify(
        {
          packages: {
            "packages/core": {
              name: "@legotin/agent-badge-core",
              version: "1.1.1"
            },
            "packages/agent-badge": {
              name: "@legotin/agent-badge",
              version: "1.1.1",
              dependencies: {
                "@legotin/agent-badge-core": "^1.1.1"
              }
            },
            "packages/create-agent-badge": {
              version: "1.1.1",
              dependencies: {
                "@legotin/agent-badge": "^1.1.1"
              }
            }
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    await applyAutoVersion("1.1.3", root);

    expect(
      JSON.parse(await readFile(join(root, "packages/core/package.json"), "utf8")).version
    ).toBe("1.1.3");
    expect(
      JSON.parse(await readFile(join(root, "packages/agent-badge/package.json"), "utf8")).dependencies[
        "@legotin/agent-badge-core"
      ]
    ).toBe("^1.1.3");
    expect(
      JSON.parse(await readFile(join(root, "packages/create-agent-badge/package.json"), "utf8")).dependencies[
        "@legotin/agent-badge"
      ]
    ).toBe("^1.1.3");

    const lockfile = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
    expect(lockfile.packages["packages/core"].version).toBe("1.1.3");
    expect(lockfile.packages["packages/agent-badge"].dependencies["@legotin/agent-badge-core"]).toBe(
      "^1.1.3"
    );
    expect(lockfile.packages["packages/create-agent-badge"].dependencies["@legotin/agent-badge"]).toBe(
      "^1.1.3"
    );
  });
});
