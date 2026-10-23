<h1 align="center">agent-badge</h1>

<p align="center">
  A little receipt for the AI tokens that went into your repo.
</p>

<div align="center">

<!-- agent-badge:start -->
[![AI usage](https://raw.githubusercontent.com/arlegotin/agent-badge/refs/heads/agent-badge/data/badge.svg)](https://github.com/arlegotin/agent-badge)
<!-- agent-badge:end -->

</div>

Your coding agent spent tokens getting this thing to work. Put the receipt in the README.

**Agent Badge adds a badge showing recorded AI coding usage: tokens or estimated cost.** It reads supported usage on the machine where you code, combines contributions from the people working on the repo, and keeps the public data in the repo itself. The badge above is this project's own recorded usage.

## Get your badge

You'll need **Node 24 or 26, npm and Git**, on Linux or macOS. On Windows, run both Badge and your coding agent inside Linux/WSL2.

In your repo:

```sh
npm init agent-badge@latest
```

Review the generated files and hook instructions, approve the project hooks in your coding agent, then commit the repository setup with your README. Setup preserves existing supported hooks and doesn't stage or commit for you. [Full installation guide →](docs/INSTALL.md)

After activation, agent hooks and Git's pre-push hook collect supported usage and attempt to sync it. Offline work stays queued for later. You don't need a global Badge install, a Gist to keep republishing, or a separate Badge server.

The usage data and `badge.svg` live on **`agent-badge/data`**. Your README stays on your normal branch and displays that SVG. You don't have to switch branches to see the badge.

## What it looks like

These are **illustrative numbers**, rendered with the same SVG renderer as the live badge above. Labels are yours; the metric can be tokens or estimated cost.

| Badge | Color | Metric |
| --- | --- | --- |
| ![AI usage: 12.4M tokens](docs/assets/badges/tokens.svg) | Gold `#E8A515` | Tokens |
| ![AI burn: 12.4M tokens](docs/assets/badges/burn.svg) | Red `#DC2626` | Tokens |
| ![AI Receipt: $38.42](docs/assets/badges/receipt.svg) | Blue `#2563EB` | Cost |
| ![AI Bill: $38.42](docs/assets/badges/bill.svg) | Purple `#7C3AED` | Cost |
| ![AI usage: 12.4M tokens](docs/assets/badges/tokens-pink.svg) | Pink `#DB2777` | Tokens |
| ![AI spent: $38.42](docs/assets/badges/cost-teal.svg) | Teal `#0F766E` | Cost |

[Badge configuration →](docs/CONFIGURATION.md)

## A few everyday examples

**You've cloned a repo that already uses Badge.** Activate your own clone once:

```sh
node .agent-badge/run.cjs setup
```

The repository shares its configuration. Each clone approves its local runtime and hooks; linked Git worktrees share the same private usage state.

**You want to see what's recorded, or catch up after working offline:**

```sh
# Show totals, coverage and pending work.
node .agent-badge/run.cjs status

# Collect new usage and try to publish the queued data.
node .agent-badge/run.cjs sync
```

**Something looks wrong:**

```sh
node .agent-badge/run.cjs doctor
```

[CLI reference](docs/CLI.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) · [Recovery](docs/RECOVERY.md)

## Teams, branches, abandoned experiments

Everyone activates their own clone. Recorded work from feature branches counts, including work that never makes it to main. Squashing and rebasing don't erase it. Deleting the branch doesn't unspend the tokens.

Seeing the same session in two worktrees doesn't turn it into twice the usage. Copied sessions aren't automatically counted as extra spend either.

Fork contributors can export sanitized usage for a normal pull request:

```sh
node .agent-badge/run.cjs contribute
```

A fork doesn't silently push usage into upstream. Its contribution counts there after the PR is accepted and the trusted import runs. [Forks and collaboration →](docs/FAQ.md)

## Which agents are counted?

| Agent | What v2 can count |
| --- | --- |
| **OpenAI Codex** | Supported final-request records. Missing or incomplete history stays explicit. |
| **Gemini CLI** | Saved successful requests, with partial coverage. Recognized Gemini models currently have no price estimate. |
| **Claude Code** | Hook integration, but native historical token amounts are omitted because they can't be verified reliably. |
| **OpenCode, Cursor, Copilot** | No verified native token totals in this release. |

“Detected an agent” and “can trust its token total” are different things. Badge reports partial or unknown coverage when that's all the saved data supports. [Exact source support and limitations →](docs/ATTRIBUTION.md)

Costs use a recorded API rate catalog. They're estimates of the usage Badge can price, not subscription bills, proof of productivity, or a complete account of everything an agent ever did.

## What leaves your machine?

Sanitized usage records: provider, model, token counts and opaque identifiers used to avoid duplicates. **Prompts, conversations, source code, filenames, local paths and credentials stay out of the public data.** Private discovery and checkpoints stay under Git's private directory.

CI can't read the agent history on your laptop. Collection happens where the agent runs; only the sanitized results travel.

The badge uses a public GitHub raw-SVG URL. Private-repository image rendering hasn't been verified; other Git hosts currently get the data/report without an automatic image route. [Privacy](docs/PRIVACY.md) · [How it works](docs/HOW-IT-WORKS.md)

## Already using v1?

V2 replaces the Gist and global-runtime setup. There's no automatic migration of old configuration or opaque Gist totals. Preserve the old records you need, remove the v1-owned integrations, then explicitly set up v2. [Installation](docs/INSTALL.md)

## More

[Configuration](docs/CONFIGURATION.md) · [Git authentication](docs/AUTH.md) · [FAQ](docs/FAQ.md) · [Uninstall](docs/UNINSTALL.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

Open source under [Apache-2.0](LICENSE). [Releases](https://github.com/arlegotin/agent-badge/releases) · [Release verification](docs/maintainers/RELEASE-STATUS.md)
