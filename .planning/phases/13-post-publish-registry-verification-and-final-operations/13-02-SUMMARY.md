---
phase: 13-post-publish-registry-verification-and-final-operations
plan: 02
subsystem: release
tags: [release, npm, github-actions, trusted-publishing, registry]
requires:
  - phase: 13-post-publish-registry-verification-and-final-operations
    plan: 01
    provides: exact-version registry smoke entrypoint and blocked 1.1.1 evidence
  - phase: 12-production-publish-execution
    provides: release evidence contract and workflow publish path
provides:
  - trusted-publishing release workflow with no legacy npm token dependency
  - refreshed Phase 12 publish evidence for the successful 1.1.2 GitHub Actions release
  - final passed registry smoke evidence and phase verification artifacts
affects: [release-operations, REL-09, OPER-07]
tech-stack:
  added: []
  patterns: [trusted-publishing workflow, workflow-backed release evidence, post-publish exact-version smoke]
key-files:
  created:
    - .planning/phases/13-post-publish-registry-verification-and-final-operations/13-02-SUMMARY.md
    - .planning/phases/13-post-publish-registry-verification-and-final-operations/13-UAT.md
    - .planning/phases/13-post-publish-registry-verification-and-final-operations/13-VERIFICATION.md
  modified:
    - .github/workflows/release.yml
    - docs/RELEASE.md
    - scripts/release/preflight.ts
    - scripts/verify-docs.sh
    - .planning/phases/12-production-publish-execution/12-PUBLISH-EVIDENCE.json
    - .planning/phases/12-production-publish-execution/12-PUBLISH-EVIDENCE.md
    - .planning/phases/12-production-publish-execution/12-UAT.md
    - .planning/phases/12-production-publish-execution/12-VERIFICATION.md
    - .planning/phases/12-production-publish-execution/12-preflight.json
    - .planning/phases/13-post-publish-registry-verification-and-final-operations/13-REGISTRY-SMOKE.json
    - .planning/phases/13-post-publish-registry-verification-and-final-operations/13-REGISTRY-SMOKE.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
key-decisions:
  - "Make GitHub Actions trusted publishing the only maintained production publish path and remove legacy `NPM_TOKEN` assumptions from active workflow/docs checks."
  - "Refresh Phase 12 evidence from the exact published workflow commit `dd5bd1f6269a2b61e42f7f4fb8ad31d0974d83f4` instead of whatever is currently checked out on `main`."
  - "Treat the final exact-version `1.1.2` registry smoke as the authority for closing REL-09 and OPER-07."
patterns-established:
  - "Release preflight validates the trusted-publishing workflow contract, not a long-lived npm token contract."
  - "Phase closeout docs should point at the final shipped version even if an earlier publish attempt existed."
requirements-completed: [REL-09, OPER-07]
duration: 22m
completed: 2026-04-01
status: completed
blockers: []
---

# Phase 13 Plan 02: Final release closeout summary

**Trusted publishing replaced the legacy token assumptions, Phase 12 evidence was refreshed to the real GitHub Actions release, and the final `1.1.2` registry smoke passed.**

## Verified repo-side outcomes

- Removed the stale `NPM_TOKEN` environment wiring from `.github/workflows/release.yml`; the release workflow now matches the successful OIDC trusted-publishing path.
- Updated `scripts/release/preflight.ts` so the workflow-contract check now requires `workflow_dispatch`, `permissions.id-token: write`, `changesets/action@v1`, and `publish: npm run release`.
- Rewrote `docs/RELEASE.md` and `scripts/verify-docs.sh` around one maintained production path: workflow publish, evidence capture, and exact-version registry smoke.
- Refreshed `.planning/phases/12-production-publish-execution/12-PUBLISH-EVIDENCE.json` and `.planning/phases/12-production-publish-execution/12-PUBLISH-EVIDENCE.md` from the exact published workflow commit `dd5bd1f6269a2b61e42f7f4fb8ad31d0974d83f4`.
- Re-ran the live registry smoke against `1.1.2`; both the runtime CLI path and `npm init agent-badge@1.1.2` passed and wrote final evidence.

## Live publish and smoke evidence

- Successful publish workflow:
  - run ID: `23848745561`
  - URL: `https://github.com/arlegotin/agent-badge/actions/runs/23848745561`
  - branch: `phase-13-repair-publish-1-1-2-v2`
  - commit: `dd5bd1f6269a2b61e42f7f4fb8ad31d0974d83f4`
  - completed at: `2026-04-01T12:33:40Z`
- Refreshed Phase 12 evidence now records:
  - `publishPath: github-actions`
  - all three publishable packages at `1.1.2`
  - successful workflow URL, run ID, and conclusion
- Final Phase 13 smoke now records:
  - `status: passed`
  - `version: 1.1.2`
  - runtime smoke: passed
  - initializer smoke: passed

## Notes on the saved preflight artifact

- `.planning/phases/12-production-publish-execution/12-preflight.json` was refreshed after `1.1.2` was already live.
- That means the saved file now proves the final trusted-publishing workflow contract and release-input inventory, but it no longer represents a pre-publish registry-availability snapshot.
- The authoritative publish proof for the repair release is the successful GitHub Actions run plus the refreshed Phase 12 evidence files.

## Next phase readiness

- Milestone `v1.2` is complete.
- The maintained release checklist now includes the exact post-publish smoke that proved the shipped npm artifacts work from a clean environment.
