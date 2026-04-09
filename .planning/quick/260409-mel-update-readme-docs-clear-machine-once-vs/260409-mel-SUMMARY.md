# Quick Task 260409-mel Summary

## Goal

Make onboarding docs unambiguous by separating one-time machine setup from per-repo setup, and keep the short install path focused on only the commands users actually need.

## Completed Tasks

### 1) Rewrite the primary onboarding flow

- Updated [README.md](/Volumes/git/legotin/agent-badge/README.md) to present the quick path as "once per machine" plus "in each repo" instead of mixing setup, validation, and diagnostics into one short block.
- Updated [docs/INSTALL.md](/Volumes/git/legotin/agent-badge/docs/INSTALL.md) with a dedicated setup model section and a short fast path that keeps validation details in the fuller first-shot flow.
- Updated [docs/QUICKSTART.md](/Volumes/git/legotin/agent-badge/docs/QUICKSTART.md) so the no-debug path stays explicit, while the shortest path only shows the machine-level install plus per-repo initializer.
- Commit: `ffd0bd7`

### 2) Align supporting user docs with the same setup model

- Updated [docs/CLI.md](/Volumes/git/legotin/agent-badge/docs/CLI.md) to state the default machine-once and repo-per-repo contract directly in the command reference.
- Updated [docs/FAQ.md](/Volumes/git/legotin/agent-badge/docs/FAQ.md) with a direct "once per machine vs per repo" answer.
- Updated [docs/TROUBLESHOOTING.md](/Volumes/git/legotin/agent-badge/docs/TROUBLESHOOTING.md) to separate machine fixes from repo follow-up steps for shared runtime and auth issues.
- Commit: `ffd0bd7`

### 3) Lock the wording into the docs gate and restore docs-check health

- Updated [scripts/verify-docs.sh](/Volumes/git/legotin/agent-badge/scripts/verify-docs.sh) so CI now enforces the new onboarding structure instead of the older README quick-install wording.
- Updated [CHANGELOG.md](/Volumes/git/legotin/agent-badge/CHANGELOG.md) with the missing `1.1.15`, `1.1.16`, and `1.1.17` release headings required by the existing docs gate.
- Commit: `ffd0bd7`

## Verification

- `npm run docs:check`

## Notes

- No runtime code changed.
- `ROADMAP.md` was not modified.
