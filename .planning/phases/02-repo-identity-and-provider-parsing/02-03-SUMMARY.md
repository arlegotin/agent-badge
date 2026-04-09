---
phase: 02-repo-identity-and-provider-parsing
plan: 03
subsystem: infra
tags: [claude, jsonl, providers, exports, vitest]
requires:
  - phase: 02-02
    provides: shared session-summary schema and Codex adapter patterns
provides:
  - Claude JSONL scanning with assistant usage dedupe by message id
  - explicit provider-default coverage for missing and detected local homes
  - public provider/repo exports from the core package entrypoint
affects: [phase-03-attribution, public-api, provider-scanning]
tech-stack:
  added: []
  patterns:
    - provider fixtures live in testkit and are runtime-loaded from core tests to preserve package boundaries
    - provider adapters export through a dedicated providers index that closes the core API surface cleanly
key-files:
  created:
    - packages/core/src/init/default-config.test.ts
    - packages/core/src/providers/claude/claude-jsonl.ts
    - packages/core/src/providers/claude/claude-adapter.ts
    - packages/core/src/providers/claude/claude-adapter.test.ts
    - packages/core/src/providers/index.ts
    - packages/testkit/src/claude-fixtures.ts
    - packages/testkit/fixtures/claude/projects/project-with-dedupe/session-main.jsonl
    - packages/testkit/fixtures/claude/projects/project-no-index/session-secondary.jsonl
    - packages/testkit/fixtures/claude/projects/project-with-index/session-tertiary.jsonl
    - packages/testkit/fixtures/claude/projects/project-with-index/sessions-index.json
  modified:
    - packages/core/src/init/preflight.test.ts
    - packages/core/src/init/scaffold.ts
    - packages/core/src/init/scaffold.test.ts
    - packages/core/src/index.ts
    - packages/testkit/src/index.ts
key-decisions:
  - "Claude scanning treats project JSONL files as canonical and ignores `sessions-index.json` as an optional side artifact."
  - "Assistant usage totals dedupe by `message.id`, keeping the latest assistant row before summing token usage."
patterns-established:
  - "Provider-default behavior is locked through explicit test matrices rather than new production logic."
  - "Core exports now flow through `packages/core/src/repo/index.ts` and `packages/core/src/providers/index.ts`, reducing direct root-entrypoint drift as the package grows."
requirements-completed: [SCAN-01, SCAN-03]
duration: 9 min
completed: 2026-03-30
---

# Phase 02 Plan 03: Claude Adapter Summary

**Claude project JSONL scanning now emits deduped assistant usage summaries, locks provider-default behavior, and exports the full Phase 2 repo/provider API surface**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-30T12:09:36Z
- **Completed:** 2026-03-30T12:18:10Z
- **Tasks:** 3
- **Files modified:** 15

## Accomplishments
- Added explicit default-config and preflight assertions so detected provider homes enable by default while privacy-safe `~/.codex` / `~/.claude` labels remain the only exposed paths.
- Added sanitized Claude fixture projects plus a JSONL reader and adapter that dedupe assistant usage by `message.id`, ignore non-canonical side artifacts, and emit the shared normalized session model.
- Exposed the full Phase 2 repo/provider surface from `@agent-badge/core` through dedicated provider and repo indexes.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock SCAN-01 with explicit provider-default tests** - `117916d` (`test`)
2. **Task 2: Add sanitized Claude fixtures and SCAN-03 tests** - `323608e` (`test`)
3. **Task 3: Implement the Claude adapter and expose the Phase 2 API surface** - `910359e` (`feat`)

Plan metadata is committed separately with the summary and planning artifacts.

## Files Created/Modified
- `packages/core/src/init/default-config.test.ts` and `packages/core/src/init/preflight.test.ts` - cover all provider-availability combinations and ensure preflight keeps provider labels privacy-safe.
- `packages/core/src/init/scaffold.ts` and `packages/core/src/init/scaffold.test.ts` - keep scaffold reconciliation aligned with the expanded config schema so incomplete config files regain `repo.aliases` defaults.
- `packages/testkit/src/claude-fixtures.ts` plus `packages/testkit/fixtures/claude/projects/*` - provide sanitized Claude JSONL fixtures for dedupe, missing-index, and ignored-index cases.
- `packages/core/src/providers/claude/claude-jsonl.ts` - walks `projects/**/*.jsonl` and parses safe Claude session rows.
- `packages/core/src/providers/claude/claude-adapter.ts` - dedupes assistant usage by `message.id` and maps Claude sessions into normalized summaries.
- `packages/core/src/providers/claude/claude-adapter.test.ts` - verifies dedupe, ignored index files, and filtering of non-assistant rows.
- `packages/core/src/providers/index.ts` - publishes the completed provider adapter surface from one module.
- `packages/core/src/index.ts` - re-exports the repo and provider entrypoints from the core package root.

## Decisions Made
- Kept `detectProviderAvailability()` and `createDefaultAgentBadgeConfig()` unchanged in production code because the Phase 1 seam was already correct; Phase 2 only needed explicit coverage.
- Ignored `sessions-index.json`, `last-prompt`, `progress`, and other non-assistant rows as correctness inputs so Claude totals come only from assistant `message.usage`.
- Normalized Claude remotes through the same repo helper used by Codex so later attribution compares one canonical remote form across providers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reconciled scaffold defaults for the new repo alias config shape**
- **Found during:** Phase-level verification after Task 3
- **Issue:** Full-suite verification exposed that scaffold reconciliation still rebuilt partial configs without the required `repo.aliases` section, breaking `applyAgentBadgeScaffold` when existing config files were incomplete.
- **Fix:** Extended scaffold reconciliation to preserve or backfill `repo.aliases.remotes` and `repo.aliases.slugs`, and tightened the existing scaffold regression test to assert those defaults explicitly.
- **Files modified:** `packages/core/src/init/scaffold.ts`, `packages/core/src/init/scaffold.test.ts`
- **Verification:** `/tmp/agent-badge-deps/node_modules/.bin/vitest --run packages/core/src/init/scaffold.test.ts`; `/tmp/agent-badge-deps/node_modules/.bin/vitest --run`; `/tmp/agent-badge-deps/node_modules/.bin/tsc -b --pretty false packages/core/tsconfig.json packages/agent-badge/tsconfig.json packages/create-agent-badge/tsconfig.json packages/testkit/tsconfig.json`
- **Committed in:** `1e0207a`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The fix restored compatibility between Phase 02's config schema and the existing scaffold reconciliation path. No scope creep beyond keeping init/scaffold behavior valid.

## Issues Encountered
- Verification still relied on the `/tmp/agent-badge-deps` toolchain because `/Volumes/git` does not have enough free space for a normal workspace reinstall.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 02 implementation scope is now complete: repo identity, Codex parsing, Claude parsing, and provider-default coverage are all landed with plan summaries on disk.

Phase 03 can now focus on attribution and historical backfill without adding new provider-parsing primitives.

## Self-Check: PASSED

- Verified summary file exists at `.planning/phases/02-repo-identity-and-provider-parsing/02-03-SUMMARY.md`.
- Verified task commit `117916d` exists in git history.
- Verified task commit `323608e` exists in git history.
- Verified task commit `910359e` exists in git history.
- Verified deviation commit `1e0207a` exists in git history.

---
*Phase: 02-repo-identity-and-provider-parsing*
*Completed: 2026-03-30*
