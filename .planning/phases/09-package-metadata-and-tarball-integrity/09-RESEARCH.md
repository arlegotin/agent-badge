# Phase 9: Package Metadata and Tarball Integrity - Research

**Researched:** 2026-03-31
**Domain:** npm workspace package metadata, internal dependency versioning, and tarball verification for a TypeScript CLI monorepo
**Confidence:** HIGH

<user_constraints>
## User Constraints

- No phase `*-CONTEXT.md` exists for Phase 09, so there are no additional locked decisions beyond the roadmap and requirements files.
- Scope this phase to `PACK-01` and `PACK-02` only.
- Do not absorb `PACK-03` clean packed-install proof or `OPER-06` release checklist work from Phase 10.
- Ground the plan in the current repository state, current packaging commands, and current tarball contents.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PACK-01 | Maintainer can publish `@agent-badge/core`, `agent-badge`, and `create-agent-badge` with deliberate non-placeholder versions and correct internal dependency references | Current manifests still use `0.0.0`; internal refs are still `^0.0.0`; runtime wiring already switches from `latest` to `^x.y.z` when the runtime manifest becomes publishable semver |
| PACK-02 | Maintainer can produce package tarballs that exclude test artifacts and include only the runtime files required for imports and CLI execution | Current dry-run tarballs are already minimal because each publishable package uses `files: ["dist"]`; the gap is explicit verification, not broad packaging redesign |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- Keep the product local-first and serverless; packaging work must not add backend or hosted dependencies.
- Preserve aggregate-only privacy guarantees; publishable artifacts must not leak local transcript data, filenames, or machine paths.
- Preserve the initializer-first npm UX; `create-agent-badge` must continue to route into the `agent-badge init` flow cleanly after version changes.
- Maintain idempotent init and failure-soft pre-push behavior while package versions become deliberate.
- Follow the existing workspace shape and repository patterns instead of introducing a second package manager or release system.

## Summary

The repo already has the core mechanics needed for Phase 9. Root scripts expose a packaging path with `npm run pack:check`, `npm run smoke:pack`, and `npm run verify:clean-checkout`. The three intended publish targets already ship only `dist/**` plus `package.json` in dry-run tarballs, and the CLI entry files already have the `#!/usr/bin/env node` shebang required for `bin` entries. Phase 9 is therefore not about inventing packaging from scratch.

The real gaps are semantic. The publishable manifests still look like development placeholders: all three target packages are versioned `0.0.0`, internal references still point at `^0.0.0`, and package metadata is sparse. The runtime wiring code is already prepared for deliberate versions, because it falls back to `latest` only while the runtime manifest is still non-publishable. Once versions are made deliberate, the repository should also add an explicit tarball verification guard so future changes cannot silently leak tests, fixtures, or source files into published artifacts.

There is one adjacent issue worth surfacing now: the existing smoke script uses an `agent-badge-*.tgz` glob that also matches `agent-badge-core-*.tgz`, so the core tarball is passed twice to `npm install`. That is a Phase 10 install-rehearsal issue, not a PACK-02 tarball-content issue, but the planner should know about it.

**Primary recommendation:** keep the roadmap's two-plan split exactly as written.

## Current Repo State

### Publish targets vs workspace reality

Intended publish targets from the roadmap:

- `packages/core/package.json`
- `packages/agent-badge/package.json`
- `packages/create-agent-badge/package.json`

Current extra workspace package:

- `packages/testkit/package.json`

`@agent-badge/testkit` is test-only in current usage, but it is not marked `"private": true` and is not ignored in `.changeset/config.json`. That means the workspace does not yet explicitly distinguish "publishable packages" from "internal package" in metadata.

### Present package metadata state

Current publishable manifest facts:

- All three publish targets still use `"version": "0.0.0"`.
- `packages/agent-badge/package.json` depends on `"@agent-badge/core": "^0.0.0"`.
- `packages/create-agent-badge/package.json` depends on `"agent-badge": "^0.0.0"`.
- `packages/core/package.json` already has `"publishConfig": { "access": "public" }`, which is correct for the scoped package.
- `agent-badge` and `create-agent-badge` already expose correct `bin` entries into `dist`.
- All three publishable packages already use `"files": ["dist"]`.

Current metadata gaps across the three publishable manifests:

- no `description`
- no `license`
- no `repository`
- no `homepage`
- no `bugs`
- no `engines`

These fields are not required to satisfy `PACK-01` or `PACK-02`, but they are still part of the current "placeholder artifact" feel.

### Existing packaging commands

Already present at the root:

- `npm run pack:check`
- `npm run smoke:pack`
- `npm run verify:clean-checkout`

Current behavior:

- `pack:check` runs `npm pack --workspace <pkg> --dry-run --json` for the three publish targets.
- `verify:clean-checkout` clears `dist/` and `*.tsbuildinfo`, runs `npm run build`, `npm test -- --run`, then runs `pack:check` and `smoke:pack` with an isolated npm cache.
- `smoke:pack` creates real tarballs, installs them into a temporary project, imports both packages, and runs both CLIs.

### Current tarball contents

Dry-run tarballs from current source with an isolated cache:

| Package | Current version | Dry-run result |
|---------|-----------------|----------------|
| `@agent-badge/core` | `0.0.0` | 97 files: `dist/**` plus `package.json` |
| `agent-badge` | `0.0.0` | 23 files: `dist/**` plus `package.json` |
| `create-agent-badge` | `0.0.0` | 3 files: `dist/index.*` plus `package.json` |

Observed exclusions:

- no `src/**`
- no `*.test.ts`
- no `fixtures/**`
- no `.tsbuildinfo`
- no repo-level docs or lockfiles

Observed inclusions that matter:

- `package.json` is present in every tarball
- `main` and `bin` entry files are present
- CLI entry files in `agent-badge` and `create-agent-badge` already start with `#!/usr/bin/env node`

### Runtime version semantics already in code

The current codebase is already prepared for deliberate runtime versions:

- [`packages/agent-badge/src/commands/init.ts`](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/init.ts)
- [`packages/agent-badge/src/commands/config.ts`](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/config.ts)

Both normalize the runtime dependency specifier this way:

- if the runtime manifest version is `0.0.0` or otherwise non-publishable, use `"latest"`
- otherwise use `^<runtime-version>`

That means Phase 9 does not need a new version-selection model. It needs deliberate manifest versions and tests that keep this behavior honest.

### Environment caveat already proven in repo

On this machine, `npm run pack:check` fails against the default user cache because `~/.npm` contains root-owned files. The same command succeeds when run with an isolated `npm_config_cache`, and the repo already encodes that pattern in [`scripts/verify-clean-checkout.sh`](/Volumes/git/legotin/agent-badge/scripts/verify-clean-checkout.sh).

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| npm CLI | Local `11.6.0`; docs current at `11.11.1` | Workspace-scoped `npm pack`, `--dry-run`, `--json`, and `--pack-destination` flows | This is the packaging authority for what actually ships; PACK-02 should validate npm's packlist output, not a custom approximation |
| npm workspaces | Current repo workspace layout | Defines the publish targets and enables `npm pack --workspace <path>` | Already adopted in the repo and aligned with the initializer-first npm workflow |
| `@changesets/cli` | Installed `2.30.0`; latest `2.30.0` | Release/version workflow across workspaces | Already configured in `.changeset/config.json`; use the existing release tool rather than adding another versioning layer |
| `files` allowlists in each publishable `package.json` | Current manifests | Controls which package files enter published tarballs | Allowlist packaging is safer than denylist packaging for PACK-02 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | Repo line `^3.2.0`; current lock line `3.2.x` | Validate version-sensitive runtime wiring and manifest assumptions | Use for narrow behavioral tests around `init`/`config` if manifest changes affect runtime dependency specifiers |
| `tar` / `bsdtar` | Local `3.5.3` | Inspect packed `package.json` and tarball payloads directly | Use when dry-run JSON is not enough and Phase 9 needs to confirm the packed manifest itself |
| `npm pack --dry-run --json` | npm CLI built-in | Scriptable packlist verification | Use as the primary Phase 9 verification surface for both manifest and file-list assertions |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Explicit semver internal refs in publishable manifests | `workspace:*` or `workspace:^` | Rejected for publish targets: local npm 11.6.0 pack/install experiments preserved the `workspace:` specifier in the tarball and failed install with `EUNSUPPORTEDPROTOCOL` |
| `files: ["dist"]` allowlists | `.npmignore` denylist rules | `.npmignore` is easier to drift; npm docs also note subdirectory `.npmignore` can override root `files` behavior |
| `npm pack --dry-run --json` assertions | Manual eyeballing of tarballs | Manual inspection does not scale and will not protect Phase 10 or future regressions |

**Installation:**

```bash
# No new dependencies are required for Phase 9.
npm exec -- changeset --version
npm run build
npm_config_cache="$(mktemp -d /tmp/agent-badge-packcheck.XXXXXX)/cache" npm run pack:check
```

**Version verification:** No new dependency additions are recommended for this phase. Verified current tooling:

- `@changesets/cli` latest: `2.30.0` via `npm view @changesets/cli version`, published `2026-03-03`
- local Node.js: `v22.14.0`
- local npm: `11.6.0`

## Recommended Plan Split

### 09-01: Set deliberate workspace versions and internal dependency references

Own:

- deliberate non-placeholder versions for `@agent-badge/core`, `agent-badge`, and `create-agent-badge`
- internal dependency refs between those three packages
- explicit non-publish treatment for `@agent-badge/testkit`
- any manifest metadata that is cheap and clearly intentional, especially `description`, `license`, and `repository.directory`
- tests or assertions that make version-derived runtime wiring fail if the repo slips back to placeholder semantics

Likely files:

- [`packages/core/package.json`](/Volumes/git/legotin/agent-badge/packages/core/package.json)
- [`packages/agent-badge/package.json`](/Volumes/git/legotin/agent-badge/packages/agent-badge/package.json)
- [`packages/create-agent-badge/package.json`](/Volumes/git/legotin/agent-badge/packages/create-agent-badge/package.json)
- [`packages/testkit/package.json`](/Volumes/git/legotin/agent-badge/packages/testkit/package.json)
- [`package-lock.json`](/Volumes/git/legotin/agent-badge/package-lock.json)
- [`.changeset/config.json`](/Volumes/git/legotin/agent-badge/.changeset/config.json) only if the phase chooses an ignore-based safeguard instead of or in addition to `"private": true`

Do not default to editing runtime code. [`packages/agent-badge/src/commands/init.ts`](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/init.ts) and [`packages/agent-badge/src/commands/config.ts`](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/config.ts) already express the correct high-level behavior; they should only change if tests reveal gaps.

### 09-02: Tighten package file lists and validate tarball contents for all publishable packages

Own:

- explicit verification of packed manifest fields and packed file lists
- a pack verification script or strengthened `pack:check` implementation
- integration of that verification into existing root scripts
- any minimal manifest `files` adjustments needed to keep tarballs strict

Likely files:

- [`package.json`](/Volumes/git/legotin/agent-badge/package.json)
- [`scripts/verify-clean-checkout.sh`](/Volumes/git/legotin/agent-badge/scripts/verify-clean-checkout.sh)
- a new repo-level verifier such as [`scripts/verify-packages.mjs`](/Volumes/git/legotin/agent-badge/scripts/verify-packages.mjs)
- the three publishable package manifests if the `files` allowlists need refinement

By default, do not make [`scripts/smoke/verify-packed-install.sh`](/Volumes/git/legotin/agent-badge/scripts/smoke/verify-packed-install.sh) a Phase 9 owner. The smoke flow is a PACK-03 concern, although the script's glob overlap issue should be carried into Phase 10 planning.

## Architecture Patterns

### Recommended Project Structure

```text
package.json
package-lock.json
.changeset/config.json
packages/
├── core/package.json
├── agent-badge/package.json
├── create-agent-badge/package.json
└── testkit/package.json
scripts/
├── verify-clean-checkout.sh
├── smoke/verify-packed-install.sh
└── verify-packages.mjs        # recommended Phase 9 addition
```

### Pattern 1: Manifest-First Publish Contract

**What:** Treat the package manifests as the source of truth for publish intent. Set deliberate versions there first, then make tests and tooling derive behavior from those manifests.

**When to use:** For PACK-01 work and for any runtime code that computes install specifiers from the runtime package version.

**Example:**

```typescript
// Source: /Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/init.ts
function normalizeRuntimeDependencySpecifier(version: unknown): string {
  if (
    typeof version !== "string" ||
    version === "0.0.0" ||
    !publishableSemverPattern.test(version)
  ) {
    return "latest";
  }

  return `^${version}`;
}
```

### Pattern 2: Packlist-As-Policy

**What:** Use npm's own packlist output as the contract for what ships, then assert on the allowed and forbidden paths.

**When to use:** For PACK-02 verification and for future regression guards in clean-checkout validation.

**Example:**

```bash
# Source: https://docs.npmjs.com/cli/v11/commands/npm-pack/
npm pack --workspace packages/agent-badge --dry-run --json
```

### Anti-Patterns to Avoid

- **Publishing with `workspace:` internal dependency ranges:** local npm 11.6.0 pack/install experiments failed with `EUNSUPPORTEDPROTOCOL` after packing.
- **Using only manual review of `npm pack` output:** Phase 9 needs a scriptable guard.
- **Treating every workspace package as publishable:** `@agent-badge/testkit` is currently internal in actual usage.
- **Expanding Phase 9 into full install rehearsal or registry-name checks:** that belongs to Phase 10.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tarball inclusion rules | Custom glob walker that guesses npm behavior | `npm pack --dry-run --json` and npm's packlist rules | npm already defines the publish surface and always-included files |
| Internal version propagation | Ad hoc sync script across package.json files | Existing Changesets workflow plus explicit manifest edits | The repo already has `.changeset/config.json` and internal dependency update semantics |
| Package exclusion policy | Social convention that "testkit won't be published" | `"private": true` and/or explicit Changesets ignore | The current manifests do not encode that intent |

**Key insight:** PACK-02 should verify npm's behavior, not reimplement it.

## Common Pitfalls

### Pitfall 1: `workspace:` Ranges Survive the Tarball

**What goes wrong:** A package packs successfully inside the monorepo, but consumers cannot install the tarball.

**Why it happens:** npm 11.6.0 preserved `workspace:*` and `workspace:^` literally in local temp-workspace pack experiments, and a clean install failed with `EUNSUPPORTEDPROTOCOL`.

**How to avoid:** Use concrete semver ranges in publishable package manifests.

**Warning signs:** Packed `package/package.json` still contains `workspace:` in `dependencies`.

### Pitfall 2: False Packaging Failures from the Default npm Cache

**What goes wrong:** `npm run pack:check` fails even though the manifests and tarball contents are fine.

**Why it happens:** This machine's default `~/.npm` cache contains root-owned files.

**How to avoid:** Run pack validation with an isolated `npm_config_cache`, exactly as [`scripts/verify-clean-checkout.sh`](/Volumes/git/legotin/agent-badge/scripts/verify-clean-checkout.sh) already does.

**Warning signs:** `EPERM`, `_cacache/tmp`, or messages about root-owned files in `~/.npm`.

### Pitfall 3: Overlapping Tarball Globs in the Smoke Script

**What goes wrong:** The install command receives the core tarball twice.

**Why it happens:** In [`scripts/smoke/verify-packed-install.sh`](/Volumes/git/legotin/agent-badge/scripts/smoke/verify-packed-install.sh), `agent-badge-*.tgz` also matches `agent-badge-core-*.tgz`.

**How to avoid:** Use explicit filenames or a stricter matcher in Phase 10.

**Warning signs:** Process listings or install logs show both `agent-badge-core-...tgz` and the same file repeated through the broader `agent-badge-*.tgz` glob.

### Pitfall 4: Clean Tarballs but Placeholder Metadata

**What goes wrong:** PACK-02 appears green while the packages are still not intentional publish artifacts.

**Why it happens:** `files: ["dist"]` already keeps tarballs minimal, so pack checks can pass while versions remain `0.0.0` and internal refs remain placeholders.

**How to avoid:** Make `PACK-01` a distinct plan with direct manifest assertions.

**Warning signs:** `npm pack --dry-run --json` passes, but packed `package.json` still shows `0.0.0` or `^0.0.0`.

## Code Examples

Verified patterns from official sources and current repo behavior:

### Dry-Run a Single Workspace Package

```bash
# Source: https://docs.npmjs.com/cli/v11/commands/npm-pack/
npm pack --workspace packages/core --dry-run --json
```

### Use `files` as an Allowlist

```json
// Source: https://docs.npmjs.com/cli/v11/configuring-npm/package-json/
{
  "main": "./dist/index.js",
  "bin": {
    "agent-badge": "./dist/cli/main.js"
  },
  "files": ["dist"]
}
```

### Repository Metadata for a Monorepo Package

```json
// Source: https://docs.npmjs.com/cli/v11/configuring-npm/package-json/
{
  "repository": {
    "type": "git",
    "url": "git+https://github.com/legotin/agent-badge.git",
    "directory": "packages/agent-badge"
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Placeholder `0.0.0` manifests | Deliberate semver package versions | Planned for Phase 9 | Lets runtime wiring pin `^x.y.z` instead of falling back to `latest` |
| Trusting `files` without verification | Parse `npm pack --dry-run --json` output and packed manifests | Current npm v11 workflow | Makes tarball scope testable and repeatable |
| `workspace:` refs in monorepo source | Concrete semver refs in publishable manifests | Validated locally on 2026-03-31 | Avoids `EUNSUPPORTEDPROTOCOL` when consuming packed artifacts |

**Deprecated/outdated:**

- `0.0.0` as a shipping placeholder for the three publish targets
- `workspace:*` or `workspace:^` in publishable npm package `dependencies` for this repo's npm-based release path

## Open Questions

1. **What deliberate version line should the three publish targets start on?**
   - What we know: the requirements only forbid placeholders; they do not mandate `0.x` versus `1.0.0`.
   - What's unclear: whether the maintainer wants a conservative first public line such as `0.1.0` or a declared `1.0.0`.
   - Recommendation: decide this in 09-01 up front and apply it consistently across all three publish targets.

2. **How should `@agent-badge/testkit` be excluded from future publish flows?**
   - What we know: it is only used by tests, but it is currently a normal workspace package with `0.0.0` version and no `"private": true`.
   - What's unclear: whether the maintainer wants `"private": true`, a Changesets ignore rule, or both.
   - Recommendation: prefer `"private": true` in Phase 09, and only touch `.changeset/config.json` if an additional guard is wanted.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build and pack flow | ✓ | `v22.14.0` | — |
| npm CLI | Workspaces, `npm pack`, `npm exec`, install rehearsal | ✓ | `11.6.0` | — |
| `@changesets/cli` via `npm exec` | Existing release/version workflow | ✓ | `2.30.0` | Manual manifest edits if absolutely necessary |
| `bash` | Existing verify and smoke scripts | ✓ | `3.2.57` | Rewrite scripts in Node, not recommended for this phase |
| `tar` / `bsdtar` | Tarball inspection | ✓ | `3.5.3` | Inspect `npm pack --dry-run --json` only |

**Missing dependencies with no fallback:**

- None

**Missing dependencies with fallback:**

- Default user npm cache is effectively unusable for pack validation on this machine; use isolated `npm_config_cache` as the repo already does

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `3.2.x` plus script-based npm pack verification |
| Config file | [`vitest.config.ts`](/Volumes/git/legotin/agent-badge/vitest.config.ts) |
| Quick run command | `npm_config_cache="$(mktemp -d /tmp/agent-badge-packcheck.XXXXXX)/cache" npm run pack:check` |
| Full suite command | `npm run verify:clean-checkout` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PACK-01 | Publishable packages use deliberate versions and correct internal refs | script + targeted unit | `npm_config_cache="$(mktemp -d /tmp/agent-badge-packcheck.XXXXXX)/cache" npm run pack:check` | ❌ current `pack:check` does not yet assert manifest semantics |
| PACK-02 | Packed artifacts exclude tests, fixtures, and source files while preserving runtime entrypoints | script | `npm_config_cache="$(mktemp -d /tmp/agent-badge-packcheck.XXXXXX)/cache" npm run pack:check` | ❌ current `pack:check` only dry-runs pack; it does not yet fail on forbidden paths |

### Sampling Rate

- **Per task commit:** `npm_config_cache="$(mktemp -d /tmp/agent-badge-packcheck.XXXXXX)/cache" npm run pack:check`
- **Per wave merge:** `npm run build` plus the isolated-cache `npm run pack:check`
- **Phase gate:** `npm run verify:clean-checkout`

### Wave 0 Gaps

- [ ] [`scripts/verify-packages.mjs`](/Volumes/git/legotin/agent-badge/scripts/verify-packages.mjs) — parse `npm pack --dry-run --json`, assert allowed/forbidden paths, and inspect packed `package.json`
- [ ] [`package.json`](/Volumes/git/legotin/agent-badge/package.json) — upgrade `pack:check` from "run dry-run pack" to "run verifiable pack assertions"
- [ ] [`packages/testkit/package.json`](/Volumes/git/legotin/agent-badge/packages/testkit/package.json) — encode internal-only status before release planning drifts further

## Sources

### Primary (HIGH confidence)

- Current repo manifests and scripts:
  - [`package.json`](/Volumes/git/legotin/agent-badge/package.json)
  - [`packages/core/package.json`](/Volumes/git/legotin/agent-badge/packages/core/package.json)
  - [`packages/agent-badge/package.json`](/Volumes/git/legotin/agent-badge/packages/agent-badge/package.json)
  - [`packages/create-agent-badge/package.json`](/Volumes/git/legotin/agent-badge/packages/create-agent-badge/package.json)
  - [`packages/testkit/package.json`](/Volumes/git/legotin/agent-badge/packages/testkit/package.json)
  - [`scripts/smoke/verify-packed-install.sh`](/Volumes/git/legotin/agent-badge/scripts/smoke/verify-packed-install.sh)
  - [`scripts/verify-clean-checkout.sh`](/Volumes/git/legotin/agent-badge/scripts/verify-clean-checkout.sh)
- npm docs `package.json`: https://docs.npmjs.com/cli/v11/configuring-npm/package-json/
- npm docs `npm pack`: https://docs.npmjs.com/cli/v11/commands/npm-pack/
- Local npm 11.6.0 pack/install experiments run on 2026-03-31:
  - confirmed `workspace:*` and `workspace:^` survive packed `package.json`
  - confirmed clean install of those tarballs fails with `EUNSUPPORTEDPROTOCOL`

### Secondary (MEDIUM confidence)

- npm registry metadata for `@changesets/cli`: https://www.npmjs.com/package/@changesets/cli

### Tertiary (LOW confidence)

- None

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - based on current repo tooling, official npm docs, and local tool versions
- Architecture: HIGH - based on current repo structure plus verified npm pack behavior
- Pitfalls: HIGH - based on direct repo inspection and local pack/install experiments

**Research date:** 2026-03-31
**Valid until:** 2026-04-30
