# How It Works

`agent-badge` does one job: turn local AI coding usage into a stable GitHub README badge without shipping raw work to a service.

Commands below are shown as `agent-badge ...` for readability. In an npm-initialized repo, run them as `npx --no-install agent-badge ...` unless the binary is already on your `PATH`.

## The Flow

1. `agent-badge init` scaffolds local state, wires the repo-local runtime, and connects a public gist when GitHub auth is available.
2. `agent-badge scan` or `agent-badge refresh` reads local provider data from `~/.codex` and `~/.claude`.
3. The attribution engine decides which sessions belong to the current repo and excludes ambiguous work by default.
4. `agent-badge` writes local state under `.agent-badge/` and publishes only aggregate badge JSON to a gist you control.
5. Shields renders that JSON through a stable endpoint URL that can live in your README forever.

## What Gets Scanned

Today the runtime supports:

- Codex data under `~/.codex`
- Claude data under `~/.claude`

If one provider is missing, the tool still works. It just reports partial coverage.

## How Attribution Stays Credible

The badge is only useful if developers trust the number. That is why attribution is conservative.

- Strong evidence wins before weak hints.
- Ambiguous sessions are not counted automatically.
- Manual include or exclude decisions persist across future scans.

Read the exact evidence order and override behavior in [Attribution Model](ATTRIBUTION.md).

## What Gets Published

The public gist contains badge-ready aggregate JSON only.

- stable endpoint payload for the main badge
- preview payloads for `combined`, `tokens`, and `cost` badge modes when cost totals are available
- no prompt text
- no raw transcript
- no filenames
- no local paths

Read the privacy boundary in [Privacy Model](PRIVACY.md).

## Why The Badge URL Stays Stable

The gist file name is deterministic, and Shields reads from that fixed raw gist URL. Once the gist is connected, future refreshes update the payload in place instead of rotating the badge URL.

## How Refresh Works

By default, init installs a failure-soft `pre-push` hook that runs:

```bash
agent-badge refresh --hook pre-push --fail-soft
```

That refresh path prefers incremental updates and falls back to a full scan when cached cursors are missing or unusable. If publish is not configured yet, refresh still updates local state and reports that publish is deferred or not configured.
