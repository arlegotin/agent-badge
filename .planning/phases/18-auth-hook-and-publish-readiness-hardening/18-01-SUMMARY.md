---
phase: 18-auth-hook-and-publish-readiness-hardening
plan: 01
subsystem: publish
tags: [publish, readiness, auth, doctor, refresh, vitest]
requires:
  - phase: 17-publish-failure-visibility-and-state-trust
    provides: canonical publish-attempt diagnostics and live badge trust reporting
provides:
  - canonical publish readiness inspection and remediation vocabulary
  - additive publish failure codes for auth, gist reachability, and readback verification
  - post-write gist readback verification with stale-read fallback and explicit mismatch states
affects: [18-02, doctor, init, publish, refresh]
tech-stack:
  added: []
  patterns:
    - derive readiness messaging from one core helper and reuse it across operator surfaces
    - verify remote writes by readback when possible, but tolerate stale gist reads by falling back to the expected local write model
key-files:
  created:
    - packages/core/src/publish/publish-readiness.ts
    - packages/core/src/publish/publish-readiness.test.ts
  modified:
    - packages/core/src/state/state-schema.ts
    - packages/core/src/state/state-schema.test.ts
    - packages/core/src/init/scaffold.ts
    - packages/core/src/init/scaffold.test.ts
    - packages/core/src/publish/index.ts
    - packages/core/src/publish/publish-service.ts
    - packages/core/src/publish/publish-state.test.ts
    - packages/core/src/publish/publish-target.ts
    - packages/core/src/diagnostics/doctor.ts
    - packages/core/src/diagnostics/doctor.test.ts
    - packages/agent-badge/src/commands/init.ts
    - packages/agent-badge/src/commands/init.test.ts
    - packages/agent-badge/src/commands/publish.ts
    - packages/agent-badge/src/commands/publish.test.ts
    - packages/agent-badge/src/commands/refresh.ts
    - packages/agent-badge/src/commands/refresh.test.ts
key-decisions:
  - "Expanded publish failure codes remain additive and backward-compatible; legacy `remote-inspection-failed` still parses, but Phase 18 paths now prefer explicit auth/gist/readback codes."
  - "Post-write gist verification only fails on genuine unreadable or mismatched remote state and falls back to the expected local write model when the immediate follow-up gist read is stale."
  - "Init keeps its operator-facing deferred guidance explicit, while publish and refresh now print a shared `Publish readiness:` line derived from the same core helper."
patterns-established:
  - "Readiness-report pattern: `inspectPublishReadiness()` maps state/config/target facts to one shared status string plus remediation."
  - "Readback-verification pattern: attempt remote gist reread, classify explicit mismatch/invalid states, and otherwise use an expected merged gist snapshot for health evaluation."
requirements-completed: [AUTH-01, AUTH-02]
duration: 18m
completed: 2026-04-02
---

# Phase 18 Plan 01: Readiness Hardening Summary

**Canonical publish readiness, additive failure-code expansion, and post-write gist verification across init, doctor, publish, and refresh**

## Performance

- **Duration:** 18m
- **Completed:** 2026-04-02
- **Tasks:** 2
- **Files modified:** 18

## Accomplishments

- Added `inspectPublishReadiness()` and `formatPublishReadinessStatus()` so init, doctor, publish, and refresh share one readiness vocabulary.
- Expanded persisted publish failure codes to distinguish `auth-missing`, gist-target failures, remote readback failures, remote readback mismatches, and invalid remote shared state.
- Updated `publish-service.ts` to re-read the gist after writes, classify explicit readback failures, and tolerate stale follow-up reads by falling back to the locally expected merged gist state.
- Added operator-visible `- Publish readiness:` lines to publish and refresh outputs, plus doctor coverage for canonical gist-unreachable remediation.

## Task Commits

No task commits were created in this execution because the repo already had unrelated dirty-worktree changes and the phase was completed safely without mixing user edits into a partial commit.

## Files Created/Modified

- `packages/core/src/publish/publish-readiness.ts` - New core readiness helper and remediation vocabulary.
- `packages/core/src/publish/publish-readiness.test.ts` - Focused coverage for readiness classification and formatting.
- `packages/core/src/publish/publish-service.ts` - Added post-write gist readback verification with stale-read fallback and explicit mismatch classification.
- `packages/core/src/state/state-schema.ts` - Expanded additive publish failure codes.
- `packages/core/src/init/scaffold.ts` - Preserved expanded failure codes across scaffold reconciliation.
- `packages/core/src/diagnostics/doctor.ts` - Reused canonical readiness fixes for auth and gist-reachability checks.
- `packages/agent-badge/src/commands/init.ts` - Kept deferred badge-setup guidance aligned with the new auth/gist readiness vocabulary.
- `packages/agent-badge/src/commands/publish.ts` - Added `Publish readiness:` output on success and typed publish failure surfaces.
- `packages/agent-badge/src/commands/refresh.ts` - Added `Publish readiness:` output on both success and fail-soft paths.

## Decisions Made

- Kept stale gist read tolerance because the repo already depends on eventual read-after-write consistency; explicit mismatch is only treated as fatal when the follow-up read is readable and internally coherent enough to trust.
- Left `status` and explicit pre-push policy inspection for Plan 18-02 so Wave 2 can build on the new readiness layer rather than duplicating logic.

## Deviations from Plan

- Executor subagents stalled twice without producing a usable completion signal, so Plan 18-01 was finished locally in the orchestrator workspace.

## Issues Encountered

- Existing publish-service tests assume stale immediate gist reads are acceptable after writes. The readback verifier was adjusted to detect genuine mismatches without breaking that established behavior.

## User Setup Required

None.

## Next Phase Readiness

- Plan 18-02 can now reuse `inspectPublishReadiness()` and the new failure codes to make pre-push degraded-mode output explicit and trustworthy.

## Self-Check: PASSED

- Found summary file: `.planning/phases/18-auth-hook-and-publish-readiness-hardening/18-01-SUMMARY.md`
- Targeted Wave 1 test suite passed:
  - `npm test -- --run packages/core/src/state/state-schema.test.ts packages/core/src/init/scaffold.test.ts packages/core/src/publish/publish-readiness.test.ts packages/core/src/publish/publish-state.test.ts packages/core/src/publish/publish-service.test.ts packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts`
