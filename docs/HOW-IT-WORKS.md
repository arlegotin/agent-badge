# How It Works

`agent-badge` does one job: turn local AI coding usage into a stable GitHub README badge without shipping raw work to a service.

Commands below are shown as `agent-badge ...` for readability. That is the default shared runtime path after `npm init agent-badge@latest`: use `agent-badge` directly when the shared runtime is on your `PATH`. If you explicitly install `@legotin/agent-badge` inside the repo instead, use your package manager's exec form for that alternative path.

## Applicability

Today the runtime supports only:

- Codex data under `~/.codex`
- Claude data under `~/.claude`

If one provider is missing, the tool still works and reports partial coverage. If both are missing, install still works, but the badge will not show meaningful usage until provider data appears.

## The Flow

1. `agent-badge init` scaffolds local state, writes a minimal repo-owned setup, and connects a public gist when GitHub auth is available.
2. `agent-badge scan` or `agent-badge refresh` reads local provider data from `~/.codex` and `~/.claude`.
3. The attribution engine decides which sessions belong to the current repo and excludes ambiguous work by default.
4. `agent-badge` writes local state under `.agent-badge/` and publishes stable badge payloads plus deterministic shared-state files to a gist you control.
5. Shields renders that JSON through a stable endpoint URL that can live in your README forever.

## How Attribution Stays Credible

The badge is only useful if developers trust the number. That is why attribution is conservative.

- Strong evidence wins before weak hints.
- Ambiguous sessions are not counted automatically.
- Manual include or exclude decisions persist across future scans.

Read the exact evidence order and override behavior in [Attribution Model](ATTRIBUTION.md).

## What Gets Published

The public gist contains stable badge endpoint payloads and deterministic shared-state files:

- stable endpoint payload for the main badge
- preview payloads for `combined`, `tokens`, and `cost` badge modes when cost totals are available
- `agent-badge-contrib-<publisher>.json` contributor files with aggregate-only per-session observations, opaque publisher ids, and freshness metadata
- those per-session observations are keyed by opaque digests instead of raw `provider:providerSessionId`
- `agent-badge-overrides.json` with shared include or exclude decisions keyed by opaque digests instead of raw `provider:providerSessionId`
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
agent-badge refresh --hook pre-push --hook-policy fail-soft || true
```

That refresh path prefers incremental updates and falls back to a full scan when cached cursors are missing or unusable. If publish is not configured yet, refresh still updates local state and reports that publish is deferred or not configured.

## How Shared Publishing Stays Deterministic

Each publisher updates exactly one contributor file, refreshes the shared overrides file, then rereads the gist to derive the badge payloads from the full remote contributor set. That means the public badge remains aggregate-first even though the shared model keeps per-publisher contribution slots under deterministic filenames.

Existing single-writer repos still depend on local machine history at migration time. To preserve continuity, rerun `agent-badge init` on the original publisher machine first so the first shared publish is seeded from the machine that already holds the repo's trusted local scan data.
