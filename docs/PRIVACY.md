# Privacy Model

## Aggregate-only publishing

`agent-badge` publishes badge-ready aggregate totals only. The public gist payload is limited to summary values and badge metadata.

## Forbidden Outbound Data

The following data must never leave the local machine:

- prompt text
- raw transcript content
- filename
- local absolute path

## Local-First Boundary

- Provider scanning runs against local `~/.codex` and `~/.claude` directories.
- Attribution and override decisions are persisted locally in `.agent-badge/`.
- Remote publishing writes only aggregate endpoint JSON for Shields.

## Local Artifacts

The runtime keeps small derived state in the repo:

- `.agent-badge/config.json` for supported settings
- `.agent-badge/state.json` for publish state, checkpoints, and persisted override decisions
- `.agent-badge/cache/` for refresh acceleration
- `.agent-badge/logs/` for local operational logs

By default, init adds the mutable state, cache, and logs paths to `.gitignore`.

## CLI Output Privacy

`privacy.output` can be set to `standard` or `minimal`:

- `standard` prints more local publish detail such as gist id and publish hash where available
- `minimal` trims that local output down

This only changes what the CLI prints on your machine. It does not relax the aggregate-only publish boundary.
