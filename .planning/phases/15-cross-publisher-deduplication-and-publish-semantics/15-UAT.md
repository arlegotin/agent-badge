---
status: complete
phase: 15-cross-publisher-deduplication-and-publish-semantics
source:
  - .planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-01-SUMMARY.md
  - .planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-02-SUMMARY.md
started: 2026-04-02T05:23:00+02:00
updated: 2026-04-02T05:27:00+02:00
---

## Current Test

[testing complete]

## Tests

### 1. Init Publishes Immediately In Shared Mode
expected: Run `agent-badge init` in a repo with a valid gist target or auth to create one. The command should finish the first publish instead of deferring it just because usage is empty or combined mode needs cost data. You should see either `README badge: updated README.md` or a pasteable `Badge snippet: ...`, and `.agent-badge/state.json` should end with `publish.status: "published"`.
result: pass

### 2. Duplicate Sessions Converge To One Badge Total
expected: Publish the same logical session from two contributors or two publish orders. The shared badge total should count that session once, not twice, and repeating publishes in a different order should leave the badge payload unchanged.
result: pass

### 3. Refresh Publish Matches Full Publish
expected: After a full publish, a later `agent-badge refresh` that publishes from cached observations should produce the same shared totals and duplicate-session outcome as the full publish path. Choosing refresh versus full publish should not change the repo badge numbers.
result: pass

### 4. Shared Ambiguous Decisions Stay Consistent
expected: If contributors publish conflicting include or exclude observations for an ambiguous session, the repo should settle on one consistent shared outcome. Later publishes should preserve that resolved outcome instead of flipping based on publish order.
result: pass

## Summary

total: 4
passed: 0
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

None
