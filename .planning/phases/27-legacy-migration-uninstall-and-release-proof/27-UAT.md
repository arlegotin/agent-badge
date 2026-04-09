---
status: complete
phase: 27-legacy-migration-uninstall-and-release-proof
source:
  - .planning/phases/27-legacy-migration-uninstall-and-release-proof/27-01-SUMMARY.md
  - .planning/phases/27-legacy-migration-uninstall-and-release-proof/27-02-SUMMARY.md
  - .planning/phases/27-legacy-migration-uninstall-and-release-proof/27-03-SUMMARY.md
started: 2026-04-09T09:42:28Z
updated: 2026-04-09T09:47:45Z
---

## Current Test

[testing complete]

## Tests

### 1. Legacy migration on an existing repo
expected: In a repository that was previously initialized with the old repo-local runtime model, rerun `agent-badge init` or the first shared publish/refresh flow. The repo should converge to the shared-runtime or minimal-artifact model without deleting user-owned `package.json` content or custom hook lines. If this is the first shared migration event, you may also see `Migration: legacy -> shared`.
result: pass

### 2. Legacy status and doctor guidance remain correct
expected: On a migrated legacy repo, `agent-badge status` and `agent-badge doctor` should use the shared-runtime recovery wording. If a legacy-no-contributors case exists, the guidance should still point to the original publisher or machine-recovery path rather than a stale repo-local runtime fix.
result: pass

### 3. Uninstall preserves data by default
expected: Running `agent-badge uninstall` should remove managed agent-badge wiring, but it should preserve local config or state and remote badge or gist continuity unless explicit purge flags are used.
result: pass

### 4. Default docs describe the shared-runtime install path
expected: `README.md`, `docs/INSTALL.md`, `docs/QUICKSTART.md`, `docs/CLI.md`, and `docs/HOW-IT-WORKS.md` should describe `npm init agent-badge@latest` as the default shared-runtime or minimal-artifact path, and normal follow-up commands should use `agent-badge` on PATH rather than repo-local wrappers.
result: pass

### 5. Recovery and troubleshooting docs match the new install model
expected: `docs/AUTH.md`, `docs/TROUBLESHOOTING.md`, `docs/RECOVERY.md`, `docs/MANUAL-GIST.md`, `docs/UNINSTALL.md`, `docs/FAQ.md`, and `docs/CONFIGURATION.md` should all match the shared-runtime model and avoid describing repo-local runtime ownership as the default setup.
result: pass

### 6. Release proof separates initializer and direct-runtime install paths
expected: `scripts/smoke/verify-registry-install.sh`, `scripts/smoke/verify-packed-install.sh`, `scripts/verify-clean-checkout.sh`, and `docs/maintainers/RELEASE.md` should clearly separate published-version initializer proof from direct package-install proof. Registry smoke should validate minimal artifacts after `npm init agent-badge@latest`, while packed-install smoke should be labeled as the explicit direct-runtime proof path.
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[]
