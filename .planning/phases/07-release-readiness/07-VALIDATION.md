---
phase: 07
slug: release-readiness
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-31
---

# Phase 07 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm run typecheck && npm run build && npm test -- --run` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run `npm run typecheck && npm run build && npm test -- --run`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 1 | REL-02 | CI pipeline | `npm ci && npm run typecheck && npm run build && npm test -- --run` | ❌ `.github/workflows/ci.yml` missing | ⬜ pending |
| 7-01-02 | 01 | 1 | REL-01 | fixture integration | `npm test -- --run packages/agent-badge/src/commands/init.test.ts packages/core/src/init/preflight.test.ts packages/core/src/repo/repo-fingerprint.test.ts packages/core/src/init/default-config.test.ts` | ✅ coverage exists, matrix umbrella test needed | ⬜ pending |
| 7-02-01 | 02 | 2 | REL-01, REL-02 | packaging smoke | `npm pack --dry-run --json && bash scripts/smoke/verify-packed-install.sh` | ❌ smoke script missing | ⬜ pending |
| 7-02-02 | 02 | 2 | REL-02 | release automation | `test -f .github/workflows/release.yml && npm run build && npm test -- --run` | ❌ workflow missing | ⬜ pending |
| 7-03-01 | 03 | 3 | REL-03 | docs presence | `test -f docs/QUICKSTART.md && test -f docs/ATTRIBUTION.md && test -f docs/PRIVACY.md && test -f docs/TROUBLESHOOTING.md && test -f docs/MANUAL-GIST.md` | ❌ docs set missing | ⬜ pending |
| 7-03-02 | 03 | 3 | REL-03 | docs integrity | `rg -n "quickstart|privacy|troubleshooting|manual gist|attribution" README.md docs/*.md` | ❌ depends on docs creation | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `.github/workflows/ci.yml` - matrix build/typecheck/test/docs/pack smoke gate
- [ ] `.github/workflows/release.yml` - changesets release PR/publish automation
- [ ] `scripts/smoke/verify-packed-install.sh` - tarball install/import smoke test
- [ ] `docs/QUICKSTART.md` - installation and first run path
- [ ] `docs/ATTRIBUTION.md` - attribution and counting model
- [ ] `docs/PRIVACY.md` - local-only data handling and publish boundaries
- [ ] `docs/TROUBLESHOOTING.md` - common failures and recovery commands
- [ ] `docs/MANUAL-GIST.md` - manual gist bootstrap and reconnect path
- [ ] package dependency strategy change to avoid published `file:` runtime deps

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Badge docs clarity for new users | REL-03 | readability and sequencing quality cannot be fully asserted by grep | Follow docs from a clean clone and verify quickstart reaches a rendered README badge without hidden setup assumptions. |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s for phase-level verification runs
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
