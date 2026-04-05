---
phase: 21
slug: external-release-blocker-audit-and-gate-repair
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-05
updated: 2026-04-05
---

# Phase 21 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` plus repo-owned shell artifact checks |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run scripts/release/preflight.test.ts` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~10-30 seconds for focused preflight tests plus any live registry/auth commands |

---

## Sampling Rate

- **After live blocker capture work:** Re-run `npm --silent run release:preflight -- --json` and validate the saved artifact plus readiness summary file.
- **After `scripts/release/preflight.ts` changes:** Run `npm test -- --run scripts/release/preflight.test.ts`.
- **After `docs/RELEASE.md` or `.planning/STATE.md` changes:** Run `npm run docs:check` plus focused grep checks for the new blocker vocabulary.
- **After every plan wave:** Run the plan-specific artifact checks and the focused preflight test suite.
- **Before `$gsd-verify-work`:** Focused tests, docs verification, and phase-owned readiness-gap artifacts must all be present and coherent.
- **Max feedback latency:** 30 seconds for focused tests and doc checks; live npm/registry confirmation is the explicit longer-running gate.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | REL-01 | live preflight capture | `npm --silent run release:preflight -- --json > .planning/phases/21-external-release-blocker-audit-and-gate-repair/21-preflight.json || true` | ✅ | ✅ green |
| 21-01-02 | 01 | 1 | REL-01, REL-02 | artifact audit | `test -f .planning/phases/21-external-release-blocker-audit-and-gate-repair/21-preflight.json && test -f .planning/phases/21-external-release-blocker-audit-and-gate-repair/21-EXTERNAL-READINESS.md && rg -n '"checks"|"packages"|"npm-auth"|workflow-contract' .planning/phases/21-external-release-blocker-audit-and-gate-repair/21-preflight.json && rg -n '## Local release gates|## Live external blockers|## Manual confirmations still required|trusted publisher|package ownership|version drift' .planning/phases/21-external-release-blocker-audit-and-gate-repair/21-EXTERNAL-READINESS.md` | ✅ | ✅ green |
| 21-02-01 | 02 | 2 | REL-02 | focused contract tests | `npm test -- --run scripts/release/preflight.test.ts` | ✅ | ✅ green |
| 21-02-02 | 02 | 2 | REL-01, REL-02 | docs and planning-state verification | `npm run docs:check && rg -n 'locally green|externally blocked|trusted-publisher|package ownership|version drift|npm auth' docs/RELEASE.md scripts/release/preflight.ts .planning/STATE.md` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Existing focused test coverage already exists for `scripts/release/preflight.ts`
- [x] No new runtime framework or test harness is required
- [x] Phase-owned artifact capture can use the existing `release:preflight -- --json` contract
- [x] Docs verification stays on the repo-owned `npm run docs:check` entrypoint

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Confirming the current maintainer environment's npm auth state | REL-01, REL-02 | `npm whoami` depends on real maintainer credentials and cannot be mocked for production proof | Run `npm whoami` or `npm run release:preflight -- --json`, then record whether auth is missing and which remediation is required. |
| Confirming npm package ownership and GitHub Actions trusted-publisher state | REL-02 | Local repo tooling cannot prove remote registry owner/trusted-publisher configuration by itself | Record the exact remote confirmation result in `21-EXTERNAL-READINESS.md`, including whether ownership is verified and whether the npm packages trust `arlegotin/agent-badge` with workflow `release.yml`. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or explicit manual-only gates
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all required infrastructure
- [x] No watch-mode flags
- [x] Focused feedback loop is under 30 seconds for local verification
- [x] `nyquist_compliant: true` set in frontmatter after the task map was finalized

**Approval:** approved 2026-04-05

## Validation Audit 2026-04-05

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
