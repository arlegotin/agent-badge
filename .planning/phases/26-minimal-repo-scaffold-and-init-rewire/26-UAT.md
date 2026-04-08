---
status: complete
phase: 26-minimal-repo-scaffold-and-init-rewire
source:
  - 26-minimal-repo-scaffold-and-init-rewire-01-SUMMARY.md
  - 26-minimal-repo-scaffold-and-init-rewire-02-SUMMARY.md
started: 2026-04-08T22:30:15Z
updated: 2026-04-08T22:34:57Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: In a fresh test repository or clean scratch directory, run the Phase 26 init path from scratch. Initialization should complete without startup errors, create the repo-owned `.agent-badge/` scaffold, and avoid creating repo-local `node_modules` just to make agent-badge runnable.
result: pass

### 2. Fresh Init Leaves Minimal Repo Artifacts
expected: After default init in a repo that started without `package.json`, the repo remains free of `package.json`, `node_modules`, and default `@legotin/agent-badge` dependency ownership. Repo-owned outputs are limited to `.agent-badge/`, README badge markup or snippet output, managed `.gitignore` entries, and optional managed hook content.
result: pass

### 3. Managed Hook Uses The Shared Runtime Contract
expected: Inspect `.git/hooks/pre-push` after init or after enabling pre-push refresh. The managed block contains `command -v agent-badge >/dev/null 2>&1` and a direct `agent-badge refresh --hook pre-push --hook-policy ...` command. It does not contain `npm run --silent agent-badge:refresh`, `pnpm`, `yarn`, `bun`, or `node_modules/.bin`.
result: pass

### 4. Legacy Re-Init Preserves User-Owned Manifest Content
expected: In a repo that still has old managed `package.json` entries, rerunning init removes only the managed `@legotin/agent-badge` dependency and managed `agent-badge:*` scripts. Unrelated manifest content remains intact, and README, gitignore, and hook each end up with one managed block.
result: pass

### 5. Config Rewrites Keep The Minimal Footprint
expected: Changing `refresh.prePush.mode` or `refresh.prePush.enabled` rewrites the managed hook to match the new policy, but does not create or recreate `package.json`, repo-local runtime dependencies, or managed package scripts.
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
