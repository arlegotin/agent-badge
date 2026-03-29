# Stack Research

**Domain:** Local-first developer tooling / GitHub badge publishing CLI
**Researched:** 2026-03-29
**Confidence:** HIGH

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

```bash
# Core
npm install commander octokit zod

# Supporting
npm install simple-git-hooks

# Dev dependencies
npm install -D typescript tsx vitest @types/node @changesets/cli
```

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

**If the repo is a pure CLI workspace:**
- Use npm workspaces with `packages/agent-badge` and `packages/create-agent-badge`
- Because both packages can share types, fixtures, and release flow without extra tooling

**If provider parsing gets large quickly:**
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

---
*Stack research for: local-first developer tooling / GitHub badge publishing CLI*
*Researched: 2026-03-29*
