import type { CapabilityManifest } from "../../domain/capabilities.js";
/** Native exports rewrite or lose fork/import origin; no numeric identity contract is certified. */
export const opencodeCapabilityManifest: CapabilityManifest = Object.freeze({
  provider: "opencode",
  normalizationVersion: 1,
  accounting: "unsupported",
  sourceSchemas: [
    "opencode-v1-export",
    "opencode-v2-export",
    "opencode-v2-api-export",
  ],
  fixtureReferences: [
    "packages/core/src/providers/opencode/adapter.test.ts",
    "packages/testkit/fixtures/opencode",
  ],
  identity: "unsupported",
  revision: "unordered",
  coverage: "unsupported",
  forks: "unsupported",
  modelSegmentation: "per-request",
});
