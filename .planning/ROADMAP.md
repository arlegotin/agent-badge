# Roadmap: agent-badge

## Overview

Build `agent-badge` as a two-package local-first npm workspace that first establishes trustworthy repo identity and provider parsing, then layers historical attribution, aggregate-only publishing, fast refresh operations, and release hardening on top. The order is deliberate: correctness and privacy come before badge rendering, and operational recovery comes before public release.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Workspace and Init Foundation** - Establish the monorepo, shared runtime primitives, and safe init preflight/scaffolding. (completed 2026-03-30)
- [x] **Phase 2: Repo Identity and Provider Parsing** - Build the canonical repo model plus normalized Codex and Claude scanners. (completed 2026-03-30)
- [x] **Phase 3: Historical Backfill and Attribution Review** - Turn normalized sessions into trustworthy repo totals with ambiguity handling. (completed 2026-03-30)
- [x] **Phase 4: Publish and README Badge Integration** - Create/connect the public Gist, publish aggregate badge JSON, and insert the stable README badge. (completed 2026-03-30)
- [ ] **Phase 5: Incremental Refresh and Operator Commands** - Add fast refresh, status/config UX, and failure-soft automation.
- [ ] **Phase 6: Doctor, Uninstall, and Safety Hardening** - Make recovery, privacy, logging, and idempotent re-entry production-safe.
- [ ] **Phase 7: Release Readiness** - Validate the scenario matrix, finalize packaging, and ship public docs.

## Phase Details

### Phase 1: Workspace and Init Foundation
**Goal**: Deliver the repository structure, local runtime wiring, and init preflight/scaffolding needed for every later feature.
**Depends on**: Nothing (first phase)
**Requirements**: [BOOT-01, BOOT-02, BOOT-03, BOOT-04]
**UI hint**: no
**Success Criteria** (what must be TRUE):
  1. Maintainer can run both workspace packages locally with one shared build/test setup.
  2. `agent-badge init` can detect git state, README presence, package manager, provider paths, and GitHub auth prerequisites before mutating the repo.
  3. Init creates the `.agent-badge` directory structure and repo-local runtime wiring without requiring a global install.
  4. Re-running the preflight path on a clean repo does not create duplicate scaffolding.
**Plans**: 5/5 plans complete

Plans:
- [x] 01-01: Create workspace/package skeleton, shared TypeScript config, test harness, and release tooling baseline
- [x] 01-02: Implement shared config/state/log schemas and repo-local runtime invocation strategy
- [x] 01-03: Build init preflight, git bootstrap handling, and `.agent-badge` scaffolding flow
- [x] 01-04: Close the non-git bootstrap verification gap by creating git before scaffold writes
- [x] 01-05: Close the repo-local runtime wiring verification gap in init

### Phase 2: Repo Identity and Provider Parsing
**Goal**: Build the normalized repo and provider data model that all attribution logic depends on.
**Depends on**: Phase 1
**Requirements**: [ATTR-01, SCAN-01, SCAN-02, SCAN-03]
**UI hint**: no
**Success Criteria** (what must be TRUE):
  1. The tool can derive one canonical repo fingerprint from local git context and configured aliases.
  2. The runtime detects which providers are locally available and enables only those by default.
  3. Codex data under `~/.codex` can be parsed into deduped normalized session summaries.
  4. Claude data under `~/.claude` can be parsed into the same normalized session model.
**Plans**: 3/3 plans complete

Plans:
- [x] 02-01: Implement repo fingerprint, remote normalization, and alias-aware identity services
- [x] 02-02: Build the Codex adapter with fixture-backed normalized session output
- [x] 02-03: Build the Claude adapter and provider-detection defaults on top of the shared session schema

### Phase 3: Historical Backfill and Attribution Review
**Goal**: Turn normalized sessions into trustworthy repository totals and expose ambiguous cases safely.
**Depends on**: Phase 2
**Requirements**: [ATTR-02, ATTR-03, ATTR-04, ATTR-05, SCAN-05]
**UI hint**: no
**Success Criteria** (what must be TRUE):
  1. First run completes a full historical backfill before any first publish occurs.
  2. Attribution uses ordered evidence and excludes ambiguous sessions from totals by default.
  3. Approved or rejected ambiguous sessions persist as overrides and stay stable on later scans.
  4. `scan` shows included totals, ambiguous sessions, and excluded sessions in a human-readable report.
**Plans**: 3/3 plans complete

Plans:
- [x] 03-01: Implement full backfill orchestration and deduped aggregation by provider session
- [x] 03-02: Build evidence-based attribution scoring, ambiguity thresholds, and override persistence
- [x] 03-03: Produce the attribution report and checkpoint-aware state updates for completed scans

### Phase 4: Publish and README Badge Integration
**Goal**: Publish privacy-safe aggregate badge JSON and connect it to a stable README badge URL.
**Depends on**: Phase 3
**Requirements**: [BOOT-05, PUBL-01, PUBL-02, PUBL-03, PUBL-04]
**UI hint**: no
**Success Criteria** (what must be TRUE):
  1. Init can create a public Gist automatically when auth exists and can connect or defer cleanly when it does not.
  2. Publish writes aggregate-only Shields endpoint JSON with the expected badge fields.
  3. The README receives one stable badge URL or a pasteable snippet when no README exists.
  4. Re-running init or publish does not duplicate README badge entries.
**Plans**: 3/3 plans complete

Plans:
- [x] 04-01: Implement Gist create/connect flows and publish-state bookkeeping
- [x] 04-02: Serialize badge totals into Shields endpoint JSON and publish aggregate-only payloads
- [x] 04-03: Insert the stable README badge once and handle no-README/degraded paths cleanly

### Phase 5: Incremental Refresh and Operator Commands
**Goal**: Make day-to-day badge maintenance fast, transparent, and low-friction.
**Depends on**: Phase 4
**Requirements**: [SCAN-04, PUBL-05, OPER-01, OPER-02, OPER-03, OPER-04]
**UI hint**: no
**Success Criteria** (what must be TRUE):
  1. `refresh` performs an incremental scan from persisted checkpoints instead of a full historical rescan.
  2. Publish is skipped when the visible badge value has not changed.
  3. `status` shows totals, provider enablement, publish state, and checkpoint timestamps clearly.
  4. `config` can change badge mode, label, providers, privacy, and refresh settings after init.
  5. Default `pre-push` automation remains failure-soft and fast enough for normal git usage.
**Plans**: 2/3 plans complete

Plans:
- [x] 05-01: Implement incremental checkpoints and diff-aware publish decisions
- [x] 05-02: Build `refresh`, `status`, and `config` command flows on top of shared services
- [x] 05-03: Install and validate the lightweight failure-soft `pre-push` integration

### Phase 6: Doctor, Uninstall, and Safety Hardening
**Goal**: Close the production-readiness gaps around recovery, privacy, logging, and re-entry safety.
**Depends on**: Phase 5
**Requirements**: [OPER-05, SAFE-01, SAFE-02, SAFE-03, SAFE-04]
**UI hint**: no
**Success Criteria** (what must be TRUE):
  1. `doctor` verifies git, provider paths, scan access, Gist auth/write, Shields endpoint, README badge, and hook installation with actionable fixes.
  2. `uninstall` removes local integration cleanly without deleting remote badge data unless explicitly requested.
  3. Logs rotate under `.agent-badge/logs/` and contain summaries only.
  4. Published outputs and logs are audited to exclude transcripts, prompts, filenames, and local paths.
  5. Re-running init converges safely instead of duplicating badges, hooks, or Gists.
**Plans**: 3 plans

Plans:
- [ ] 06-01: Build `doctor` checks, result formatting, and common fix guidance
- [ ] 06-02: Implement `uninstall` plus reconciliation logic for safe re-init
- [ ] 06-03: Add log rotation, privacy guards, and idempotency coverage across setup/publish paths

### Phase 7: Release Readiness
**Goal**: Prove the product is ready for external developers to install and trust.
**Depends on**: Phase 6
**Requirements**: [REL-01, REL-02, REL-03]
**UI hint**: no
**Success Criteria** (what must be TRUE):
  1. CI validates builds, tests, and docs without requiring access to live provider directories.
  2. The supported scenario matrix is covered by smoke or fixture-backed tests.
  3. Public docs explain quickstart, attribution, privacy, troubleshooting, and manual Gist connection clearly.
  4. Both npm packages have a deliberate versioning and release path.
**Plans**: 3 plans

Plans:
- [ ] 07-01: Build CI and automated scenario coverage for the supported matrix
- [ ] 07-02: Add end-to-end packaging and smoke tests for runtime and initializer packages
- [ ] 07-03: Write the publish-time documentation and release runbook

## Progress

**Execution Order:**
Phases execute in numeric order: 2 -> 2.1 -> 2.2 -> 3 -> 3.1 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Workspace and Init Foundation | 5/5 | Complete | 2026-03-30 |
| 2. Repo Identity and Provider Parsing | 3/3 | Complete | 2026-03-30 |
| 3. Historical Backfill and Attribution Review | 3/3 | Complete | 2026-03-30 |
| 4. Publish and README Badge Integration | 3/3 | Complete | 2026-03-30 |
| 5. Incremental Refresh and Operator Commands | 2/3 | In Progress | - |
| 6. Doctor, Uninstall, and Safety Hardening | 0/3 | Not started | - |
| 7. Release Readiness | 0/3 | Not started | - |
