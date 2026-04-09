---
status: complete
phase: 18-auth-hook-and-publish-readiness-hardening
source:
  - 18-01-SUMMARY.md
  - 18-02-SUMMARY.md
  - 18-03-SUMMARY.md
  - 18-04-SUMMARY.md
started: 2026-04-02T10:13:34Z
updated: 2026-04-02T11:21:03Z
---

## Current Test

[testing complete]

## Tests

### 1. Automated Validation Gate
expected: Running `npm test -- --run` should pass cleanly before manual UAT starts for Phase 18.
result: pass
reported: "Passed after updating `shared-badge-aggregation.test.ts` to assert the badge -> contributor -> overrides write sequence and rerunning the full suite."
severity: none

### 2. Cold Start Smoke Test
expected: From a fresh checkout of this repo with no stale build state assumed, run `npm run build` and then execute a primary CLI entrypoint such as `node packages/agent-badge/dist/cli/main.js --help` or `node packages/agent-badge/dist/cli/main.js status`. Build and startup should complete without missing-entrypoint errors, startup crashes, or broken CLI bootstrapping.
result: pass

### 3. Publish Reports Canonical Readiness
expected: Running `npm run dev:agent-badge -- publish` in a repo with a connected gist or available GitHub auth should end with a `- Publish readiness:` line using the canonical readiness wording. If auth or gist setup is missing, the command should explicitly name that readiness problem instead of collapsing it into a generic remote inspection failure.
result: pass

### 4. Refresh Reports Canonical Readiness And Live Badge Trust
expected: Running `npm run dev:agent-badge -- refresh` should print both `- Publish readiness:` and `- Live badge trust:` lines. The readiness line should use the same vocabulary as publish and doctor, while stale or unchanged badge state should still be called out separately under live badge trust.
result: pass

### 5. Doctor Reuses Readiness Remediation
expected: Running `npm run dev:agent-badge -- doctor` should include checks that explain missing auth or gist reachability with actionable remediation using the same readiness vocabulary that publish and refresh expose.
result: pass

### 6. Init Rerun Preserves Publish Diagnostics
expected: After a publish or publish failure records diagnostics in `.agent-badge/state.json`, rerunning `npm run dev:agent-badge -- init` should preserve the publish diagnostic fields and expanded failure codes instead of wiping them.
result: pass

### 7. Managed Hook Uses Explicit Hook Policy
expected: After `npm run dev:agent-badge -- init` wires the managed refresh flow, the managed refresh command in `package.json` or `.git/hooks/pre-push` should include an explicit `--hook-policy fail-soft` or `--hook-policy strict` flag instead of inferring strict behavior from a missing flag.
result: pass

### 8. Config And Status Show Pre-Push Policy
expected: Running `npm run dev:agent-badge -- config` and `npm run dev:agent-badge -- status` should each expose `Pre-push policy:`. When the repo is in a degraded publish state, status should also make stale-badge risk obvious instead of implying the hook succeeded cleanly.
result: pass

### 9. Hook Refresh Fail-Soft Warns Without Blocking
expected: Running `npm run dev:agent-badge -- refresh --hook pre-push --hook-policy fail-soft` in a degraded state should warn loudly about badge drift or readiness problems, print policy-aware wording, and still avoid blocking the push.
result: pass

### 10. Hook Refresh Strict Blocks On Degraded State
expected: Running `npm run dev:agent-badge -- refresh --hook pre-push --hook-policy strict` in the same degraded state should print blocking language and fail the run even when the degraded result comes from stale or untrusted badge state rather than a thrown publish exception.
result: pass

## Summary

total: 10
passed: 10
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Running `npm test -- --run` passes cleanly before manual UAT starts for Phase 18."
  status: resolved
  reason: "The shared aggregation regression was repaired and the full suite passed, so manual Phase 18 UAT can resume."
  severity: none
  test: 1
  root_cause: "The shared badge aggregation tests used `toHaveBeenLastCalledWith(...)` for the badge payload write even though `publishBadgeToGist()` writes the badge payload first and the overrides snapshot last."
  artifacts:
    - path: "packages/core/src/publish/shared-badge-aggregation.test.ts"
      issue: "Sequence-aware assertions now cover the badge payload write without assuming it is the final `updateGistFile()` call"
    - path: "packages/core/src/publish/publish-service.ts"
      issue: "The write sequence is badge payload, contributor snapshot, then overrides snapshot"
  missing: []
  debug_session: ""
