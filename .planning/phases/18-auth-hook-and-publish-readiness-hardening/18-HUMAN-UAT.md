---
status: partial
phase: 18-auth-hook-and-publish-readiness-hardening
source:
  - 18-VERIFICATION.md
started: 2026-04-02T10:41:31Z
updated: 2026-04-02T10:41:31Z
---

## Current Test

Awaiting human verification of live GitHub/gist behavior and installed pre-push hook behavior.

## Tests

### 1. Live Publish Readiness
expected: `npm run dev:agent-badge -- publish` ends with `- Publish readiness:` using the canonical wording and reflects real auth/gist state rather than a generic failure.
result: pending

### 2. Live Refresh Trust And Readiness
expected: `npm run dev:agent-badge -- refresh` prints both `- Publish readiness:` and `- Live badge trust:` with the same wording used by publish and doctor.
result: pending

### 3. Doctor Remediation With Real Environment Drift
expected: `npm run dev:agent-badge -- doctor` reports the same remediation path seen in init/publish/refresh, including `GH_TOKEN`, `GITHUB_TOKEN`, or `GITHUB_PAT` and `agent-badge init --gist-id <id>` guidance.
result: pending

### 4. Installed Hook Fail-Soft Versus Strict
expected: `npm run dev:agent-badge -- refresh --hook pre-push --hook-policy fail-soft` warns and continues, while `--hook-policy strict` prints the blocking message and exits non-zero in the same degraded state.
result: pending

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
