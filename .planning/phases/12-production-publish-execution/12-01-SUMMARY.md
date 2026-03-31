---
phase: 12-production-publish-execution
plan: 01
subsystem: infra
tags: [release, evidence, npm, github-actions, cli]
requires:
  - phase: 11-registry-preflight-and-release-environment-validation
    provides: preflight checks and release workflow baseline used for production publish evidence capture
provides:
  - release:evidence CLI entrypoint and durable evidence artifacts for operator execution
  - production publish checklist requiring workflow-based publish and evidence capture
affects:
  - 12-02
  - 13-01
  - 13-02

tech-stack:
  added: [vitest]
  patterns: ["repo-owned release script composition", "workflow-first publish evidence contract"]

key-files:
  created:
    - scripts/release/capture-publish-evidence.ts
    - scripts/release/capture-publish-evidence.test.ts
  modified:
    - package.json
    - docs/RELEASE.md
    - scripts/verify-docs.sh

key-decisions:
  - "Use `.github/workflows/release.yml` + `workflow_dispatch` as the canonical production publish path, keeping local `npm run release` as explicit recovery fallback."
  - "Persist both JSON and Markdown evidence artifacts with package inventory, registry checks, commit SHA, and publish-path metadata."

requirements-completed:
  - REL-08

duration: 0min
completed: 2026-03-31
---

# Phase 12 Plan 01: Production publish evidence and operator path alignment

**Release evidence writer and checklist now enforce workflow-driven production publish with deterministic, repository-owned artifacts for publish metadata and registry visibility.**

## Performance

- **Duration:** 0min
- **Started:** 2026-03-31T14:57:49Z
- **Completed:** 2026-03-31T14:57:57Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `release:evidence` root script and a new `scripts/release/capture-publish-evidence.ts` entrypoint that accepts explicit publish-path flags and writes `.planning/phases/12-production-publish-execution/12-PUBLISH-EVIDENCE.json` and `.planning/phases/12-production-publish-execution/12-PUBLISH-EVIDENCE.md`.
- Captured publish artifacts from manifest-derived package inventory, `git rev-parse HEAD`, preflight JSON, and `npm view <package> version dist-tags.latest --json` snapshots.
- Updated `docs/RELEASE.md` to require workflow-primary publish (`.github/workflows/release.yml`, `workflow_dispatch`) and explicit evidence capture commands for both workflow and fallback local paths.
- Extended `scripts/verify-docs.sh` checks so release docs must include `12-preflight.json`, evidence capture command signatures, and fallback path markers.

## Task Commits

Each task was committed atomically:

1. **Task 1:** Add a repo-owned release-evidence writer and root script for Phase 12 publish records - `15770bd` (feat)
2. **Task 2:** Make the release checklist require preflight capture, workflow path selection, and evidence recording - `0ce8058` (feat)

## Files Created/Modified

- `package.json` - Added `release:evidence` script entrypoint.
- `scripts/release/capture-publish-evidence.ts` - Added deterministic evidence capture script for workflow and local fallback publishing metadata.
- `scripts/release/capture-publish-evidence.test.ts` - Added deterministic tests for workflow evidence and local fallback behavior.
- `docs/RELEASE.md` - Updated release runbook to require primary `workflow_dispatch` publish and evidence capture command requirements.
- `scripts/verify-docs.sh` - Added exact-string checks for new evidence workflow guidance and paths.

## Decisions Made

- Chosen publish operator path is workflow-first via `.github/workflows/release.yml`, and local `npm run release` is only allowed as fallback.
- Evidence capture is required for both publish modes to produce stable, repo-owned artifacts before production release decisions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected git command execution source**
- **Found during:** Task 1 (script implementation)
- **Issue:** Initial implementation called the `npm` binary for `git rev-parse` and did not explicitly validate local fallback workflow field behavior.
- **Fix:** Switched SHA capture to an explicit `git rev-parse` command and tightened evidence field shaping so workflow fields are omitted only for `local-cli`.
- **Files modified:** `scripts/release/capture-publish-evidence.ts`
- **Committed in:** `15770bd`
- **Verification:** `npm test -- --run scripts/release/capture-publish-evidence.test.ts`

**2. [Rule 1 - Bug] Fixed docs verifier argument pattern**
- **Found during:** Task 2 (docs validation)
- **Issue:** `scripts/verify-docs.sh` used `rg` with `--fallback-reason` as a raw flag-like pattern and failed verification.
- **Fix:** Added `--` separator (`rg -n --`) before the flag-like pattern.
- **Files modified:** `scripts/verify-docs.sh`
- **Committed in:** `0ce8058`
- **Verification:** `npm run docs:check`

## Issues Encountered

- Running the full verification command from the plan (`npm run release:evidence ...`) is blocked in this sandbox because `tsx` cannot create its IPC socket (`listen EPERM`), so that final command should be validated by the maintainer environment.

## User Setup Required

None - no new external service configuration required in this plan.

## Next Phase Readiness

- Phase 12 Task 2 execution can proceed with an explicit evidence-first publish process.
- `.github/workflows/release.yml` must be used as the canonical production publish entrypoint in the upcoming execution plan.

## Known Stubs

None.

---
*Phase: 12-production-publish-execution*
*Completed: 2026-03-31*

## Self-Check: PASSED

- `FOUND: .planning/phases/12-production-publish-execution/12-01-SUMMARY.md`
- `FOUND: 15770bd`
- `FOUND: 0ce8058`
