---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: milestone
status: executing
stopped_at: Completed 20-01-PLAN.md
last_updated: "2026-04-05T14:57:31.029Z"
last_activity: 2026-04-05
progress:
  total_phases: 7
  completed_phases: 6
  total_plans: 18
  completed_plans: 17
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-05)

**Core value:** Any repository can display an accurate, privacy-preserving AI usage badge with one setup command and near-zero ongoing maintenance.
**Current focus:** Phase 20 — verification-artifact-closure-and-audit-recovery

## Current Position

Phase: 20 (verification-artifact-closure-and-audit-recovery) — EXECUTING
Plan: 2 of 2
Status: Ready to execute
Last activity: 2026-04-05

Progress: [█████████░] 6/7 phases complete in milestone v1.4

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
| Phase 07-release-readiness P01 | 5min | 2 tasks | 2 files |
| Phase 07-release-readiness P02 | 7min | 2 tasks | 9 files |
| Phase 07-release-readiness P03 | 2m 22s | 2 tasks | 9 files |
| Phase 12-production-publish-execution P01 | 1 | 2 tasks | 6 files |
| Phase 13 P01 | 5m 31s | 2 tasks | 8 files |
| Phase 14 P01 | 3m 21s | 2 tasks | 5 files |
| Phase 16 P02 | 9 min | 2 tasks | 11 files |
| Phase 17 P03 | 9 min | 2 tasks | 7 files |
| Phase 18-auth-hook-and-publish-readiness-hardening P03 | 4 min | 1 tasks | 1 files |
| Phase 19 P01 | 7m | 2 tasks | 11 files |
| Phase 20-verification-artifact-closure-and-audit-recovery P01 | 15m | 3 tasks | 8 files |

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
- [Phase 07-release-readiness]: Release-readiness proof is a dedicated matrix test file rather than implicit coverage spread across tests.
- [Phase 07-release-readiness]: CI runs a separate scenario-matrix job so REL-01 remains an explicit release gate.
- [Phase 07-release-readiness]: Recovered existing valid task commits for 07-02 and preserved atomic history instead of rewriting completed work.
- [Phase 07-release-readiness]: Release verification may require isolated npm cache on hosts with invalid ~/.npm ownership, while publish flow remains workflow-driven.
- [Phase 08-verification-gate-recovery]: Dynamic third-party imports should be narrowed through runtime constructor validation instead of module-wide force casts.
- [Phase 08-verification-gate-recovery]: Clean release verification must clear both `dist/` and `*.tsbuildinfo` so TypeScript project references re-emit runtime artifacts from scratch.
- [Phase 08-verification-gate-recovery]: CI and release should share one repo-owned `verify:clean-checkout` entrypoint instead of drifting copies of build/test/pack/smoke steps.
- [Phase 09-package-metadata-and-tarball-integrity]: Publishable workspace manifests must use deliberate `1.1.0` versions while retaining npm workspace `file:` links in the lockfile for local development.
- [Phase 09-package-metadata-and-tarball-integrity]: Tarball integrity is enforced by a repo-owned pack checker that allows only `dist/**` plus `package.json` and requires explicit runtime entrypoints before smoke-install validation runs.
- [Phase 10-release-rehearsal-and-checklist]: The packed-install smoke rehearsal must rebuild before packing and resolve exact tarball identities before install so clean-tree verification stays trustworthy.
- [Phase 10-release-rehearsal-and-checklist]: Release operators should follow one repo-owned checklist that includes `/tmp` scratch-space guidance, isolated npm cache usage, and live `npm view` checks immediately before publish.
- [Phase 12-production-publish-execution]: Use `.github/workflows/release.yml` + `workflow_dispatch` as the canonical production publish path and record workflow-backed publish evidence for the shipped release.
- [Phase 12-production-publish-execution]: Release evidence must be captured in both JSON and Markdown files with manifest inventory, git SHA, preflight input, and workflow metadata or fallback reason.
- [Phase 13]: Keep registry smoke evidence limited to package coordinates and passed-or-blocked outcomes so local temp paths never leave the machine.
- [Phase 13]: Match create-agent-badge direct execution to the runtime CLI's realpath-based guard so symlinked npm bin paths cannot silently no-op.
- [Phase 13]: Production release operations now rely on npm trusted publishing via GitHub Actions OIDC rather than a long-lived `NPM_TOKEN`.
- [Phase 13]: The maintained release checklist must include the exact-version post-publish registry smoke before a release can be considered closed.
- [Phase 14]: Canonical shared Phase 14 state is one per-publisher contribution file plus one shared overrides file.
- [Phase 15]: Shared contributor files now publish schema-version-2 session observations keyed by opaque digests rather than per-publisher totals. — Cross-publisher deduplication must operate on stable session identities instead of merged aggregate snapshots.
- [Phase 15]: Refresh cache v2 preserves session status, override decision, tokens, and optional cost for later shared publish wiring. — Incremental publish and pre-push must be able to rebuild the shared reducer contract without a mandatory full rescan.
- [Phase 15]: Shared publish-service now recomputes authoritative badge totals from merged observation maps after injecting the just-written local contributor record. — Deterministic totals should not depend on immediate gist read-after-write consistency.
- [Phase 15]: Combined-mode zero usage now publishes as `$0` rather than failing first-publish flows. — Shared publish correctness includes empty repos and init-time release-readiness scenarios.
- [Phase 16]: Shared publish health is a typed core report reused by publish flows instead of command-specific migration heuristics.
- [Phase 16]: Migration is explicit only when the pre-write gist is legacy and the post-write authoritative shared view is shared on the same gist id.
- [Phase 16]: Status and doctor both consume inspectSharedPublishHealth() so operator mode and health vocabulary cannot drift between commands.
- [Phase 16]: Migration docs explicitly direct legacy repos back to the original publisher machine because the old badge payload is not a lossless history source.
- [Phase 17]: Publish trust now derives from persisted attempt outcome, candidate hash, and last successful sync facts rather than refresh-time heuristics. — Canonical persisted facts keep status, refresh, and doctor aligned without command-local inference drift.
- [Phase 17]: Doctor owns a dedicated publish-trust check so badge trust stays separate from shared-mode health and recovery guidance. — Operators need distinct signals for live badge freshness and shared contributor health.
- [Phase 18-auth-hook-and-publish-readiness-hardening]: Kept the regression strong by asserting the exact three-call gist write sequence: badge payload first, local contributor snapshot second, overrides snapshot third.
- [Phase 19]: Recovery routing now lives in one core helper consumed by status, doctor, refresh, and init. — This keeps publish readiness, trust, and shared-health as separate facts while giving operators one consistent supported recovery path.
- [Phase 19]: `docs/RECOVERY.md` is now the canonical operator runbook, and the repo-owned `verify-recovery-flow.sh` harness records whichever supported command the current status output advertises into phase evidence artifacts.
- [Phase 20-verification-artifact-closure-and-audit-recovery]: Phase 19 verification was only closed after the phase-owned recovery artifacts were refreshed to show a healthy post-recovery publish state.
- [Phase 20-verification-artifact-closure-and-audit-recovery]: CTRL-02 and CTRL-03 are reattached through Phase 19's formal verification report instead of a Phase 20-only bookkeeping workaround.

### Pending Todos

- None.

### Blockers/Concerns

- `/Volumes/git` still has too little free space for a normal local `npm install`, so verification on this machine relies on temporary `/tmp` work directories.
- Sandboxed `tsx` entrypoints can still hit IPC permission issues; repo-owned release tooling passed once rerun outside the sandbox when needed.
- Local-first fail-soft refresh can still let the live badge drift stale when GitHub auth or gist writes fail in the push environment.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260330-uip | Add a real README with the live badge, brief project description, installation instructions, then commit and push | 2026-03-30 | e432521 | [260330-uip-add-a-real-readme-with-the-live-badge-br](./quick/260330-uip-add-a-real-readme-with-the-live-badge-br/) |
| 260330-uo2 | Switch the live badge from sessions to tokens, republish it, commit the repo-local state, and push main | 2026-03-30 | 5e4d51f | [260330-uo2-switch-the-live-badge-from-sessions-to-t](./quick/260330-uo2-switch-the-live-badge-from-sessions-to-t/) |
| 260330-uxa | Auto-ignore agent-badge local runtime state so refresh/push do not dirty repos, and stop tracking this repo's state.json | 2026-03-30 | ae6b8c2 | [260330-uxa-auto-ignore-agent-badge-local-runtime-st](./quick/260330-uxa-auto-ignore-agent-badge-local-runtime-st/) |
| 260330-v47 | Lower agent-badge Shields cacheSeconds to a shorter default and update this repo's configured badge URL/README to match | 2026-03-30 | cda747b | [260330-v47-lower-agent-badge-shields-cacheseconds-t](./quick/260330-v47-lower-agent-badge-shields-cacheseconds-t/) |

## Session Continuity

Last session: 2026-04-05T14:57:31.026Z
Stopped at: Completed 20-01-PLAN.md
Resume file: None
