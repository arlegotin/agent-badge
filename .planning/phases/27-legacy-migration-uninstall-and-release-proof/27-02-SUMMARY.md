---
phase: 27-legacy-migration-uninstall-and-release-proof
plan: 02
subsystem: docs
tags: [docs, install, quickstart, cli, uninstall, recovery]
requires:
  - phase: 27-legacy-migration-uninstall-and-release-proof
    provides: verified legacy migration and uninstall behavior from plan 01
provides:
  - primary docs rewritten around the shared-runtime and minimal-artifact default path
  - recovery, auth, uninstall, and FAQ docs aligned with current reinstall and migration behavior
  - documentation verification that blocks stale repo-local vocabulary from reappearing
affects: [phase-27, docs, install, uninstall, recovery, shared-runtime]
tech-stack:
  added: []
  patterns:
    - docs verification uses fixed-string checks plus denylist checks for stale vocabulary
key-files:
  created:
    - .planning/phases/27-legacy-migration-uninstall-and-release-proof/27-02-SUMMARY.md
  modified:
    - README.md
    - docs/INSTALL.md
    - docs/QUICKSTART.md
    - docs/CLI.md
    - docs/HOW-IT-WORKS.md
    - docs/TROUBLESHOOTING.md
    - docs/CONFIGURATION.md
    - docs/AUTH.md
    - docs/UNINSTALL.md
    - docs/FAQ.md
    - docs/MANUAL-GIST.md
    - docs/RECOVERY.md
    - scripts/verify-docs.sh
key-decisions:
  - "The default operator story is now explicitly shared-runtime/global-first; direct package installation remains documented only as an alternative path."
  - "Docs verification now enforces the updated shared-runtime vocabulary and rejects the stale repo-local init story in the affected public docs."
patterns-established:
  - "Operator docs should describe `agent-badge` as the normal follow-up command after init, with package-manager exec wrappers reserved for the explicit direct-install path."
requirements-completed:
  - MIG-02
duration: 22 min
completed: 2026-04-09
---

# Phase 27 Plan 02: Shared-Runtime Docs Summary

**Primary and secondary user docs now describe the global-first shared-runtime contract, while the docs verifier blocks the old repo-local install story from slipping back in**

## Performance

- **Duration:** 22 min
- **Completed:** 2026-04-09
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- Rewrote README, Install, Quickstart, CLI, and How It Works so `npm init agent-badge@latest` is documented as a minimal-artifact initializer path, not a repo-local runtime installer.
- Updated Auth, Troubleshooting, Recovery, Manual Gist, Uninstall, Configuration, and FAQ so reinstall and recovery guidance follows the shared-runtime/default-init contract.
- Hardened `scripts/verify-docs.sh` with new fixed-string checks for shared-runtime wording and denylist checks for stale repo-local vocabulary.

## Task Commits

Each task was committed atomically:

1. **Task 1: primary shared-runtime docs rewrite** - `70fcec3` (docs)
2. **Task 2: secondary docs and verifier alignment** - `eb8f6b5` (docs)

## Files Created/Modified

- `README.md` - updates the 60-second path and deferred publish follow-up to the shared-runtime default.
- `docs/INSTALL.md` - documents minimal repo artifacts by default and keeps direct runtime install as an explicit alternative.
- `docs/QUICKSTART.md` - rewrites the default follow-up flow around `agent-badge` on `PATH` and removes repo-local default assumptions.
- `docs/CLI.md` - aligns the command reference with the shared-runtime/global or user-scoped default path.
- `docs/HOW-IT-WORKS.md` - explains init as minimal repo-owned setup and fixes the managed hook command example.
- `docs/TROUBLESHOOTING.md`, `docs/AUTH.md`, `docs/RECOVERY.md`, `docs/MANUAL-GIST.md`, `docs/UNINSTALL.md`, `docs/FAQ.md`, `docs/CONFIGURATION.md` - align recovery and reinstall language with current behavior.
- `scripts/verify-docs.sh` - locks the updated wording into CI-style verification.

## Decisions Made

- Use `agent-badge` itself as the documented default follow-up command after init; only mention package-manager exec wrappers for the explicit direct-install path.
- Keep direct package installation documented, but label it clearly as an alternative instead of the normal initializer outcome.

## Deviations from Plan

None.

## Issues Encountered

- The docs verifier initially failed because one CLI phrase did not include the exact `global or user-scoped` wording required by the new fixed-string gate. The doc wording was tightened instead of weakening the check.

## User Setup Required

None.

## Next Phase Readiness

- Wave 3 can now align smoke scripts and maintainer release instructions to the same shared-runtime/minimal-artifact contract described in the public docs.

## Self-Check: PASSED

- `npm run docs:check` passed.
- `npm test -- --run packages/agent-badge/src/cli/main.test.ts` passed.
- Acceptance searches confirmed that the primary docs no longer contain `repo-local runtime` or `local runtime`, and that the new shared-runtime/global-first wording is present.
