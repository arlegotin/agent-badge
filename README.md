<!-- agent-badge:start -->
![AI Usage](https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Farlegotin%2Ff9f1989fe5ddd0f04e25df81c6dd051e%2Fraw%2Fagent-badge.json&cacheSeconds=300)
<!-- agent-badge:end -->

# agent-badge

`agent-badge` is a local-first, serverless CLI for publishing a stable GitHub README badge that shows historical and ongoing AI-agent usage for a repository. It scans local Codex and Claude data on the developer machine, attributes usage to the current repo, publishes aggregate-only badge JSON to a public Gist, and renders the badge through a fixed Shields URL.

## Install

To add `agent-badge` to a repository:

```bash
npm init agent-badge@latest
```

That initializer sets up the local runtime, creates `.agent-badge/` state, configures a failure-soft `pre-push` refresh hook, and inserts or prints the badge snippet.

## How It Works

- Scans `~/.codex` and `~/.claude` locally instead of sending raw transcripts to a service.
- Publishes only aggregate badge data, not prompts, transcripts, filenames, or local paths.
- Keeps the badge URL stable after setup by publishing `agent-badge.json` to a public GitHub Gist.

## Badge Variants And Views

The badge at the top of this README is the live badge for this repo. The previews below show each supported badge mode as it renders in practice, plus the exact command used to switch to it after init.

| Mode | Preview | Command | Notes |
| --- | --- | --- | --- |
| `tokens` | ![AI Usage tokens example](https://img.shields.io/badge/AI%20Usage-474M%20tokens-brightgreen) | `agent-badge config set badge.mode tokens` | Shows total attributed token usage for the repo with compact badge-friendly formatting. |
| `cost` | ![AI Usage cost example](https://img.shields.io/badge/AI%20Usage-%24221.44-brightgreen) | `agent-badge config set badge.mode cost` | Shows an API-equivalent USD estimate derived from local token telemetry and current official provider pricing. |

`cost` is intentionally labeled as an estimate. It uses the local usage buckets available from Claude and Codex, combines them with current official OpenAI and Anthropic API pricing when pricing fetch succeeds, and falls back to bundled official rates when it cannot refresh pricing live. That number is useful for directional tracking, but it can differ from your actual bill, plan discounts, or non-API product pricing.

The CLI also exposes a few different ways to inspect the same data:

- `agent-badge status` shows the persisted badge, provider, and publish state.
- `agent-badge scan` shows a full attribution report, including included, ambiguous, and excluded sessions.
- `agent-badge refresh` updates persisted totals and publishes the badge when the payload changed.
- `agent-badge doctor` checks local setup, scan readiness, and publish wiring.
- `agent-badge config` shows the current badge, refresh, privacy, and provider settings.

## Documentation

- [Release Checklist](docs/RELEASE.md)
- [Quickstart](docs/QUICKSTART.md)
- [Attribution Model](docs/ATTRIBUTION.md)
- [Privacy Model](docs/PRIVACY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Manual Gist Connection](docs/MANUAL-GIST.md)
