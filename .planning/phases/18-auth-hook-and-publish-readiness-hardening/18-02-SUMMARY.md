---
phase: 18-auth-hook-and-publish-readiness-hardening
plan: 02
subsystem: automation-policy
tags: [hooks, refresh, policy, doctor, status, vitest]
requires:
  - phase: 18-auth-hook-and-publish-readiness-hardening
    provides: canonical publish readiness and live badge trust vocabulary
provides:
  - explicit `--hook-policy` wiring for managed pre-push refresh commands
  - loud fail-soft versus strict degraded-mode pre-push output
  - operator-visible pre-push policy reporting in config, status, and doctor
affects: [refresh, init, config, status, doctor, release-readiness]
tech-stack:
  added: []
  patterns:
    - derive degraded pre-push consequences from canonical publish readiness and trust state
    - keep config as the persisted policy source of truth while allowing explicit per-run hook-policy overrides
key-files:
  created:
    - packages/core/src/publish/pre-push-policy.ts
  modified:
    - packages/core/src/publish/index.ts
    - packages/core/src/runtime/local-cli.ts
    - packages/core/src/runtime/local-cli.test.ts
    - packages/core/src/init/runtime-wiring.test.ts
    - packages/core/src/diagnostics/doctor.ts
    - packages/core/src/diagnostics/doctor.test.ts
    - packages/agent-badge/src/cli/main.ts
    - packages/agent-badge/src/cli/main.test.ts
    - packages/agent-badge/src/commands/config.ts
    - packages/agent-badge/src/commands/config.test.ts
    - packages/agent-badge/src/commands/status.ts
    - packages/agent-badge/src/commands/status.test.ts
    - packages/agent-badge/src/commands/refresh.ts
    - packages/agent-badge/src/commands/refresh.test.ts
    - packages/agent-badge/src/commands/init.test.ts
    - packages/agent-badge/src/commands/doctor.test.ts
    - packages/agent-badge/src/commands/release-readiness-matrix.test.ts
key-decisions:
  - "Managed script commands now encode `--hook-policy fail-soft|strict` explicitly, but the repo config remains the persisted source of truth for default policy inspection."
  - "Hook-mode degraded-state messaging is driven from one pre-push policy helper so refresh, status, and doctor use the same `Pre-push policy`, `Warning`, and `Blocking` vocabulary."
  - "Strict pre-push runs now block even when publish degradation is detected without a thrown publish exception, because a stale or unconfigured live badge is a policy failure, not a success."
patterns-established:
  - "Explicit-hook-policy pattern: runtime wiring emits explicit policy-bearing refresh commands instead of relying on missing flags."
  - "Degraded-pre-push pattern: combine publish readiness plus live badge trust to decide whether pushes warn or block."
requirements-completed: [OPER-03, CTRL-01]
duration: 24m
completed: 2026-04-02
---

# Phase 18 Plan 02: Pre-Push Policy and Degraded-Mode Summary

**Explicit pre-push policy wiring with loud fail-soft versus strict hook behavior across refresh, status, config, and doctor**

## Performance

- **Duration:** 24m
- **Completed:** 2026-04-02
- **Tasks:** 2
- **Files modified:** 18

## Accomplishments

- Replaced implicit strict-mode hook semantics with explicit `--hook-policy fail-soft|strict` managed refresh commands and CLI parsing.
- Added canonical pre-push policy reporting to `config`, `status`, and `doctor`, including degraded-mode wording that makes stale badge risk obvious.
- Updated hook-mode `refresh` so fail-soft runs warn loudly and strict runs block loudly, including strict blocking when publish state is degraded even without a thrown publish error.
- Extended the release-readiness scenario matrix so default no-auth repos still wire explicit fail-soft policy and strict policy rewiring is covered after init.

## Task Commits

No task commits were created in this execution because the repo already had unrelated dirty-worktree changes and the phase was completed safely without mixing user edits into a partial commit.

## Files Created/Modified

- `packages/core/src/publish/pre-push-policy.ts` - New shared helper for pre-push policy lines, degraded-state detection, and warning/blocking consequences.
- `packages/core/src/runtime/local-cli.ts` - Managed refresh script commands now encode `--hook-policy` explicitly.
- `packages/agent-badge/src/cli/main.ts` - Added `--hook-policy <mode>` parsing and kept `--fail-soft` as a backward-compatible alias.
- `packages/agent-badge/src/commands/refresh.ts` - Hook-mode refresh now prints policy-aware warning/blocking lines and blocks strict degraded runs.
- `packages/agent-badge/src/commands/status.ts` - Status now exposes `Pre-push policy:` and degraded-mode wording without requiring hook-file inspection.
- `packages/core/src/diagnostics/doctor.ts` - Hook diagnostics now report pre-push policy wording and degraded-mode semantics consistently with status and refresh.
- `packages/agent-badge/src/commands/config.ts` - Config output now names the persisted refresh mode as a pre-push policy.
- `packages/agent-badge/src/commands/release-readiness-matrix.test.ts` - Scenario coverage now asserts explicit fail-soft wiring and strict rewiring after init.

## Decisions Made

- Left `packages/core/src/init/runtime-wiring.ts` unchanged because its managed script wiring already delegates through `getAgentBadgeRefreshScriptCommand()`, so the new explicit policy behavior flowed through from the shared helper instead of needing duplicated runtime-wiring logic.
- Kept `--fail-soft` supported as a CLI alias for backward compatibility, but stopped using flag absence as the managed-hook representation of strict mode.

## Deviations from Plan

- `packages/core/src/init/runtime-wiring.ts` itself did not require source edits; the helper-based script wiring already picked up the explicit policy contract once `packages/core/src/runtime/local-cli.ts` changed.

## Issues Encountered

- The first Wave 2 test pass exposed two subtle mismatches: hook output was still formatting policy from persisted config instead of explicit runtime override, and doctor was treating direct explicit hook commands as invalid unless they used `|| true`. Both were corrected before the final verification pass.

## User Setup Required

None.

## Next Phase Readiness

- Phase 18 now has explicit, inspectable pre-push policy behavior and loud degraded-mode semantics.
- The next logical workflow step is verification or phase completion; Phase 18 no longer has execution gaps.

## Self-Check: PASSED

- Found summary file: `.planning/phases/18-auth-hook-and-publish-readiness-hardening/18-02-SUMMARY.md`
- Verified Plan 18-02 key links:
  - `node "$HOME/.codex/get-shit-done/bin/gsd-tools.cjs" verify key-links .planning/phases/18-auth-hook-and-publish-readiness-hardening/18-02-PLAN.md`
- Targeted Wave 2 suite passed:
  - `npm test -- --run packages/core/src/runtime/local-cli.test.ts packages/core/src/init/runtime-wiring.test.ts packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/cli/main.test.ts packages/agent-badge/src/commands/config.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/release-readiness-matrix.test.ts`
