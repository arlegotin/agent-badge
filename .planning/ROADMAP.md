# Roadmap: agent-badge

## Overview

The latest shipped work is archived under `.planning/milestones/`. The root roadmap remains milestone-oriented, but an active milestone now exists again: convert the repo from locally releaseable to externally proven production-ready by resolving live release blockers and refreshing public release evidence.

## Current Planning State

Active milestone:
- 🚧 **v1.5 Production Readiness Closure** — Phases 21-24 (started 2026-04-05)

Latest shipped milestone:
- ✅ [`v1.4 Publish Reliability Hardening`](./milestones/v1.4-ROADMAP.md) — shipped 2026-04-05

Next workflow entrypoint:
- `$gsd-plan-phase 21`

## Milestones

- 🚧 **v1.5 Production Readiness Closure** — Phases 21-24 (started 2026-04-05)
- ✅ **v1.4 Publish Reliability Hardening** — Phases 14-20 (shipped 2026-04-05)
  Archive: `.planning/milestones/v1.4-ROADMAP.md`

## Phases

### v1.5 Production Readiness Closure

- [x] **Phase 21: External Release Blocker Audit And Gate Repair** - Turn the remaining live preflight blockers into explicit repo-owned requirements, diagnostics, and remediation.
- [x] **Phase 22: Trusted Publish Execution And Evidence Capture** - Publish the current source through the canonical GitHub Actions trusted-publishing path and capture exact release evidence.
- [ ] **Phase 23: Post-Publish Registry Verification And Version Alignment** - Prove the released npm artifacts and initializer from a clean install path and reconcile any version drift or doc mismatch.
- [ ] **Phase 24: Production Ready Exit Criteria And Closeout** - Define the explicit go or no-go bar for “100% production ready” and close the milestone only when evidence meets it.

<details>
<summary>✅ v1.4 Publish Reliability Hardening (Phases 14-20) — SHIPPED 2026-04-05</summary>

- [x] Phase 14: Shared Remote Contribution Model (3/3 plans) — completed 2026-04-01
- [x] Phase 15: Cross-Publisher Deduplication And Publish Semantics (2/2 plans) — completed 2026-04-02
- [x] Phase 16: Migration, Diagnostics, And Team Operator UX (2/2 plans) — completed 2026-04-02
- [x] Phase 17: Publish Failure Visibility And State Trust (3/3 plans) — completed 2026-04-02
- [x] Phase 18: Auth, Hook, And Publish Readiness Hardening (4/4 plans) — completed 2026-04-05
- [x] Phase 19: Recovery Paths And Production Reliability Verification (2/2 plans) — completed 2026-04-05
- [x] Phase 20: Verification Artifact Closure And Audit Recovery (2/2 plans) — completed 2026-04-05

</details>

## Phase Details

### Phase 21: External Release Blocker Audit And Gate Repair
**Goal**: Close the gap between local release confidence and live external release readiness by making the remaining blockers explicit, reproducible, and actionable.
**Depends on**: Phase 20
**Requirements**: [REL-01, REL-02]
**Success Criteria** (what must be TRUE):
  1. The repo can state exactly why a current source tree is not yet production-ready when live preflight is blocked.
  2. Preflight, state, and docs distinguish auth, trusted-publisher, ownership, and version-drift problems instead of collapsing them into generic release uncertainty.
  3. The remaining external blockers are converted into repo-owned work items rather than tribal knowledge.
**Plans**: 2 plans

Plans:
- [x] 21-01: Audit live release blockers and reconcile the exact external readiness gap
- [x] 21-02: Repair preflight, docs, and planning state around blocker classification

### Phase 22: Trusted Publish Execution And Evidence Capture
**Goal**: Execute one successful production publish from the maintained GitHub Actions workflow and capture the exact evidence needed to treat that release path as proven.
**Depends on**: Phase 21
**Requirements**: [PUB-01, PUB-02]
**Success Criteria** (what must be TRUE):
  1. The canonical GitHub Actions workflow publishes the current source without falling back to a local manual publish path.
  2. The release evidence records the exact workflow run, published version, and outcome for all three publishable packages.
  3. The released version is traceable from source manifests, workflow evidence, and npm-visible package metadata.
**Plans**: 2 plans

Plans:
- [x] 22-01: Execute the trusted-publishing release path for the current source
- [ ] 22-02: Capture and verify production publish evidence

### Phase 23: Post-Publish Registry Verification And Version Alignment
**Goal**: Prove the live registry artifacts for the released version from a clean temp directory and reconcile any remaining version, dist-tag, or documentation mismatch.
**Depends on**: Phase 22
**Requirements**: [REG-01, REG-02]
**Success Criteria** (what must be TRUE):
  1. The exact released registry artifacts install and run successfully from a clean temp directory.
  2. `npm init agent-badge@latest` resolves to the intended initializer and works for the released version.
  3. Package versions, tags, internal dependency references, and operator docs all align with what npm shows publicly.
**Plans**: 2 plans

Plans:
- [ ] 23-01: Run live registry smoke verification for the released version
- [ ] 23-02: Repair version-alignment or registry-surface issues and rerun verification if needed

### Phase 24: Production Ready Exit Criteria And Closeout
**Goal**: Make the repo’s production-ready claim explicit, evidence-backed, and hard to overstate, then close the milestone with consistent planning artifacts.
**Depends on**: Phase 23
**Requirements**: [READY-01, READY-02]
**Success Criteria** (what must be TRUE):
  1. The repo has a written go or no-go standard for calling itself production ready, and the current state meets that standard.
  2. Any unresolved external blockers are called out explicitly as blockers instead of being hidden behind local green checks.
  3. PROJECT, REQUIREMENTS, ROADMAP, STATE, and milestone evidence agree on the final readiness verdict.
**Plans**: 2 plans

Plans:
- [ ] 24-01: Define and verify production-ready exit criteria
- [ ] 24-02: Close the milestone with aligned docs, traceability, and readiness verdict

## Progress

| Milestone | Status | Phases | Shipped |
|-----------|--------|--------|---------|
| v1.5 Production Readiness Closure | In progress | 21-24 | - |
| v1.4 Publish Reliability Hardening | Complete | 14-20 | 2026-04-05 |
