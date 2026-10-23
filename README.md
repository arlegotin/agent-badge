# Agent Badge

Local-first AI coding usage, recorded in your repository. Supported local observations become sanitized, immutable receipts on `agent-badge/data`; `summary.json`, a coverage report and `badge.svg` are derived from that ledger.

This documents the unreleased repository-native replacement. Published npm `1.1.20` uses the previous architecture and does not provide these commands. Exact local candidate artifacts have passed Node 24/26 installation checks. Final scoped re-review and external release gates remain pending.

## Repository setup

Requires Node.js 24 or 26, npm and Git. Install a verified candidate runtime before using the command examples below. For development, build the workspace and inspect the CLI:

```sh
npm run build
npm run dev:agent-badge -- --help
```

The initializer entry point remains:

```sh
npm init agent-badge@latest
```

That is the intended public setup command **after the replacement is released**. Today `@latest` does not install this replacement. Do not use the old release to activate a candidate repository. [Installation](docs/INSTALL.md) explains local activation and exact runtime approval.

Once a candidate is installed, each clone explicitly activates the repository setup:

```sh
node .agent-badge/run.cjs setup
node .agent-badge/run.cjs status --json
node .agent-badge/run.cjs collect --full
node .agent-badge/run.cjs sync
```

Setup plans tracked configuration, a nested exact runtime lock, launcher, instructions and a managed README badge linked to data/coverage. It installs an approved runtime and recovery state under Git's common directory. It preserves the repository's package scripts and delegates existing supported hooks. Native provider project trust and hook review remain local user steps.

## What the numbers mean

All recorded work attributed to the repository counts, including abandoned branches and work that never merges. Squash, rebase, revert and code-branch deletion do not erase usage. Multiple contributors and worktrees union immutable identities rather than summing copied sessions. Unknown coverage, unsupported sources and unknown prices remain explicit. Costs are current-catalog API-equivalent estimates, never invoices or productivity measures.

Collection runs where the coding agent runs. CI cannot discover histories on someone else's machine. Codex has a pinned final-request reader; Gemini saved successful requests have partial coverage and recognized Gemini models remain unpriced. Native Claude numeric amounts are omitted. OpenCode candidates, Cursor and Copilot do not have certified numeric accounting in this release. See [source support and exact pins](docs/ATTRIBUTION.md).

## Privacy and synchronization

Public receipts contain scoped opaque hashes, allowlisted provider/model/meter fields and causal controls. Prompts, transcripts, source paths, filenames, credentials and raw provider IDs never enter outbound artifacts or Git metadata. Private discovery, attribution, journals and checkpoints stay under `<git-common-dir>/agent-badge/`.

Normal sync preserves the user's index, worktree, HEAD, stash and code refs, uses normal Git authentication, and fast-forwards only `refs/heads/agent-badge/data`. Automatic wakeups have a two-second total budget; incomplete work stays pending. No force push, Gist or hosted Badge service is needed.

Forks collect locally when their destination differs from the declaration. `contribute` writes a sanitized immutable envelope for a normal PR; trusted default-branch import accepts it in confirmed batches. Only accepted contributions affect upstream. [Fork contribution protocol](docs/superpowers/specs/2026-10-22-fork-contribution-import.md).

The ledger contains an SVG. For canonical GitHub destinations, setup embeds a fixed public `raw.githubusercontent.com/OWNER/REPO/refs/heads/agent-badge/data/badge.svg` image linked to the data-branch report. Other hosts receive an unsupported-image/report-only result. Hosting caches are separate from confirmed usage synchronization. Authenticated/private image rendering is an unverified external gate. [How it works](docs/HOW-IT-WORKS.md).

## Documentation

[Install](docs/INSTALL.md) · [Quickstart](docs/QUICKSTART.md) · [CLI](docs/CLI.md) · [Configuration](docs/CONFIGURATION.md) · [Attribution](docs/ATTRIBUTION.md) · [Privacy](docs/PRIVACY.md) · [Git authentication](docs/AUTH.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) · [Recovery](docs/RECOVERY.md) · [Uninstall](docs/UNINSTALL.md) · [FAQ](docs/FAQ.md).

[Design and implementation status](docs/superpowers/specs/2026-10-22-repo-native-design.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Release maintenance](docs/maintainers/RELEASE.md).

Licensed under [Apache-2.0](LICENSE). No release or deployment is authorized by this refactor.
