---
phase: 01-workspace-and-init-foundation
plan: 01
subsystem: infra
tags: [npm-workspaces, typescript, vitest, changesets, commander]
requires: []
provides:
  - Root npm workspace with shared build, test, and typecheck scripts
  - Runtime, initializer, core, and testkit package skeletons with stable entrypoints
  - CLI smoke coverage for the `agent-badge init` command shell
affects: [phase-01-02, phase-01-03, workspace-foundation, init]
tech-stack:
  added: [typescript, vitest, tsx, commander, zod, changesets]
  patterns: [npm-workspace-layout, ts-project-references, shared-cli-entrypoints]
key-files:
  created:
    - package.json
    - tsconfig.base.json
    - vitest.config.ts
    - packages/agent-badge/src/cli/main.ts
    - packages/agent-badge/src/cli/main.test.ts
    - packages/core/src/index.ts
  modified:
    - .gitignore
    - packages/agent-badge/package.json
    - packages/create-agent-badge/package.json
key-decisions:
  - "Centralized build, typecheck, and test scripts at the workspace root using TypeScript project references."
  - "Kept runtime and initializer entrypoints as stable exported placeholders so later init work can extend them without renaming."
requirements-completed: [BOOT-01]
duration: 1 min
completed: 2026-03-30
---

# Phase 01 Plan 01: Workspace Bootstrap Summary

**npm workspace foundation with shared TypeScript/Vitest tooling, stable package entrypoints, and CLI smoke coverage for `agent-badge init`**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-30T06:08:11Z
- **Completed:** 2026-03-30T06:08:38Z
- **Tasks:** 3
- **Files modified:** 26

## Accomplishments
- Added the root npm workspace, shared TypeScript baseline, Vitest config, and Changesets release scaffolding.
- Created the `agent-badge`, `create-agent-badge`, `@agent-badge/core`, and `@agent-badge/testkit` package skeletons with stable source entrypoints.
- Added a runtime CLI smoke test that confirms the program name and `init` subcommand wiring.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create root workspace config and shared toolchain files** - `e3ff145` (`chore`)
2. **Task 2: Create package manifests, tsconfig files, and source entrypoints** - `61ccb0a` (`feat`)
3. **Task 3: Install dependencies and add a runtime smoke test** - `5be15ae` (`test`)

Plan metadata is committed separately with the summary and planning artifacts.

## Files Created/Modified
- `package.json` - Root workspace manifest with shared scripts and dev tooling.
- `tsconfig.base.json` - Shared TypeScript compiler baseline for all packages.
- `vitest.config.ts` - Root Vitest configuration for workspace tests.
- `packages/agent-badge/src/cli/main.ts` - Runtime CLI shell with the placeholder `init` command.
- `packages/agent-badge/src/cli/main.test.ts` - Smoke coverage for CLI naming and command registration.
- `packages/core/src/index.ts` - Shared core export surface for later config/init/runtime modules.

## Decisions Made
- Centralized build, typecheck, and test execution at the repo root so later plans can rely on one consistent workspace toolchain.
- Preserved stable public entrypoint names (`buildProgram`, `run`, `main`) so later phases can extend behavior without changing call sites.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Replaced `workspace:*` dependency specs with `file:` links for local packages**
- **Found during:** Task 1 verification
- **Issue:** `npm install` on this machine failed with `EUNSUPPORTEDPROTOCOL` for `workspace:*`, blocking lockfile generation and workspace verification.
- **Fix:** Switched local package dependencies to `file:../core` while keeping the repo configured as an npm workspace.
- **Files modified:** `packages/agent-badge/package.json`, `packages/create-agent-badge/package.json`
- **Verification:** `npm install --package-lock-only --ignore-scripts`, `npm run typecheck`, `npm test -- --run`
- **Committed in:** `61ccb0a`

**2. [Rule 3 - Blocking] Moved verification-only dependency installation to `/tmp`**
- **Found during:** Task 3 verification
- **Issue:** `/Volumes/git` had only about `150 MiB` free, so a normal `npm install` failed with `ENOSPC` while extracting `node_modules`.
- **Fix:** Generated the repo `package-lock.json` without a full install, installed the toolchain under `/tmp/agent-badge-deps`, and pointed the repo at that temporary `node_modules` tree for typecheck and test execution.
- **Files modified:** None - execution environment workaround only
- **Verification:** `npm run typecheck`, `npm test -- --run`
- **Committed in:** Not committed

---

**Total deviations:** 2 auto-fixed (`2x Rule 3 - Blocking`)
**Impact on plan:** The source tree matches the intended workspace foundation, but verification required environment-specific install workarounds because local npm/package storage could not complete on the repo volume.

## Issues Encountered
`npm install` first stalled in the sandbox, then failed outside the sandbox because the repo volume was nearly full. Both blockers were resolved without exposing the workaround in tracked source beyond the package manifest protocol change needed to keep npm working on this machine.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
Ready for `01-02`: the workspace structure, package names, shared scripts, and placeholder entrypoints are all in place for schema/runtime work.

Concern to carry forward: local verification currently depends on the temporary `/tmp/agent-badge-deps` install because `/Volumes/git` does not have enough free space for a normal `node_modules` extraction.

---
*Phase: 01-workspace-and-init-foundation*
*Completed: 2026-03-30*
