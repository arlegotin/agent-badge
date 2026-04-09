---
phase: 15-cross-publisher-deduplication-and-publish-semantics
verified: 2026-04-05T14:42:39Z
status: passed
score: 3/3 must-haves verified
---

# Phase 15: Cross-Publisher Deduplication And Publish Semantics Verification Report

**Phase Goal:** Make shared badge totals deterministic across contributors by deduplicating on stable session identity, converging ambiguous-session outcomes, and keeping init, publish, and refresh on one shared publish contract.
**Verified:** 2026-04-05T14:42:39Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Shared contributor records publish opaque per-session observations instead of totals-only snapshots, so duplicate sessions can be reduced canonically without leaking raw provider identifiers. | ✓ VERIFIED | Phase 15 Plan 01 records the schema-version-2 observation move in `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-01-SUMMARY.md`; the runtime contract requires `schemaVersion: 2` observation maps keyed by `sha256:` digests in `packages/core/src/publish/shared-model.ts:43`; the phase UAT marks shared ambiguous consistency and duplicate-session convergence as passed in `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-UAT.md`. |
| 2 | Shared totals and overrides converge deterministically across contributors because duplicate session winners and shared decisions are reduced by one canonical merge algorithm. | ✓ VERIFIED | The canonical watermark ordering is implemented in `packages/core/src/publish/shared-merge.ts:98`, shared included totals derive from grouped observation digests in `packages/core/src/publish/shared-merge.ts:175`, and resolved shared overrides are derived from the same grouped observations in `packages/core/src/publish/shared-merge.ts:206`; Plan 01 summarizes the same reducer and override decisions in `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-01-SUMMARY.md`; the validation contract assigns `CONS-01` and `CONS-03` to reducer and cache tests in `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-VALIDATION.md`. |
| 3 | Init, full publish, and incremental refresh all publish through the same shared observation contract, so command choice does not change shared badge totals or first-publish behavior. | ✓ VERIFIED | Phase 15 Plan 02 records command-parity wiring in `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-02-SUMMARY.md`; publish now builds per-session publisher observations in `packages/agent-badge/src/commands/publish.ts:151`, refresh persists and reuses observation-bearing cache entries in `packages/core/src/scan/incremental-refresh.ts:123` and `packages/agent-badge/src/commands/refresh.ts:5`, init reuses shared publish in `packages/agent-badge/src/commands/init.ts:5`, and authoritative shared totals are recomputed from merged contributor observations in `packages/core/src/publish/publish-service.ts:49`; UAT passes for init-first publish and refresh/full-publish parity are recorded in `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-UAT.md`. |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-01-SUMMARY.md` | Evidence for schema-version-2 observation records, reducers, and refresh-cache v2 | ✓ VERIFIED | Captures the completed observation-map foundation, deterministic reducer decisions, and `CONS-01/02/03` completion. |
| `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-02-SUMMARY.md` | Evidence for shared publish wiring and convergence work | ✓ VERIFIED | Captures the publish-service, refresh, publish, and init command-parity completion and follow-up regressions. |
| `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-UAT.md` | Human-facing proof that init, duplicate-session convergence, refresh parity, and shared ambiguous decisions passed | ✓ VERIFIED | Records four passed checks, including init first publish, duplicate-session convergence, refresh/full-publish parity, and shared ambiguous-session stability. |
| `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-VALIDATION.md` | Planned automated coverage map for reducers, cache persistence, and command wiring | ✓ VERIFIED | The validation artifact maps `CONS-01`, `CONS-02`, and `CONS-03` to reducer, cache, publish-service, publish, and refresh tests. |
| `packages/core/src/publish/shared-model.ts` | Privacy-safe shared contributor record schema keyed by opaque digests | ✓ VERIFIED | Defines `schemaVersion: 2` contributor records and strict observation maps in `packages/core/src/publish/shared-model.ts:43`. |
| `packages/core/src/publish/shared-merge.ts` | Canonical duplicate-session reduction and shared override resolution | ✓ VERIFIED | Implements watermark comparison, included-total derivation, and shared override derivation in `packages/core/src/publish/shared-merge.ts:98`, `packages/core/src/publish/shared-merge.ts:175`, and `packages/core/src/publish/shared-merge.ts:206`. |
| `packages/core/src/publish/publish-service.ts` | Authoritative shared aggregation from contributor observations | ✓ VERIFIED | Uses shared contributor observations as publish input and supports authoritative shared totals during publish in `packages/core/src/publish/publish-service.ts:49`. |
| `packages/core/src/publish/shared-badge-aggregation.test.ts` | Regression proof for authoritative shared badge aggregation and write ordering | ✓ VERIFIED | Verifies the shared three-write sequence and badge payload aggregation from observation records in `packages/core/src/publish/shared-badge-aggregation.test.ts:116` and `packages/core/src/publish/shared-badge-aggregation.test.ts:171`. |
| `packages/core/src/scan/refresh-cache.ts` | Cache contract that preserves per-session shared publish observations | ✓ VERIFIED | Persists status, override decision, tokens, and optional cost in cache version `2` at `packages/core/src/scan/refresh-cache.ts:11`. |
| `packages/core/src/scan/incremental-refresh.ts` | Incremental refresh path that keeps publishable shared observations and summary parity | ✓ VERIFIED | Merges attributed sessions into observation-bearing cache entries in `packages/core/src/scan/incremental-refresh.ts:123`. |
| `packages/agent-badge/src/commands/publish.ts` | Full publish path that builds shared observation maps from attributed sessions | ✓ VERIFIED | Builds publisher observation maps in `packages/agent-badge/src/commands/publish.ts:151`. |
| `packages/agent-badge/src/commands/refresh.ts` | Refresh path that reuses shared observations and shared publish semantics | ✓ VERIFIED | Uses the shared publish helpers and observation digests throughout the command in `packages/agent-badge/src/commands/refresh.ts:5`. |
| `packages/agent-badge/src/commands/init.ts` | Init path that uses the same shared publish contract for first publish | ✓ VERIFIED | Reuses shared publish helpers and shared-health inspection in `packages/agent-badge/src/commands/init.ts:5`. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `packages/core/src/publish/shared-model.ts` | `packages/core/src/publish/shared-merge.ts` | observation-map contributor records feed canonical shared reduction | ✓ WIRED | The reducer consumes `SharedContributorRecord` observations and groups them by digest in `packages/core/src/publish/shared-merge.ts:116`. |
| `packages/core/src/scan/refresh-cache.ts` | `packages/core/src/scan/incremental-refresh.ts` | refresh cache v2 persists the per-session observation inputs reused by refresh publish | ✓ WIRED | Cache entries preserve status, override, tokens, and cost in `packages/core/src/scan/refresh-cache.ts:11`, and refresh rebuilds cache entries from attributed sessions in `packages/core/src/scan/incremental-refresh.ts:123`. |
| `packages/agent-badge/src/commands/publish.ts` | `packages/core/src/publish/publish-service.ts` | full publish passes shared publisher observations to authoritative shared aggregation | ✓ WIRED | `runPublishCommand()` builds `publisherObservations` and passes them to `publishBadgeToGist()` in `packages/agent-badge/src/commands/publish.ts:236`. |
| `packages/agent-badge/src/commands/refresh.ts` | `packages/core/src/publish/publish-service.ts` | refresh publish reuses the same shared publish boundary as full publish | ✓ WIRED | The refresh command imports and uses `publishBadgeIfChanged` with shared observation helpers in `packages/agent-badge/src/commands/refresh.ts:5`. |
| `packages/agent-badge/src/commands/init.ts` | `packages/core/src/publish/publish-service.ts` | init first-publish uses the same shared observation publish path | ✓ WIRED | The init command imports and uses `publishBadgeToGist` from the shared core publish layer in `packages/agent-badge/src/commands/init.ts:5`. |
| `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-UAT.md` | `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-VALIDATION.md` | phase-level UAT outcomes align with the planned automated coverage | ✓ WIRED | The UAT scenarios for init first publish, duplicate-session convergence, refresh parity, and shared ambiguous decisions line up with the validation coverage matrix for reducer, cache, publish, and refresh tests. |

### Behavioral Spot-Checks

| Behavior | Command / Artifact | Result | Status |
| --- | --- | --- | --- |
| Shared observation schema, duplicate-session reduction, and authoritative badge aggregation were implemented and test-backed | `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-01-SUMMARY.md`, `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-02-SUMMARY.md`, `packages/core/src/publish/shared-badge-aggregation.test.ts` | Completed summaries cite the reducer and aggregation work; aggregation regression exists and is substantive | ✓ PASS |
| Init, publish, refresh, and shared ambiguous decision scenarios were explicitly accepted at the phase level | `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-UAT.md` | 4 scenarios passed, 0 issues, 0 blocked | ✓ PASS |
| Validation strategy covered reducer, cache, publish-service, publish, and refresh regressions required by `CONS-01`, `CONS-02`, and `CONS-03` | `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-VALIDATION.md` | Coverage map includes all three phase requirements | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `CONS-01` | `15-01-PLAN.md` | Shared badge totals deduplicate by stable session identity across contributors and machines instead of summing opaque local aggregates. | ✓ SATISFIED | Observation-map contract and digest-keyed shared reducer are recorded in `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-01-SUMMARY.md`, implemented in `packages/core/src/publish/shared-model.ts:43` and `packages/core/src/publish/shared-merge.ts:175`, and planned for explicit reducer validation in `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-VALIDATION.md`. |
| `CONS-02` | `15-02-PLAN.md` | Shared publish-service recomputes authoritative totals from merged contributor observations so publish order and gist readback timing do not corrupt badge totals. | ✓ SATISFIED | Phase 15 Plan 02 records authoritative shared publish wiring in `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-02-SUMMARY.md`; the shared publish aggregation regression exists in `packages/core/src/publish/shared-badge-aggregation.test.ts:116`; the publish service consumes shared observation inputs in `packages/core/src/publish/publish-service.ts:49`. |
| `CONS-03` | `15-01-PLAN.md`, `15-02-PLAN.md` | Repo-level include/exclude decisions and refresh/full-publish semantics stay consistent across contributors and CLI entrypoints. | ✓ SATISFIED | Shared override derivation is implemented in `packages/core/src/publish/shared-merge.ts:206`, refresh persists override-aware observation cache entries in `packages/core/src/scan/incremental-refresh.ts:123`, and the passed UAT scenarios for refresh parity plus shared ambiguous decisions are recorded in `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-UAT.md`. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| None | - | No blocker stub, placeholder, or fabricated evidence pattern was needed to verify Phase 15. This report is grounded in existing summaries, UAT, validation, and runtime/test artifacts. | ℹ️ Info | Phase 15 verification closure does not require reopening implementation work. |

### Human Verification Required

None.

### Gaps Summary

None. Phase 15 already had completed execution summaries, phase UAT, validation coverage, and concrete runtime/test artifacts; the missing gap was the formal `15-VERIFICATION.md` synthesis tying that evidence together for milestone audit consumption.

---

_Verified: 2026-04-05T14:42:39Z_
_Verifier: Codex (gsd-executor)_
