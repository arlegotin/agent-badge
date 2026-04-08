---
status: complete
phase: 25-global-runtime-contract-and-command-resolution
source:
  - 25-01-SUMMARY.md
  - 25-02-SUMMARY.md
started: 2026-04-08T20:52:22Z
updated: 2026-04-08T21:01:38Z
---

## Current Test

[testing complete]

## Tests

### 1. Shared Runtime Status Output
expected: Run `npm run dev:agent-badge -- status`. The output includes exactly one `Shared runtime:` line. It either reports `available (...)` or prints the shared install/PATH remediation. It does not mention `npx`, `pnpm exec`, `yarn run`, `bun run`, or `node_modules/.bin`.
result: pass

### 2. Config Output Uses Shared Runtime Vocabulary
expected: Run `npm run dev:agent-badge -- config`. The output includes a `Shared runtime:` line and uses the same shared-runtime wording as init/status rather than package-manager wrapper guidance.
result: pass

### 3. Managed Hook Uses Direct Shared Command
expected: Inspect `.git/hooks/pre-push`. The managed block contains `command -v agent-badge >/dev/null 2>&1` and `agent-badge refresh --hook pre-push --hook-policy ...`, and it does not contain `npm run --silent agent-badge:refresh`, `pnpm exec`, `yarn run`, `bun run`, or `node_modules/.bin`.
result: pass

### 4. Doctor Accepts Direct Managed Hook
expected: Run `npm run dev:agent-badge -- doctor`. The pre-push hook check reports the managed hook as wired or healthy for the current direct shared-runtime hook contract.
result: pass

### 5. Doctor Flags Tampered Shared Hook
expected: Temporarily edit the managed block in `.git/hooks/pre-push` so the shared-runtime PATH guard is missing or uses the wrong exit code, then run `npm run dev:agent-badge -- doctor`. The hook check warns that the shared runtime guard is missing or does not match configuration and suggests rerunning `agent-badge init`. Restore the hook after the check.
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

None yet.
