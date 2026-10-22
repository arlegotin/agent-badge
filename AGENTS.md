# agent-badge

Local-first CLI for privacy-preserving AI coding usage badges. The repository
contains npm workspaces for the core library, CLI, initializer, and test fixtures.

## Workflow

- Use Superpowers for design, planning, implementation, review, and verification.
- Keep designs in `docs/superpowers/specs/` and execution plans in
  `docs/superpowers/plans/`. Track research and decisions in Git.
- The current refactoring is a breaking redesign. Backward compatibility with
  the Gist architecture, global runtime setup, or old schemas is not required.
- Design the replacement around repository-owned data and automation, including
  multiple contributors, branches, forks, and Git worktrees.
- Planning does not authorize publishing releases or deploying the replacement.

## Product constraints

- Read usage where the coding agent runs; never claim CI can discover usage that
  exists only on a developer's machine.
- Never commit or transmit prompts, transcripts, local paths, filenames from
  agent work, credentials, or raw provider session identifiers.
- Keep public usage data separate from private local discovery and checkpoints.
- Prefer trustworthy partial coverage over fabricated counts or costs.
- Setup must be idempotent. Automatic maintenance must preserve existing hooks,
  the user's index and worktree, and normal Git operations.
- Keep the initializer entry point `npm init agent-badge@latest`.

## Code and validation

- ESM TypeScript; npm workspaces. Follow focused modules and typed boundaries.
- Existing source lives in `packages/core/src`, `packages/agent-badge/src`,
  `packages/create-agent-badge/src`, and `packages/testkit`.
- Use synthetic, sanitized provider fixtures. Do not copy private user histories
  into tests, reports, logs, or tool output.
- Standard checks: `npm run typecheck`, `npm run build`,
  `npm test -- --run`, and `npm run docs:check`.
- Package/release changes additionally need `npm run pack:check` and
  `npm run smoke:pack`. Run publishing commands only with explicit authorization.
- `/Volumes/git` may have little free space. Use an isolated temporary copy for
  dependency installation and baseline validation when necessary.
