# Phase 06: Doctor recovery diagnostics and command surface summary

---
phase: 06-doctor-uninstall-and-safety-hardening
plan: 01
subsystem: api
tags: [doctor, diagnostics, preflight, publish, cli]
requires:
  - phase: 04
    provides: "Runtime and publish scaffolding primitives required for diagnostic checks."
  - phase: 05
    provides: "Scan/refresh state context used for report interpretation."
provides:
  - "runDoctorChecks contract with pass/warn/fail statuses and recovery guidance."
  - "agent-badge doctor command with JSON and optional write-probe modes."
  - "CLI registration for doctor with flags for automation."
affects:
  - "commands"
  - "core diagnostics"
  - "refresh health workflows"
tech-stack:
  added: ["commander"]
  patterns: ["typed diagnostic contract", "reusable core service + CLI command wrapper"]
key-files:
  created:
    - "packages/core/src/diagnostics/doctor.ts"
    - "packages/core/src/diagnostics/doctor.test.ts"
    - "packages/core/src/diagnostics/index.ts"
    - "packages/agent-badge/src/commands/doctor.ts"
    - "packages/agent-badge/src/commands/doctor.test.ts"
  modified:
    - "packages/core/src/index.ts"
    - "packages/agent-badge/src/commands/index.ts"
    - "packages/agent-badge/src/cli/main.ts"
    - "packages/agent-badge/src/cli/main.test.ts"
key-decisions:
  - "Keep `runDoctorChecks` read-only by default and only perform gist update when `runProbeWrite` is explicitly enabled."
  - "Expose doctor checks through both structured (JSON) and human-readable output and keep command-level options minimal."
requirements-completed:
  - SAFE-03
duration: 37m
completed: 2026-03-30
---

# Phase 06: Doctor Recovery Surface Summary

**Recovery diagnostics and operator command surface for repository readiness, provider scan capability, publish wiring, README marker health, and pre-push hook verification**

## Performance

- **Duration:** 37 min
- **Started:** 2026-03-30T20:00:00.000Z
- **Completed:** 2026-03-30T20:37:00.000Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Added the core `runDoctorChecks` diagnostics contract with seven required check IDs and summary status counts.
- Implemented `agent-badge doctor` command with `--json` and `--probe-write` execution modes and fix guidance output.
- Wired doctor command discovery and options into CLI registration and command exports.

## Task Commits

1. **Task 1: Add core `doctor` check contracts and read-only health probes** - `6daa804` (feat)
2. **Task 2: Add `agent-badge doctor` command, output formats, and CLI wiring** - `713de47` (feat)

## Files Created/Modified

- `packages/core/src/diagnostics/doctor.ts` - Core diagnostics check service and summary contract.
- `packages/core/src/diagnostics/doctor.test.ts` - Core diagnostics behavioral test coverage.
- `packages/core/src/diagnostics/index.ts` - Exports diagnostics contract from core.
- `packages/core/src/index.ts` - Re-exports diagnostics from core entrypoint.
- `packages/agent-badge/src/commands/doctor.ts` - CLI command wrapper for doctor diagnostics.
- `packages/agent-badge/src/commands/doctor.test.ts` - Command-level output and JSON mode tests.
- `packages/agent-badge/src/commands/index.ts` - Re-exports `runDoctorCommand`.
- `packages/agent-badge/src/cli/main.ts` - Adds `doctor` command and flags.
- `packages/agent-badge/src/cli/main.test.ts` - CLI registration assertions for doctor command and flags.

## Decisions Made

- Use explicit check ordering and deterministic output keys so automation can anchor on stable IDs (`git`, `providers`, `scan-access`, `publish-auth`, `publish-write`, `publish-shields`, `readme-badge`, `pre-push-hook`).
- Keep all default checks read-only and isolate credential mutation behind `--probe-write`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected malformed diagnostics module import wiring**
- **Found during:** Task 1
- **Issue:** Early draft imported `buildEndpointBadgePayload` from the badge URL module and lacked `AGENT_BADGE_GIST_FILE` import.
- **Fix:** Rewired imports to `publish/badge-payload.ts` and `publish/badge-url.ts` and normalized badge payload generation for write-probe checks.
- **Files modified:** `packages/core/src/diagnostics/doctor.ts`
- **Committed in:** 6daa804 (Task 1)

## Issues Encountered

- No additional blocking issues remained after correcting the diagnostics module wiring.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Doctor command surface is available for SAFE-03 and can be consumed by upcoming hardening/uninstall flows.
- Remaining work should hook any additional cleanup and uninstall-specific diagnostics paths into the same contract.

---
*Phase: 06-doctor-uninstall-and-safety-hardening*
*Completed: 2026-03-30*

## Self-Check: PASSED

- FOUND: .planning/phases/06-doctor-uninstall-and-safety-hardening/06-01-SUMMARY.md
- FOUND: 6daa804
- FOUND: 713de47
