---
phase: 11
slug: registry-preflight-and-release-environment-validation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-31
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + repo-owned release preflight command |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run scripts/release/preflight.test.ts` |
| **Full suite command** | `npm run docs:check && npm run typecheck && npm test -- --run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run the targeted preflight test file or the exact targeted `npm test -- --run ...` command for touched release-preflight logic.
- **After every plan wave:** Run `npm run docs:check && npm run typecheck && npm test -- --run`.
- **Before `$gsd-verify-work`:** Full suite must be green, then run the live repo-owned preflight manually from a networked maintainer environment.
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | REL-07 | unit | `npm test -- --run scripts/release/preflight.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | REL-07 | script assertion | `rg -n 'release:preflight|npm view agent-badge|npm view create-agent-badge|npm view @agent-badge/core' package.json scripts/release/preflight.ts docs/RELEASE.md` | ❌ W0 | ⬜ pending |
| 11-02-01 | 02 | 2 | REL-07 | unit | `npm test -- --run scripts/release/preflight.test.ts` | ❌ W0 | ⬜ pending |
| 11-02-02 | 02 | 2 | REL-07 | docs/workflow assertion | `rg -n 'NPM_TOKEN|changesets/action@v1|npm run release|release:preflight' .github/workflows/release.yml docs/RELEASE.md scripts/verify-docs.sh package.json` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/release/preflight.test.ts` — targeted test coverage for registry/auth/workflow classification logic
- [ ] `scripts/release/preflight.ts` — repo-owned preflight command surface that the tests exercise

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live npm registry state is classified correctly for all three publishable packages | REL-07 | Requires current external registry responses and maintainer network access | Run `npm run release:preflight` immediately before publish and confirm the report includes `agent-badge`, `create-agent-badge`, and `@agent-badge/core` with an unambiguous overall decision |
| npm auth and release-operator identity are actually usable from the maintainer environment | REL-07 | Requires real credentials that are not available in automated tests | Run `npm run release:preflight` with real npm auth configured and confirm the report passes the auth checks or prints the exact blocker |
| GitHub Actions prerequisites are understood by the operator before Phase 12 | REL-07 | Secret presence/value may require human confirmation even if workflow-contract checks are automated | Confirm the preflight output or `docs/RELEASE.md` explicitly identifies the `NPM_TOKEN` workflow dependency and any manual follow-up needed before production publish |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
