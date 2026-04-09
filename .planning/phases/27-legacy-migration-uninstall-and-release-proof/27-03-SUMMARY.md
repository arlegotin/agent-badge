---
phase: 27-legacy-migration-uninstall-and-release-proof
plan: 03
subsystem: release-proof
tags: [smoke, release, registry, packed-install, initializer]
requires:
  - phase: 27-legacy-migration-uninstall-and-release-proof
    provides: shared-runtime vocabulary and operator docs alignment from plan 02
provides:
  - registry smoke that certifies the minimal-artifact initializer contract
  - explicit separation between initializer proof and direct-runtime packed-install proof
  - release instructions that point maintainers at the correct published-version smoke evidence
affects: [phase-27, smoke, release, initializer, direct-runtime]
tech-stack:
  added: []
  patterns:
    - initializer smoke asserts artifact absence as well as hook presence
    - local tarball smoke is documented as a direct-runtime proof, not an initializer proof
key-files:
  created:
    - .planning/phases/27-legacy-migration-uninstall-and-release-proof/27-03-SUMMARY.md
  modified:
    - scripts/smoke/verify-registry-install.sh
    - scripts/smoke/verify-packed-install.sh
    - scripts/verify-clean-checkout.sh
    - docs/maintainers/RELEASE.md
key-decisions:
  - "Published-version registry smoke is the authoritative initializer proof and must reject managed runtime manifest ownership after `npm init agent-badge@latest`."
  - "Packed-install smoke remains valuable, but it is explicitly documented as direct-runtime package proof rather than initializer proof."
patterns-established:
  - "Release evidence should separate minimal-artifact initializer validation from explicit package-install validation."
requirements-completed:
  - MIG-02
duration: 18 min
completed: 2026-04-09
---

# Phase 27 Plan 03: Smoke And Release Proof Summary

**Registry smoke now proves the initializer’s minimal-artifact contract, while packed-install and clean-checkout flows are documented as the explicit direct-runtime proof path**

## Performance

- **Duration:** 18 min
- **Completed:** 2026-04-09
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Removed repo-local binary expectations from `scripts/smoke/verify-registry-install.sh` and replaced them with manifest-ownership absence checks for the initializer path.
- Kept packed-install smoke intact as the direct-runtime package proof, but clarified that it does not certify the initializer contract.
- Updated maintainer release instructions so `verify-registry-install.sh --check-initializer --write-evidence` is clearly the authoritative initializer proof.

## Task Commits

Each task was committed atomically:

1. **Task 1: minimal-artifact initializer registry smoke** - `a17e648` (test)
2. **Task 2: separate direct-install and initializer proof surfaces** - `b90a08e` (docs)

## Files Created/Modified

- `scripts/smoke/verify-registry-install.sh` - validates `.agent-badge/*`, the shared hook contract, and absence of managed runtime manifest ownership after `npm init agent-badge@latest`.
- `scripts/smoke/verify-packed-install.sh` - labels packed-install smoke as the direct-runtime proof path.
- `scripts/verify-clean-checkout.sh` - distinguishes local tarball smoke from published-version initializer proof.
- `docs/maintainers/RELEASE.md` - points maintainers to registry smoke as the initializer contract gate and evidence source.

## Decisions Made

- Keep registry smoke focused on published-version behavior and use it to validate the initializer story end-to-end.
- Keep direct-runtime install proof in the local tarball smoke path, but document the distinction explicitly so release validation does not conflate the two.

## Deviations from Plan

None.

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

- The phase can move into verification with public docs, release docs, and smoke scripts all describing the same shared-runtime/minimal-artifact distribution model.

## Self-Check: PASSED

- `npm run docs:check` passed.
- `npm test -- --run packages/agent-badge/src/cli/main.test.ts packages/agent-badge/src/commands/release-readiness-matrix.test.ts packages/create-agent-badge/src/index.test.ts` passed.
- `bash -n scripts/smoke/verify-registry-install.sh && bash -n scripts/smoke/verify-packed-install.sh && bash -n scripts/verify-clean-checkout.sh` passed.
- Acceptance searches confirmed that `scripts/smoke/verify-registry-install.sh` no longer references `node_modules/.bin/agent-badge` or `npx --no-install agent-badge --help`.
