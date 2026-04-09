# Quick Task 260409-jn2 Summary

## Goal

Harden shared-runtime validation so init/config do not false-fail on older shared CLIs while preserving actionable broken-state diagnostics.

## Completed Tasks

### 1) Backward-compatible runtime probe

- Updated [shared-cli.ts](/Volumes/git/legotin/agent-badge/packages/core/src/runtime/shared-cli.ts) to run a two-stage probe:
  - primary: `agent-badge --version`
  - compatibility fallback: `agent-badge refresh --help`
- Preserved strict status semantics:
  - `missing` only when command resolution fails (`ENOENT`)
  - `available` when either probe proves command contract viability
  - `broken` when both probes fail, with combined diagnostics from both attempts
- Version handling:
  - use trimmed version when `--version` succeeds
  - report `unknown` when only compatibility probe succeeds

### 2) Operator-facing message stability with clearer fallback output

- Updated [init.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/init.ts) and [config.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/config.ts) to render `available (version unavailable)` for compatibility-path success, while keeping existing remediation text for `missing` and `broken`.

### 3) Regression coverage and validation

- Extended [shared-cli.test.ts](/Volumes/git/legotin/agent-badge/packages/core/src/runtime/shared-cli.test.ts) with:
  - fallback success when `--version` is unsupported
  - fallback success when version output is empty
  - dual-probe broken diagnostics
  - empty-version + failed-compatibility broken diagnostics
- Verified with:
  - `npm test -- --run packages/core/src/runtime/shared-cli.test.ts packages/agent-badge/src/cli/main.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/config.test.ts`
  - `npm run docs:check`
  - `npm run typecheck`
  - `npm run build`
  - `npm run release:preflight` (blocked as expected locally due same-version-already-published + npm auth not present)

## Commit

- `c70ad6d` `fix(runtime): add backward-compatible shared CLI probe`

## Release Notes

- Local preflight confirms this change set is release-eligible through the repo's GitHub Actions trusted-publishing path.
- Local direct publish remains blocked by design in this environment because registry `latest` is already `1.1.13` and `npm whoami` is unauthorized.
