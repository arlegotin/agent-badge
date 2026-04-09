---
phase: 02-repo-identity-and-provider-parsing
plan: 02
subsystem: infra
tags: [codex, sqlite, fixtures, privacy, session-summary]
requires:
  - phase: 02-01
    provides: canonical repo fingerprinting and normalized remote handling
provides:
  - provider-neutral normalized session summaries for later attribution phases
  - Codex SQLite scanning with allowlisted fields and preserved thread lineage
  - sanitized fixture coverage for SQLite-primary parsing and history fallback boundaries
affects: [phase-02-03, phase-03-attribution, provider-scanning]
tech-stack:
  added: [better-sqlite3]
  patterns:
    - provider adapters parse into one shared session-summary schema before any attribution logic
    - Codex fallback reads history metadata without deriving totals from transcript text
key-files:
  created:
    - packages/core/src/providers/session-summary.ts
    - packages/core/src/providers/codex/codex-sql.ts
    - packages/core/src/providers/codex/codex-adapter.ts
    - packages/core/src/providers/codex/codex-adapter.test.ts
    - packages/testkit/src/codex-fixtures.ts
    - packages/testkit/fixtures/codex/state-5.sql
    - packages/testkit/fixtures/codex/history.jsonl
  modified:
    - packages/core/package.json
    - package-lock.json
    - packages/testkit/src/index.ts
    - packages/core/src/repo/repo-fingerprint.test.ts
key-decisions:
  - "Codex scanning uses `state_*.sqlite` as the authoritative source and only falls back to `history.jsonl` for zero-total metadata when SQLite cannot be read."
  - "SQLite access is constrained to an allowlisted query surface so unsafe thread/log text never enters normalized summaries."
patterns-established:
  - "Core tests that need workspace fixtures should runtime-load `@agent-badge/testkit` helpers instead of statically importing sibling package sources into the core TypeScript project."
  - "Workspace verification on low-disk machines can use the `/tmp/agent-badge-deps` toolchain while keeping the runtime dependency change in the repo-local lockfile."
requirements-completed: [SCAN-02]
duration: 17 min
completed: 2026-03-30
---

# Phase 02 Plan 02: Codex Adapter Summary

**Codex session scanning now reads sanitized SQLite fixtures into one normalized summary model, preserves thread lineage, and limits `history.jsonl` to zero-total fallback metadata**

## Performance

- **Duration:** 17 min
- **Started:** 2026-03-30T11:49:30Z
- **Completed:** 2026-03-30T12:06:18Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- Added the shared `NormalizedSessionSummary` schema that both providers can target without carrying transcript or filename data forward.
- Implemented Codex SQLite discovery/query helpers plus an adapter that normalizes one summary per thread, preserves `thread_spawn_edges` lineage, and reuses repo remote normalization.
- Added sanitized fixture assets and adapter tests that prove SQLite-primary parsing, privacy filtering, and `history.jsonl` fallback behavior.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the shared normalized session schema and sanitized Codex fixtures** - `91eb81e` (`feat`)
2. **Task 2: Implement the SQLite query boundary and Codex adapter** - `3b13620` (`feat`)
3. **Task 3: Prove SCAN-02 with fixture-backed Codex adapter tests** - `d6e5b5e` (`test`)

Plan metadata is committed separately with the summary and planning artifacts.

## Files Created/Modified
- `packages/core/src/providers/session-summary.ts` - defines the provider-neutral normalized session schema and parser.
- `packages/core/src/providers/codex/codex-sql.ts` - isolates allowlisted SQLite reads for `threads` and `thread_spawn_edges`.
- `packages/core/src/providers/codex/codex-adapter.ts` - maps Codex artifacts into normalized summaries and handles the zero-total history fallback path.
- `packages/core/src/providers/codex/codex-adapter.test.ts` - verifies dedupe, lineage, privacy filtering, and fallback boundaries.
- `packages/testkit/src/codex-fixtures.ts` and `packages/testkit/fixtures/codex/*` - create sanitized `.codex` fixture homes with a materialized SQLite database and fallback history file.
- `packages/core/package.json` and `package-lock.json` - add the deliberate SQLite runtime dependency required for Node 20-compatible local scanning.

## Decisions Made
- Used `better-sqlite3` for deterministic local SQLite access instead of relying on `node:sqlite` or the host `sqlite3` CLI, preserving Node 20 support.
- Kept Codex token accounting pinned to `threads.tokens_used`; the fallback path groups `history.jsonl` only for session presence/timestamps and forces token totals to zero.
- Normalized observed remotes through the Phase 02-01 repo helper so provider scans and later attribution compare the same canonical remote values.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed a static sibling-package test import that broke core typecheck**
- **Found during:** Task 1 verification
- **Issue:** `packages/core/src/repo/repo-fingerprint.test.ts` statically imported `@agent-badge/testkit`, which pulled sibling package sources into the `packages/core` TypeScript project and broke `tsc -b`.
- **Fix:** Switched the test to runtime-load the fixture helper instead of statically importing sibling package sources.
- **Files modified:** `packages/core/src/repo/repo-fingerprint.test.ts`
- **Verification:** `/tmp/agent-badge-deps/node_modules/.bin/tsc -b --pretty false packages/core/tsconfig.json packages/agent-badge/tsconfig.json packages/create-agent-badge/tsconfig.json packages/testkit/tsconfig.json`
- **Committed in:** `91eb81e`

**2. [Rule 3 - Blocking] Added a local declaration for `better-sqlite3`**
- **Found during:** Task 2 verification
- **Issue:** The runtime dependency was intentionally added for SQLite access, but this workspace did not surface type declarations for `better-sqlite3`, blocking TypeScript verification.
- **Fix:** Added a minimal local module declaration that covers the adapter's readonly database usage.
- **Files modified:** `packages/core/src/providers/codex/better-sqlite3.d.ts`
- **Verification:** `/tmp/agent-badge-deps/node_modules/.bin/tsc -b --pretty false packages/core/tsconfig.json packages/agent-badge/tsconfig.json packages/create-agent-badge/tsconfig.json packages/testkit/tsconfig.json`
- **Committed in:** `3b13620`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes were required to keep workspace verification green while adding the new provider adapter. No product-scope creep.

## Issues Encountered
- A normal `npm install` on `/Volumes/git` failed again with `ENOSPC`, so verification used the existing `/tmp/agent-badge-deps` toolchain plus local symlinks for missing dev-only packages. The repo lockfile/runtime dependency change still landed normally.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 02-03 can now build the Claude adapter on top of the shared session schema and the fixture-driven provider-testing pattern established here.

Carry-forward concern: the low-disk `/Volumes/git` environment still prevents a normal workspace reinstall, so future verification should continue using the `/tmp/agent-badge-deps` workaround unless disk pressure changes.

## Self-Check: PASSED

- Verified summary file exists at `.planning/phases/02-repo-identity-and-provider-parsing/02-02-SUMMARY.md`.
- Verified task commit `91eb81e` exists in git history.
- Verified task commit `3b13620` exists in git history.
- Verified task commit `d6e5b5e` exists in git history.

---
*Phase: 02-repo-identity-and-provider-parsing*
*Completed: 2026-03-30*
