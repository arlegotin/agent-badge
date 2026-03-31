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

## Documentation

- [Quickstart](docs/QUICKSTART.md)
- [Attribution Model](docs/ATTRIBUTION.md)
- [Privacy Model](docs/PRIVACY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Manual Gist Connection](docs/MANUAL-GIST.md)
