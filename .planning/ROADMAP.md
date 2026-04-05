# Roadmap: agent-badge

## Overview

Phases 1 through 16 established the local-first scanning model, stable gist-backed badge publishing, release verification, merge-safe shared publishing, migration flows, and operator-facing shared-health diagnostics. The next milestone addresses the most important remaining trust gap: the live badge can still drift stale when local publish automation fails softly and the operator does not notice.

Milestone v1.4 focuses on publish reliability hardening: visible failure states, auth and gist readiness checks, stale badge detection, and supported recovery flows that keep the local-first model trustworthy in production use.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 14: Shared Remote Contribution Model** - Define and implement a merge-safe remote representation for per-contributor repo usage and shared override state.
- [x] **Phase 15: Cross-Publisher Deduplication And Publish Semantics** - Merge contributor state deterministically by stable session identity so shared totals converge without double counting.
- [x] **Phase 16: Migration, Diagnostics, And Team Operator UX** - Migrate existing single-writer repos safely and expose clear operator flows for shared badge state. (completed 2026-04-02)
- [x] **Phase 17: Publish Failure Visibility And State Trust** - Make stale or failed badge publish state obvious in normal operator workflows. (completed 2026-04-02)
- [x] **Phase 18: Auth, Hook, And Publish Readiness Hardening** - Tighten auth detection, readiness checks, and automation controls around local publish flows. (completed 2026-04-05)
- [ ] **Phase 19: Recovery Paths And Production Reliability Verification** - Prove the stale-badge recovery path and lock the operator runbooks to real failure modes.

## Phase Details

### Phase 14: Shared Remote Contribution Model
**Goal**: Replace the single overwritten remote aggregate with a merge-safe shared state model that multiple contributors can publish into safely.
**Depends on**: Phase 13
**Requirements**: [TEAM-01, TEAM-02, TEAM-03]
**Success Criteria** (what must be TRUE):
  1. Shared badge publishing writes remote contribution state that can be merged across contributors instead of overwriting one machine's aggregate-only snapshot.
  2. The shared remote shape keeps the product aggregate-only and does not expose prompts, transcript text, filenames, or local paths.
  3. Shared ambiguous-session decisions have a defined repo-level home instead of remaining only machine-local overrides.
**Plans**: 3 plans

Plans:
- [x] 14-01: Design the shared remote contribution and override model
- [x] 14-02: Implement shared-state persistence and publish wiring
- [x] 14-03: Add schema, safety, and privacy verification for the shared model

### Phase 15: Cross-Publisher Deduplication And Publish Semantics
**Goal**: Make merged shared totals converge deterministically and avoid double counting when the same underlying session is seen by more than one publisher.
**Depends on**: Phase 14
**Requirements**: [CONS-01, CONS-02, CONS-03]
**Success Criteria** (what must be TRUE):
  1. Shared totals use stable provider session identity to deduplicate across contributors and machines rather than summing local badge totals.
  2. Conflicting or duplicated contributor observations converge deterministically so repeated publishes from different users do not inflate totals.
  3. Shared include/exclude decisions for ambiguous sessions produce one consistent repo-level outcome in published totals.
**Plans**: 2 plans

Plans:
- [x] 15-01: Implement deterministic cross-publisher merge and deduplication rules
- [x] 15-02: Validate convergence, conflict handling, and shared override behavior

### Phase 16: Migration, Diagnostics, And Team Operator UX
**Goal**: Move existing repos to the shared model safely and give operators enough visibility to trust and recover shared badge state.
**Depends on**: Phase 15
**Requirements**: [MIGR-01, MIGR-02, MIGR-03]
**Success Criteria** (what must be TRUE):
  1. Existing single-writer repos can migrate to shared publishing without changing the stable README badge URL or losing prior badge continuity.
  2. Operators can inspect whether shared mode is healthy, stale, conflicting, or partially migrated.
  3. Team-oriented docs and recovery flows make the new shared correctness model understandable in normal repository workflows.
**Plans**: 2 plans

Plans:
- [x] 16-01: Add migration path and diagnostics for existing repos
- [x] 16-02: Finalize team operator UX, docs, and verification

### Phase 17: Publish Failure Visibility And State Trust
**Goal**: Make the difference between a fresh badge and a stale failed publish obvious from the normal repo surfaces operators already use.
**Depends on**: Phase 16
**Requirements**: [OPER-01, OPER-02]
**Success Criteria** (what must be TRUE):
  1. `status`, `refresh`, and persisted state distinguish successful local refresh from failed remote publish with explicit timestamps and stale-state messaging.
  2. Operators can tell whether the live badge is stale because publish failed, because no publish was attempted, or because the remote value genuinely did not change.
  3. Shared-mode state and live-badge trust signals do not drift between CLI output and persisted diagnostics.
**Plans**: 3 plans

Plans:
- [x] 17-01: Add stale badge and failed publish visibility to status and refresh flows
- [x] 17-02: Persist canonical publish failure diagnostics and attempt facts
- [x] 17-03: Align doctor and command trust output with canonical persisted diagnostics

### Phase 18: Auth, Hook, And Publish Readiness Hardening
**Goal**: Validate GitHub auth and publish readiness where operators need it, and give repos explicit control over how strict pre-push publish failures should be.
**Depends on**: Phase 17
**Requirements**: [OPER-03, AUTH-01, AUTH-02, CTRL-01]
**Success Criteria** (what must be TRUE):
  1. Refresh and publish report whether auth is missing, gist access is broken, writes fail, or remote readback is inconsistent.
  2. Pre-push automation can be configured deliberately and warns loudly when the badge did not update.
  3. Doctor and init point operators to environment-specific fixes before the repo silently falls out of sync.
**Plans**: 4 plans

Plans:
- [x] 18-01: Harden auth and gist readiness checks across publish, refresh, and doctor
- [x] 18-02: Add explicit automation strictness and visible degraded-mode hook behavior
- [x] 18-03: Repair the shared publish regression so the automated validation gate is green again
- [x] 18-04: Close the live publish and refresh auth-failure reporting gaps found in human UAT

### Phase 19: Recovery Paths And Production Reliability Verification
**Goal**: Give operators supported recovery flows for publish error state and verify the real production failure-and-recovery path end to end.
**Depends on**: Phase 18
**Requirements**: [CTRL-02, CTRL-03]
**Success Criteria** (what must be TRUE):
  1. Repos can recover from publish error state and return to healthy shared publish mode through supported CLI flows.
  2. Production-readiness verification proves the stale-badge failure path, recovery path, and operator instructions against live repo state.
  3. Docs and checklists match the actual failure signals and recovery workflow used by the CLI.
**Plans**: 2 plans

Plans:
- [x] 19-01: Implement supported recovery flows for publish error and stale shared state
- [ ] 19-02: Add production reliability verification and operational runbooks for stale badge recovery

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 14. Shared Remote Contribution Model | 3/3 | Complete    | 2026-04-01 |
| 15. Cross-Publisher Deduplication And Publish Semantics | 2/2 | Complete | 2026-04-02 |
| 16. Migration, Diagnostics, And Team Operator UX | 2/2 | Complete    | 2026-04-02 |
| 17. Publish Failure Visibility And State Trust | 3/3 | Complete   | 2026-04-02 |
| 18. Auth, Hook, And Publish Readiness Hardening | 4/4 | Complete    | 2026-04-05 |
| 19. Recovery Paths And Production Reliability Verification | 1/2 | In Progress | — |
