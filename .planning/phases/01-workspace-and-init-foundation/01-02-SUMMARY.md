---
phase: 01-workspace-and-init-foundation
plan: 02
subsystem: infra
tags: [typescript, zod, vitest, cli, test-fixtures]
requires:
  - phase: 01-01
    provides: workspace manifests, TypeScript project references, and Vitest wiring
provides:
  - strict schema-backed `.agent-badge` config, state, and log models
  - package-manager-aware local runtime and pre-push command builders
  - offline repo and provider fixture helpers for later init and scanner tests
affects: [01-03, phase-02-provider-parsing, refresh-hooks]
tech-stack:
  added: []
  patterns:
    - strict Zod schemas for persisted workspace artifacts
    - lockfile-first package-manager detection with canonical local CLI commands
    - temp-directory fixture helpers for git repos and fake provider homes
key-files:
  created:
    - packages/core/src/config/config-schema.ts
    - packages/core/src/state/state-schema.ts
    - packages/core/src/logging/log-entry.ts
    - packages/core/src/runtime/package-manager.ts
    - packages/core/src/runtime/local-cli.ts
    - packages/testkit/src/repo-fixtures.ts
    - packages/testkit/src/provider-fixtures.ts
  modified:
    - packages/core/src/index.ts
    - packages/core/src/config/index.ts
    - packages/core/src/runtime/index.ts
    - packages/core/src/config/config-schema.test.ts
    - packages/core/src/state/state-schema.test.ts
    - packages/core/src/runtime/local-cli.test.ts
    - packages/testkit/src/index.ts
key-decisions:
  - "Persisted config, state, and log schemas stay aggregate-only and reject transcript-like or path-like fields."
  - "Repo-local CLI invocation is generated from package-manager-specific templates selected by lockfile detection."
patterns-established:
  - "Persisted `.agent-badge` files are defined through strict Zod schemas with parse helpers and exported defaults."
  - "Reusable test fixtures create isolated temp repos and fake `~/.codex` and `~/.claude` roots instead of touching the real machine state."
requirements-completed: [BOOT-03, BOOT-04]
duration: 6 min
completed: 2026-03-30
---

# Phase 01 Plan 02: Shared Schemas and Runtime Primitives Summary

**Strict `.agent-badge` config/state/log schemas, package-manager-aware local CLI commands, and offline repo/provider fixtures for init verification**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-30T06:15:30Z
- **Completed:** 2026-03-30T06:21:06Z
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments

- Added strict Zod schemas plus defaults and parse helpers for `.agent-badge/config.json`, `.agent-badge/state.json`, and aggregate log entries.
- Replaced the placeholder runtime module with lockfile-based package-manager detection and canonical repo-local `agent-badge` command builders.
- Replaced placeholder `testkit` modules with temp repo and fake provider-home fixtures, then locked in schema/runtime behavior with deterministic tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement schema-backed config, state, and log models** - `4bb1d82` (`feat`)
2. **Task 2: Implement package-manager-aware local CLI command builders** - `08a10e6` (`feat`)
3. **Task 3: Add fixture helpers and automated coverage for schema/runtime primitives** - `750f955` (`feat`)

## Files Created/Modified

- `packages/core/src/config/config-schema.ts` - canonical config schema, defaults, and parser for `.agent-badge/config.json`
- `packages/core/src/state/state-schema.ts` - canonical state schema, defaults, and parser for `.agent-badge/state.json`
- `packages/core/src/logging/log-entry.ts` - aggregate-only log entry schema for later operational logging
- `packages/core/src/runtime/package-manager.ts` - lockfile-first package-manager detection with npm fallback
- `packages/core/src/runtime/local-cli.ts` - canonical local CLI and pre-push refresh command builders
- `packages/testkit/src/repo-fixtures.ts` - temp repo helpers for git/no-git and README/no-README scenarios
- `packages/testkit/src/provider-fixtures.ts` - fake `~/.codex` and `~/.claude` home helpers for offline provider tests

## Decisions Made

- Used strict object schemas so persisted config/state/log files reject extra transcript-like and filename-like fields instead of silently accepting them.
- Kept publish and checkpoint defaults intentionally empty but typed, so later phases can extend real values without rewriting the file shapes.
- Exposed repo-local command strings from `@agent-badge/core` so init, scripts, and hook installation can share one command-generation path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added minimal schema tests during Task 1**
- **Found during:** Task 1 (Implement schema-backed config, state, and log models)
- **Issue:** The Task 1 verification command referenced `config-schema.test.ts` and `state-schema.test.ts`, but the written task sequence deferred those files to Task 3.
- **Fix:** Created minimal schema tests in Task 1 so verification could run immediately, then expanded them in Task 3 as planned.
- **Files modified:** `packages/core/src/config/config-schema.test.ts`, `packages/core/src/state/state-schema.test.ts`
- **Verification:** `npm test -- --run packages/core/src/config/config-schema.test.ts packages/core/src/state/state-schema.test.ts`
- **Committed in:** `4bb1d82`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The deviation only repaired task ordering for verification. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

- `packages/core/src/state/state-schema.test.ts:6` uses the phrase "default placeholder state" to describe intentionally empty scaffold defaults. This is test wording, not an unwired product stub.

## Next Phase Readiness

- Phase `01-03` can consume the shared schemas, `detectPackageManager`, and repo/provider fixtures without redefining persisted file shapes or local command strings.
- No blockers remain for init preflight and `.agent-badge` scaffolding work.

## Self-Check: PASSED

- Found `.planning/phases/01-workspace-and-init-foundation/01-02-SUMMARY.md`
- Found commit `4bb1d82`
- Found commit `08a10e6`
- Found commit `750f955`
