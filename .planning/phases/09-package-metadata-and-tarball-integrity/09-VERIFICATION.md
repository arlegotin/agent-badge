---
phase: 09-package-metadata-and-tarball-integrity
verified: 2026-03-31T11:31:36Z
status: passed
score: 3/3 must-haves verified
human_verification: []
---

# Phase 09: Package Metadata and Tarball Integrity Verification Report

**Phase Goal:** The workspace packages are publishable as intentional npm artifacts rather than development placeholders.
**Verified:** 2026-03-31T11:31:36Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Maintainers can inspect the publishable workspace manifests and see deliberate `1.1.0` versions with correct internal dependency references. | ✓ VERIFIED | `packages/core/package.json`, `packages/agent-badge/package.json`, and `packages/create-agent-badge/package.json` all now ship version `1.1.0`. `agent-badge` depends on `@agent-badge/core` at `^1.1.0`, `create-agent-badge` depends on `agent-badge` at `^1.1.0`, and `packages/agent-badge/src/commands/init.test.ts` asserts the repo-local runtime wiring matches that published contract. |
| 2 | Maintainers can run one repo-owned pack gate that fails on non-runtime tarball content and missing runtime entrypoints. | ✓ VERIFIED | `scripts/check-packages.mjs` shells out to `npm pack --workspace ... --dry-run --json`, allows only `dist/**` plus `package.json`, and requires the explicit runtime entrypoints for all three publishable packages. `package.json` routes `pack:check` through that script, and `npm_config_cache=/tmp/agent-badge-npm-cache npm run pack:check` passed. |
| 3 | The packed-install and clean-checkout release path succeeds from the current source with the stricter tarball gate in place. | ✓ VERIFIED | `bash scripts/smoke/verify-packed-install.sh` passed outside the sandbox with both package imports and both CLI `--help` checks succeeding. `bash scripts/verify-clean-checkout.sh` passed end to end with build, the full test suite (33 files / 172 tests), the stricter `pack:check`, and the packed-install smoke step. |

**Score:** 3/3 truths verified

### Plan Completion Evidence

| Plan | Status | Evidence |
| --- | --- | --- |
| 09-01 | Complete | Commit `96b501d`; summary `.planning/phases/09-package-metadata-and-tarball-integrity/09-01-SUMMARY.md` |
| 09-02 | Complete | Commit `42740a6`; summary `.planning/phases/09-package-metadata-and-tarball-integrity/09-02-SUMMARY.md` |

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `packages/core/package.json` | Deliberate published core package version | ✓ VERIFIED | Version is `1.1.0`. |
| `packages/agent-badge/package.json` | Deliberate CLI version and `@agent-badge/core` publishable dependency range | ✓ VERIFIED | Version is `1.1.0`; dependency is `^1.1.0`. |
| `packages/create-agent-badge/package.json` | Deliberate initializer version and `agent-badge` publishable dependency range | ✓ VERIFIED | Version is `1.1.0`; dependency is `^1.1.0`. |
| `packages/agent-badge/src/commands/init.test.ts` | Runtime-wiring regression coverage follows the published dependency contract | ✓ VERIFIED | Test derives the expected runtime specifier from the runtime manifest and explicitly checks `"agent-badge": "^1.1.0"` in the initializer manifest. |
| `scripts/check-packages.mjs` | Repo-owned tarball integrity checker | ✓ VERIFIED | Script defines all three publishable workspaces, explicit required runtime files, and `process.exitCode = 1` on failure. |
| `package.json` | Root `pack:check` entrypoint uses the checker script | ✓ VERIFIED | Script is `"pack:check": "node scripts/check-packages.mjs"`. |
| `scripts/verify-clean-checkout.sh` | Release-critical path reuses the stricter pack gate before smoke install | ✓ VERIFIED | Clean-checkout verifier calls `npm run build`, `npm test -- --run`, `npm_config_cache="${NPM_CACHE_DIR}" npm run pack:check`, then `npm_config_cache="${NPM_CACHE_DIR}" npm run smoke:pack`. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `packages/agent-badge/package.json` | `packages/core/package.json` | `@agent-badge/core: "^1.1.0"` | ✓ WIRED | Runtime package depends on the deliberate core version range. |
| `packages/create-agent-badge/package.json` | `packages/agent-badge/package.json` | `agent-badge: "^1.1.0"` | ✓ WIRED | Initializer package depends on the deliberate runtime version range. |
| `package.json` | `scripts/check-packages.mjs` | `pack:check` script entrypoint | ✓ WIRED | Root packaging verification delegates to the checker script. |
| `scripts/verify-clean-checkout.sh` | `package.json` | `npm run pack:check` and `npm run smoke:pack` | ✓ WIRED | Clean-checkout verification reuses the strict tarball gate before smoke install. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Runtime-wiring regression coverage | `npm test -- --run packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/config.test.ts` | 2 files / 18 tests passed | ✓ PASS |
| Stricter tarball gate | `npm_config_cache=/tmp/agent-badge-npm-cache npm run pack:check` | All three publishable packages passed the allowlist and required-entrypoint checks | ✓ PASS |
| Packed-install smoke proof | `bash scripts/smoke/verify-packed-install.sh` | `agent-badge` import ok, `create-agent-badge` import ok, both CLI help checks passed | ✓ PASS |
| Clean-checkout release path | `bash scripts/verify-clean-checkout.sh` | Build passed, 33 files / 172 tests passed, stricter pack check passed, packed-install smoke passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `PACK-01` | `09-01-PLAN.md` | Publishable manifests use deliberate non-placeholder versions and correct internal dependency references. | ✓ SATISFIED | All three publishable package manifests now use `1.1.0`, internal dependency ranges are `^1.1.0`, the lockfile is synchronized, and the init regression test expects the same publishable runtime contract. |
| `PACK-02` | `09-02-PLAN.md` | Published tarballs exclude non-runtime artifacts while retaining required runtime and CLI entrypoints. | ✓ SATISFIED | `scripts/check-packages.mjs` enforces the tarball allowlist and required entrypoints, `npm run pack:check` passed, and both the packed-install smoke proof and the full clean-checkout verifier passed from current source. |

Phase 09 requirement IDs match the Phase 9 traceability entries in `.planning/REQUIREMENTS.md`; no orphaned Phase 9 requirements were found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| None | - | No blocker-level placeholder-version or non-runtime tarball-surface anti-patterns remain in the Phase 09 implementation path. | - | No blocker or warning-level anti-patterns found. |

### Human Verification Required

None. The only environment-sensitive step was the packed-install smoke run, which passed when rerun outside the sandboxed workspace so npm could install dependencies normally.

### Gaps Summary

No remaining Phase 09 gaps were found. Package metadata, tarball integrity, and the clean-checkout verification path are green from current source.

---

_Verified: 2026-03-31T11:31:36Z_
_Verifier: Codex inline fallback_
