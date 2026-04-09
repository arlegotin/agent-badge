---
phase: 04-publish-and-readme-badge-integration
verified: 2026-03-30T17:08:55Z
status: passed
score: 4/4 must-haves verified
re_verification:
  previous_status: human_needed
  previous_score: 4/4
  gaps_closed:
    - "Completed the live GitHub + Shields smoke test with a real `GH_TOKEN` and public gist create/update path."
  gaps_remaining: []
  regressions: []
---

# Phase 04: Publish and README Badge Integration Verification Report

**Phase Goal:** Publish privacy-safe aggregate badge JSON and connect it to a stable README badge URL.
**Verified:** 2026-03-30T17:08:55Z
**Status:** passed
**Re-verification:** Yes — after live GitHub + Shields smoke test

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Init can create a public gist automatically when auth exists and can connect or defer cleanly when it does not. | ✓ VERIFIED | `packages/core/src/publish/publish-target.ts:103` enforces explicit-id -> configured-id -> create -> defer ordering, and `packages/agent-badge/src/commands/init.ts:401` persists and reports the outcome. `packages/agent-badge/src/commands/init.test.ts:249`, `:308`, `:371`, and `:553` cover connect, create, reuse, and defer paths. |
| 2 | Publish writes aggregate-only Shields endpoint JSON with the expected badge fields. | ✓ VERIFIED | `packages/core/src/publish/badge-payload.ts:39` returns only `schemaVersion`, `label`, `message`, and `color`; `packages/core/src/publish/publish-service.ts:68` derives totals from scan+attribution and updates only `agent-badge.json`. `packages/core/src/publish/publish-service.test.ts:162` asserts the payload excludes session ids, local paths, and reason strings. |
| 3 | The README receives one stable badge URL or a pasteable snippet when no README exists. | ✓ VERIFIED | `packages/core/src/publish/badge-url.ts:11` derives the stable endpoint URL from gist identity plus `agent-badge.json`. `packages/agent-badge/src/commands/init.ts:456` publishes before `writeReadmeBadgeOutput()`, and `packages/core/src/publish/readme-badge.ts:23` builds the managed README/snippet markup. `packages/agent-badge/src/commands/init.test.ts:281` and `:461` cover README insertion and snippet output. |
| 4 | Re-running init or publish does not duplicate README badge entries. | ✓ VERIFIED | `packages/core/src/publish/publish-target.ts:119` reuses configured gist ids, `packages/core/src/publish/readme-badge.ts:36` replaces any existing managed badge block, and `packages/agent-badge/src/commands/publish.ts:124` only rewrites state, not README content. `packages/agent-badge/src/commands/init.test.ts:371` and `:500` verify gist reuse and single-block README idempotency. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `packages/core/src/publish/publish-target.ts` | Init-time create/connect/reuse/defer orchestration | ✓ VERIFIED | Deterministic ordering, deferred reasons, and gist seeding are implemented. |
| `packages/core/src/publish/github-gist-client.ts` | GitHub Gist transport boundary | ✓ VERIFIED | `getGist`, `createPublicGist`, and `updateGistFile` are implemented behind an Octokit seam. |
| `packages/core/src/publish/badge-url.ts` | Stable badge URL derivation | ✓ VERIFIED | Uses fixed filename `agent-badge.json` and `cacheSeconds=3600`, not revision-specific `raw_url`. |
| `packages/core/src/publish/publish-state.ts` | Config/state reconciliation for target setup | ✓ VERIFIED | Persists only gist id, badge URL, publish status, and hash bookkeeping. |
| `packages/core/src/publish/badge-payload.ts` | Shields endpoint payload serializer | ✓ VERIFIED | Produces the expected field set and explicit unsupported-cost failure. |
| `packages/core/src/publish/publish-service.ts` | Aggregate-only gist publish orchestration | ✓ VERIFIED | Serializes endpoint JSON, updates the deterministic gist file, and hashes the exact uploaded content. |
| `packages/core/src/publish/readme-badge.ts` | Managed README badge insertion/snippet helpers | ✓ VERIFIED | Marker-bounded upsert keeps a single managed block and supports no-README snippet output. |
| `packages/agent-badge/src/commands/init.ts` | End-to-end init wiring | ✓ VERIFIED | Establishes target, performs first publish, then updates README or prints a snippet. |
| `packages/agent-badge/src/commands/publish.ts` | Standalone publish command | ✓ VERIFIED | Reuses full backfill + attribution and persists publish status/hash. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `packages/agent-badge/src/commands/init.ts` | `packages/core/src/publish/publish-target.ts` | `ensurePublishTarget()` | ✓ WIRED | Confirmed by code and `gsd-tools verify key-links` for `04-01-PLAN.md`. |
| `packages/core/src/publish/publish-target.ts` | `packages/core/src/publish/github-gist-client.ts` | `getGist()` / `createPublicGist()` | ✓ WIRED | Existing gist lookup and public gist creation both go through the client seam. |
| `packages/core/src/publish/publish-target.ts` | `packages/core/src/publish/badge-url.ts` | `buildStableBadgeUrl()` | ✓ WIRED | Stable badge URL is derived from owner login + gist id. |
| `packages/agent-badge/src/commands/publish.ts` | `packages/core/src/scan/full-backfill.ts` | `runFullBackfillScan()` | ✓ WIRED | Publish reuses the scan pipeline instead of inventing a second aggregation path. |
| `packages/agent-badge/src/commands/publish.ts` | `packages/core/src/attribution/attribution-engine.ts` | `attributeBackfillSessions()` | ✓ WIRED | Publish totals come from attributed sessions only. |
| `packages/core/src/publish/publish-service.ts` | `packages/core/src/publish/badge-payload.ts` | `buildEndpointBadgePayload()` | ✓ WIRED | Payload serialization is delegated to the dedicated serializer. |
| `packages/core/src/publish/publish-service.ts` | `packages/core/src/publish/github-gist-client.ts` | `updateGistFile()` | ✓ WIRED | Remote updates target only the deterministic gist file. |
| `packages/agent-badge/src/commands/init.ts` | `packages/core/src/publish/publish-service.ts` | `publishBadgeToGist()` | ✓ WIRED | README mutation happens only after first publish succeeds. |
| `packages/agent-badge/src/commands/init.ts` | `packages/core/src/publish/readme-badge.ts` | `buildReadmeBadgeSnippet()` / `upsertReadmeBadge()` | ✓ WIRED | Init uses the shared helper for both README and no-README paths. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `packages/core/src/publish/publish-service.ts` | `includedTotals` | `runFullBackfillScan()` sessions filtered by `attributeBackfillSessions()` | Yes | ✓ FLOWING |
| `packages/agent-badge/src/commands/publish.ts` | `scan` / `attribution` | Shared scan and attribution services, not hardcoded values | Yes | ✓ FLOWING |
| `packages/agent-badge/src/commands/init.ts` | `config.publish.badgeUrl` and README/snippet output | `ensurePublishTarget()` -> `buildStableBadgeUrl()` after successful first publish | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Phase 4 publish + README integration regression suite | `PATH="/tmp/agent-badge-deps/node_modules/.bin:$PATH" npm test -- --run packages/core/src/publish/github-gist-client.test.ts packages/core/src/publish/publish-state.test.ts packages/core/src/publish/badge-payload.test.ts packages/core/src/publish/publish-service.test.ts packages/core/src/publish/readme-badge.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/cli/main.test.ts` | 8 files / 34 tests passed | ✓ PASS |
| Repository regression gate | `PATH="/tmp/agent-badge-deps/node_modules/.bin:$PATH" npm test -- --run` | 22 files / 97 tests passed | ✓ PASS |
| Live GitHub + Shields smoke test | `source .env` then run the temp Phase 4 smoke repo through `runInitCommand()` and `runPublishCommand()` with a real `GH_TOKEN` | Public gist created, `agent-badge.json` published, README gained exactly one managed badge block, second publish preserved the badge URL, raw gist JSON fetched successfully, Shields returned SVG, and the temp gist was deleted after verification | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `PUBL-01` | `04-01-PLAN.md` | Init can create a public Gist automatically when GitHub auth is available. | ✓ SATISFIED | `publish-target.ts:123` creates a public gist; `init.test.ts:308` verifies automatic creation with auth. |
| `PUBL-02` | `04-01-PLAN.md` | If automatic Gist creation fails, developer can retry, connect an existing Gist, or continue in explicit unpublished mode. | ✓ SATISFIED | `publish-target.ts:109`/`:135` defer cleanly; `init.ts:428` prints actionable deferred guidance; `init.test.ts:249`, `:371`, and `:553` cover connect/reuse/defer paths. |
| `PUBL-03` | `04-02-PLAN.md` | `publish` writes aggregate-only Shields endpoint JSON with `schemaVersion`, `label`, `message`, `color`, and cache behavior fields. | ✓ SATISFIED | `badge-payload.ts:39`, `badge-url.ts:3`, and `publish-service.test.ts:162` verify the payload shape, stable endpoint, and aggregate-only content. |
| `BOOT-05` | `04-03-PLAN.md` | Init inserts one stable badge URL into the repository README or prints a pasteable snippet when no README exists. | ✓ SATISFIED | `init.ts:456` -> `writeReadmeBadgeOutput()` and `init.test.ts:461` cover README and snippet behavior. |
| `PUBL-04` | `04-03-PLAN.md` | The README badge URL stays stable after init; later updates modify only the remote JSON. | ✓ SATISFIED | `badge-url.ts:11` derives a stable URL; `readme-badge.ts:36` keeps one managed block; `publish.ts:124` updates state only; `init.test.ts:500` verifies no duplication on rerun. |

Phase 4 plan requirements match the Phase 4 traceability entries in `.planning/REQUIREMENTS.md`; no orphaned Phase 4 requirements were found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| None | - | No TODO/FIXME/placeholder stub patterns in the Phase 4 implementation files | - | No blocker or warning-level anti-patterns found. |

### Human Verification Required

None. The required live GitHub + Shields smoke test has been completed successfully in a throwaway repository with a real `GH_TOKEN`.

### Gaps Summary

No code or verification gaps remain in Phase 4. Automated checks are green and the live external smoke check against GitHub + Shields passed.

---

_Verified: 2026-03-30T17:08:55Z_
_Verifier: Claude (gsd-verifier)_
