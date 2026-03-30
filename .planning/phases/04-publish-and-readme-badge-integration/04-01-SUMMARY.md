---
phase: 04-publish-and-readme-badge-integration
plan: 01
subsystem: infra
tags: [github-gist, shields, init, cli, vitest, octokit]
requires:
  - phase: 01-03
    provides: schema-safe `.agent-badge` scaffold plus init runtime wiring
  - phase: 03-03
    provides: config/state persistence patterns reused by runtime commands
provides:
  - explicit deferred publish-target state and scaffold reconciliation
  - stable badge URL derivation from gist identity plus `agent-badge.json`
  - init create/connect/reuse/defer wiring for one public GitHub Gist target
affects: [phase-04-publish-command, phase-04-readme-badge, init-cli, github-gist-publishing]
tech-stack:
  added: [octokit]
  patterns:
    - stable badge URLs are derived from gist identity plus `agent-badge.json`, never from Gist API `raw_url`
    - init reconciles publish config and state together through pure publish-target helpers before any README mutation
key-files:
  created:
    - packages/core/src/publish/badge-url.ts
    - packages/core/src/publish/github-gist-client.ts
    - packages/core/src/publish/github-gist-client.test.ts
    - packages/core/src/publish/publish-state.ts
    - packages/core/src/publish/publish-state.test.ts
    - packages/core/src/publish/publish-target.ts
    - packages/core/src/publish/index.ts
  modified:
    - packages/core/package.json
    - packages/core/src/state/state-schema.ts
    - packages/core/src/state/state-schema.test.ts
    - packages/core/src/config/config-schema.test.ts
    - packages/core/src/init/scaffold.ts
    - packages/core/src/index.ts
    - packages/agent-badge/src/commands/init.ts
    - packages/agent-badge/src/commands/init.test.ts
    - packages/agent-badge/src/cli/main.ts
key-decisions:
  - "Publish target setup writes `deferred` explicitly when no safe gist target is available instead of leaving stale config or broken state."
  - "Stable badge URLs are derived from `{ownerLogin, gistId, agent-badge.json}` and never copied from revision-specific Gist API fields."
  - "Init only marks publish state as `pending` after target selection; actual remote JSON publish remains a later phase concern."
patterns-established:
  - "GitHub network boundaries live behind `GitHubGistClient`, with command tests injecting fake clients instead of using live network calls."
  - "Init command persistence loads parsed config/state, applies a pure publish-target result, then rewrites both files atomically."
requirements-completed: [PUBL-01, PUBL-02]
duration: 13 min
completed: 2026-03-30
---

# Phase 04 Plan 01: Publish Target Foundation Summary

**Deterministic GitHub Gist publish-target setup with stable Shields badge URLs and init create/connect/defer wiring**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-30T17:46:30+02:00
- **Completed:** 2026-03-30T17:59:42+02:00
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments

- Added explicit deferred publish-target state handling so `.agent-badge/state.json` can represent deliberate unpublished mode without losing existing gist bookkeeping.
- Built the new core publish namespace with stable badge URL derivation, a GitHub Gist transport seam, publish-target orchestration, and config/state reconciliation helpers.
- Extended `agent-badge init` to accept `--gist-id`, persist publish-target outcomes, and print one explicit status line for created, connected, reused, or deferred targets.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend publish config/state defaults for explicit target management** - `316d8f0` (`feat`)
2. **Task 2: Add deterministic badge URL and GitHub Gist target services in core** - `2c728e6` (`feat`)
3. **Task 3: Wire init to create, connect, or defer the publish target idempotently** - `24b2738` (`feat`)

Plan metadata is committed separately with the summary and planning artifacts.

## Files Created/Modified

- `packages/core/src/state/state-schema.ts`, `packages/core/src/state/state-schema.test.ts`, and `packages/core/src/init/scaffold.ts` - add and preserve the explicit `deferred` publish state.
- `packages/core/src/config/config-schema.test.ts` - proves publish config stays aggregate-only and rejects transcript-like or path-like fields.
- `packages/core/src/publish/badge-url.ts` - derives the stable Shields endpoint URL from gist identity plus `agent-badge.json`.
- `packages/core/src/publish/github-gist-client.ts` and `packages/core/src/publish/github-gist-client.test.ts` - define and verify the GitHub Gist transport seam.
- `packages/core/src/publish/publish-target.ts`, `packages/core/src/publish/publish-state.ts`, and `packages/core/src/publish/publish-state.test.ts` - create/connect/reuse/defer one deterministic public Gist target and reconcile config/state safely.
- `packages/core/src/publish/index.ts`, `packages/core/src/index.ts`, and `packages/core/package.json` - export the new publish namespace and add the `octokit` dependency declaration.
- `packages/agent-badge/src/commands/init.ts`, `packages/agent-badge/src/commands/init.test.ts`, and `packages/agent-badge/src/cli/main.ts` - wire init-time publish-target setup and CLI `--gist-id` support.

## Decisions Made

- The publish target is now the source of truth for Phase 4 setup: config stores the stable connection details, while state stores only target lifecycle and last-publish bookkeeping.
- Deferred mode clears broken target references and prints next-step guidance instead of leaving stale Gist ids in config.
- The init command persists publish-target results immediately after scaffold/runtime wiring and stops short of README or publish mutations in this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added an injectable `gistClient` seam to keep init publish-target tests offline**
- **Found during:** Task 3 (Wire init to create, connect, or defer the publish target idempotently)
- **Issue:** The planned init wiring needed deterministic tests for create/connect/reuse flows, but relying on live GitHub calls or a locally installed `octokit` runtime would break the repo's stubbed validation pattern.
- **Fix:** Added optional `gistClient` injection to `runInitCommand()` and used it in the new init tests while keeping the default runtime path on `createGitHubGistClient()`.
- **Files modified:** `packages/agent-badge/src/commands/init.ts`, `packages/agent-badge/src/commands/init.test.ts`
- **Verification:** `PATH="/tmp/agent-badge-deps/node_modules/.bin:$PATH" npm test -- --run packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/cli/main.test.ts`
- **Committed in:** `24b2738`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** The added test seam kept the implementation aligned with the no-live-network validation strategy. No product-scope creep.

## Issues Encountered

- The workspace still lacks local `vitest` binaries under `/Volumes/git`, so verification continued to use `PATH="/tmp/agent-badge-deps/node_modules/.bin:$PATH"` instead of reinstalling dependencies on the low-space volume.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 04 now has the stable publish-target contract needed for payload serialization and first publish behavior.

The next plan can build the badge JSON serializer and publish command on top of deterministic gist identity without revisiting init-time target selection or state drift.

## Self-Check: PASSED

- Verified summary file exists at `.planning/phases/04-publish-and-readme-badge-integration/04-01-SUMMARY.md`.
- Verified task commit `316d8f0` exists in git history.
- Verified task commit `2c728e6` exists in git history.
- Verified task commit `24b2738` exists in git history.

---
*Phase: 04-publish-and-readme-badge-integration*
*Completed: 2026-03-30*
