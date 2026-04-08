# Roadmap: agent-badge

## Overview

Milestone v2.0 changes `agent-badge` from repo-local runtime wiring to a global or user-scoped CLI model. The goal is to keep initialization one-command while leaving only repo-specific state and automation artifacts inside target repositories.

## Current Planning State

Active milestone:
- 🔄 **v2.0 Global Runtime and Minimal Repo Footprint** — kickoff complete on 2026-04-08

Latest shipped milestone:
- ✅ [`v1.5 Production Readiness Closure`](./milestones/v1.5-ROADMAP.md) — shipped 2026-04-05
- ✅ [`v1.4 Publish Reliability Hardening`](./milestones/v1.4-ROADMAP.md) — shipped 2026-04-05

Next workflow entrypoint:
- `$gsd-discuss-phase 25`
- or `$gsd-plan-phase 25`

## Current Milestone: v2.0 Global Runtime and Minimal Repo Footprint

This milestone removes repo-local runtime installation from initialized repositories, switches command execution to a global or user-scoped CLI contract, and keeps repo-local artifacts intentionally minimal.

## Milestones

- 🔄 **v2.0 Global Runtime and Minimal Repo Footprint** — Phases 25-27 (planned)
  Goal: Remove repo-local runtime installation from initialized repos, switch execution to a global or user-scoped CLI contract, and keep repo artifacts minimal.
  Status: Milestone initialized on 2026-04-08
- ✅ **v1.5 Production Readiness Closure** — Phases 21-24 (shipped 2026-04-05)
  Archive: `.planning/milestones/v1.5-ROADMAP.md`
- ✅ **v1.4 Publish Reliability Hardening** — Phases 14-20 (shipped 2026-04-05)
  Archive: `.planning/milestones/v1.4-ROADMAP.md`

## Phases

- [ ] **Phase 25: Global Runtime Contract And Command Resolution** - Replace repo-local command assumptions with a shared CLI contract, runtime detection, and migration-safe execution paths.
- [ ] **Phase 26: Minimal Repo Scaffold And Init Rewire** - Remove repo-local runtime installation from init and leave only repo-owned artifacts with idempotent scaffolding.
- [ ] **Phase 27: Legacy Migration, Uninstall, And Release Proof** - Migrate existing repos safely and prove docs, uninstall, and smoke verification for the new install model.

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

### Phase 25: Global Runtime Contract And Command Resolution
**Goal**: Define the runtime discovery and invocation contract used by init, refresh, config, uninstall, and managed hooks without relying on repo-local binaries.
**Depends on**: Phase 24
**Requirements**: [DIST-03, AUTO-01]
**Success Criteria** (what must be TRUE):
  1. Core runtime command builders and generated hook entrypoints no longer assume `npx --no-install`, package-manager exec wrappers, or `node_modules/.bin`.
  2. The CLI can detect whether a shared `agent-badge` runtime is available and emits actionable remediation when it is not.
  3. The shared runtime contract is test-covered across supported package-manager contexts without regressing idempotent reruns or privacy guarantees.
**Plans**: 2 plans

Plans:
- [ ] 25-01-PLAN.md — Establish the shared PATH-based runtime contract and canonical managed hook writer
- [ ] 25-02-PLAN.md — Propagate the shared runtime contract through operator surfaces and compatibility proof

### Phase 26: Minimal Repo Scaffold And Init Rewire
**Goal**: Make the initializer and scaffold global-first, leaving minimal repo artifacts and no repo-local runtime install by default.
**Depends on**: Phase 25
**Requirements**: [DIST-01, DIST-02, ART-01, ART-02]
**Success Criteria** (what must be TRUE):
  1. `npm init agent-badge@latest` completes without adding `@legotin/agent-badge` to repo manifests or creating repo-local `node_modules` by default.
  2. Repo-local artifacts are limited to `.agent-badge/`, README badge markup, gitignore entries, and optional hook content owned by the tool.
  3. Re-running init preserves idempotency and keeps repo-local artifacts minimal even in repositories that already contain prior agent-badge setup.
**Plans**: 2 plans

Plans:
- [ ] 26-01: Remove repo-local runtime install and package manifest mutation from initializer flows
- [ ] 26-02: Reconcile scaffold, README, gitignore, and idempotency semantics for the minimal-artifact model

### Phase 27: Legacy Migration, Uninstall, And Release Proof
**Goal**: Migrate legacy repo-local installs safely and prove docs, uninstall, and release verification for the new distribution model.
**Depends on**: Phase 26
**Requirements**: [MIG-01, MIG-02]
**Success Criteria** (what must be TRUE):
  1. Repositories previously initialized under the repo-local model can migrate cleanly without losing refresh, publish, status, doctor, or uninstall behavior.
  2. Operator docs, help text, and uninstall flows accurately describe the global or user-scoped install model and cleanup expectations.
  3. Clean temp install and registry smoke verification prove the released initializer and runtime no longer create repo-local runtime artifacts by default.
**Plans**: 3 plans

Plans:
- [ ] 27-01: Add migration and uninstall support for legacy repo-local setups
- [ ] 27-02: Update docs and command help for global-first installation
- [ ] 27-03: Extend registry and clean-temp smoke coverage for minimal repo artifacts

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 25. Global Runtime Contract And Command Resolution | 0/2 | Not started | - |
| 26. Minimal Repo Scaffold And Init Rewire | 0/2 | Not started | - |
| 27. Legacy Migration, Uninstall, And Release Proof | 0/3 | Not started | - |
