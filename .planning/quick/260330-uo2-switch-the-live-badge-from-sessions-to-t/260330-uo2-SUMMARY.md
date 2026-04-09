---
quick_task: 260330-uo2
title: Switch the live badge from sessions to tokens, republish it, commit the repo-local state, and push main
status: completed
completed: 2026-03-30T20:06:30Z
commit: 5e4d51f
---

# Quick Task 260330-uo2 Summary

## Outcome

Switched this repository's live badge mode from sessions to tokens and republished the configured public Gist.

## Files

- `.agent-badge/config.json` - Changed `badge.mode` from `sessions` to `tokens`.
- `.agent-badge/state.json` - Recorded the published refresh at `2026-03-30T20:05:47.703Z` with the new publish hash.
- `.planning/quick/260330-uo2-switch-the-live-badge-from-sessions-to-t/260330-uo2-PLAN.md` - Quick-task plan for the badge mode change.

## Commit

- `5e4d51f` `chore: show token totals in badge`

## Notes

The GitHub Gist API already reports `296530 tokens` in `agent-badge.json`. The stable raw/Shields URLs may continue to serve the previous `2 sessions` payload briefly because they are cached.
