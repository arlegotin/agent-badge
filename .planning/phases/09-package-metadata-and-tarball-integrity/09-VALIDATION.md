---
phase: 9
slug: package-metadata-and-tarball-integrity
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-31
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + npm pack dry-run inspection |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/config.test.ts` |
| **Full suite command** | `npm run build && npm test -- --run && npm_config_cache=/tmp/agent-badge-npm-cache npm run pack:check` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run the exact targeted `npm test -- --run ...` command for touched version/wiring code, or `npm_config_cache=/tmp/agent-badge-npm-cache npm run pack:check` for tarball-content work.
- **After every plan wave:** Run `npm run build && npm test -- --run && npm_config_cache=/tmp/agent-badge-npm-cache npm run pack:check`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | PACK-01 | targeted test | `npm test -- --run packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/config.test.ts` | ✅ | ✅ green |
| 09-01-02 | 01 | 1 | PACK-01 | manifest assertion | `rg -n '"version": "1\\.1\\.0"|"@agent-badge/core": "\\^1\\.1\\.0"|"agent-badge": "\\^1\\.1\\.0"' packages/core/package.json packages/agent-badge/package.json packages/create-agent-badge/package.json && ! rg -n '"version": "0\\.0\\.0"|"@agent-badge/core": "\\^0\\.0\\.0"|"agent-badge": "\\^0\\.0\\.0"' packages/core/package.json packages/agent-badge/package.json packages/create-agent-badge/package.json` | ✅ | ✅ green |
| 09-02-01 | 02 | 2 | PACK-02 | packaging dry-run | `npm_config_cache=/tmp/agent-badge-npm-cache npm run pack:check` | ✅ | ✅ green |
| 09-02-02 | 02 | 2 | PACK-02 | tarball-content assertion | `test -f scripts/check-packages.mjs && rg -n 'dist/index.js|dist/index.d.ts|dist/cli/main.js|dist/cli/main.d.ts|package.json|process.exitCode = 1' scripts/check-packages.mjs` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `scripts/check-packages.mjs` — repo-owned tarball content checker for PACK-02
- [x] Existing infrastructure covers the remaining Phase 09 verification needs.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Packed install still works from tarballs in a normal networked environment | PACK-02 | Requires a dependency-install path outside the sandboxed workspace environment | Completed on 2026-03-31 by running `bash scripts/smoke/verify-packed-install.sh` outside the sandbox; both package imports and both CLI `--help` checks succeeded |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved
