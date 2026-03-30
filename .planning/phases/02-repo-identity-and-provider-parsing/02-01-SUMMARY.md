---
phase: 02-repo-identity-and-provider-parsing
plan: 01
subsystem: infra
tags: [repo-identity, git, aliases, zod, vitest]
requires:
  - phase: 01-03
    provides: git context inspection and provider-safe init defaults
provides:
  - privacy-safe repo alias persistence for normalized remotes and slugs
  - canonical repo fingerprint resolution from git root, origin, and runtime aliases
  - regression coverage for remote normalization, alias application, and no-origin repositories
affects: [phase-02-02, phase-03-attribution, repo-matching]
tech-stack:
  added: []
  patterns:
    - repo identity lives in a dedicated service rather than overloading init git-context helpers
    - persisted repo aliases stay portable by storing normalized remotes and slugs instead of local paths
key-files:
  created:
    - packages/core/src/repo/repo-fingerprint.ts
    - packages/core/src/repo/repo-fingerprint.test.ts
    - packages/core/src/repo/index.ts
  modified:
    - packages/core/src/config/config-schema.ts
    - packages/core/src/config/config-schema.test.ts
    - packages/core/src/init/default-config.ts
key-decisions:
  - "Persist only privacy-safe repo aliases (`remotes` and `slugs`) in config; local path aliases remain runtime-only evidence."
  - "Normalize GitHub-style remotes into a canonical HTTPS comparison key and leave multi-segment non-GitHub paths without a canonical slug."
patterns-established:
  - "Provider adapters and later attribution logic should consume `resolveRepoFingerprint()` rather than shelling out for git identity independently."
  - "Remote and slug alias normalization uses the same path-trimming rules as origin normalization to keep comparisons stable."
requirements-completed: [ATTR-01]
duration: 8 min
completed: 2026-03-30
---

# Phase 02 Plan 01: Repo Identity Summary

**Canonical repo fingerprinting now resolves stable git identity from normalized remotes, privacy-safe aliases, and no-origin repo fallbacks**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-30T11:40:26Z
- **Completed:** 2026-03-30T11:48:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Extended persisted config and default-config generation so repos can carry normalized remote and slug aliases without storing private path data.
- Added `resolveRepoFingerprint()` and `normalizeGitRemoteUrl()` to produce one stable runtime repo identity from git root, origin remote, and configured aliases.
- Locked the behavior with tests that cover SSH/HTTPS normalization, alias application, and the no-origin repository path.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend config defaults for privacy-safe repo aliases** - `6c685da` (`feat`)
2. **Task 2: Build the canonical repo fingerprint and remote normalization service** - `ff062ff` (`feat`)

Plan metadata is committed separately with the summary and planning artifacts.

## Files Created/Modified
- `packages/core/src/config/config-schema.ts` - adds the schema-backed `repo.aliases.remotes` and `repo.aliases.slugs` config surface.
- `packages/core/src/config/config-schema.test.ts` - proves the alias shape parses and rejects unsupported path aliases.
- `packages/core/src/init/default-config.ts` - preserves provider-detection defaults while returning the full repo alias structure.
- `packages/core/src/repo/repo-fingerprint.ts` - implements git-root/origin inspection, remote normalization, and canonical repo fingerprint assembly.
- `packages/core/src/repo/repo-fingerprint.test.ts` - covers normalization, alias application, and no-origin fallback behavior.
- `packages/core/src/repo/index.ts` - exports the repo fingerprint service from the repo module surface.

## Decisions Made
- Kept repo alias persistence limited to remotes and slugs so committed config stays privacy-safe and portable across machines.
- Reused one normalization path for origin URLs and alias remotes so later attribution compares canonical values instead of raw remote strings.
- Left canonical slug derivation unset for non-GitHub multi-segment paths instead of inventing an owner/repo mapping from enterprise URL layouts.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 02-02 can now build Codex normalization on top of a stable repo identity helper and privacy-safe alias model.

Carry-forward concern: the Codex adapter still needs a deliberate SQLite dependency and fixture-backed lineage coverage before Phase 3 can consume session summaries safely.

## Self-Check: PASSED

- Verified summary file exists at `.planning/phases/02-repo-identity-and-provider-parsing/02-01-SUMMARY.md`.
- Verified task commit `6c685da` exists in git history.
- Verified task commit `ff062ff` exists in git history.

---
*Phase: 02-repo-identity-and-provider-parsing*
*Completed: 2026-03-30*
