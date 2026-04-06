# agent-badge

A local-first README badge for repos that ship with AI:

<!-- agent-badge:start -->
[![Vibe budget](https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Farlegotin%2Ff9f1989fe5ddd0f04e25df81c6dd051e%2Fraw%2Fagent-badge.json&cacheSeconds=300)](https://github.com/arlegotin/agent-badge)
<!-- agent-badge:end -->

Some people want transparency.<br>
Some people just want to flex how hard they ship with agents.

`agent-badge` works for both:

```bash
npm init agent-badge@latest
```

If you already have GitHub auth configured in your shell through `GH_TOKEN`, `GITHUB_TOKEN`, or `GITHUB_PAT`, that same command will create or reuse a public gist, publish the initial badge payload, and add the badge to `README.md`.

Otherwise, local setup still completes and publishing is deferred. To publish later, export one of those tokens and rerun `npx --no-install agent-badge init`, or create a public gist and run `npx --no-install agent-badge init --gist-id <id>`.

For stale after failed publish, gist repair, shared metadata repair, and team-coordination recovery states, use the canonical runbook in [docs/RECOVERY.md](docs/RECOVERY.md).


## How it works

1. `agent-badge` scans local provider data under `~/.codex` and `~/.claude`.
2. It attributes sessions conservatively to the current repo so ambiguous work does not inflate the number.
3. It publishes aggregate-only badge JSON to a public GitHub gist you own.
4. Shields renders that JSON through a stable badge URL that stays the same after setup.

No prompts. No transcripts. No filenames. No local paths.  
Just the badge.


## What gets published

`agent-badge` publishes only aggregate badge JSON.

It does **NOT** publish:

- prompts
- transcripts
- filenames
- local paths

That makes it useful for public accountability without turning your local workflow into telemetry bait.


## Install

```bash
npm init agent-badge@latest
```

That initializer sets up the local runtime, creates `.agent-badge/` state, configures a failure-soft `pre-push` refresh hook, and inserts or prints the badge snippet.

If GitHub auth is already available through `GH_TOKEN`, `GITHUB_TOKEN`, or `GITHUB_PAT`, that one command also creates or reuses a public gist, publishes the first badge payload, and inserts the badge into `README.md`.

Otherwise, local setup still completes and publishing is deferred. To publish later, export one of those tokens and rerun `npx --no-install agent-badge init`, or create a public gist and run `npx --no-install agent-badge init --gist-id <id>`.

To migrate existing single-writer repos, rerun `agent-badge init` on the original publisher machine before other contributors start publishing. That first shared publish keeps the same gist id and stable badge URL while seeding the shared contributor state from the local history that already exists on that machine.

What init sets up:

- installs `@legotin/agent-badge` as a repo-local dev dependency
- creates `.agent-badge/config.json` and `.agent-badge/state.json`
- adds managed `agent-badge:init` and `agent-badge:refresh` package scripts
- wires a failure-soft `.git/hooks/pre-push` refresh hook
- updates `.gitignore` for local state, cache, and logs
- inserts the badge into `README.md` when publish is configured, or prints the snippet when no README exists

Read more:

- [Quickstart](docs/QUICKSTART.md)
- [Recovery Runbook](docs/RECOVERY.md)
- [How It Works](docs/HOW-IT-WORKS.md)
- [Attribution Model](docs/ATTRIBUTION.md)
- [Privacy Model](docs/PRIVACY.md)


## Badge Modes

The badge at the top of this README is live. By default it shows the closest Shields-compatible version of "Vibe budget | tokens | estimated cost".

| Mode | Preview | Command | Notes |
| --- | --- | --- | --- |
| `combined` | ![Vibe budget](https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Farlegotin%2Ff9f1989fe5ddd0f04e25df81c6dd051e%2Fraw%2Fagent-badge-combined.json&cacheSeconds=300) | `agent-badge config set badge.mode combined` | Default mode. Shows total attributed tokens and estimated USD together in one Shields message segment. |
| `tokens` | ![Tokens burned](https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Farlegotin%2Ff9f1989fe5ddd0f04e25df81c6dd051e%2Fraw%2Fagent-badge-tokens.json&cacheSeconds=300) | `agent-badge config set badge.mode tokens` | Shows total attributed token usage for the repo with compact badge-friendly formatting. |
| `cost` | ![AI receipt](https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Farlegotin%2Ff9f1989fe5ddd0f04e25df81c6dd051e%2Fraw%2Fagent-badge-cost.json&cacheSeconds=300) | `agent-badge config set badge.mode cost` | Shows an API-equivalent USD estimate derived from local token telemetry and current official provider pricing. |

`cost` is an estimate. It uses the local usage buckets available from Claude and Codex, combines them with current official OpenAI and Anthropic API pricing when pricing fetch succeeds, and falls back to bundled official rates when it cannot refresh pricing live. That number is useful for directional tracking, but it can differ from your actual bill, plan discounts, or non-API product pricing.

## Configuration

The CLI exposes a small configuration surface on purpose. The product is not trying to become a dashboard.

| Goal | Command |
| --- | --- |
| Show tokens and estimated cost | `agent-badge config set badge.mode combined` |
| Show tokens only | `agent-badge config set badge.mode tokens` |
| Show estimated cost only | `agent-badge config set badge.mode cost` |
| Set label to `AI Receipt` | `agent-badge config set badge.label "AI Receipt"` |
| Set the active badge color | `agent-badge config set badge.color orange` |
| Set the zero-state badge color | `agent-badge config set badge.colorZero silver` |
| Change Shields cache time | `agent-badge config set badge.cacheSeconds 900` |
| Ignore Codex data | `agent-badge config set providers.codex.enabled false` |
| Ignore Claude data | `agent-badge config set providers.claude.enabled false` |
| Disable auto-refresh on push | `agent-badge config set refresh.prePush.enabled false` |
| Make the hook strict instead of failure-soft | `agent-badge config set refresh.prePush.mode strict` |
| Hide extra publish details from CLI output | `agent-badge config set privacy.output minimal` |

`privacy.aggregateOnly` is intentionally fixed to `true`. `agent-badge` does not have a mode that publishes raw prompts, transcripts, filenames, or local paths.

Badge appearance stays intentionally small in scope: you can change the label, the active color, the zero-state color, and the Shields cache hint. The default cache time is `300` seconds.

Read the full supported config surface in [Configuration](docs/CONFIGURATION.md).


## Documentation

- [Quickstart](docs/QUICKSTART.md)
- [How It Works](docs/HOW-IT-WORKS.md)
- [Configuration](docs/CONFIGURATION.md)
- [Recovery Runbook](docs/RECOVERY.md)
- [Attribution Model](docs/ATTRIBUTION.md)
- [Privacy Model](docs/PRIVACY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Manual Gist Connection](docs/MANUAL-GIST.md)
- [Release Checklist](docs/RELEASE.md)


## Contributing

Issues, ideas, and sharper badge modes are welcome.

If you think AI-assisted work should be visible and measurable, you’re in the right repo.
