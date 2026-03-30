---
quick_task: 260330-uxa
title: Auto-ignore agent-badge local runtime state so refresh/push do not dirty repos, and stop tracking this repo's state.json
status: completed
completed: 2026-03-30T20:19:57Z
commit: ae6b8c2
---

# Quick Task 260330-uxa Summary

## Outcome

Made `agent-badge` stop polluting git status with mutable runtime state by auto-managing ignore rules for local state/cache/logs and by removing this repository's tracked `.agent-badge/state.json`.

## Files

- `packages/core/src/init/runtime-wiring.ts` - Added managed `.gitignore` support for local runtime state, cache, and logs.
- `packages/core/src/init/runtime-wiring.test.ts` - Added creation, idempotence, and pre-existing-ignore coverage.
- `packages/agent-badge/src/commands/init.test.ts` - Verified init now creates and reuses the runtime-state ignore setup.
- `.gitignore` - Added the repo-local ignore block for `.agent-badge/state.json`.

## Commit

- `ae6b8c2` `fix(init): ignore local runtime state`

## Verification

- Targeted build and tests passed for runtime wiring, init, and config flows.
- A real authenticated `agent-badge refresh --hook pre-push --fail-soft` updated local state to `2026-03-30T20:19:57.725Z` without changing git status beyond the deliberate fix work.

## Notes

This keeps `.agent-badge/config.json` trackable, because it is stable configuration, while treating `.agent-badge/state.json` as local mutable runtime state that users should not have to manage.
