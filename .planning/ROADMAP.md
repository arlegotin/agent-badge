# Roadmap: agent-badge

## Overview

Phases 1 through 13 established the local-first scanning model, conservative attribution, stable gist-backed badge publishing, operator tooling, and the production release path. The next milestone addresses the most important remaining product correctness gap: multiple users on the same repo do not currently contribute to one correct shared badge total because publishing still overwrites a single aggregate payload.

Milestone v1.3 focuses on replacing that last-writer-wins model with a merge-safe shared publishing architecture that preserves privacy, local-first collection, and stable badge URLs.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 14: Shared Remote Contribution Model** - Define and implement a merge-safe remote representation for per-contributor repo usage and shared override state.
- [ ] **Phase 15: Cross-Publisher Deduplication And Publish Semantics** - Merge contributor state deterministically by stable session identity so shared totals converge without double counting.
- [ ] **Phase 16: Migration, Diagnostics, And Team Operator UX** - Migrate existing single-writer repos safely and expose clear operator flows for shared badge state.

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
- [ ] 15-01: Implement deterministic cross-publisher merge and deduplication rules
- [ ] 15-02: Validate convergence, conflict handling, and shared override behavior

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
- [ ] 16-01: Add migration path and diagnostics for existing repos
- [ ] 16-02: Finalize team operator UX, docs, and verification

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 14. Shared Remote Contribution Model | 3/3 | Complete    | 2026-04-01 |
| 15. Cross-Publisher Deduplication And Publish Semantics | 0/2 | Pending | — |
| 16. Migration, Diagnostics, And Team Operator UX | 0/2 | Pending | — |
