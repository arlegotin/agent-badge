---
status: complete
phase: 14-shared-remote-contribution-model
source:
  - 14-01-SUMMARY.md
  - 14-02-SUMMARY.md
  - 14-03-SUMMARY.md
started: 2026-04-01T22:11:44Z
updated: 2026-04-02T02:13:44Z
---

## Current Test

[testing complete]

## Tests

### 1. Shared Publish Output Is Privacy-Safe
expected: From an initialized repo with GitHub gist publishing configured, run `agent-badge publish` (or the repo-local equivalent). The command should print a normal publish summary that includes `Publish mode: shared` and a `lastPublishedHash`, while not printing any raw `provider:providerSessionId` value, prompt text, transcript text, or local filesystem paths.
result: pass

### 2. Init Rerun Preserves Shared Publisher Identity
expected: In a repo that already has `.agent-badge/state.json`, rerun `agent-badge init` (or the repo-local initializer path). The scaffold should keep the existing `publish.publisherId`, preserve `publish.mode: shared`, and avoid rotating shared publish identity on reruns.
result: pass

### 3. Shared Publish Recomputes Badge Totals From Remote Contributors
expected: With a gist that already contains another publisher contribution file, run `agent-badge publish` from this repo. The shared contributor file for the current publisher should refresh in place, the other contributor file should remain present, and the published badge payload should reflect the combined remote contributor totals instead of only this machine's local totals.
result: pass

### 4. Public Docs Match The Shared Privacy Contract
expected: `docs/HOW-IT-WORKS.md` and `docs/PRIVACY.md` should describe deterministic contributor files and `agent-badge-overrides.json` with opaque digest keys, while explicitly stating that prompt text, transcript text, filenames, local paths, and raw `provider:providerSessionId` values are not published.
result: pass

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

none yet
