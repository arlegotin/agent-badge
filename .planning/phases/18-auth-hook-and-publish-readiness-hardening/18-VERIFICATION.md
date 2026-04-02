---
phase: 18-auth-hook-and-publish-readiness-hardening
verified: 2026-04-02T10:39:08Z
status: human_needed
score: 3/3 must-haves verified
human_verification:
  - test: "Publish against a real connected gist"
    expected: "`npm run dev:agent-badge -- publish` ends with `- Publish readiness:` using the canonical wording and reflects real auth/gist state rather than a generic failure."
    why_human: "This phase depends on live GitHub auth and gist behavior; automated tests use mocked gist clients."
  - test: "Refresh against a real repo in degraded publish state"
    expected: "`npm run dev:agent-badge -- refresh` prints both `- Publish readiness:` and `- Live badge trust:` with the same wording used by publish and doctor."
    why_human: "The code path is covered, but real degraded-state messaging still depends on local repo state and live operator context."
  - test: "Doctor with missing auth or broken gist access"
    expected: "`npm run dev:agent-badge -- doctor` reports the same remediation path seen in init/publish/refresh, including `GH_TOKEN`, `GITHUB_TOKEN`, or `GITHUB_PAT` and `agent-badge init --gist-id <id>` guidance."
    why_human: "This is external-service integration and environment-specific remediation, which cannot be fully verified from mocks alone."
  - test: "Real pre-push fail-soft versus strict behavior"
    expected: "`npm run dev:agent-badge -- refresh --hook pre-push --hook-policy fail-soft` warns and continues, while `--hook-policy strict` prints the blocking message and exits non-zero in the same degraded state."
    why_human: "Actual hook behavior depends on the repo's installed hook, shell, and local publish environment."
---

# Phase 18: Auth, Hook, And Publish Readiness Hardening Verification Report

**Phase Goal:** Validate GitHub auth and publish readiness where operators need it, and give repos explicit control over how strict pre-push publish failures should be.
**Verified:** 2026-04-02T10:39:08Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Refresh and publish report whether auth is missing, gist access is broken, writes fail, or remote readback is inconsistent. | ✓ VERIFIED | `packages/core/src/publish/publish-readiness.ts` classifies explicit statuses; `packages/core/src/publish/publish-service.ts` throws `gist-unreachable`, `remote-write-failed`, `remote-readback-failed`, `remote-readback-mismatch`, and `remote-state-invalid`; `packages/agent-badge/src/commands/publish.ts` and `packages/agent-badge/src/commands/refresh.ts` print `- Publish readiness:`; targeted tests and full suite passed. |
| 2 | Pre-push automation can be configured deliberately and warns loudly when the badge did not update. | ✓ VERIFIED | `packages/agent-badge/src/cli/main.ts` parses `--hook-policy <mode>`; `packages/core/src/runtime/local-cli.ts` emits explicit fail-soft/strict commands; `packages/core/src/init/runtime-wiring.ts` installs managed hooks from that helper; `packages/core/src/publish/pre-push-policy.ts`, `packages/agent-badge/src/commands/refresh.ts`, and `packages/agent-badge/src/commands/status.ts` generate explicit warning/blocking output; targeted hook-policy suite and full suite passed. |
| 3 | Doctor and init point operators to environment-specific fixes before the repo silently falls out of sync. | ✓ VERIFIED | `packages/core/src/diagnostics/doctor.ts` reuses `inspectPublishReadiness()` fixes for auth and gist readiness; `packages/agent-badge/src/commands/init.ts` prints auth/gist-specific deferred and first-publish remediation; tests cover auth-missing, gist-unreachable, strict/fail-soft wording, and init deferred messaging. |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `packages/core/src/publish/publish-readiness.ts` | Canonical readiness inspection, failure-code mapping, remediation text | ✓ VERIFIED | Exists, substantive, exported, and consumed by refresh and doctor. |
| `packages/core/src/publish/publish-service.ts` | Typed post-write readback verification and explicit publish failure classification | ✓ VERIFIED | Exists, verifies gist readback, validates shared files, and maps mismatch/invalid/readback failures into persisted publish diagnostics. |
| `packages/agent-badge/src/commands/refresh.ts` | Operator-facing readiness and hook-policy reporting | ✓ VERIFIED | Exists and prints readiness/trust lines plus warning or blocking lines in hook mode; plan pattern check missed the literal string because the output is assembled through `formatPrePushPolicyLine()`. |
| `packages/core/src/diagnostics/doctor.ts` | Doctor checks that reuse readiness report and pre-push policy semantics | ✓ VERIFIED | Exists, substantive, wired to `inspectPublishReadiness()`, `derivePrePushPolicyReport()`, and gist read checks. |
| `packages/core/src/runtime/local-cli.ts` | Canonical explicit pre-push refresh command | ✓ VERIFIED | Emits `agent-badge refresh --hook pre-push --hook-policy fail-soft|strict`. |
| `packages/core/src/init/runtime-wiring.ts` | Managed hook wiring for explicit policy command | ✓ VERIFIED | Hook block delegates through `getPrePushRefreshCommand()`; plan pattern check missed the exact literal because the command is composed through the shared helper, but tests verify the installed command text. |
| `packages/agent-badge/src/commands/status.ts` | Inspectable current automation policy in normal operator output | ✓ VERIFIED | Uses the same pre-push policy helper and degraded-state wording as refresh and doctor; literal pattern lives in the shared formatter. |
| `packages/core/src/publish/shared-badge-aggregation.test.ts` | Sequence-aware regression aligned with badge -> contributor -> overrides writes | ✓ VERIFIED | Verifies exact ordered `updateGistFile.mock.calls` and locks `50 tokens`, `100 tokens`, and `30 tokens` cases. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `packages/core/src/publish/publish-readiness.ts` | `packages/agent-badge/src/commands/refresh.ts` | `inspectPublishReadiness` | ✓ WIRED | Refresh prints canonical readiness status instead of command-local wording. |
| `packages/core/src/publish/publish-readiness.ts` | `packages/core/src/diagnostics/doctor.ts` | `inspectPublishReadiness` | ✓ WIRED | Doctor reuses the same readiness classification and fixes. |
| `packages/core/src/publish/publish-service.ts` | `packages/core/src/state/state-schema.ts` | `lastFailureCode` | ✓ WIRED | Publish failure classification persists through additive failure codes without raw error detail. |
| `packages/agent-badge/src/cli/main.ts` | `packages/agent-badge/src/commands/refresh.ts` | `hookPolicy` | ✓ WIRED | CLI parsing forwards explicit hook policy into hook-mode refresh. |
| `packages/core/src/runtime/local-cli.ts` | `packages/core/src/init/runtime-wiring.ts` | `--hook-policy` command generation | ✓ WIRED | Managed hook wiring consumes the shared refresh command helper. |
| `packages/core/src/diagnostics/doctor.ts` | `packages/agent-badge/src/commands/status.ts` | shared pre-push policy wording | ✓ WIRED | Doctor and status use the same policy formatter and degraded-mode semantics. |
| `packages/core/src/publish/shared-badge-aggregation.test.ts` | `packages/core/src/publish/publish-service.ts` | ordered gist write sequence | ✓ WIRED | Regression assertions match the current badge -> contributor -> overrides write order. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `packages/agent-badge/src/commands/refresh.ts` | `readiness.status` / hook consequence | Parsed config + persisted state, updated through `runIncrementalRefresh()` and `publishBadgeIfChanged()` | Yes | ✓ FLOWING |
| `packages/agent-badge/src/commands/publish.ts` | `nextState.publish.*` / `failedState.publish.*` | `publishBadgeToGist()` plus `applyPublishAttemptFailure()` | Yes | ✓ FLOWING |
| `packages/core/src/diagnostics/doctor.ts` | readiness fixes, gist reachability, pre-push policy detail | `runInitPreflight()`, parsed config/state, live `gistClient.getGist()` | Yes | ✓ FLOWING |
| `packages/core/src/publish/publish-service.ts` | `candidateHash`, `readbackGist`, verified shared state | Real gist reads/writes through `client.getGist()` and `client.updateGistFile()` | Yes | ✓ FLOWING |
| `packages/agent-badge/src/commands/status.ts` | policy/trust report lines | Parsed config/state through `derivePrePushPolicyReport()` and `derivePublishTrustReport()` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full automated validation gate is green again | `npm test -- --run` | `45` test files passed, `293` tests passed | ✓ PASS |
| Publish readback classification and sequence-aware shared publish regression hold | `npm test -- --run packages/core/src/publish/publish-service.test.ts packages/core/src/publish/shared-badge-aggregation.test.ts` | `2` test files passed, `22` tests passed | ✓ PASS |
| Hook policy, warning/blocking output, doctor/status wording, and release-readiness scenarios hold | `npm test -- --run packages/agent-badge/src/commands/refresh.test.ts packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/release-readiness-matrix.test.ts` | `4` test files passed, `39` tests passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `OPER-03` | `18-02-PLAN.md` | Pre-push automation reports degraded publish health clearly enough that a developer cannot mistake a stale badge for a successful update. | ✓ SATISFIED | Explicit `--hook-policy` parsing and wiring, shared pre-push policy helper, warning/blocking output in refresh/status/doctor, and scenario coverage in `release-readiness-matrix.test.ts`. |
| `AUTH-01` | `18-01-PLAN.md`, `18-03-PLAN.md` | Refresh and publish validate GitHub auth and gist write readiness before or during publish with concrete, local-environment-specific remediation. | ✓ SATISFIED | `inspectPublishReadiness()` provides canonical remediation; init/publish/refresh/doctor surface it; readback validation and full suite pass. |
| `AUTH-02` | `18-01-PLAN.md`, `18-03-PLAN.md` | Runtime distinguishes auth-missing, gist-unreachable, write-failed, and remote-readback mismatch states instead of collapsing them into one generic publish error. | ✓ SATISFIED | Expanded `publishFailureCodeSchema`, `publish-target.ts` auth/gist mapping, `publish-service.ts` explicit readback/write classifications, and targeted tests. |
| `CTRL-01` | `18-02-PLAN.md` | Repos can choose explicit automation strictness for badge publish failures rather than inheriting one hidden failure-soft default. | ✓ SATISFIED | `--hook-policy <mode>`, explicit command generation, idempotent managed hook wiring, policy inspection in config/status/doctor, and strict rewiring scenario coverage. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| None | - | No blocker or warning-level stub/placeholder patterns were found in the phase implementation files after manual review of grep matches. | ℹ️ Info | Matches such as `return null`, `return []`, and `return {}` were legitimate helper/control-flow cases, not hollow user-visible behavior. |

### Human Verification Required

### 1. Live Publish Readiness

**Test:** Run `npm run dev:agent-badge -- publish` in a repo with either valid GitHub auth or a deliberately broken gist target.
**Expected:** The command ends with `- Publish readiness:` using the canonical wording and distinguishes auth missing, gist reachability, write failure, or readback mismatch instead of a generic publish error.
**Why human:** Real GitHub auth and Gist behavior are external integrations; the automated tests mock the gist client.

### 2. Live Refresh Trust And Readiness

**Test:** Run `npm run dev:agent-badge -- refresh` in a repo that has both a healthy state and a degraded publish state.
**Expected:** Output includes both `- Publish readiness:` and `- Live badge trust:` and keeps those concepts distinct.
**Why human:** The code path is automated, but end-to-end wording against real repo state and live publish targets is still environment-dependent.

### 3. Doctor Remediation With Real Environment Drift

**Test:** Run `npm run dev:agent-badge -- doctor` once with auth removed and once with a broken or unreachable gist id.
**Expected:** Doctor points to the same remediation path used elsewhere, including `GH_TOKEN`, `GITHUB_TOKEN`, or `GITHUB_PAT` and `agent-badge init --gist-id <id>`.
**Why human:** This depends on the operator's real shell environment and network/GitHub access.

### 4. Installed Hook Fail-Soft Versus Strict

**Test:** After `init`, invoke the repo's actual pre-push flow in a degraded publish state for both `fail-soft` and `strict`.
**Expected:** Fail-soft prints `Warning: live badge may be stale; push continues because pre-push policy is fail-soft.` Strict prints `Blocking: push stopped because pre-push policy is strict.` and exits non-zero.
**Why human:** Hook execution depends on the installed `.git/hooks/pre-push`, shell behavior, and local repo environment.

### Gaps Summary

No implementation gaps were found in the Phase 18 code or automated validation coverage. The remaining work is live-environment verification of GitHub/gist behavior and actual installed-hook behavior, so this phase is `human_needed`, not `gaps_found`.

---

_Verified: 2026-04-02T10:39:08Z_
_Verifier: Claude (gsd-verifier)_
