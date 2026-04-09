---
quick_task: 260409-jfu
title: Make first-shot setup unambiguous and fix shared-runtime version probe false failure
status: planned
created: 2026-04-09T12:01:46.000Z
---

# Quick Task 260409-jfu Plan

## Goal

Make first-shot setup outcomes explicit and reliable by removing shared-runtime version probe false failures and tightening setup documentation around exact next steps.

## Tasks

1. Fix the shared-runtime version probe contract across CLI and core runtime inspection.
   - Update `packages/agent-badge/src/cli/main.ts` so `agent-badge --version` is a supported top-level path and returns a stable version string.
   - Update `packages/core/src/runtime/shared-cli.ts` only as needed to avoid false negatives from valid version probe output while preserving explicit broken-state diagnostics.
2. Add regression coverage for the probe fix.
   - Extend `packages/agent-badge/src/cli/main.test.ts` with assertions proving the top-level version option is registered and no longer treated as unsupported.
   - Extend `packages/core/src/runtime/shared-cli.test.ts` with a regression case for the false-failure scenario and a positive case for normalized version output.
   - Verify with focused test runs for both files (Vitest).
3. Make first-shot setup unambiguous in user docs and guard it in docs checks.
   - Update `docs/INSTALL.md`, `docs/QUICKSTART.md`, and `docs/TROUBLESHOOTING.md` to state the exact expected `init` setup outcomes and required next command/action for each branch (ready, auth-deferred, shared-runtime-missing).
   - Add/adjust assertions in `scripts/verify-docs.sh` so these outcome lines remain enforced.
   - Verify with `npm run docs:check`.
