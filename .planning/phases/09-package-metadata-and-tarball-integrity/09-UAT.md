---
status: complete
phase: 09-package-metadata-and-tarball-integrity
source:
  - 09-01-SUMMARY.md
  - 09-02-SUMMARY.md
started: 2026-03-31T11:35:56Z
updated: 2026-03-31T11:40:39Z
---

## Current Test

[testing complete]

## Tests

### 1. Publishable Manifest Contract
expected: Open the three publishable package manifests. `packages/core/package.json`, `packages/agent-badge/package.json`, and `packages/create-agent-badge/package.json` should each show version `1.1.0`. The runtime package should depend on `@agent-badge/core` at `^1.1.0`, and the initializer should depend on `agent-badge` at `^1.1.0`.
result: pass

### 2. Strict Pack Gate
expected: From the repository root, `npm_config_cache=/tmp/agent-badge-npm-cache npm run pack:check` should pass all three publishable packages. The check should fail on unexpected non-runtime files and on missing required runtime entrypoints.
result: pass

### 3. Packed-Install Release Path
expected: Running `bash scripts/verify-clean-checkout.sh` should succeed end to end, including build, the full test suite, the strict tarball gate, and the packed-install smoke check for both CLIs.
result: pass

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[]
