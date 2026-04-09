---
status: complete
phase: 06-doctor-uninstall-and-safety-hardening
source:
  - 06-01-SUMMARY.md
  - 06-02-SUMMARY.md
  - 06-03-SUMMARY.md
started: 2026-03-31T07:47:00Z
updated: 2026-03-31T08:09:38Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: In a clean shell, clear any existing `.agent-badge` state and start the CLI from scratch in this repo. Startup should complete without boot errors, and a basic command like `agent-badge --help` or `agent-badge doctor` should return a usable response.
result: pass

### 2. Doctor Command Surface
expected: Running `agent-badge doctor` should print the diagnostic check list with pass/warn/fail style statuses and actionable recovery guidance for any failing checks.
result: pass

### 3. Doctor JSON Report Contract
expected: Running `agent-badge doctor --json` should return parseable JSON with stable check identifiers and summary counts that automation can consume.
result: pass

### 4. Probe Write Is Opt-In
expected: A normal `agent-badge doctor` run should remain read-only, and write-probe behavior should only be attempted when `--probe-write` is explicitly provided.
result: pass

### 5. Uninstall Default Safety
expected: Running `agent-badge uninstall` should remove managed runtime wiring and local cache/log artifacts by default while preserving config, state, and remote publish target unless extra purge flags are provided.
result: pass

### 6. Uninstall Purge Flags
expected: Running uninstall with explicit purge flags (`--purge-remote`, `--purge-config`, `--purge-state`, `--purge-logs`, `--purge-cache`) should remove only the requested targets, with remote deletion gated behind explicit opt-in.
result: pass

### 7. Init-Uninstall-Init Reentry
expected: After uninstall, running `agent-badge init` again should restore required wiring cleanly without duplicate scripts/hooks/README badge blocks.
result: pass

### 8. Aggregate-Only Logging and Privacy
expected: Running `scan`, `refresh`, and `publish` should emit bounded aggregate log entries under `.agent-badge/logs` that include operation/status/count metadata without prompt text, transcript content, local paths, or cwd details.
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

None yet.
