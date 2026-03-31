# Privacy Model

## Aggregate-only publishing

`agent-badge` publishes badge-ready aggregate totals only. The public gist payload is limited to summary values and badge metadata.

## Forbidden Outbound Data

The following data must never leave the local machine:

- prompt text
- raw transcript
- filename
- local absolute path

## Local-First Boundary

- Provider scanning runs against local `~/.codex` and `~/.claude` directories.
- Attribution and override decisions are persisted locally in `.agent-badge/`.
- Remote publishing writes only aggregate endpoint JSON for Shields.
