# FAQ

Supported execution requires Linux or macOS. Native Windows actions return `unsupported-platform` (exit 3) before setup or usage writes. WSL2 requires both the coding agent and Badge to run inside Linux; it does not imply discovery of native Windows histories.

## Which version do I need?

The repository-native commands require **2.0.0 or newer**. The initializer is `npm init agent-badge@latest`; check [release status](maintainers/RELEASE-STATUS.md) for publication evidence. Version 1 uses Gists and does not provide these commands or an automatic migration.

Version **2.0.0** is published on `latest`. The
[release record](maintainers/releases/2.0.0/README.md) confirms exact public bytes,
the initializer dependency graph and the supported platform matrix.

## What do I install per repository or clone?

Tracked declaration, nested exact runtime lock, launcher and instructions belong to the repository. Each clone/common directory explicitly approves its private runtime and integration with setup. Linked worktrees share private usage but native project hook/trust rules still apply. A global Badge runtime is unnecessary.

## Can CI scan my laptop?

No. Collection runs where the coding agent runs. CI imports accepted sanitized envelopes or usage collected in that CI environment; it cannot discover another machine's history.

## Does only merged code count?

All recorded repository work counts, including abandoned branches and failed experiments. Merge, squash, rebase, revert and code-branch deletion do not remove receipts. Unknown/unsupported history remains unknown rather than guessed.

## What happens in a fork?

A different origin stays unbound to upstream automatic publication. A writer can explicitly approve `setup --target upstream`; contributors use immutable sanitized public files in normal PRs. Only accepted default-branch imports affect upstream, and closed/unmerged PRs do not. For independent accounting, `setup --new-repository --repository-url <fork-url>` requires a fresh clone without Badge private state. A copied foreign data branch is never overwritten; choose a supported fresh destination without that foreign ledger or reconcile as repository owner.

## Are costs bills and are all agents supported?

No. Cost is current-catalog API-equivalent valuation of known supported dimensions. Unknown rates/models stay unpriced; token/cost coverage can differ. Native Claude amounts are omitted; OpenCode/Cursor/Copilot numeric accounting remains unsupported. Gemini saved-success coverage is partial and its recognized exact models remain unpriced. [Support table](ATTRIBUTION.md).

## Why can synced usage still be partial or the image stale?

Synchronization confirmation, provider coverage and HTTP image cache are distinct. `status` reports accepted commit/queue/partial/conflicts locally. The ledger contains `badge.svg`; canonical GitHub setup embeds its fixed public raw URL linked to the data-branch report. Non-GitHub hosts have no guessed image route. Private authenticated image rendering remains an unverified external gate.

## Does deleting tracked setup deactivate an older branch?

No. Approved private integration may keep working from an older branch with no tracked declaration. Explicit uninstall revokes owned activation/integrations while retaining unsynced data and remote history. Edited/unknown ownership remains for local action. [Uninstall](UNINSTALL.md).

## Can saved attribution reinclude shared exclusions?

Ordinary unchanged attribution/import cannot. `attribute` establishes repository membership only. Deliberate include/exclude requires current validated accepted causal heads and refuses offline/unbound operation. Remote-only keys use source-free control intent. Automatic worktree inventory also cannot authorize unseen history at a deleted/reused path.
