status: resolved
phase: 18-auth-hook-and-publish-readiness-hardening
source:
  - 18-VERIFICATION.md
started: 2026-04-02T10:41:31Z
updated: 2026-04-05T12:19:55Z
---

## Current Test

Recorded live Phase 18 operator validation rerun after Plan 18-04. All previously failing missing-auth publish and refresh behaviors now match the canonical readiness and trust contract.

## Tests

### 1. Live Publish Readiness
expected: `npm run dev:agent-badge -- publish` ends with `- Publish readiness:` using the canonical wording and reflects real auth/gist state rather than a generic failure.
result: passed
reported: "`npm run dev:agent-badge -- publish` exited with `- Publish readiness: auth missing` and did not surface raw GitHub REST auth text."
severity: none

### 2. Live Refresh Trust And Readiness
expected: `npm run dev:agent-badge -- refresh` prints both `- Publish readiness:` and `- Live badge trust:` with the same wording used by publish and doctor.
result: passed
reported: "`npm run dev:agent-badge -- refresh` exited non-zero with `- Publish readiness: auth missing` and `- Live badge trust: stale after failed publish` before the failure."
severity: none

### 3. Doctor Remediation With Real Environment Drift
expected: `npm run dev:agent-badge -- doctor` reports the same remediation path seen in init/publish/refresh, including `GH_TOKEN`, `GITHUB_TOKEN`, or `GITHUB_PAT` and `agent-badge init --gist-id <id>` guidance.
result: passed
reported: "`doctor` reported `publish-auth: warn`, named `GH_TOKEN`, `GITHUB_TOKEN`, and `GITHUB_PAT`, kept `Live badge trust: stale after failed publish` separate from readiness/auth messaging, and kept the gist recovery path visible."
severity: none

### 4. Installed Hook Fail-Soft Versus Strict
expected: `npm run dev:agent-badge -- refresh --hook pre-push --hook-policy fail-soft` warns and continues, while `--hook-policy strict` prints the blocking message and exits non-zero in the same degraded state.
result: passed
reported: "Hook-mode reruns printed `Warning: live badge may be stale; push continues because pre-push policy is fail-soft.` in fail-soft mode, and `Blocking: push stopped because pre-push policy is strict.` plus a non-zero failure in strict mode."
severity: none

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
No remaining gaps. Live operator validation passed for publish, refresh, doctor, and hook-policy behavior.
