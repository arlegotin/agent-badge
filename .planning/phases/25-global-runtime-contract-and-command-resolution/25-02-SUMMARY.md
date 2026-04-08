---
phase: 25-global-runtime-contract-and-command-resolution
plan: 02
subsystem: cli
tags: [runtime, hooks, smoke, compatibility]
requires:
  - phase: 25-global-runtime-contract-and-command-resolution
    provides: shared runtime probe, direct hook contract, and dual-read diagnostics from plan 01
provides:
  - operator-facing shared runtime reporting in init, config, and status
  - compatibility proof for the direct shared managed hook contract
  - smoke assertions that pin the generated hook contract
affects: [phase-26, phase-27, init, status, uninstall, smoke]
tech-stack:
  added: []
  patterns:
    - operator-visible shared runtime reporting
    - contract-first compatibility and smoke assertions
key-files:
  created: []
  modified:
    - packages/agent-badge/src/commands/init.ts
    - packages/agent-badge/src/commands/init.test.ts
    - packages/agent-badge/src/commands/config.ts
    - packages/agent-badge/src/commands/config.test.ts
    - packages/agent-badge/src/commands/status.ts
    - packages/agent-badge/src/commands/status.test.ts
    - packages/agent-badge/src/commands/uninstall.test.ts
    - packages/agent-badge/src/commands/release-readiness-matrix.test.ts
    - scripts/smoke/verify-registry-install.sh
key-decisions:
  - "Init, config, and status now report the shared runtime prerequisite with one `Shared runtime:` line backed by the core probe and remediation helper."
  - "Compatibility tests keep the repo-local installer path intact for Phase 25 while proving that generated hooks no longer depend on npm, pnpm, yarn, or bun runner wrappers."
  - "Registry smoke verifies the hook body directly so AUTO-01 is enforced at the artifact boundary, not only in unit tests."
patterns-established:
  - "Operator output stays contract-oriented: report shared runtime availability explicitly instead of inferring it from package-manager wiring."
  - "Proof layers assert generated hook content directly and reject legacy runner strings."
requirements-completed:
  - DIST-03
  - AUTO-01
duration: 2 min
completed: 2026-04-08
---

# Phase 25: Global Runtime Contract And Command Resolution Summary

**Shared-runtime reporting in operator commands with direct-hook compatibility proof across uninstall, release-readiness, and registry smoke checks**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-08T20:35:19Z
- **Completed:** 2026-04-08T20:37:26Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Added one consistent `Shared runtime:` status line to `init`, `config`, and `status`, backed by the core shared-runtime probe and remediation vocabulary.
- Updated uninstall and release-readiness coverage so the new direct managed hook contract is enforced while legacy hook cleanup and Phase 25 initializer compatibility remain intact.
- Extended the registry smoke script to assert the actual generated hook body, including the PATH guard and direct shared refresh command.

## Task Commits

Each task was committed atomically:

1. **Task 1: Surface shared runtime availability and remediation in init, config, and status** - `3f0c0c4` (feat)
2. **Task 2: Update compatibility regressions and smoke assertions to enforce the new managed hook contract** - `4962f2a` (test)

## Files Created/Modified
- `packages/agent-badge/src/commands/init.ts` - Reports shared runtime availability during init and updates setup wording to the shared-runtime model.
- `packages/agent-badge/src/commands/init.test.ts` - Verifies init output includes the shared runtime line and shared remediation vocabulary.
- `packages/agent-badge/src/commands/config.ts` - Reports shared runtime availability when config inspects or rewrites pre-push automation.
- `packages/agent-badge/src/commands/config.test.ts` - Verifies config output and hook rewrites follow the direct shared contract.
- `packages/agent-badge/src/commands/status.ts` - Includes the current shared runtime state in status output.
- `packages/agent-badge/src/commands/status.test.ts` - Pins the shared runtime line in status output.
- `packages/agent-badge/src/commands/uninstall.test.ts` - Covers removal of both shared and legacy managed hook blocks while preserving custom hook lines.
- `packages/agent-badge/src/commands/release-readiness-matrix.test.ts` - Verifies direct-hook generation and rejects legacy runner strings across npm, pnpm, Yarn, and Bun lockfile contexts.
- `scripts/smoke/verify-registry-install.sh` - Asserts the generated hook contains the shared PATH guard and direct refresh command in registry smoke runs.

## Decisions Made

- Shared-runtime output remains generic and privacy-safe: remediation tells operators how to install the CLI and fix PATH without printing machine-local directories.
- Release-readiness proof now validates the generated hook file directly instead of treating package scripts as the canonical automation surface.
- Phase 25 preserves `create-agent-badge` repo-local installation compatibility in tests and smoke flows; removing that default remains Phase 26 work.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Operator output, compatibility regressions, and smoke verification all point at the same shared-runtime contract, so Phase 26 can focus on removing repo-local runtime installation and reducing repo artifact footprint.
- Legacy hook cleanup coverage remains intact, which keeps the migration path open for later phases.

## Self-Check: PASSED

- `init`, `config`, and `status` expose the shared runtime prerequisite with consistent wording.
- Uninstall, release-readiness, and smoke proof all enforce the direct shared hook contract.
- `npm test -- --run packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/config.test.ts packages/agent-badge/src/commands/status.test.ts` passed.
- `npm test -- --run packages/agent-badge/src/commands/uninstall.test.ts packages/agent-badge/src/commands/release-readiness-matrix.test.ts packages/create-agent-badge/src/index.test.ts` passed.
- `bash -n scripts/smoke/verify-registry-install.sh` passed.

---
*Phase: 25-global-runtime-contract-and-command-resolution*
*Completed: 2026-04-08*
