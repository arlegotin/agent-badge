---
status: complete
phase: 02-repo-identity-and-provider-parsing
source:
  - 02-01-SUMMARY.md
  - 02-02-SUMMARY.md
  - 02-03-SUMMARY.md
started: 2026-03-30T12:26:56Z
updated: 2026-03-30T12:51:43Z
---

## Current Test

[testing complete]

## Tests

### 1. Alias Config Safety
expected: In a fresh or partial `.agent-badge/config.json`, the Phase 02 config/scaffold path should accept only privacy-safe `repo.aliases.remotes` and `repo.aliases.slugs`, preserve or backfill those keys when scaffold files are incomplete, and reject path-like aliases instead of persisting local filesystem paths.
result: pass

### 2. Repo Fingerprint Resolution
expected: In a git repo with mixed-case SSH or HTTPS GitHub remotes plus configured alias remotes and slugs, repo fingerprint resolution should normalize origin and alias remotes to canonical lowercase HTTPS form, derive the canonical `owner/repo` slug when possible, and still return git-root metadata. In a no-origin git repo, it should fall back to the repo basename with null remote fields and empty alias lists.
result: pass

### 3. Codex SQLite Scan
expected: Against a fixture or local `.codex` home with a readable `state_*.sqlite`, Codex scanning should emit one normalized summary per thread id, preserve parent or child lineage from `thread_spawn_edges`, normalize observed GitHub remotes, and omit transcript fields like titles or first-user-message text from serialized output.
result: pass

### 4. Codex History Fallback
expected: If the Codex SQLite file is unreadable or missing, the adapter should fall back to `history.jsonl` only for session presence and metadata, emit zero token totals for those fallback sessions, mark the source as `history.jsonl`, and continue to avoid leaking transcript text.
result: pass

### 5. Claude JSONL Scan
expected: Against Claude project JSONL fixtures or an equivalent `.claude/projects/**/*.jsonl` home, Claude scanning should dedupe repeated assistant `message.id` rows, ignore `sessions-index.json` and non-assistant rows when calculating totals, and emit only canonical normalized session summaries with normalized remotes.
result: pass

### 6. Phase 2 Public Surface
expected: From `@agent-badge/core`, the package root should re-export the repo and provider APIs added in Phase 02, and the default-config or provider-detection paths should only enable detected providers while keeping exposed provider home labels privacy-safe as `~/.codex` and `~/.claude`.
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

None yet.
