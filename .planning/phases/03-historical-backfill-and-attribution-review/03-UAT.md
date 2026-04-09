---
status: complete
phase: 03-historical-backfill-and-attribution-review
source:
  - 03-01-SUMMARY.md
  - 03-02-SUMMARY.md
  - 03-03-SUMMARY.md
started: 2026-03-30T14:15:37Z
updated: 2026-03-30T14:21:21Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Scan Smoke Test
expected: In an initialized repo with `.agent-badge/config.json` and `.agent-badge/state.json`, run the Phase 3 `scan` flow from a fresh shell. It should complete without crashing, print a scan report, and leave `.agent-badge/state.json` as valid JSON after the run.
result: pass

### 2. Report Sections and Redaction
expected: Against data that yields at least one included session, one ambiguous session, and one excluded session, `scan` should print `Included Totals`, `Ambiguous Sessions`, and `Excluded Sessions` in that order, show stable `provider:sessionId` review keys, and avoid raw local paths or transcript content in the output.
result: pass

### 3. Ambiguous Sessions Stay Out of Totals
expected: When a session matches only weak evidence such as normalized cwd or transcript-project correlation, `scan` should leave it under `Ambiguous Sessions` and exclude its usage from `Included Totals` until you explicitly override it.
result: pass

### 4. Override Flags Persist Across Scans
expected: If you rerun `scan` with `--include-session <provider:sessionId>` or `--exclude-session <provider:sessionId>` for currently ambiguous sessions, the command should persist those decisions in `.agent-badge/state.json`, and a later plain `scan` should reuse them without needing the flags again.
result: pass

### 5. Failed Scan Leaves State Unchanged
expected: If `scan` errors before completion, existing checkpoints and ambiguous-session override decisions in `.agent-badge/state.json` should remain unchanged instead of being partially rewritten.
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
