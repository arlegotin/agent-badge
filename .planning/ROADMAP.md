# Roadmap: agent-badge

## Overview

Phases 1 through 10 turned `agent-badge` into a release candidate with green local verification, deliberate package metadata, exact packed-install rehearsal, and a constrained-environment release checklist. Milestone v1.2 focuses on the remaining external proof: validating live registry and credential state, executing the real production publish path, and confirming the shipped packages from the npm registry after release.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 11: Registry Preflight and Release Environment Validation** - Prove that package-name state, release credentials, and workflow prerequisites are safe before production publish.
- [ ] **Phase 12: Production Publish Execution** - Execute the intended production publish path and capture real release evidence from current source.
- [ ] **Phase 13: Post-Publish Registry Verification and Final Operations** - Verify the actual published artifacts from npm and finalize the production operator checklist.

## Phase Details

### Phase 11: Registry Preflight and Release Environment Validation
**Goal**: Fail fast on real production publish blockers before attempting the first public release.
**Depends on**: Phase 10
**Requirements**: [REL-07]
**Success Criteria** (what must be TRUE):
  1. Maintainer can run a repo-owned preflight flow that checks live npm registry state for `agent-badge`, `create-agent-badge`, and `@agent-badge/core` and clearly reports safe versus blocked outcomes.
  2. Maintainer can verify the intended release environment has the required npm and GitHub credentials, workflow prerequisites, and changeset/release inputs before starting the real publish.
  3. Any package-name conflict, auth gap, or release-environment blocker is surfaced before Phase 12 begins.
**Plans**: 2 plans

Plans:
- [ ] 11-01: Add a repo-owned live registry preflight and decision record for publish readiness
- [ ] 11-02: Validate release credentials, secrets, and GitHub Actions prerequisites before production publish

### Phase 12: Production Publish Execution
**Goal**: Publish the current source through the intended release path and record trustworthy release evidence.
**Depends on**: Phase 11
**Requirements**: [REL-08]
**Success Criteria** (what must be TRUE):
  1. Maintainer can execute the real production publish path with release credentials and successfully ship the current source.
  2. The intended GitHub Actions release workflow, or the explicitly chosen release path, completes successfully and leaves recorded evidence of the publish outcome.
  3. Published versions, package list, and release outputs match the deliberate artifacts prepared in earlier milestones, with no undocumented manual recovery steps.
**Plans**: 2 plans

Plans:
- [ ] 12-01: Align the production publish path and release-evidence capture with the real operator workflow
- [ ] 12-02: Execute and document the first production publish from current source

### Phase 13: Post-Publish Registry Verification and Final Operations
**Goal**: Prove that the actual published packages work from the npm registry and that maintainers have a complete production runbook.
**Depends on**: Phase 12
**Requirements**: [REL-09, OPER-07]
**Success Criteria** (what must be TRUE):
  1. Maintainer can install the published `agent-badge`, `create-agent-badge`, and `@agent-badge/core` artifacts from the npm registry in a fresh environment and verify the shipped CLI and initializer behavior.
  2. The production release checklist includes registry preflight, publish execution, GitHub Actions confirmation, and post-publish smoke verification in one maintained place.
  3. The repo contains recorded evidence that the real published artifacts, not only local tarballs, satisfy the production smoke expectations.
**Plans**: 2 plans

Plans:
- [ ] 13-01: Verify published registry artifacts in a fresh install environment
- [ ] 13-02: Finalize the production release checklist and operator evidence trail

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 11. Registry Preflight and Release Environment Validation | 0/2 | Not started | - |
| 12. Production Publish Execution | 0/2 | Not started | - |
| 13. Post-Publish Registry Verification and Final Operations | 0/2 | Not started | - |
