# Roadmap: agent-badge

## Overview

Phases 1 through 7 delivered the v1 product surface. Milestone v1.1 starts at Phase 8 and focuses only on ship readiness: recover green source-of-truth verification, convert the workspace packages into deliberate publishable artifacts, and rehearse the packed-install release flow under the repo's known npm-cache and disk-space constraints so current source can ship with no red gates.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 8: Verification Gate Recovery** - Restore green build, test, and schema-aware release verification from current source. Completed 2026-03-31.
- [x] **Phase 9: Package Metadata and Tarball Integrity** - Make the publishable workspace packages deliberate, versioned, and minimal. Completed 2026-03-31.
- [ ] **Phase 10: Release Rehearsal and Checklist** - Prove the packed-install flow and codify the constrained-environment release path.

## Phase Details

### Phase 8: Verification Gate Recovery
**Goal**: Maintainers can trust build, test, and release-critical verification results from current source again.
**Depends on**: Phase 7
**Requirements**: [REL-04, REL-05, REL-06]
**Success Criteria** (what must be TRUE):
  1. Maintainer can run `npm run build` from committed source on a supported Node version and get a successful workspace build with no TypeScript errors.
  2. Maintainer can run `npm test` from committed source and get passing doctor coverage plus Claude incremental refresh coverage.
  3. Release-critical verification passes against the current config/state schemas and current runtime behavior from a clean checkout without stale fixtures or stale build artifacts affecting the result.
**Plans**: 3 plans

Plans:
- [x] 08-01: Recover the TypeScript build gate and Octokit integration errors
- [x] 08-02: Repair doctor-test drift and Claude incremental refresh coverage
- [x] 08-03: Rebaseline clean-checkout verification for current schemas and artifact expectations

### Phase 9: Package Metadata and Tarball Integrity
**Goal**: The workspace packages are publishable as intentional npm artifacts rather than development placeholders.
**Depends on**: Phase 8
**Requirements**: [PACK-01, PACK-02]
**Success Criteria** (what must be TRUE):
  1. Maintainer can inspect `@agent-badge/core`, `agent-badge`, and `create-agent-badge` package manifests and see deliberate non-placeholder versions with correct internal dependency references.
  2. Maintainer can run the packaging flow for all three workspace packages successfully from current source.
  3. The produced tarballs include only the runtime/build/CLI files needed for install and execution and exclude tests, fixtures, and other non-runtime artifacts.
**Plans**: 2 plans

Plans:
- [x] 09-01: Set deliberate workspace versions and internal dependency references
- [x] 09-02: Tighten package file lists and validate tarball contents for all publishable packages

### Phase 10: Release Rehearsal and Checklist
**Goal**: The release path is proven end to end on a constrained developer machine and documented as one repeatable sequence.
**Depends on**: Phase 9
**Requirements**: [PACK-03, OPER-06]
**Success Criteria** (what must be TRUE):
  1. Maintainer can install the locally packed tarballs into a clean temporary project and invoke both exported CLIs successfully.
  2. Maintainer can follow one documented checklist to reproduce the packed-install proof even when isolated npm cache usage or temporary working space is required.
  3. The same checklist includes npm package-name verification and the final pre-publish checks in one place.
**Plans**: 2 plans

Plans:
- [ ] 10-01: Prove clean temporary-project install and CLI smoke flows from packed tarballs
- [ ] 10-02: Finalize the constrained-environment release checklist and publish-time preflight

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 8. Verification Gate Recovery | 3/3 | Complete | 2026-03-31 |
| 9. Package Metadata and Tarball Integrity | 2/2 | Complete | 2026-03-31 |
| 10. Release Rehearsal and Checklist | 0/2 | Not started | - |
