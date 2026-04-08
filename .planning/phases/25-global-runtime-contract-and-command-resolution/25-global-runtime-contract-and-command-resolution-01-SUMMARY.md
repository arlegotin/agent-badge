---
phase: 25-global-runtime-contract-and-command-resolution
plan: 01
subsystem: infra
tags: [runtime, hooks, diagnostics, cli]
requires:
  - phase: 24-production-ready-exit-criteria-and-closeout
    provides: current production-ready init and refresh behavior used as the migration baseline
provides:
  - shared PATH-based runtime probing and remediation in core
  - direct managed pre-push hook generation with a shared-runtime guard
  - doctor compatibility for both shared and legacy managed hook contracts
affects: [phase-26, init, doctor, pre-push-hook]
tech-stack:
  added: []
  patterns:
    - shared-runtime-first command builders
    - single-write dual-read hook migration
key-files:
  created:
    - packages/core/src/runtime/shared-cli.ts
  modified:
    - packages/core/src/runtime/shared-cli.test.ts
    - packages/core/src/runtime/local-cli.ts
    - packages/core/src/runtime/local-cli.test.ts
    - packages/core/src/runtime/index.ts
    - packages/core/src/init/runtime-wiring.ts
    - packages/core/src/init/runtime-wiring.test.ts
    - packages/core/src/diagnostics/doctor.ts
    - packages/core/src/diagnostics/doctor.test.ts
    - packages/agent-badge/src/commands/init.test.ts
key-decisions:
  - "Shared command builders now emit plain `agent-badge ...` invocations instead of package-manager wrapper commands."
  - "Managed hooks guard `command -v agent-badge` and follow strict versus fail-soft exit behavior when the shared runtime is missing."
  - "Doctor remains dual-read so legacy `agent-badge:refresh` hook blocks still pass during the migration window."
patterns-established:
  - "Shared runtime contract: probe once in core and reuse one remediation vocabulary across callers."
  - "Single-write, dual-read migration: new managed hooks use the direct shared command while diagnostics still accept legacy hook bodies."
requirements-completed:
  - DIST-03
  - AUTO-01
duration: 5 min
completed: 2026-04-08
---

# Phase 25: Global Runtime Contract And Command Resolution Summary

**Shared PATH-based runtime probing, direct managed hook wiring, and migration-safe doctor checks for the global `agent-badge` contract**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-08T20:22:53Z
- **Completed:** 2026-04-08T20:27:45Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Added a new core shared-runtime helper that probes `agent-badge --version`, builds privacy-safe remediation, and centralizes direct command construction.
- Rewired managed pre-push hooks to use the direct shared command contract with a PATH guard and policy-aware strict versus fail-soft handling.
- Updated doctor and init verification coverage so the new shared hook contract is validated while legacy `agent-badge:refresh` blocks remain accepted during migration.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the shared PATH-based runtime contract in core** - `88b89a6` (feat)
2. **Task 2: Rewire hook generation and diagnostics to single-write shared hooks with legacy-read compatibility** - `7d66ed2` (feat)

## Files Created/Modified
- `packages/core/src/runtime/shared-cli.ts` - Shared runtime probe, remediation builder, and direct command helper.
- `packages/core/src/runtime/shared-cli.test.ts` - Unit coverage for availability, missing-runtime, and direct-command behavior.
- `packages/core/src/runtime/local-cli.ts` - Local command builders now route through the shared PATH-based contract.
- `packages/core/src/runtime/local-cli.test.ts` - Confirms package-manager contexts all resolve to the same shared command path.
- `packages/core/src/runtime/index.ts` - Re-exports the shared runtime module.
- `packages/core/src/init/runtime-wiring.ts` - Managed hook generation now guards `command -v agent-badge` and emits the direct shared command.
- `packages/core/src/init/runtime-wiring.test.ts` - Verifies the guarded hook body, remediation output, and package-manager-invariant hook contract.
- `packages/core/src/diagnostics/doctor.ts` - Accepts both shared and legacy managed hook contracts and reuses the shared runtime remediation path for hook repair guidance.
- `packages/core/src/diagnostics/doctor.test.ts` - Covers healthy shared hooks, legacy compatibility, and shared-runtime remediation for missing hooks.
- `packages/agent-badge/src/commands/init.test.ts` - Updates init-level expectations to the guarded shared hook contract.

## Decisions Made

- Shared runtime probing stays in core so init, doctor, config, status, and hook generation can consume one contract instead of diverging package-manager-specific logic.
- Generated hooks print generic install and PATH guidance only; they do not persist resolved local executable paths or machine-specific directories.
- Hook migration is writer-strict but reader-compatible: new writes use the shared direct command, while diagnostics continue recognizing legacy hook bodies until later migration phases finish.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The initial delegated executor stalled without a completion signal and left partial local edits behind. The orchestrator recovered that work, completed the remaining changes inline, and re-ran the full verification bundle before closing the plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Core runtime, hook, and doctor surfaces now share one PATH-based contract, so Wave 2 can focus on operator-facing command output and compatibility proof.
- Legacy hook compatibility remains intact, which preserves the migration window needed by later phases.

## Self-Check: PASSED

- Shared runtime probe and remediation exist in core.
- Managed hook generation uses the direct shared command with runtime guarding.
- Doctor accepts shared and legacy hook bodies.
- `npm test -- --run packages/core/src/runtime/shared-cli.test.ts packages/core/src/init/runtime-wiring.test.ts packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/init.test.ts` passed.

---
*Phase: 25-global-runtime-contract-and-command-resolution*
*Completed: 2026-04-08*
