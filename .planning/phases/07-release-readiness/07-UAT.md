---
status: complete
phase: 07-release-readiness
source:
  - 07-01-SUMMARY.md
  - 07-02-SUMMARY.md
  - 07-03-SUMMARY.md
started: 2026-03-31T09:36:14Z
updated: 2026-03-31T09:42:23Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running node services for this repo, clear local ephemeral state (`.agent-badge`, temp pack output, and temporary install dirs), then start from scratch (`npm ci`, `npm run build`, and `npm run test -- packages/agent-badge/src/commands/release-readiness-matrix.test.ts`). The repo should boot cleanly and the matrix test should pass without warm-state dependencies.
result: pass

### 2. Init Scenario Matrix Coverage
expected: Running `npm run test -- packages/agent-badge/src/commands/release-readiness-matrix.test.ts` should pass scenarios for fresh repo setup, re-run idempotency, provider combinations (Codex only, Claude only, both), no-README handling, no-origin, and no-auth behavior.
result: pass

### 3. CI Validate + Scenario Gate Definition
expected: `.github/workflows/ci.yml` should define a validate matrix on Node 20.x/22.x/24.x and a separate `scenario-matrix` gate job for the release-readiness matrix test file.
result: pass

### 4. Packed Install Smoke Script
expected: `bash scripts/smoke/verify-packed-install.sh` should complete successfully, proving tarballs install in an isolated temp project, imports work, and package binaries run.
result: pass

### 5. Release Workflow Publish Gates
expected: `.github/workflows/release.yml` should run typecheck/build/test/pack/smoke gates before publish and use a changesets-driven publish path with trusted publishing or `NPM_TOKEN` fallback.
result: pass

### 6. Release Documentation Discoverability
expected: `README.md` should include a Documentation section linking `docs/QUICKSTART.md`, `docs/ATTRIBUTION.md`, `docs/PRIVACY.md`, `docs/TROUBLESHOOTING.md`, and `docs/MANUAL-GIST.md`, and each linked document should exist.
result: pass

### 7. Docs Compliance Gate
expected: `npm run docs:check` should pass and enforce required release-doc content checks.
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

None yet.
