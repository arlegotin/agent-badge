---
status: partial
phase: 18-auth-hook-and-publish-readiness-hardening
source:
  - 18-VERIFICATION.md
started: 2026-04-02T10:41:31Z
updated: 2026-04-02T10:52:19Z
---

## Current Test

Recorded live Phase 18 operator validation. `doctor` and installed hook behavior passed, but `publish` and normal `refresh` exposed runtime gaps in canonical readiness/trust reporting.

## Tests

### 1. Live Publish Readiness
expected: `npm run dev:agent-badge -- publish` ends with `- Publish readiness:` using the canonical wording and reflects real auth/gist state rather than a generic failure.
result: failed
reported: "`npm run dev:agent-badge -- publish` printed `- Publish readiness: remote write failed` followed by raw `Requires authentication - https://docs.github.com/rest`."
severity: high

### 2. Live Refresh Trust And Readiness
expected: `npm run dev:agent-badge -- refresh` prints both `- Publish readiness:` and `- Live badge trust:` with the same wording used by publish and doctor.
result: failed
reported: "Both normal and auth-cleared `npm run dev:agent-badge -- refresh` exited with only `Requires authentication - https://docs.github.com/rest` and did not print the expected readiness or trust lines."
severity: high

### 3. Doctor Remediation With Real Environment Drift
expected: `npm run dev:agent-badge -- doctor` reports the same remediation path seen in init/publish/refresh, including `GH_TOKEN`, `GITHUB_TOKEN`, or `GITHUB_PAT` and `agent-badge init --gist-id <id>` guidance.
result: passed
reported: "`doctor` reported `publish-auth: warn`, named `GH_TOKEN`, `GITHUB_TOKEN`, and `GITHUB_PAT`, and kept `Live badge trust: stale after failed publish` separate from readiness/auth messaging."
severity: none

### 4. Installed Hook Fail-Soft Versus Strict
expected: `npm run dev:agent-badge -- refresh --hook pre-push --hook-policy fail-soft` warns and continues, while `--hook-policy strict` prints the blocking message and exits non-zero in the same degraded state.
result: passed
reported: "The installed pre-push hook printed `Warning: live badge may be stale; push continues because pre-push policy is fail-soft.` in fail-soft mode, and `Blocking: push stopped because pre-push policy is strict.` plus a non-zero failure in strict mode."
severity: none

## Summary

total: 4
passed: 2
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "`publish` should classify missing GitHub auth with canonical readiness wording instead of reporting `remote write failed`."
  status: failed
  reason: "A live publish without auth surfaced the generic `remote write failed` classification and leaked the raw GitHub REST auth error text, so operators do not get the intended missing-auth readiness signal."
  severity: high
  test: 1
  root_cause: "The runtime publish path is still letting a missing-auth write failure collapse into the remote-write bucket instead of mapping it to the same auth-specific readiness/remediation language used by doctor."
  artifacts:
    - path: "packages/agent-badge/src/commands/publish.ts"
      issue: "Live publish output reported `remote write failed` and raw auth failure text instead of canonical missing-auth readiness wording"
    - path: "packages/core/src/publish/publish-service.ts"
      issue: "Missing-auth write failures need to be classified distinctly enough that publish can render the canonical readiness message"
    - path: "packages/core/src/publish/publish-readiness.ts"
      issue: "Canonical readiness vocabulary exists, but live publish did not surface the auth-specific classification"
  missing:
    - "Publish maps unauthenticated GitHub write failures to the auth-missing readiness state and remediation path"
    - "Publish hides or normalizes raw GitHub REST auth text once canonical readiness output is available"

- truth: "Normal `refresh` should always print `- Publish readiness:` and `- Live badge trust:` lines in degraded publish states."
  status: failed
  reason: "A live refresh without auth exited on the thrown GitHub auth error before printing the expected readiness and trust summary lines, while hook-mode refresh still printed them."
  severity: high
  test: 2
  root_cause: "The standard refresh command path is not using the same failure-soft summary/reporting branch as hook-mode refresh when publish fails during live execution."
  artifacts:
    - path: "packages/agent-badge/src/commands/refresh.ts"
      issue: "Normal refresh exits before rendering canonical readiness and live badge trust lines on auth failure"
    - path: "packages/core/src/publish/pre-push-policy.ts"
      issue: "Hook-mode degraded reporting works; normal refresh needs equivalent post-failure summary output"
    - path: "packages/core/src/publish/publish-trust.ts"
      issue: "Trust reporting is available but was not emitted on the normal refresh auth-failure path"
  missing:
    - "Refresh prints canonical readiness and live badge trust lines even when publish fails during a normal non-hook run"
    - "Normal refresh and hook-mode refresh share the same degraded-state reporting vocabulary"
