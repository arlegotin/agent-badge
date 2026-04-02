---
status: complete
phase: 17-publish-failure-visibility-and-state-trust
source:
  - 17-01-SUMMARY.md
  - 17-02-SUMMARY.md
  - 17-03-SUMMARY.md
started: 2026-04-02T08:41:15Z
updated: 2026-04-02T09:08:06Z
---

## Current Test

[testing complete]

## Tests

### 1. Refresh Reports Canonical Live Badge Trust
expected: Running `agent-badge refresh` in this repo should print a `- Live badge trust:` line using the canonical Phase 17 wording for the current badge state. If there was a prior successful sync, refresh should also print `- Last successful badge update:` separately instead of folding badge freshness into shared-mode health output.
result: pass

### 2. Status Separates Live Badge Trust From Shared Mode Health
expected: Running `agent-badge status` should print `- Live badge trust:` before the shared-mode lines, and stale or failed-but-unchanged badge states should appear there without changing the separate `- Shared mode:` and `- Shared issues:` reporting.
result: pass

### 3. Publish Persists Privacy-Safe Attempt Facts
expected: After a real `agent-badge publish` or publish step inside refresh, `.agent-badge/state.json` should record canonical attempt facts such as `lastAttemptOutcome`, `lastSuccessfulSyncAt`, `lastAttemptCandidateHash`, `lastAttemptChangedBadge`, and `lastFailureCode` without storing raw private error text or local paths.
result: pass

### 4. Init Rerun Preserves Publish Diagnostics
expected: After publish-attempt diagnostics exist in `.agent-badge/state.json`, rerunning `agent-badge init` should preserve those fields instead of resetting or deleting them.
result: pass

### 5. Doctor Reports Publish Trust With Actionable Recovery
expected: Running `agent-badge doctor` should include a dedicated `publish-trust` check that uses the same live-badge trust wording as `status` and `refresh`, and it should offer publish-retry guidance when the latest local state has not been synced successfully.
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

None.
