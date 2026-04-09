---
phase: 10
slug: release-rehearsal-and-checklist
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-31
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | repo-owned bash scripts + vitest-adjacent regression checks |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `find packages -type d -name dist -prune -exec rm -rf {} + && find packages -type f -name '*.tsbuildinfo' -delete && npm_config_cache=/tmp/agent-badge-npm-cache bash scripts/smoke/verify-packed-install.sh` |
| **Full suite command** | `npm run docs:check && npm run verify:clean-checkout` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `find packages -type d -name dist -prune -exec rm -rf {} + && find packages -type f -name '*.tsbuildinfo' -delete && npm_config_cache=/tmp/agent-badge-npm-cache bash scripts/smoke/verify-packed-install.sh` for packed-install script work, or the smallest doc verification/readback command that proves checklist updates are wired correctly.
- **After every plan wave:** Run `npm run docs:check && npm run verify:clean-checkout`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | PACK-03 | packed-install smoke | `find packages -type d -name dist -prune -exec rm -rf {} + && find packages -type f -name '*.tsbuildinfo' -delete && npm_config_cache=/tmp/agent-badge-npm-cache bash scripts/smoke/verify-packed-install.sh` | ✅ | ⬜ pending |
| 10-01-02 | 01 | 1 | PACK-03 | script contract assertion | `rg -n 'npm pack --workspace packages/core|npm pack --workspace packages/agent-badge|npm pack --workspace packages/create-agent-badge|agent-badge --help|create-agent-badge --help' scripts/smoke/verify-packed-install.sh` | ✅ | ⬜ pending |
| 10-02-01 | 02 | 2 | OPER-06 | docs verification | `npm run docs:check` | ✅ | ⬜ pending |
| 10-02-02 | 02 | 2 | OPER-06 | checklist content assertion | `rg -n 'npm run verify:clean-checkout|npm run smoke:pack|npm view agent-badge|npm_config_cache|/tmp' docs/RELEASE.md README.md scripts/verify-docs.sh` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Existing infrastructure covers all Phase 10 validation needs; no new test framework or runner is required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| npm package-name verification for `agent-badge`, `create-agent-badge`, and `@agent-badge/core` before publish | OPER-06 | Requires live registry access and current package-availability state | Run `npm view agent-badge name version`, `npm view create-agent-badge name version`, and `npm view @agent-badge/core name version` immediately before publish and record the results in the phase verification summary |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 45s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-31
