---
quick_task: 260409-mth
title: Add a GitHub auth check to the README quick per-repo instructions
status: planned
created: 2026-04-09T14:27:34Z
---

# Quick Task 260409-mth Plan

## Goal

Make the README quick-start instructions explicit about GitHub auth readiness so users do not mistake the short per-repo setup path for a guaranteed live-publish path when gist-capable auth is missing.

## Tasks

1. Update the `README.md` `60-Second Path` so the per-repo quick instructions include a concrete GitHub auth check or prerequisite right where users are about to run `npm init agent-badge@latest`.
   - Keep the quick path short and readable, but stop relying on later explanatory paragraphs to introduce the auth requirement.
   - Preserve the current machine-once shared runtime model and repo-once init model from quick task `260409-mel`; do not expand this into the full first-shot flow from `docs/INSTALL.md`.
   - Keep the wording aligned with actual behavior: missing GitHub auth should still read as a deferred live-publish condition, not a failed local setup.

2. Update `scripts/verify-docs.sh` so the docs gate enforces the new README quick-path auth guidance, then run `npm run docs:check` and resolve any wording drift required for the documentation check to pass.
   - Keep this task documentation-only. Do not change CLI behavior, auth resolution order, or unrelated support docs unless the verification gate requires a small follow-up wording fix.
