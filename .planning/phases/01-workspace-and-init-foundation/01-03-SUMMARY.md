---
phase: 01-workspace-and-init-foundation
plan: 03
subsystem: infra
tags: [init, scaffolding, git, provider-detection, vitest]
requires:
  - phase: 01-01
    provides: workspace packages, CLI shell, and shared toolchain
  - phase: 01-02
    provides: config/state schemas, runtime helpers, and offline fixtures
provides:
  - structured init preflight for git, README, package manager, providers, auth, and existing scaffold state
  - idempotent `.agent-badge` scaffold writer shared by the runtime CLI and initializer package
  - integration coverage for non-mutating preflight and re-running init without duplicate scaffold output
affects: [phase-02-provider-parsing, phase-04-publish, init-flow]
tech-stack:
  added: []
  patterns:
    - init flow delegates through shared core preflight and scaffold services
    - scaffold reconciliation preserves valid existing values while filling missing defaults
    - runtime package imports are resolved through shared tsconfig and Vitest aliases
key-files:
  created:
    - packages/core/src/repo/git-context.ts
    - packages/core/src/init/preflight.ts
    - packages/core/src/init/scaffold.ts
    - packages/agent-badge/src/commands/init.ts
    - packages/agent-badge/src/commands/init.test.ts
    - packages/core/src/init/scaffold.test.ts
  modified:
    - packages/agent-badge/src/cli/main.ts
    - packages/agent-badge/src/index.ts
    - packages/create-agent-badge/src/index.ts
    - tsconfig.base.json
    - vitest.config.ts
key-decisions:
  - "Preflight reports normalized provider home labels rather than exporting absolute local paths."
  - "The initializer package delegates to the runtime init command so both entrypoints share one scaffold implementation."
  - "Scaffold writes only missing or invalid sections and preserves valid user values on re-entry."
patterns-established:
  - "Init orchestration lives in `packages/agent-badge/src/commands/init.ts`, while filesystem mutations stay in `@agent-badge/core`."
  - "Integration tests use temp git repos and fake provider homes instead of touching the real machine state."
requirements-completed: [BOOT-01, BOOT-02, BOOT-03, BOOT-04]
duration: 6 min
completed: 2026-03-30
---

# Phase 01 Plan 03: Init Foundation Summary

**Shared init preflight and idempotent `.agent-badge` scaffolding wired through both the runtime CLI and `create-agent-badge`**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-30T06:31:53Z
- **Completed:** 2026-03-30T06:40:29Z
- **Tasks:** 3
- **Files modified:** 20

## Accomplishments
- Added preflight services that inspect git state, README presence, package manager, provider availability, GitHub auth, and existing scaffold state without mutating the target repo.
- Implemented shared schema-backed scaffold services that create and reconcile `.agent-badge/config.json`, `.agent-badge/state.json`, `.agent-badge/cache/`, and `.agent-badge/logs/`.
- Wired both `agent-badge init` and `create-agent-badge` through the same init command path and covered the flow with temp-repo integration tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build structured init preflight services** - `f172104` (`feat`)
2. **Task 2: Implement schema-backed idempotent scaffolding and wire CLI/initializer entrypoints** - `d15f2f7` (`feat`)
3. **Task 3: Add integration tests for no-mutation preflight and idempotent re-entry** - `c52b693` (`test`)

Plan metadata is committed separately with the summary and planning artifacts.

## Files Created/Modified
- `packages/core/src/repo/git-context.ts` - non-mutating git context inspection with actionable blocking messages.
- `packages/core/src/init/preflight.ts` - structured init preflight result assembly.
- `packages/core/src/init/scaffold.ts` - idempotent scaffold writer and reconciler for `.agent-badge` artifacts.
- `packages/agent-badge/src/commands/init.ts` - runtime init orchestration and human-readable preflight/scaffold output.
- `packages/create-agent-badge/src/index.ts` - initializer entrypoint that delegates to the runtime init flow.
- `packages/core/src/init/preflight.test.ts` and `packages/core/src/init/scaffold.test.ts` - offline integration coverage for preflight and re-entry behavior.

## Decisions Made
- Kept provider detection privacy-safe by returning `~/.codex` and `~/.claude` labels instead of leaking absolute paths outside the local machine.
- Routed initializer behavior through the runtime command implementation so Phase 4 and later only need to evolve one init orchestration path.
- Reconciled incomplete scaffold JSON with schema defaults instead of overwriting valid existing values, preserving user state across re-runs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added runtime package aliases and direct initializer dependency wiring**
- **Found during:** Task 2 (Implement schema-backed idempotent scaffolding and wire CLI/initializer entrypoints)
- **Issue:** `create-agent-badge` needed to import the runtime package entrypoint directly, but the workspace had no source-resolution aliases or package reference for that path.
- **Fix:** Added shared TypeScript/Vitest aliases plus a local `agent-badge` dependency/reference for the initializer package so source imports resolve in both typecheck and test execution.
- **Files modified:** `tsconfig.base.json`, `vitest.config.ts`, `packages/create-agent-badge/package.json`, `packages/create-agent-badge/tsconfig.json`
- **Verification:** `npm run typecheck`, `npm test -- --run`
- **Committed in:** `d15f2f7`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The deviation was required to keep the shared init path executable in the monorepo. No scope creep beyond source-resolution wiring.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
Phase 1 is now ready for verification: the repo has a usable `agent-badge init` foundation, shared scaffold services, and idempotency coverage for repeated setup runs.

Carry-forward concern: local verification on this machine still relies on the temporary `/tmp/agent-badge-deps` install because `/Volumes/git` does not have enough free space for a normal `node_modules` extraction.

---
*Phase: 01-workspace-and-init-foundation*
*Completed: 2026-03-30*
