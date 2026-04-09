---
quick_task: 260409-mel
title: Clarify machine-once vs per-repo setup and simplify quick install guidance
status: planned
created: 2026-04-09T14:09:49Z
---

# Quick Task 260409-mel Plan

## Goal

Make onboarding docs unambiguous by separating the one-time machine runtime install from the per-repo `init` flow, and simplify the quick-install guidance so users can choose the right path without reverse-engineering the setup model.

## Tasks

1. Rewrite the primary onboarding flow in `README.md`, `docs/INSTALL.md`, and `docs/QUICKSTART.md`.
   - Establish one consistent mental model across all three pages: install or validate the shared runtime once per machine, then run `npm init agent-badge@latest` or `agent-badge init` per repo.
   - Simplify the current “60-Second / First-Shot / Fastest” guidance so the recommended path is obvious, the best-effort shortcut is clearly labeled, and the direct package-install path remains an explicit alternative rather than sounding like a second required step.
   - Preserve the current initializer-first product contract and minimal-repo-artifact story; do not reintroduce repo-local runtime ownership as the default.

2. Align supporting user docs that explain setup, command usage, and recovery.
   - Update `docs/FAQ.md`, `docs/CLI.md`, and `docs/TROUBLESHOOTING.md` wherever the wording currently blurs machine-level setup with repo-level setup, so users can tell whether an action must happen once on the machine or once in the current repo.
   - Ensure guidance for `Shared runtime: unavailable`, gist reconnects, and follow-up command examples explicitly distinguishes machine repair (`npm install -g`, `hash -r`, `agent-badge --version`) from repo reruns (`npm init agent-badge@latest`, `agent-badge init`, `agent-badge doctor`, `agent-badge status`).
   - Keep this scoped to documentation clarity only; no CLI behavior, release notes, or runtime implementation changes.

3. Lock the revised wording into the docs gate and verify it.
   - Update `scripts/verify-docs.sh` so it enforces the new onboarding structure and explicit machine-once versus per-repo guidance instead of the older quick-install wording.
   - Run `npm run docs:check` and resolve any doc drift until the documentation verification passes cleanly.
