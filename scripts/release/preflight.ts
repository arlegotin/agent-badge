import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRootFromScript = resolve(scriptDir, "..", "..");
const changesetConfigPath = ".changeset/config.json";
const rootPackageManifestPath = "package.json";
const releaseWorkflowPath = ".github/workflows/release.yml";

const publishableManifestPaths = [
  "packages/core/package.json",
  "packages/agent-badge/package.json",
  "packages/create-agent-badge/package.json"
] as const;

const expectedPublishablePackageNames = [
  "@legotin/agent-badge-core",
  "@legotin/agent-badge",
  "create-agent-badge"
] as const;
const expectedWorkflowMarkers = [
  "workflow_dispatch",
  "id-token: write",
  "npm run release:publish-impact",
  "npm run release:auto-version",
  "npm run release",
  "git tag -a",
  "gh release create"
] as const;

export type ReleasePreflightStatus = "safe" | "warn" | "blocked";
export type RegistryLookupKind = "package" | "missing" | "error";
export type ReleaseBlockerCategory =
  | "npm auth"
  | "version drift"
  | "same version already published"
  | "package ownership"
  | "trusted-publisher";
export type ReleasePreflightCheckId =
  | "npm-auth"
  | "release-inputs"
  | "workflow-contract"
  | "package-ownership"
  | "trusted-publisher";

export interface PublishablePackageManifest {
  readonly manifestPath: string;
  readonly name: string;
  readonly version: string;
  readonly packageManager: string | null;
  readonly enginesNode: string | null;
}

export interface RegistryPackageMetadata {
  readonly name: string | null;
  readonly version: string | null;
  readonly latestTag: string | null;
  readonly raw: unknown;
}

export interface RegistryLookupResult {
  readonly kind: RegistryLookupKind;
  readonly command: readonly string[];
  readonly message: string;
  readonly metadata: RegistryPackageMetadata | null;
}

export interface PackageRegistryState {
  readonly kind: RegistryLookupKind;
  readonly observedName: string | null;
  readonly observedVersion: string | null;
  readonly latestTag: string | null;
  readonly message: string;
}

export interface PackagePreflightResult {
  readonly manifestPath: string;
  readonly packageName: string;
  readonly intendedVersion: string;
  readonly status: ReleasePreflightStatus;
  readonly summary: string;
  readonly blockers: readonly ReleaseBlockerCategory[];
  readonly registry: PackageRegistryState;
}

export interface ReleasePreflightReport {
  readonly generatedAt: string;
  readonly overallStatus: ReleasePreflightStatus;
  readonly packages: readonly PackagePreflightResult[];
  readonly checks: readonly ReleasePreflightCheckResult[];
}

interface PackageManifestFile {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly private?: unknown;
  readonly publishConfig?: unknown;
  readonly packageManager?: unknown;
  readonly engines?: unknown;
}

interface RootPackageManifestFile {
  readonly scripts?: unknown;
  readonly packageManager?: unknown;
  readonly engines?: unknown;
}

interface ChangesetConfigFile {
  readonly access?: unknown;
  readonly ignore?: unknown;
}

export interface ReleasePreflightCheckResult {
  readonly id: ReleasePreflightCheckId;
  readonly label: string;
  readonly status: ReleasePreflightStatus;
  readonly summary: string;
  readonly blockers: readonly ReleaseBlockerCategory[];
  readonly details: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function firstNonEmptyString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function formatCommandError(error: unknown): string {
  if (!isRecord(error)) {
    return String(error);
  }

  const text = [error.stderr, error.stdout, error.message]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find((value) => value.length > 0);

  return text ?? "command failed";
}

async function readJsonFile<T>(
  relativePath: string,
  repoRoot = repoRootFromScript
): Promise<T> {
  const absolutePath = resolve(repoRoot, relativePath);

  return JSON.parse(await readFile(absolutePath, "utf8")) as T;
}

async function runNpmCommand(
  args: readonly string[],
  repoRoot = repoRootFromScript
): Promise<string> {
  const { stdout, stderr } = await execFileAsync("npm", [...args], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024
  });

  return `${stdout}${stderr}`.trim();
}

function describeVisibleRegistryState(metadata: RegistryPackageMetadata): string {
  const details = [
    metadata.name ? `name=${metadata.name}` : null,
    metadata.version ? `version=${metadata.version}` : null,
    metadata.latestTag ? `dist-tags.latest=${metadata.latestTag}` : null
  ].filter((value): value is string => value !== null);

  return details.length > 0 ? details.join(", ") : "no visible registry metadata";
}

function extractRegistryMetadata(raw: unknown): RegistryPackageMetadata {
  const entry =
    Array.isArray(raw) && raw.length > 0 && isRecord(raw[0])
      ? raw[0]
      : isRecord(raw)
        ? raw
        : {};

  const flattenedLatest = isRecord(entry) ? entry["dist-tags.latest"] : undefined;
  const distTags = isRecord(entry) && isRecord(entry["dist-tags"]) ? entry["dist-tags"] : null;

  return {
    name: firstNonEmptyString(isRecord(entry) ? entry.name : null),
    version: firstNonEmptyString(isRecord(entry) ? entry.version : null),
    latestTag: firstNonEmptyString(flattenedLatest, distTags?.latest),
    raw
  };
}

export function parseRegistryViewJson(stdout: string): RegistryPackageMetadata {
  const trimmed = stdout.trim();

  if (trimmed.length === 0) {
    return extractRegistryMetadata({});
  }

  return extractRegistryMetadata(JSON.parse(trimmed));
}

export function isMissingRegistryPackageError(error: unknown): boolean {
  const text = isRecord(error)
    ? `${String(error.stdout ?? "")}\n${String(error.stderr ?? "")}\n${String(error.message ?? "")}`
    : String(error);

  const normalized = text.toLowerCase();

  return (
    normalized.includes("e404") ||
    normalized.includes("404 not found") ||
    normalized.includes("not in this registry") ||
    normalized.includes("is not in this registry")
  );
}

export async function loadPublishablePackageInventory(
  repoRoot = repoRootFromScript
): Promise<readonly PublishablePackageManifest[]> {
  const manifests = await Promise.all(
    publishableManifestPaths.map(async (manifestPath) => {
      const absolutePath = resolve(repoRoot, manifestPath);
      const parsed = JSON.parse(
        await readFile(absolutePath, "utf8")
      ) as PackageManifestFile;

      if (typeof parsed.name !== "string" || parsed.name.trim().length === 0) {
        throw new Error(`Manifest ${manifestPath} is missing a valid package name.`);
      }

      if (typeof parsed.version !== "string" || parsed.version.trim().length === 0) {
        throw new Error(`Manifest ${manifestPath} is missing a valid package version.`);
      }

      return {
        manifestPath,
        name: parsed.name,
        version: parsed.version,
        packageManager:
          typeof parsed.packageManager === "string" &&
          parsed.packageManager.trim().length > 0
            ? parsed.packageManager
            : null,
        enginesNode:
          isRecord(parsed.engines) && typeof parsed.engines.node === "string"
            ? parsed.engines.node
            : null
      };
    })
  );

  const actualNames = manifests
    .map((manifest) => manifest.name)
    .sort((left, right) => left.localeCompare(right));
  const expectedNames = [...expectedPublishablePackageNames].sort((left, right) =>
    left.localeCompare(right)
  );

  if (actualNames.join("\n") !== expectedNames.join("\n")) {
    throw new Error(
      `Publishable package inventory drifted. Expected ${expectedNames.join(", ")} but found ${actualNames.join(", ")}.`
    );
  }

  return manifests;
}

export async function fetchRegistryPackageState(
  packageName: string,
  repoRoot = repoRootFromScript
): Promise<RegistryLookupResult> {
  const command = [
    "view",
    packageName,
    "name",
    "version",
    "dist-tags.latest",
    "--json"
  ] as const;

  try {
    const { stdout } = await execFileAsync("npm", [...command], {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024
    });

    const metadata = parseRegistryViewJson(stdout);

    return {
      kind: "package",
      command,
      message:
        metadata.name !== null || metadata.version !== null || metadata.latestTag !== null
          ? `Observed ${describeVisibleRegistryState(metadata)}.`
          : "Registry returned empty metadata for this package lookup.",
      metadata
    };
  } catch (error) {
    if (isMissingRegistryPackageError(error)) {
      return {
        kind: "missing",
        command,
        message: "Package is not currently present in the npm registry.",
        metadata: null
      };
    }

    return {
      kind: "error",
      command,
      message: isRecord(error) ? String(error.stderr ?? error.message ?? "npm view failed.") : String(error),
      metadata: null
    };
  }
}

export function classifyRegistryResult(
  manifest: PublishablePackageManifest,
  lookup: RegistryLookupResult
): PackagePreflightResult {
  if (lookup.kind === "missing") {
    return {
      manifestPath: manifest.manifestPath,
      packageName: manifest.name,
      intendedVersion: manifest.version,
      status: "safe",
      summary: "Package name is available for a first publish.",
      blockers: [],
      registry: {
        kind: "missing",
        observedName: null,
        observedVersion: null,
        latestTag: null,
        message: lookup.message
      }
    };
  }

  if (lookup.kind === "error") {
    return {
      manifestPath: manifest.manifestPath,
      packageName: manifest.name,
      intendedVersion: manifest.version,
      status: "warn",
      summary: "Registry state could not be confirmed from npm view output.",
      blockers: [],
      registry: {
        kind: "error",
        observedName: null,
        observedVersion: null,
        latestTag: null,
        message: lookup.message
      }
    };
  }

  const metadata = lookup.metadata ?? extractRegistryMetadata({});

  if (metadata.name !== null && metadata.name !== manifest.name) {
    return {
      manifestPath: manifest.manifestPath,
      packageName: manifest.name,
      intendedVersion: manifest.version,
      status: "blocked",
      summary: `Registry lookup resolved to ${metadata.name}, not ${manifest.name}.`,
      blockers: [],
      registry: {
        kind: "package",
        observedName: metadata.name,
        observedVersion: metadata.version,
        latestTag: metadata.latestTag,
        message: lookup.message
      }
    };
  }

  if (metadata.version === manifest.version || metadata.latestTag === manifest.version) {
    return {
      manifestPath: manifest.manifestPath,
      packageName: manifest.name,
      intendedVersion: manifest.version,
      status: "blocked",
      summary: `Same version already published: intended version ${manifest.version} is already visible in the registry.`,
      blockers: ["same version already published", "package ownership"],
      registry: {
        kind: "package",
        observedName: metadata.name,
        observedVersion: metadata.version,
        latestTag: metadata.latestTag,
        message: lookup.message
      }
    };
  }

  if (metadata.name === null || (metadata.version === null && metadata.latestTag === null)) {
    return {
      manifestPath: manifest.manifestPath,
      packageName: manifest.name,
      intendedVersion: manifest.version,
      status: "warn",
      summary: "Registry returned partial metadata that needs manual review.",
      blockers: [],
      registry: {
        kind: "package",
        observedName: metadata.name,
        observedVersion: metadata.version,
        latestTag: metadata.latestTag,
        message: lookup.message
      }
    };
  }

  return {
      manifestPath: manifest.manifestPath,
      packageName: manifest.name,
      intendedVersion: manifest.version,
      status: "warn",
      summary: `Visible version drift: registry exposes ${metadata.latestTag ?? metadata.version ?? "an existing version"} while source intends ${manifest.version}; confirm package ownership and publish intent.`,
      blockers: ["version drift", "package ownership"],
      registry: {
        kind: "package",
        observedName: metadata.name,
        observedVersion: metadata.version,
      latestTag: metadata.latestTag,
      message: lookup.message
    }
  };
}

export function determineOverallStatus(
  results: readonly Pick<{ readonly status: ReleasePreflightStatus }, "status">[]
): ReleasePreflightStatus {
  if (results.some((result) => result.status === "blocked")) {
    return "blocked";
  }

  if (results.some((result) => result.status === "warn")) {
    return "warn";
  }

  return "safe";
}

export async function runNpmAuthCheck(
  repoRoot = repoRootFromScript
): Promise<ReleasePreflightCheckResult> {
  try {
    await runNpmCommand(["ping"], repoRoot);
  } catch (error) {
    return {
      id: "npm-auth",
      label: "npm auth",
      status: "blocked",
      summary: "npm ping failed, so registry reachability could not be confirmed.",
      blockers: ["npm auth"],
      details: [formatCommandError(error)]
    };
  }

  try {
    const identity = (await runNpmCommand(["whoami"], repoRoot)).trim();

    if (identity.length === 0) {
      return {
        id: "npm-auth",
        label: "npm auth",
        status: "blocked",
        summary: "npm whoami succeeded without returning an authenticated npm identity.",
        blockers: ["npm auth"],
        details: ["Re-run `npm login` and retry the preflight."]
      };
    }

    return {
      id: "npm-auth",
      label: "npm auth",
      status: "safe",
      summary: `npm ping and npm whoami succeeded for ${identity}.`,
      blockers: [],
      details: [
        "Registry connectivity is available from this maintainer environment.",
        "Authenticated npm identity is readable before publish."
      ]
    };
  } catch (error) {
    return {
      id: "npm-auth",
      label: "npm auth",
      status: "blocked",
      summary: "npm whoami failed, so the maintainer identity is not ready for publish.",
      blockers: ["npm auth"],
      details: [formatCommandError(error)]
    };
  }
}

export function evaluateReleaseInputs(input: {
  readonly manifests: readonly PublishablePackageManifest[];
  readonly changesetConfig: ChangesetConfigFile;
  readonly rootPackage: RootPackageManifestFile;
  readonly coreManifest: PackageManifestFile;
  readonly extraIssues?: readonly string[];
}): ReleasePreflightCheckResult {
  const issues = [...(input.extraIssues ?? [])];
  const versions = [...new Set(input.manifests.map((manifest) => manifest.version))];
  const scriptMap = isRecord(input.rootPackage.scripts) ? input.rootPackage.scripts : {};
  const ignoredPackages = Array.isArray(input.changesetConfig.ignore)
    ? input.changesetConfig.ignore.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0
      )
    : [];
  const releaseScript = typeof scriptMap.release === "string" ? scriptMap.release : null;
  const preflightScript =
    typeof scriptMap["release:preflight"] === "string" ? scriptMap["release:preflight"] : null;
  const rootPackageManager =
    typeof input.rootPackage.packageManager === "string" &&
    input.rootPackage.packageManager.trim().length > 0
      ? input.rootPackage.packageManager
      : null;
  const rootEngines = isRecord(input.rootPackage.engines)
    ? input.rootPackage.engines
    : {};
  const rootNodeEngine =
    typeof rootEngines.node === "string" && rootEngines.node.trim().length > 0
      ? rootEngines.node
      : null;
  const manifestPackageManagers = [
    ...new Set(
      input.manifests
        .map((manifest) => manifest.packageManager)
        .filter((value): value is string => typeof value === "string")
    )
  ];
  const manifestNodeEngines = [
    ...new Set(
      input.manifests
        .map((manifest) => manifest.enginesNode)
        .filter((value): value is string => typeof value === "string")
    )
  ];
  const corePublishConfig = isRecord(input.coreManifest.publishConfig)
    ? input.coreManifest.publishConfig
    : {};
  const coreAccess =
    typeof corePublishConfig.access === "string" ? corePublishConfig.access : null;

  if (input.changesetConfig.access !== "public") {
    issues.push(
      `${changesetConfigPath} must keep \`access: "public"\` for the intended publish path.`
    );
  }

  if (versions.length !== 1) {
    issues.push(
      `Publishable workspace versions must stay aligned, but found ${versions.join(", ")}.`
    );
  }

  if (coreAccess !== "public") {
    issues.push("packages/core/package.json must keep `publishConfig.access` set to `public`.");
  }

  if (rootPackageManager === null) {
    issues.push(`${rootPackageManifestPath} must declare a root \`packageManager\`.`);
  }

  if (rootNodeEngine === null) {
    issues.push(`${rootPackageManifestPath} must declare \`engines.node\`.`);
  }

  if (manifestPackageManagers.length !== 1 || manifestPackageManagers[0] !== rootPackageManager) {
    issues.push(
      "Publishable package manifests must share the same `packageManager` as the root manifest."
    );
  }

  if (manifestNodeEngines.length !== 1 || manifestNodeEngines[0] !== rootNodeEngine) {
    issues.push(
      "Publishable package manifests must share the same `engines.node` support policy as the root manifest."
    );
  }

  if (releaseScript !== "changeset publish") {
    issues.push(
      `${rootPackageManifestPath} must keep \`release\` mapped to \`changeset publish\`.`
    );
  }

  if (preflightScript !== "tsx scripts/release/preflight.ts") {
    issues.push(
      `${rootPackageManifestPath} must keep \`release:preflight\` mapped to the repo-owned TypeScript entrypoint.`
    );
  }

  if (!ignoredPackages.includes("@agent-badge/testkit")) {
    issues.push(
      `${changesetConfigPath} must ignore \`@agent-badge/testkit\` so helper workspaces cannot leak into production publish.`
    );
  }

  if (issues.length > 0) {
    return {
      id: "release-inputs",
      label: "release inputs",
      status: "blocked",
      summary: "Release inputs are inconsistent with the intended public publish path.",
      blockers: [],
      details: issues
    };
  }

  return {
    id: "release-inputs",
    label: "release inputs",
    status: "safe",
    summary: `Changesets access is public and all publishable workspaces agree on version ${versions[0]}.`,
    blockers: [],
    details: [
      `Publishable inventory: ${input.manifests.map((manifest) => manifest.name).join(", ")}`,
      `Support policy: node ${rootNodeEngine}`,
      `Package manager: ${rootPackageManager}`,
      `Root release contract: ${releaseScript}`,
      `Root preflight contract: ${preflightScript}`
    ]
  };
}

export function evaluateWorkflowContract(
  workflowContent: string,
  workflowFile = releaseWorkflowPath
): ReleasePreflightCheckResult {
  const missingMarkers = expectedWorkflowMarkers.filter(
    (marker) => !workflowContent.includes(marker)
  );

  if (missingMarkers.length > 0) {
    return {
      id: "workflow-contract",
      label: "workflow contract",
      status: "blocked",
      summary: `${workflowFile} drifted away from the expected production publish contract.`,
      blockers: [],
      details: missingMarkers.map(
        (marker) => `Missing required workflow marker: ${marker}`
      )
    };
  }

  return {
    id: "workflow-contract",
    label: "workflow contract",
    status: "safe",
    summary: `${workflowFile} still references the expected trusted-publishing release workflow contract.`,
    blockers: [],
    details: [
      "Local preflight validates workflow markers only.",
      "GitHub Actions publish auth is expected to come from npm trusted publishing via OIDC, not a long-lived npm token.",
      "The production workflow is expected to auto-bump and publish qualifying main-branch changes.",
      "The production workflow is expected to create Git tags and a GitHub release for the published version."
    ]
  };
}

async function loadReleaseInputCheck(
  manifests: readonly PublishablePackageManifest[],
  repoRoot = repoRootFromScript,
  extraIssues: readonly string[] = []
): Promise<ReleasePreflightCheckResult> {
  const [changesetConfig, rootPackage, coreManifest] = await Promise.all([
    readJsonFile<ChangesetConfigFile>(changesetConfigPath, repoRoot),
    readJsonFile<RootPackageManifestFile>(rootPackageManifestPath, repoRoot),
    readJsonFile<PackageManifestFile>("packages/core/package.json", repoRoot)
  ]);

  return evaluateReleaseInputs({
    manifests,
    changesetConfig,
    rootPackage,
    coreManifest,
    extraIssues
  });
}

async function loadWorkflowContractCheck(
  repoRoot = repoRootFromScript
): Promise<ReleasePreflightCheckResult> {
  const workflowContent = await readFile(resolve(repoRoot, releaseWorkflowPath), "utf8");
  return evaluateWorkflowContract(workflowContent, releaseWorkflowPath);
}

export function evaluatePackageOwnershipCheck(
  packageResults: readonly PackagePreflightResult[]
): ReleasePreflightCheckResult {
  const existingPackages = packageResults.filter((result) => result.registry.kind === "package");

  if (existingPackages.length === 0) {
    return {
      id: "package-ownership",
      label: "package ownership",
      status: "safe",
      summary: "No existing npm packages were detected, so package ownership confirmation is not required for a first publish.",
      blockers: [],
      details: ["Package ownership only becomes a manual confirmation when npm already exposes the package name."]
    };
  }

  return {
    id: "package-ownership",
    label: "package ownership",
    status: "warn",
    summary: `Manual package ownership confirmation is still required for ${existingPackages.map((result) => result.packageName).join(", ")}.`,
    blockers: ["package ownership"],
    details: [
      "Local preflight can see registry visibility and version drift, but it cannot prove publisher/owner permissions.",
      "Confirm that the intended npm publisher owns every already-visible package before treating the release as externally ready."
    ]
  };
}

export function evaluateTrustedPublisherCheck(input: {
  readonly packageResults: readonly PackagePreflightResult[];
  readonly workflowContract: ReleasePreflightCheckResult;
}): ReleasePreflightCheckResult {
  const existingPackages = input.packageResults.filter(
    (result) => result.registry.kind === "package"
  );

  if (input.workflowContract.status === "blocked") {
    return {
      id: "trusted-publisher",
      label: "trusted-publisher",
      status: "blocked",
      summary: "Trusted-publisher confirmation is blocked because the checked-in release workflow no longer matches the expected production contract.",
      blockers: ["trusted-publisher"],
      details: input.workflowContract.details
    };
  }

  if (existingPackages.length === 0) {
    return {
      id: "trusted-publisher",
      label: "trusted-publisher",
      status: "safe",
      summary: "No existing npm package settings were observed, so remote trusted-publisher confirmation is not yet required for a first publish.",
      blockers: [],
      details: [
        "The checked-in workflow still uses the expected OIDC release markers.",
        "Trusted-publisher confirmation becomes a manual external check once the packages already exist in npm."
      ]
    };
  }

  return {
    id: "trusted-publisher",
    label: "trusted-publisher",
    status: "warn",
    summary: "Trusted-publisher confirmation is still manual because local preflight can validate workflow markers but cannot prove remote npm package trust settings.",
    blockers: ["trusted-publisher"],
    details: [
      "Confirm that each package trusts the arlegotin/agent-badge repository and the production release workflow file.",
      "Keep the checked-in workflow on the OIDC path (`permissions.id-token: write`) so the local and remote contracts stay aligned."
    ]
  };
}

function formatRegistryObservation(result: PackagePreflightResult): string {
  if (result.registry.kind === "missing") {
    return "missing";
  }

  const details = [
    result.registry.observedName ? `name=${result.registry.observedName}` : null,
    result.registry.observedVersion ? `version=${result.registry.observedVersion}` : null,
    result.registry.latestTag ? `dist-tags.latest=${result.registry.latestTag}` : null
  ].filter((value): value is string => value !== null);

  return details.length > 0 ? details.join(", ") : result.registry.message;
}

export function formatHumanReport(report: ReleasePreflightReport): string {
  const lines = ["Release preflight", `Generated: ${report.generatedAt}`];

  for (const result of report.packages) {
    lines.push("");
    lines.push(`${result.packageName}`);
    lines.push(`  manifest: ${result.manifestPath}`);
    lines.push(`  intended: ${result.intendedVersion}`);
    lines.push(`  registry: ${formatRegistryObservation(result)}`);
    lines.push(`  decision: ${result.status}`);
    lines.push(`  blockers: ${result.blockers.length > 0 ? result.blockers.join(", ") : "none"}`);
    lines.push(`  detail: ${result.summary}`);
  }

  lines.push("");
  lines.push("Checks");

  for (const check of report.checks) {
    lines.push("");
    lines.push(`${check.id}`);
    lines.push(`  decision: ${check.status}`);
    lines.push(`  blockers: ${check.blockers.length > 0 ? check.blockers.join(", ") : "none"}`);
    lines.push(`  detail: ${check.summary}`);

    for (const detail of check.details) {
      lines.push(`  note: ${detail}`);
    }
  }

  lines.push("");
  lines.push(`OVERALL: ${report.overallStatus}`);

  return lines.join("\n");
}

export async function runReleasePreflight(
  repoRoot = repoRootFromScript
): Promise<ReleasePreflightReport> {
  let manifests: readonly PublishablePackageManifest[] = [];
  const releaseInputIssues: string[] = [];

  try {
    manifests = await loadPublishablePackageInventory(repoRoot);
  } catch (error) {
    releaseInputIssues.push(error instanceof Error ? error.message : String(error));
  }

  try {
    const packageDirEntries = await readdir(resolve(repoRoot, "packages"), {
      withFileTypes: true
    });

    for (const entry of packageDirEntries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const manifestPath = `packages/${entry.name}/package.json`;
      const manifest = await readJsonFile<PackageManifestFile>(manifestPath, repoRoot);
      const packageName =
        typeof manifest.name === "string" && manifest.name.trim().length > 0
          ? manifest.name
          : null;

      if (packageName === null || expectedPublishablePackageNames.includes(packageName as never)) {
        continue;
      }

      const isPrivate = manifest.private === true;

      if (!isPrivate) {
        releaseInputIssues.push(
          `${manifestPath} must set \`private: true\` because ${packageName} is not part of the production publish inventory.`
        );
      }
    }
  } catch (error) {
    releaseInputIssues.push(
      error instanceof Error
        ? `Failed to inspect workspace publishability: ${error.message}`
        : `Failed to inspect workspace publishability: ${String(error)}`
    );
  }

  const packageResults = await Promise.all(
    manifests.map(async (manifest) =>
      classifyRegistryResult(manifest, await fetchRegistryPackageState(manifest.name, repoRoot))
    )
  );
  const npmAuthCheck = await runNpmAuthCheck(repoRoot);
  const releaseInputsCheck = await loadReleaseInputCheck(manifests, repoRoot, releaseInputIssues);
  const workflowContractCheck = await loadWorkflowContractCheck(repoRoot);
  const packageOwnershipCheck = evaluatePackageOwnershipCheck(packageResults);
  const trustedPublisherCheck = evaluateTrustedPublisherCheck({
    packageResults,
    workflowContract: workflowContractCheck
  });
  const checks = [
    npmAuthCheck,
    releaseInputsCheck,
    workflowContractCheck,
    packageOwnershipCheck,
    trustedPublisherCheck
  ];

  return {
    generatedAt: new Date().toISOString(),
    overallStatus: determineOverallStatus([...packageResults, ...checks]),
    packages: packageResults,
    checks
  };
}

async function main(): Promise<void> {
  const jsonMode = process.argv.includes("--json");
  const report = await runReleasePreflight();

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatHumanReport(report));
  }

  if (report.overallStatus === "blocked") {
    process.exitCode = 1;
  }
}

const executedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);

if (executedPath === modulePath) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`release preflight failed: ${message}`);
    process.exitCode = 1;
  });
}
