---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 05-03-PLAN.md
last_updated: "2026-03-30T20:45:00.586Z"
last_activity: 2026-03-30
progress:
  total_phases: 7
  completed_phases: 5
  total_plans: 20
  completed_plans: 18
  percent: 94
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-30)

**Core value:** Any repository can display an accurate, privacy-preserving AI usage badge with one setup command and near-zero ongoing maintenance.
**Current focus:** Phase 06 — doctor-uninstall-and-safety-hardening

## Current Position

Phase: 06 (doctor-uninstall-and-safety-hardening) — EXECUTING
Plan: 2 of 3
Status: Ready to execute
Last activity: 2026-03-30

Progress: [█████████░] 16/17 plans (94%)

## Performance Metrics

**Velocity:**

- Total plans completed: 16
- Average duration: 9 min
- Total execution time: 143 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 5 | 25 min | 5 min |
| 02 | 3 | 34 min | 11 min |
| 03 | 3 | 21 min | 7 min |
| 04 | 3 | 32 min | 11 min |
| 05 | 2 | 31 min | 16 min |

**Recent Trend:**

- Last 5 plans: 05-02 (18 min), 05-01 (13 min), 04-03 (13 min), 04-02 (6 min), 04-01 (13 min)
- Trend: Stable

*Updated after each plan completion*
| Phase 03 P02 | 5 min | 3 tasks | 6 files |
| Phase 03 P03 | 9 min | 3 tasks | 8 files |
| Phase 04 P01 | 13 min | 3 tasks | 16 files |
| Phase 04 P02 | 6 min | 2 tasks | 10 files |
| Phase 04 P03 | 13 min | 2 tasks | 5 files |
| Phase 05 P01 | 13 min | 2 tasks | 13 files |
| Phase 05 P02 | 18 min | 3 tasks | 12 files |
| Phase 05 P03 | 13min | 2 tasks | 11 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Initialization-first package split: ship `agent-badge` and `create-agent-badge` from one workspace.
- Phase 01 kept persisted `.agent-badge` data aggregate-only through strict Zod schemas.
- Phase 01 kept init preflight privacy-safe and `getGitContext()` read-only, with git bootstrap moved to a separate helper.
- Phase 01 routed `create-agent-badge` through the runtime init command so both entrypoints share one scaffold path.
- Phase 01 generated repo-local scripts and a failure-soft managed `pre-push` hook from package-manager-specific templates.
- Phase 02 uses Codex SQLite as the authoritative local source and limits `history.jsonl` to zero-total fallback metadata when SQLite cannot be read.
- [Phase 03]: Only repo-root and normalized remote matches auto-include; cwd-only and transcript-only evidence stay ambiguous until a developer override exists.
- [Phase 03]: Override persistence stores only stable provider:providerSessionId keys in overrides.ambiguousSessions, never raw cwd or transcript correlation values.
- [Phase 03]: Override reuse changes final include/exclude status while preserving the raw evidence reason for later scan reporting.
- [Phase 03]: The scan report prints stable provider:providerSessionId keys plus evidence kinds and reasons, never raw cwd realpaths or transcript paths. — Operator-facing scan output must remain reviewable without leaking local filesystem evidence.
- [Phase 03]: Completed-scan state updates only advance lastScannedAt for providers scanned successfully and preserve existing cursors unless a concrete cursor is supplied. — Phase 3 should not invent incremental cursor semantics or rewrite checkpoint data after partial failures.
- [Phase 03]: Explicit include/exclude session keys are applied only when the current scan still marks that session ambiguous; invalid override requests warn without mutating state. — Manual override requests should be conservative and visible instead of silently changing persisted data.
- [Phase 04]: Publish target setup writes deferred explicitly when no safe gist target is available instead of leaving stale config or broken state.
- [Phase 04]: Stable badge URLs are derived from owner login, gist id, and agent-badge.json instead of revision-specific Gist API raw_url values.
- [Phase 04]: Init marks publish state as pending only after target selection succeeds; remote JSON publishing remains a later phase.
- [Phase 04]: Core publish hashes the exact uploaded endpoint JSON so Phase 5 can compare real remote payload content.
- [Phase 04]: The publish command reruns full backfill plus attribution internally and only persists publish state, leaving scan checkpoint updates to the scan flow.
- [Phase 04]: Init reuses runFullBackfillScan(), attributeBackfillSessions(), and publishBadgeToGist() so README edits only happen after a live remote JSON publish succeeds.
- [Phase 04]: README mutation is marker-bounded and idempotent, while repositories without a README receive a pasteable snippet instead of a silently created file.
- [Phase 04]: Deferred publish-target setup or first-publish failures print actionable badge-setup guidance and leave README content untouched.
- [Phase 05]: Provider checkpoints now use opaque per-session digest maps keyed by stable providerSessionId values instead of lastScannedAt-derived semantics.
- [Phase 05]: Refresh totals are derived from a local session-index cache that stores only stable keys plus aggregate contributions.
- [Phase 05]: Publish skipping compares the exact serialized endpoint payload hash and leaves lastPublishedAt unchanged when a write is skipped.
- [Phase 05]: Refresh persists local state and the derived session-index cache before any remote publish attempt so fail-soft runs still recover badge state.
- [Phase 05]: Status output is privacy-aware: minimal mode omits gist identifiers and publish hashes while keeping totals, publish state, and checkpoints visible.
- [Phase 05]: Post-init config mutations stay on an explicit allowlist, and aggregate-only publishing remains enforced even when privacy settings are inspected through the CLI.
- [Phase 05]: Managed pre-push blocks now derive || true from refresh.prePush.mode instead of hardcoding fail-soft behavior into every installed hook.
- [Phase 05]: Refresh config mutations immediately reconcile package.json scripts and the managed hook with the repo's detected package manager.
- [Phase 05]: Init scaffold reconciliation must preserve newly added Phase 5 config and state fields so reruns do not downgrade persisted schema.
- [Quick 260330-uxa]: Mutable `.agent-badge/state.json` is local runtime state, not a tracked repo artifact; init/runtime wiring must ensure it is gitignored alongside cache/logs so refresh and pre-push stay invisible in normal git workflows.
- [Quick 260330-v47]: The stable Shields badge URL should use a short cache window (`300` seconds) so visible badge changes do not feel stale after a publish, while still avoiding overly aggressive refetching.
- [Phase 06-doctor-uninstall-and-safety-hardening]: Keep runDoctorChecks read-only by default and isolate write checks behind --probe-write.

### Pending Todos

None yet.

### Blockers/Concerns

- `/Volumes/git` still has too little free space for a normal local `npm install`, so verification on this machine relies on the temporary `/tmp/agent-badge-deps` workaround.
- npm package-name availability for `agent-badge` must be checked at publish time.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260330-uip | Add a real README with the live badge, brief project description, installation instructions, then commit and push | 2026-03-30 | e432521 | [260330-uip-add-a-real-readme-with-the-live-badge-br](./quick/260330-uip-add-a-real-readme-with-the-live-badge-br/) |
| 260330-uo2 | Switch the live badge from sessions to tokens, republish it, commit the repo-local state, and push main | 2026-03-30 | 5e4d51f | [260330-uo2-switch-the-live-badge-from-sessions-to-t](./quick/260330-uo2-switch-the-live-badge-from-sessions-to-t/) |
| 260330-uxa | Auto-ignore agent-badge local runtime state so refresh/push do not dirty repos, and stop tracking this repo's state.json | 2026-03-30 | ae6b8c2 | [260330-uxa-auto-ignore-agent-badge-local-runtime-st](./quick/260330-uxa-auto-ignore-agent-badge-local-runtime-st/) |
| 260330-v47 | Lower agent-badge Shields cacheSeconds to a shorter default and update this repo's configured badge URL/README to match | 2026-03-30 | cda747b | [260330-v47-lower-agent-badge-shields-cacheseconds-t](./quick/260330-v47-lower-agent-badge-shields-cacheseconds-t/) |

## Session Continuity

Last session: 2026-03-30T18:53:34.706Z
Stopped at: Completed 05-03-PLAN.md
Resume file: None
