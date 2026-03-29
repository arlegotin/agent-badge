<!-- GSD:project-start source:PROJECT.md -->
## Project

**agent-badge**

`agent-badge` is a local-first, serverless CLI that lets a repository publish a stable GitHub README badge showing historical and ongoing AI-agent usage. It initializes a repo, scans local Codex and Claude data under `~/.codex` and `~/.claude`, attributes that usage to the current repo, publishes aggregate badge JSON to a public Gist, and renders the badge through a fixed Shields endpoint URL.

The product is for developers who want a low-friction, trustworthy way to show how much AI assistance a repository has consumed without running a backend or exposing raw transcripts.

**Core Value:** Any repository can display an accurate, privacy-preserving AI usage badge with one setup command and near-zero ongoing maintenance.

### Constraints

- **Architecture**: Local-first and serverless - collection happens on the developer machine because that is where the source data lives.
- **Privacy**: Aggregate-only publishing - no raw transcripts, prompt text, filenames, or local paths may leave the machine.
- **Distribution**: Initializer-first npm UX - setup must work from `npm init agent-badge@latest` without requiring a global install.
- **GitHub Integration**: Public Gist plus Shields endpoint badge - README badge URLs must remain stable after first insertion.
- **Performance**: Incremental refresh must usually be fast enough for `pre-push` and must default to failure-soft behavior.
- **Reliability**: `init` must be idempotent - re-running setup cannot duplicate README badges, hooks, or Gists.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 24.x LTS (support >=20.x) | CLI runtime, file system access, HTTP, child process integration | Latest LTS keeps the tool on a supported runtime while still leaving room to support current developer machines on Node 20+. |
| TypeScript | 5.x | Shared domain model for scanners, attribution, publishing, and CLI commands | The product has multiple parsers and evidence-based attribution rules; type safety reduces silent data-shape bugs. |
| npm workspaces | npm 10.x | Manage `agent-badge` and `create-agent-badge` in one repository | The product ships two packages with shared logic; workspaces keep releases and local linking simple without adding another package manager requirement. |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `commander` | 14.x | Multi-command CLI surface (`init`, `scan`, `publish`, `refresh`, `doctor`, `status`, `config`, `uninstall`) | Use for runtime command parsing, help text, and subcommand routing. |
| `octokit` | 5.x | Public Gist create/update and GitHub auth-aware REST operations | Use for all GitHub API access instead of hand-rolled request code. |
| `zod` | 4.x | Parse and validate local config, derived state, provider metadata, and publish payloads | Use anywhere external or loosely structured data enters the system. |
| `simple-git-hooks` | 2.13.x | Lightweight `pre-push` installation without Husky-style ceremony | Use if direct hook-file management becomes brittle; otherwise a direct hook writer is acceptable for v1. |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| `vitest` 3.2.x | Unit and integration tests | Strong fit for TypeScript CLIs; keep fixture-heavy parser tests here. |
| `tsx` 4.20.x | Run local TypeScript entrypoints during development | Keeps local scripts simple without a separate compile step during iteration. |
| `@changesets/cli` 2.29.x | Version and release management across runtime and initializer packages | Helps publish `agent-badge` and `create-agent-badge` intentionally. |
## Installation
# Core
# Supporting
# Dev dependencies
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `commander` | `cac` | Use `cac` only if the CLI stays very small and command help customization is minimal. |
| `octokit` | Native `fetch` plus handwritten REST wrappers | Use raw `fetch` only if the surface stays tiny and you want to remove a dependency at the cost of more auth and pagination code. |
| npm workspaces | `pnpm` workspaces | Use `pnpm` if the repo already standardizes on it; for this product, npm alignment helps because the onboarding story centers on `npm init`. |
| Direct hook writer or `simple-git-hooks` | `husky` | Use `husky` only if the broader repo already depends on it; otherwise it adds avoidable setup friction for a single fast hook. |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Global-only runtime installation | It breaks reproducibility across machines and conflicts with the repo-local runtime goal. | Install the runtime in the project and invoke it through package scripts and hooks. |
| A second local usage database as the source of truth | It duplicates data the user already has under `~/.codex` and `~/.claude` and makes trust harder. | Keep only small derived checkpoint and publish state in `.agent-badge/state.json`. |
| Husky-first hook setup | It adds package lifecycle ceremony that is unnecessary for one failure-soft `pre-push` hook. | Write the hook directly or use a thin hook helper. |
| Summing raw low-level transcript events | It is easy to double count and hard to explain to users. | Prefer per-session cumulative totals, dedupe once, then aggregate by repo. |
## Stack Patterns by Variant
- Use npm workspaces with `packages/agent-badge` and `packages/create-agent-badge`
- Because both packages can share types, fixtures, and release flow without extra tooling
- Split reusable scanner logic into a shared `core` package
- Because provider adapters should not depend on CLI wiring or publish concerns
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Node.js 24.x LTS | `commander` 14.x, `vitest` 3.2.x, `tsx` 4.20.x | Develop on the latest LTS and test against Node 20, 22, and 24 in CI. |
| `octokit` 5.x | TypeScript 5.x, ESM-aware package config | Keep the repository ESM-first to avoid avoidable interop friction. |
| `zod` 4.x | TypeScript 5.x | Good fit for config and parser boundaries. |
## Sources
- https://nodejs.org/en/about/eol - verified supported Node release expectations and current LTS guidance
- https://docs.npmjs.com/creating-a-package-json-file/ - verified npm initializer and package setup conventions
- https://github.com/tj/commander.js - verified CLI framework fit and multi-command patterns
- https://github.com/octokit/octokit.js/ - verified GitHub SDK scope for REST, auth, and pagination
- https://www.npmjs.com/package/vitest - verified current stable test runner line
- https://www.npmjs.com/package/tsx - verified current dev runner line
- https://www.npmjs.com/package/%40changesets/cli - verified current release tooling line
- https://www.npmjs.com/package/simple-git-hooks - verified lightweight hook installation model
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
