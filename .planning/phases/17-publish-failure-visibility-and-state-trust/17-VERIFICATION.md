---
phase: 17-publish-failure-visibility-and-state-trust
verified: 2026-04-02T08:31:24Z
status: passed
score: 3/3 must-haves verified
---

# Phase 17: Publish Failure Visibility And State Trust Verification Report

**Phase Goal:** Make the difference between a fresh badge and a stale failed publish obvious from the normal repo surfaces operators already use.
**Verified:** 2026-04-02T08:31:24Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `status`, `refresh`, and persisted state distinguish successful local refresh from failed remote publish with explicit timestamps and stale-state messaging. | ✓ VERIFIED | Persisted publish-attempt fields exist in `packages/core/src/state/state-schema.ts:74`; refresh writes not-attempted, success, and failure outcomes in `packages/agent-badge/src/commands/refresh.ts:371` and `packages/agent-badge/src/commands/refresh.ts:445`; status prints `Live badge trust` and `Last successful badge update` in `packages/agent-badge/src/commands/status.ts:263`; refresh prints the same trust/timestamp lines in `packages/agent-badge/src/commands/refresh.ts:166`. |
| 2 | Operators can tell whether the live badge is stale because publish failed, because no publish was attempted, or because the remote value genuinely did not change. | ✓ VERIFIED | Canonical trust states `not-attempted`, `unchanged`, `failed-but-unchanged`, `stale-failed-publish`, and `current` are derived in `packages/core/src/publish/publish-trust.ts:3`; tests lock all key branches in `packages/core/src/publish/publish-trust.test.ts:7`, `packages/core/src/publish/publish-trust.test.ts:54`, `packages/core/src/publish/publish-trust.test.ts:88`, and `packages/core/src/publish/publish-trust.test.ts:124`; command rendering is covered in `packages/agent-badge/src/commands/status.test.ts:260` and `packages/agent-badge/src/commands/refresh.test.ts:511`. |
| 3 | Shared-mode state and live-badge trust signals do not drift between CLI output and persisted diagnostics. | ✓ VERIFIED | `status`, `refresh`, and `doctor` all call `derivePublishTrustReport()` and `formatPublishTrustStatus()` from core in `packages/agent-badge/src/commands/status.ts:263`, `packages/agent-badge/src/commands/refresh.ts:166`, and `packages/core/src/diagnostics/doctor.ts:393`; doctor ordering keeps `publish-trust`, `shared-mode`, and `shared-health` as separate checks in `packages/core/src/diagnostics/doctor.ts:1016`; separation is test-covered in `packages/core/src/diagnostics/doctor.test.ts:455` and `packages/agent-badge/src/commands/doctor.test.ts:373`. |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `packages/core/src/publish/publish-trust.ts` | Canonical live-badge trust derivation and shared wording | ✓ VERIFIED | Defines the phase trust vocabulary and maps persisted publish facts to operator-visible states in `packages/core/src/publish/publish-trust.ts:3`. |
| `packages/core/src/state/state-schema.ts` | Canonical persisted publish-attempt diagnostics | ✓ VERIFIED | Stores `lastAttemptedAt`, `lastAttemptOutcome`, `lastSuccessfulSyncAt`, `lastAttemptCandidateHash`, `lastAttemptChangedBadge`, and `lastFailureCode` in `packages/core/src/state/state-schema.ts:74`. |
| `packages/core/src/publish/publish-service.ts` | Candidate-hash and changed-badge facts before remote writes | ✓ VERIFIED | Computes `candidateHash` before writes and returns unchanged vs published outcomes in `packages/core/src/publish/publish-service.ts:423` and `packages/core/src/publish/publish-service.ts:443`. |
| `packages/core/src/publish/publish-state.ts` | Shared persistence contract for publish outcomes | ✓ VERIFIED | Centralizes not-attempted, failed, and successful publish writes in `packages/core/src/publish/publish-state.ts:99`. |
| `packages/core/src/init/scaffold.ts` | Init reruns preserve Phase 17 publish diagnostics | ✓ VERIFIED | Reconciles and preserves every additive publish field in `packages/core/src/init/scaffold.ts:334`. |
| `packages/core/src/diagnostics/doctor.ts` | Dedicated publish-trust check separate from shared-health | ✓ VERIFIED | Adds `publish-trust` with its own status/fix logic in `packages/core/src/diagnostics/doctor.ts:367`. |
| `packages/agent-badge/src/commands/status.ts` | Trust output on normal status surface | ✓ VERIFIED | Renders `Live badge trust` and `Last successful badge update` before shared-mode output in `packages/agent-badge/src/commands/status.ts:263`. |
| `packages/agent-badge/src/commands/refresh.ts` | Trust output on success and failed-soft refresh paths | ✓ VERIFIED | Renders trust lines for normal summaries and soft failures, and persists failure state before output in `packages/agent-badge/src/commands/refresh.ts:166` and `packages/agent-badge/src/commands/refresh.ts:445`. |
| `packages/agent-badge/src/commands/doctor.ts` | Doctor surface exposes the same publish-trust check | ✓ VERIFIED | The file renders all core doctor checks generically via `check.id` in `packages/agent-badge/src/commands/doctor.ts:30`; although the plan-pattern scan did not find a literal `publish-trust` token in this file, runtime behavior is verified by `packages/agent-badge/src/commands/doctor.test.ts:373`. |
| `packages/agent-badge/src/commands/publish.ts` | Direct publish path persists the same diagnostics contract as refresh | ✓ VERIFIED | Writes not-attempted and failure diagnostics around publish flows in `packages/agent-badge/src/commands/publish.ts:176` and `packages/agent-badge/src/commands/publish.ts:253`. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `packages/core/src/publish/publish-service.ts` | `packages/core/src/publish/publish-state.ts` | `applySuccessfulPublishAttempt()` carries candidate-hash and changed-badge facts into state | ✓ WIRED | `publishBadgeIfChanged()` returns state through `applySuccessfulPublishAttempt()` in `packages/core/src/publish/publish-service.ts:465` and `packages/core/src/publish/publish-service.ts:518`. |
| `packages/core/src/publish/publish-state.ts` | `packages/agent-badge/src/commands/refresh.ts` | Refresh persists canonical not-attempted, success, and failure facts | ✓ WIRED | `refresh.ts` uses `applyPublishAttemptNotAttempted()` and `applyPublishAttemptFailure()` in `packages/agent-badge/src/commands/refresh.ts:375` and `packages/agent-badge/src/commands/refresh.ts:449`. |
| `packages/core/src/publish/publish-state.ts` | `packages/agent-badge/src/commands/publish.ts` | Direct publish persists the same canonical failure/not-attempted facts | ✓ WIRED | `publish.ts` uses the same persistence helpers in `packages/agent-badge/src/commands/publish.ts:176` and `packages/agent-badge/src/commands/publish.ts:253`. |
| `packages/core/src/publish/publish-trust.ts` | `packages/agent-badge/src/commands/status.ts` | Status renders shared trust vocabulary | ✓ WIRED | `status.ts` imports and renders `derivePublishTrustReport()` plus `formatPublishTrustStatus()` in `packages/agent-badge/src/commands/status.ts:263`. |
| `packages/core/src/publish/publish-trust.ts` | `packages/agent-badge/src/commands/refresh.ts` | Refresh renders the same trust vocabulary after success and failure | ✓ WIRED | `refresh.ts` uses the same helper in `packages/agent-badge/src/commands/refresh.ts:166`. |
| `packages/core/src/publish/publish-trust.ts` | `packages/core/src/diagnostics/doctor.ts` | Doctor derives `publish-trust` from the same persisted facts | ✓ WIRED | `checkPublishTrust()` uses the shared helper in `packages/core/src/diagnostics/doctor.ts:393`. |
| `packages/core/src/diagnostics/doctor.ts` | `packages/agent-badge/src/commands/doctor.ts` | Command renders the `publish-trust` check output returned by core | ✓ WIRED | `runDoctorCommand()` renders every `check.id` and message in `packages/agent-badge/src/commands/doctor.ts:30`; behavior is covered by `packages/agent-badge/src/commands/doctor.test.ts:373`. |
| `packages/agent-badge/src/commands/status.ts` | `packages/core/src/publish/shared-health.ts` | Shared health remains a separate line after trust output | ✓ WIRED | `buildSharedModeLines()` still derives shared health separately and is appended after `buildPublishTrustLines()` in `packages/agent-badge/src/commands/status.ts:77` and `packages/agent-badge/src/commands/status.ts:315`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `packages/agent-badge/src/commands/status.ts` | `trustReport` | Parsed `.agent-badge/state.json` -> `derivePublishTrustReport(state)` | Yes | ✓ FLOWING |
| `packages/agent-badge/src/commands/refresh.ts` | `persistedState.publish.*` -> `trustReport` | `publishBadgeIfChanged()` or `applyPublishAttemptNotAttempted()` / `applyPublishAttemptFailure()` update persisted state before output | Yes | ✓ FLOWING |
| `packages/core/src/diagnostics/doctor.ts` | `report` | `readPersistedState()` -> `derivePublishTrustReport(state)` | Yes | ✓ FLOWING |
| `packages/core/src/publish/publish-trust.ts` | `publish.lastAttempt*`, `lastPublished*` | Canonical state schema fields written by publish/refresh paths | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Canonical trust vocabulary across `publish-trust`, `status`, `refresh`, and `doctor` | `npm test -- --run packages/core/src/publish/publish-trust.test.ts packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/doctor.test.ts` | 5 files passed, 33 tests passed | ✓ PASS |
| Persisted diagnostics and command write paths | `npm test -- --run packages/core/src/state/state-schema.test.ts packages/core/src/init/scaffold.test.ts packages/core/src/publish/publish-service.test.ts packages/core/src/publish/publish-trust.test.ts packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts` | Fresh orchestrator evidence: 9 files passed, 75 tests passed | ✓ PASS |
| Shared-health regression stays intact while Phase 17 trust changes land | `npm test -- --run packages/core/src/publish/shared-health.test.ts` | Fresh orchestrator evidence: 1 file passed, 5 tests passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `OPER-01` | `17-01`, `17-02`, `17-03` | Operators can immediately see when the live badge is stale because publish failed or was skipped for an actionable reason. | ✓ SATISFIED | `status` and `refresh` render explicit trust states and last successful update timestamps in `packages/agent-badge/src/commands/status.ts:263` and `packages/agent-badge/src/commands/refresh.ts:166`; stale, unchanged, not-attempted, and failed-but-unchanged cases are covered in `packages/agent-badge/src/commands/status.test.ts:260` and `packages/agent-badge/src/commands/refresh.test.ts:511`. |
| `OPER-02` | `17-02`, `17-03` | `status`, `refresh`, and `doctor` expose one coherent view of last successful publish, current failure state, and required recovery action. | ✓ SATISFIED | One core trust model drives all three surfaces via `packages/core/src/publish/publish-trust.ts:22`; doctor adds recovery actions in `packages/core/src/diagnostics/doctor.ts:367`; persisted contract is shared by refresh/publish and preserved by init in `packages/core/src/publish/publish-state.ts:99` and `packages/core/src/init/scaffold.ts:334`. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| None | — | No blocker stub, placeholder, or TODO/FIXME patterns in phase-touched runtime files. Benign `null`/default handling matches schema and parser logic. | ℹ️ Info | No implementation-level anti-pattern blocked the phase goal. |

### Human Verification Required

None.

### Gaps Summary

None. Phase 17’s goal is achieved in code: persisted publish-attempt facts exist, those facts distinguish stale failed publishes from unchanged live badges, and `status`, `refresh`, and `doctor` all render the same trust vocabulary while keeping shared-health separate.

---

_Verified: 2026-04-02T08:31:24Z_
_Verifier: Claude (gsd-verifier)_
