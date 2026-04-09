---
quick_task: 260408-qpw
title: Adjust docs validation to match current README and release-doc structure
status: completed
created: 2026-04-08T17:14:16.901Z
---

# Quick Task 260408-qpw Plan

## Goal

Fix the failing release-readiness docs gate by updating the repo-owned verification script to assert the current documentation structure instead of stale README copy.

## Tasks

1. Confirm the exact docs-check failure and identify which validator expectations drifted from the current docs.
2. Update `scripts/verify-docs.sh` so README checks match the present landing-page structure while preserving the existing release-doc and public-doc safety checks.
3. Re-run the docs verification locally to confirm the CI failure is resolved without changing any documentation content.
