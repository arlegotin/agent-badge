---
quick_task: 260330-uxa
title: Auto-ignore agent-badge local runtime state so refresh/push do not dirty repos, and stop tracking this repo's state.json
status: completed
created: 2026-03-30T20:15:57.336Z
---

# Quick Task 260330-uxa Plan

## Goal

Prevent normal `agent-badge` usage from creating ongoing git churn by treating mutable runtime state as ignored local data.

## Tasks

1. Add managed `.gitignore` support so init/runtime wiring ensures `.agent-badge/state.json`, `.agent-badge/cache/`, and `.agent-badge/logs/` are ignored.
2. Add tests covering first-run creation, idempotent reruns, and manual pre-existing ignore entries.
3. Stop tracking this repository's `.agent-badge/state.json`.
4. Verify that a refresh updates local state without dirtying the worktree.
