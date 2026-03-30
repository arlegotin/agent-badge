---
status: complete
phase: 04-publish-and-readme-badge-integration
source:
  - 04-01-SUMMARY.md
  - 04-02-SUMMARY.md
  - 04-03-SUMMARY.md
started: 2026-03-30T17:14:33Z
updated: 2026-03-30T17:19:03Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Init Smoke Test
expected: In a fresh throwaway git repo with no existing `.agent-badge` state, run the Phase 4 `agent-badge init` flow from a clean shell. It should complete without startup errors, create or cleanly defer the public gist target, and leave the repo in a usable state for follow-up publish and README badge checks.
result: pass

### 2. Publish Target Setup Paths
expected: Running `agent-badge init` with GitHub auth or an explicit `--gist-id` should create, connect, or reuse exactly one public gist target. If neither is available, it should switch to explicit deferred mode and print clear next-step guidance instead of leaving ambiguous gist state behind.
result: pass

### 3. Publish Command Writes Aggregate Badge JSON
expected: Running `agent-badge publish` after init should update the configured gist's deterministic `agent-badge.json` file, keep the badge URL stable, and avoid exposing raw transcript text, local paths, or provider session ids in the published payload.
result: pass

### 4. README Badge Or Snippet Output
expected: If the repo has a README, init should insert exactly one managed `agent-badge` badge block that points at the stable badge URL. If the repo has no README, init should print one pasteable snippet and should not silently create a README file.
result: pass

### 5. Init Rerun Idempotency
expected: Re-running `agent-badge init` in the same repo should reuse the existing target and keep exactly one managed README badge block without duplicating badge markup, gist references, or other setup artifacts.
result: pass

### 6. Deferred Or Failed Publish Leaves README Untouched
expected: If gist setup or first publish cannot complete, init should print `Badge setup deferred` guidance and leave any existing README content unchanged instead of inserting a broken placeholder badge.
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

None yet.
