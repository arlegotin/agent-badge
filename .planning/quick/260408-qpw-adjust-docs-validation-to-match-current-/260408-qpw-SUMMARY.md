---
quick_task: 260408-qpw
title: Adjust docs validation to match current README and release-doc structure
status: completed
completed: 2026-04-08T17:19:00Z
commit: uncommitted
---

# Quick Task 260408-qpw Summary

## Outcome

Updated the repo-owned docs verifier so the release-readiness job validates the current README structure instead of stale requirements and package-name copy that now lives in the dedicated install docs.

## Files

- `scripts/verify-docs.sh` - Replaced outdated README assertions with checks for the current landing-page sections and preserved the existing release-doc and public-doc safety gates.

## Verification

- `npm run docs:check`
- `npm run verify:clean-checkout`
