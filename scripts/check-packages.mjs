import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const npmCommand = process.platform === "win32" ? process.execPath : "npm";
const npmPrefix = process.platform === "win32" ? [resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js")] : [];
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const publishablePackages = [
  {
    workspace: "packages/core",
    requiredFiles: ["LICENSE", "package.json", "dist/index.js", "dist/index.d.ts", "resources/workflows/agent-badge-import.yml"]
  },
  {
    workspace: "packages/agent-badge",
    requiredFiles: [
      "LICENSE",
      "package.json",
      "dist/index.js",
      "dist/index.d.ts",
      "dist/cli/main.js",
      "dist/cli/main.d.ts"
    ]
  },
  {
    workspace: "packages/create-agent-badge",
    requiredFiles: ["LICENSE", "package.json", "dist/index.js", "dist/index.d.ts"]
  }
];

function isAllowedPackPath(packPath, pkg) {
  return ["package.json", "LICENSE", "CHANGELOG.md"].includes(packPath) || packPath.startsWith("dist/") || pkg.requiredFiles.includes(packPath);
}

function runPackDryRun(workspace) {
  const output = execFileSync(
    npmCommand,
    [...npmPrefix, "pack", "--workspace", workspace, "--dry-run", "--json"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: process.env
    }
  ).trim();

  const parsed = JSON.parse(output);

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`npm pack returned no metadata for ${workspace}`);
  }

  return parsed[0];
}

function toFilePaths(packJson) {
  const files = packJson.files;

  if (!Array.isArray(files)) {
    throw new Error("npm pack JSON did not include a files array");
  }

  return files
    .map((entry) => entry?.path)
    .filter((packPath) => typeof packPath === "string")
    .sort();
}

let hasFailures = false;

for (const pkg of publishablePackages) {
  const packJson = runPackDryRun(pkg.workspace);
  const filePaths = toFilePaths(packJson);
  const fileSet = new Set(filePaths);
  const unexpectedPaths = filePaths.filter((packPath) => !isAllowedPackPath(packPath, pkg));
  const missingPaths = pkg.requiredFiles.filter((packPath) => !fileSet.has(packPath));

  if (unexpectedPaths.length === 0 && missingPaths.length === 0) {
    console.log(`PASS ${pkg.workspace}`);
    continue;
  }

  hasFailures = true;
  console.error(`FAIL ${pkg.workspace}`);

  if (unexpectedPaths.length > 0) {
    console.error("  Unexpected files:");
    for (const packPath of unexpectedPaths) {
      console.error(`    - ${packPath}`);
    }
  }

  if (missingPaths.length > 0) {
    console.error("  Missing runtime files:");
    for (const packPath of missingPaths) {
      console.error(`    - ${packPath}`);
    }
  }
}

if (hasFailures) {
  process.exitCode = 1;
} else {
  console.log("Pack output check passed.");
}
