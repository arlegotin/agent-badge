---
phase: 05-incremental-refresh-and-operator-commands
plan: 03
subsystem: infra
tags: [refresh, hooks, config, init, runtime-wiring]
requires:
  - phase: 05-incremental-refresh-and-operator-commands
    provides: refresh, status, and config command surfaces plus Phase 5 refresh settings
provides:
  - config-aware repo-local refresh script and managed pre-push hook reconciliation
  - init and config flows that converge runtime wiring with persisted refresh settings
  - rerun-safe scaffold reconciliation for Phase 5 config and state fields
affects: [06-01, init, config, refresh, hooks]
tech-stack:
  added: []
  patterns:
    - marker-bounded managed hook reconciliation
    - config-driven repo-local runtime wiring
    - scaffold schema backfill on init reruns
key-files:
  created: []
  modified:
    - packages/core/src/runtime/local-cli.ts
    - packages/core/src/init/runtime-wiring.ts
    - packages/core/src/init/scaffold.ts
    - packages/agent-badge/src/commands/init.ts
    - packages/agent-badge/src/commands/config.ts
    - packages/agent-badge/src/commands/refresh.test.ts
key-decisions:
  - "Managed pre-push blocks now derive `|| true` from `refresh.prePush.mode` instead of hardcoding fail-soft behavior into every installed hook."
  - "Refresh config mutations immediately reconcile package.json scripts and the managed hook with the repo's detected package manager."
  - "Init scaffold reconciliation must preserve newly added Phase 5 config/state fields so reruns do not downgrade persisted schema."
patterns-established:
  - "Managed hook ownership stays marker-bounded: enabling or changing mode rewrites only the agent-badge block, disabling removes only that block."
  - "Repo-local runtime wiring is driven from persisted `config.refresh` during init and config changes rather than frozen init defaults."
requirements-completed: [OPER-01, OPER-02, OPER-04]
duration: 13min
completed: 2026-03-30
---

# Phase 05 Plan 03: Hook Reconciliation Summary

**Managed pre-push wiring now follows persisted refresh settings across init reruns and config changes without breaking the original failure-soft contract**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-30T18:39:00Z
- **Completed:** 2026-03-30T18:51:55Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Made repo-local refresh scripts and managed `pre-push` blocks mode-aware so fail-soft remains the default while strict mode and disable are explicit config outcomes.
- Updated `init` and `config` flows to reconcile runtime wiring from persisted `refresh.prePush` settings instead of leaving the install-time hook stale forever.
- Fixed init scaffold reconciliation so reruns preserve Phase 5 `privacy.output`, `publish.lastPublishedAt`, and `refresh` state fields instead of regressing the persisted schema.

## Task Commits

Each task was committed atomically:

1. **Task 1: Make runtime wiring config-aware for fail-soft, strict, and disabled pre-push modes** - `60012b1` (feat)
2. **Task 2: Reconcile runtime wiring from init and config flows, then prove the managed hook contract end to end** - `a9512e0` (feat)

**Plan metadata:** created in the final `docs(05-03)` commit for this plan

## Files Created/Modified
- `packages/core/src/runtime/local-cli.ts` - Added mode-aware managed refresh script generation while preserving package-manager script runners.
- `packages/core/src/init/runtime-wiring.ts` - Reconciles managed scripts and marker-bounded hook blocks for fail-soft, strict, and disabled pre-push automation.
- `packages/core/src/init/runtime-wiring.test.ts` - Covers strict hooks, disabled managed-block removal, and idempotent reruns.
- `packages/core/src/init/scaffold.ts` - Preserves Phase 5 config/state fields during init rerun reconciliation instead of downgrading persisted schema.
- `packages/core/src/init/scaffold.test.ts` - Guards `privacy.output`, `publish.lastPublishedAt`, and refresh summary preservation.
- `packages/agent-badge/src/commands/init.ts` - Applies repo-local runtime wiring from persisted `config.refresh`.
- `packages/agent-badge/src/commands/init.test.ts` - Verifies default one-block wiring and rerun reconciliation from persisted strict refresh settings.
- `packages/agent-badge/src/commands/config.ts` - Reconciles runtime wiring immediately after refresh pre-push config changes using detected package manager.
- `packages/agent-badge/src/commands/config.test.ts` - Verifies strict updates, disable/remove behavior, and clean re-enable restoration.
- `packages/agent-badge/src/commands/refresh.test.ts` - Adds concise hook output and fail-soft versus strict error-surfacing regressions.

## Decisions Made
- Keep the managed hook command runner stable and move fail-soft behavior to the hook block itself so strict mode can remove `|| true` without changing package-manager runner selection.
- Treat `refresh.prePush.enabled` and `refresh.prePush.mode` as reconciliation triggers in `config`, while other config keys remain pure config-file mutations.
- Preserve schema evolution in scaffold reconciliation rather than assuming existing `.agent-badge` files are already on the newest shape.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Preserved Phase 5 config/state fields during init scaffold reconciliation**
- **Found during:** Task 2 (Reconcile runtime wiring from init and config flows, then prove the managed hook contract end to end)
- **Issue:** Init rerun tests exposed that `packages/core/src/init/scaffold.ts` still reconciled persisted files with a pre-Phase-5 shape, dropping `privacy.output`, `publish.lastPublishedAt`, and the entire `refresh` object.
- **Fix:** Extended scaffold config/state reconciliation to preserve the new fields and added scaffold/init regression coverage.
- **Files modified:** `packages/core/src/init/scaffold.ts`, `packages/core/src/init/scaffold.test.ts`, `packages/agent-badge/src/commands/init.test.ts`
- **Verification:** `node node_modules/vitest/vitest.mjs --run packages/core/src/init/scaffold.test.ts packages/agent-badge/src/commands/init.test.ts`
- **Committed in:** `a9512e0`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The auto-fix was required for correctness because init reruns would otherwise corrupt persisted Phase 5 state and break the Phase 1 idempotent init contract.

## Issues Encountered
- `npm test -- --run ...` remains less reliable than direct Vitest invocation in this environment, so verification used `node node_modules/vitest/vitest.mjs --run ...`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 5 is complete: the installed `pre-push` path now stays failure-soft by default, honors strict and disabled modes, and converges with post-init config changes.
- Phase 6 can build `doctor` and `uninstall` against a stable hook ownership model and schema-safe init reruns.

---
*Phase: 05-incremental-refresh-and-operator-commands*
*Completed: 2026-03-30*

## Self-Check: PASSED

- Found `.planning/phases/05-incremental-refresh-and-operator-commands/05-03-SUMMARY.md`
- Found task commits `60012b1` and `a9512e0`
