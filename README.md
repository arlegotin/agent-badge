<h1 align="center">agent-badge</h1>

<p align="center">
  A README badge for repos that ship with AI:
</p>

<p align="center">
  <img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Farlegotin%2Ff9f1989fe5ddd0f04e25df81c6dd051e%2Fraw%2Fagent-badge.json&cacheSeconds=300" alt="Last Commit"></a>
</p>

<p align="center">
  The badge reflects how many tokens were spent on development.
</p>

---

## 60-Second Path

Some people want transparency.<br>
Some people just want to flex how hard they ship with agents.

`agent-badge` works for both:

```bash
npm init agent-badge@latest
```

If GitHub auth is already available, init creates a public gist, publishes the first badge payload, and inserts the badge into `README.md`.

If GitHub auth is not available yet, init still completes the repo-owned scaffold and ends with:

- `- Publish target: deferred`
- `- Badge setup deferred: set GH_TOKEN, GITHUB_TOKEN, or GITHUB_PAT to create a public gist automatically, or rerun agent-badge init --gist-id <id> to connect an existing public gist.`
- `- Setup: repo setup complete, but GitHub auth is still required before the live badge can publish. Set GH_TOKEN, GITHUB_TOKEN, or GITHUB_PAT, then rerun agent-badge init or connect a public gist with agent-badge init --gist-id <id>.`

Other successful `init` runs can end with `- Publish target: connected existing gist` or `- Publish target: reused existing gist`, and when publish succeeds but the shared runtime is unavailable, setup ends with guidance to repair the shared runtime before relying on pre-push refresh.

The default path is shared-runtime/global-first: `npm init agent-badge@latest` writes `.agent-badge/*`, managed `.gitignore` entries, and the direct shared `pre-push` hook, but it does not install repo-local `node_modules`, `agent-badge:init`, or `agent-badge:refresh` by default.

To publish later, make sure the shared runtime is available on `PATH`, export `GH_TOKEN`, `GITHUB_TOKEN`, or `GITHUB_PAT`, or make `gh auth token` work in the same shell, then rerun:

```bash
agent-badge init
```

## What Gets Published

`agent-badge` publishes aggregate badge JSON and shared metadata only.

It does NOT publish prompts, transcripts, filenames, or local paths.

## Badge Examples

The badge at the top of this README is live. The gallery below shows how mode, style, label, and color settings change the output.

| Badge | Command |
| --- | --- |
| ![AI budget](https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Farlegotin%2Ff9f1989fe5ddd0f04e25df81c6dd051e%2Fraw%2Fagent-badge-combined.json&cacheSeconds=300) | `agent-badge config set badge.mode combined` |
| ![AI budget](https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Farlegotin%2Ff9f1989fe5ddd0f04e25df81c6dd051e%2Fraw%2Fagent-badge-tokens.json&cacheSeconds=300) | `agent-badge config set badge.mode tokens` |
| ![AI budget](https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Farlegotin%2Ff9f1989fe5ddd0f04e25df81c6dd051e%2Fraw%2Fagent-badge-cost.json&cacheSeconds=300) | `agent-badge config set badge.mode cost` |
| ![AI budget](https://img.shields.io/badge/AI%20budget-42%20tokens%20%7C%20%2458-teal?style=flat-square) | `agent-badge config set badge.style flat-square`<br>`agent-badge config set badge.color teal` |
| ![AI budget](https://img.shields.io/badge/AI%20budget-42%20tokens%20%7C%20%2458-royalblue?style=plastic) | `agent-badge config set badge.style plastic`<br>`agent-badge config set badge.color royalblue` |
| ![AI budget](https://img.shields.io/badge/AI%20budget-42%20tokens%20%7C%20%2458-ff69b4?style=for-the-badge) | `agent-badge config set badge.style for-the-badge`<br>`agent-badge config set badge.color "#ff69b4"` |
| ![AI receipt](https://img.shields.io/badge/AI%20receipt-%2458-orange) | `agent-badge config set badge.mode cost`<br>`agent-badge config set badge.label "AI receipt"`<br>`agent-badge config set badge.color orange` |
| ![Ship budget](https://img.shields.io/badge/Ship%20budget-42%20tokens%20%7C%20%2458-red?style=for-the-badge) | `agent-badge config set badge.mode combined`<br>`agent-badge config set badge.label "Ship budget"`<br>`agent-badge config set badge.color red`<br>`agent-badge config set badge.style for-the-badge` |

## Documentation

### User Docs

- [Install](docs/INSTALL.md)
- [Authentication](docs/AUTH.md)
- [Quickstart](docs/QUICKSTART.md)
- [CLI Reference](docs/CLI.md)
- [Configuration](docs/CONFIGURATION.md)
- [How It Works](docs/HOW-IT-WORKS.md)
- [Attribution Model](docs/ATTRIBUTION.md)
- [Privacy Model](docs/PRIVACY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Recovery Runbook](docs/RECOVERY.md)
- [Manual Gist Connection](docs/MANUAL-GIST.md)
- [Uninstall](docs/UNINSTALL.md)
- [FAQ](docs/FAQ.md)

### Maintainer Docs

- [Release Process](docs/maintainers/RELEASE.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)

## Contributing

If you think AI-assisted work should be visible and measurable, you’re in the right repo.

The maintainer workflow and support boundary live in [CONTRIBUTING.md](CONTRIBUTING.md).
