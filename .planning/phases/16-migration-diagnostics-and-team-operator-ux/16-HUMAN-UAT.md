---
status: partial
phase: 16-migration-diagnostics-and-team-operator-ux
source: [16-VERIFICATION.md]
started: 2026-04-02T04:57:58Z
updated: 2026-04-02T04:57:58Z
---

## Current Test

awaiting human testing

## Tests

### 1. Live legacy gist migration preserves badge continuity
expected: Rerunning `agent-badge init --gist-id <existing-id>` on the original publisher machine keeps the same gist id and README badge URL while `status` and `doctor` report shared mode.
result: pending

### 2. Real multi-operator recovery flow
expected: `agent-badge status` and `agent-badge doctor` expose stale, orphaned, partial, or conflicting shared state with fixes that let operators recover without reading gist files.
result: pending

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
