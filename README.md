<h1 align="center">agent-badge</h1>

<p align="center">
  A README badge showing AI coding-agent usage for a repo:
</p>

<p align="center">
  <a href="https://github.com/arlegotin/agent-badge">
    <img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Farlegotin%2Ff9f1989fe5ddd0f04e25df81c6dd051e%2Fraw%2Fagent-badge.json&cacheSeconds=300" alt="AI burn badge">
  </a>
</p>

<p align="center">
  The badge reflects how many tokens were spent on development.
</p>

---

## What is it

`agent-badge` is an open-source CLI that adds a GitHub README badge showing **AI coding-agent usage** for a repo. It currently supports **Claude Code** and **OpenAI Codex**, shows **aggregate tokens + estimated cost**, and publishes **aggregate badge data only** — not prompts, transcripts, filenames, or local paths.

## 60-Second Path

Do this once:

```bash
# install the package globally:
npm install -g @legotin/agent-badge@latest
```

Do this in each repo:

```bash
# ensure GitHub authentication:
gh auth token >/dev/null

# add badge to the repo:
npm init agent-badge@latest
```

That is the quick install path: shared runtime once per machine, then in each repo confirm GitHub auth in the current shell and run init.

For full support details, use [docs/INSTALL.md](docs/INSTALL.md), [docs/QUICKSTART.md](docs/QUICKSTART.md), and [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md#shared-runtime-could-not-be-validated).

## What Gets Published

`agent-badge` publishes aggregate badge JSON and shared metadata only.

It does NOT publish prompts, transcripts, filenames, or local paths.

## Badge Examples

The badge at the top of this README is live. The gallery below also uses live repo data everywhere, with Shields query overrides for style, label, and color previews.

| Badge | Command |
| --- | --- |
| [![AI burn](https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Farlegotin%2Ff9f1989fe5ddd0f04e25df81c6dd051e%2Fraw%2Fagent-badge-combined.json&cacheSeconds=300)](https://github.com/arlegotin/agent-badge) | `agent-badge config set badge.mode combined` |
| [![AI Receipt](https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Farlegotin%2Ff9f1989fe5ddd0f04e25df81c6dd051e%2Fraw%2Fagent-badge-tokens.json&cacheSeconds=300&label=AI%20Receipt)](https://github.com/arlegotin/agent-badge) | `agent-badge config set badge.mode tokens`<br>`agent-badge config set badge.label "AI Receipt"` |
| [![AI spent](https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Farlegotin%2Ff9f1989fe5ddd0f04e25df81c6dd051e%2Fraw%2Fagent-badge-cost.json&cacheSeconds=300&label=AI%20spent)](https://github.com/arlegotin/agent-badge) | `agent-badge config set badge.mode cost`<br>`agent-badge config set badge.label "AI spent"` |
| [![AI Spend](https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Farlegotin%2Ff9f1989fe5ddd0f04e25df81c6dd051e%2Fraw%2Fagent-badge-combined.json&cacheSeconds=300&label=AI%20Spend&style=flat-square&color=teal)](https://github.com/arlegotin/agent-badge) | `agent-badge config set badge.label "AI Spend"`<br>`agent-badge config set badge.style flat-square`<br>`agent-badge config set badge.color teal` |
| [![AI Bill](https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Farlegotin%2Ff9f1989fe5ddd0f04e25df81c6dd051e%2Fraw%2Fagent-badge-combined.json&cacheSeconds=300&label=AI%20Bill&style=plastic&color=royalblue)](https://github.com/arlegotin/agent-badge) | `agent-badge config set badge.label "AI Bill"`<br>`agent-badge config set badge.style plastic`<br>`agent-badge config set badge.color royalblue` |
| [![AI Receipt](https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Farlegotin%2Ff9f1989fe5ddd0f04e25df81c6dd051e%2Fraw%2Fagent-badge-combined.json&cacheSeconds=300&label=AI%20Receipt&style=for-the-badge&color=%23ff69b4)](https://github.com/arlegotin/agent-badge) | `agent-badge config set badge.label "AI Receipt"`<br>`agent-badge config set badge.style for-the-badge`<br>`agent-badge config set badge.color "#ff69b4"` |
| [![AI spent](https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Farlegotin%2Ff9f1989fe5ddd0f04e25df81c6dd051e%2Fraw%2Fagent-badge-cost.json&cacheSeconds=300&label=AI%20spent&color=orange)](https://github.com/arlegotin/agent-badge) | `agent-badge config set badge.mode cost`<br>`agent-badge config set badge.label "AI spent"`<br>`agent-badge config set badge.color orange` |
| [![AI Bill](https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Farlegotin%2Ff9f1989fe5ddd0f04e25df81c6dd051e%2Fraw%2Fagent-badge-combined.json&cacheSeconds=300&label=AI%20Bill&color=red&style=for-the-badge)](https://github.com/arlegotin/agent-badge) | `agent-badge config set badge.mode combined`<br>`agent-badge config set badge.label "AI Bill"`<br>`agent-badge config set badge.color red`<br>`agent-badge config set badge.style for-the-badge` |

When the configuration changes, run `agent-badge refresh`.

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
