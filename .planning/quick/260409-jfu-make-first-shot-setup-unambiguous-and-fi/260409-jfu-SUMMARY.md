# Quick Task 260409-jfu Summary

## Goal

Make first-shot setup outcomes explicit and reliable by removing shared-runtime version probe false failures and tightening setup docs around exact required commands.

## Completed Tasks

### 1) Fix shared-runtime probe false failures

- Updated [main.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/cli/main.ts) to register a real top-level `--version` option backed by package metadata.
- Added a CLI regression test in [main.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/cli/main.test.ts) proving `--version` is registered.
- Added runtime probe regression coverage in [shared-cli.test.ts](/Volumes/git/legotin/agent-badge/packages/core/src/runtime/shared-cli.test.ts) for whitespace normalization and non-zero exit behavior.
- Commit: `1d7c02e`

### 2) Make first-shot setup unambiguous in docs

- Updated [INSTALL.md](/Volumes/git/legotin/agent-badge/docs/INSTALL.md) with a strict "First-Shot Recommended Path" including install, runtime check, auth check, init, and verification commands.
- Updated [QUICKSTART.md](/Volumes/git/legotin/agent-badge/docs/QUICKSTART.md) with a "No-Debug First Shot" sequence and explicit interpretation for each `- Setup:` outcome, including `shared runtime could not be validated`.
- Updated [TROUBLESHOOTING.md](/Volumes/git/legotin/agent-badge/docs/TROUBLESHOOTING.md) with a dedicated `shared runtime could not be validated` recovery flow.
- Updated [CLI.md](/Volumes/git/legotin/agent-badge/docs/CLI.md) to include global options (`--version`, `--help`).
- Updated [README.md](/Volumes/git/legotin/agent-badge/README.md) to point users to the strict no-debug install sequence.
- Extended [verify-docs.sh](/Volumes/git/legotin/agent-badge/scripts/verify-docs.sh) so these first-shot/runtime-check invariants are enforced in CI.
- Commit: `1406b95`

## Verification

- `npm test -- --run packages/agent-badge/src/cli/main.test.ts packages/core/src/runtime/shared-cli.test.ts`
- `npm run docs:check`
- `npm run build`
- `node packages/agent-badge/dist/cli/main.js --version` -> `1.1.13` (exit `0`)

## Notes

- This fixes the false negative where init reported `shared runtime could not be validated` solely because the runtime probe called `agent-badge --version` while the CLI did not support that option.
