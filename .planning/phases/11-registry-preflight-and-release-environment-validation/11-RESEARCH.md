# Phase 11: Registry Preflight and Release Environment Validation - Research

**Researched:** 2026-03-31
**Domain:** live npm registry preflight, release-environment validation, and production-publish blocker detection for an npm workspace CLI
**Confidence:** HIGH

<user_constraints>
## User Constraints

- No phase `11-CONTEXT.md` exists, so there are no additional locked decisions beyond the roadmap, requirements, state, and current repo files.
- Scope this phase to `REL-07` only.
- Keep the release proof anchored to the current repo-owned workflow and checklist. Do not invent a second release system.
- Treat live registry and credential state as time-sensitive. A result observed on 2026-03-31 is not durable proof for a later publish.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REL-07 | Maintainer can verify live npm registry state for `agent-badge`, `create-agent-badge`, and `@agent-badge/core` immediately before publish, including whether the planned package names and ownership state are safe to use | The repo already documents three `npm view` commands in `docs/RELEASE.md`, but Phase 11 needs one repo-owned preflight flow that classifies safe vs blocked outcomes, checks auth and workflow prerequisites, and records exactly which release blocker must be resolved before Phase 12 |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- Keep the product local-first and serverless; release validation should happen from the maintainer machine or from the existing GitHub workflow path, not from a new hosted backend.
- Preserve aggregate-only privacy guarantees; release tooling must not export raw local history or filesystem details.
- Preserve the initializer-first npm UX; Phase 11 is maintainer workflow hardening, not end-user installation redesign.
- Preserve idempotent setup and failure-soft runtime behavior; release preflight should not mutate repo state or publish anything.
- Follow existing workspace, script, and workflow patterns rather than adding a parallel release stack.

## Summary

Phase 11 should turn the current release checklist's ad-hoc publish-time commands into one deterministic, repo-owned preflight that a maintainer can run immediately before production publish. The repo already has the important release pieces:

- workspace manifests are versioned at `1.1.0`
- `.changeset/config.json` is already public-package oriented
- `npm run release` already maps to `changeset publish`
- `.github/workflows/release.yml` already defines the intended publish path with `changesets/action@v1` and `NPM_TOKEN`
- `docs/RELEASE.md` already tells maintainers to run `npm view` for all three packages before publish

The gap is that the repo still lacks a single machine-checkable answer to: "Is it safe to attempt the first real publish right now?" Phase 11 should add that answer without publishing anything.

The preflight should check four areas:

1. **Live registry package state**
   For `agent-badge`, `create-agent-badge`, and `@agent-badge/core`, determine whether the package exists, what version and dist-tags are visible, and whether the planned release version looks safe versus blocked.
2. **Local publish identity**
   Confirm the maintainer can authenticate to npm and that the authenticated account is the identity intended to publish.
3. **Release-input consistency**
   Confirm the repo's package versions, workspace relationships, and changeset/release inputs are coherent before publish begins.
4. **Workflow prerequisites**
   Confirm the repo's release workflow still expects the same secret names and publish contract, and surface any missing local prerequisites needed to trigger or monitor the intended path.

**Primary recommendation:** keep the roadmap's two-plan split as written:

- `11-01` should own live registry/package-state classification.
- `11-02` should own release credential, workflow-prerequisite, and operator-environment validation.

## Current Repo State

### The release contract already exists, but only as scattered pieces

Root `package.json` already exposes:

- `npm run docs:check`
- `npm run typecheck`
- `npm run verify:clean-checkout`
- `npm run release`

This is good because Phase 11 can extend the current release checklist with one new preflight entrypoint rather than teaching maintainers a different process.

### Package manifests already define the publish targets clearly

Current publishable workspaces:

- `packages/agent-badge/package.json` -> `name: "agent-badge"`, `version: "1.1.0"`
- `packages/create-agent-badge/package.json` -> `name: "create-agent-badge"`, `version: "1.1.0"`
- `packages/core/package.json` -> `name: "@agent-badge/core"`, `version: "1.1.0"`, `publishConfig.access = "public"`

That means the preflight can derive exact package names and intended versions from repo state instead of requiring duplicated configuration.

### The release workflow is already the intended production path

`.github/workflows/release.yml` already:

- runs on `push` to `main` and `workflow_dispatch`
- installs dependencies with `npm ci`
- runs `npm run typecheck`
- runs `npm run verify:clean-checkout`
- publishes via `changesets/action@v1`
- relies on `secrets.NPM_TOKEN`

Phase 11 should not replace this path. It should validate that the operator environment and workflow contract are ready for Phase 12 to use.

### Current documentation is directionally right but too weak

`docs/RELEASE.md` currently documents:

- `/tmp` cache guidance
- required local gates
- `npm view agent-badge`
- `npm view create-agent-badge`
- `npm view @agent-badge/core`
- `npm run release`

The problem is that these commands are still human-interpreted. They do not yet provide one structured safe/warn/block decision, and they do not validate npm auth, workflow prerequisites, or release-input coherence.

### Existing diagnostics patterns are useful, but release preflight should stay maintainer-focused

The current `agent-badge doctor` flow already has a structured check/report pattern for repo setup, provider access, publish auth, and pre-push wiring. That pattern is worth reusing conceptually:

- stable check IDs
- pass/warn/fail status
- actionable fixes

But Phase 11 should not overload product-facing repository health checks with production-release concerns unless the added surface stays clearly maintainer-specific. A repo-owned release-preflight entrypoint is the cleaner fit.

## Standard Stack

### Core

| Tool | Purpose | Why Standard for Phase 11 |
|------|---------|---------------------------|
| Node.js + TypeScript | Deterministic preflight logic, JSON parsing, child-process integration | Already the repo's primary implementation stack |
| npm CLI | Live registry/auth checks via `npm view`, `npm whoami`, `npm access`, and publish contract validation | It is the system of record for the target registry and publish identity |
| GitHub Actions workflow files | Source of truth for intended production publish path | Phase 11 must validate readiness against the existing workflow, not an imagined one |

### Supporting

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `npm view <pkg> ... --json` | Inspect package existence, visible versions, and dist-tags | Use for the live registry package-state checks |
| `npm whoami` / `npm ping` | Validate npm auth availability before publish | Use for local maintainer identity and registry access checks |
| `changeset status` or direct workspace/version inspection | Validate publish inputs and pending release intent | Use to ensure the repo's release inputs are coherent before publish |
| Workflow-file inspection (`.github/workflows/release.yml`) | Validate expected secret names and publish steps | Use to prevent docs and release contract drift |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| One repo-owned preflight command/script | Keep relying on manual `npm view` commands in docs | Rejected because REL-07 needs a reliable safe-vs-blocked decision, not manual interpretation |
| Repo-owned script or TS entrypoint | Product CLI subcommand such as `agent-badge release-preflight` | Possible, but less desirable because release-operator tooling is repo-maintainer scope, not end-user product scope |
| Live registry and auth checks | Pure static manifest/workflow inspection | Rejected because name conflicts and credential state are external and time-sensitive |
| Hard failure on every uncheckable GitHub prerequisite | Mixed automated + explicit manual follow-up statuses | Mixed mode is safer because some GitHub secret metadata may not be queryable from every maintainer environment |

## Recommended Plan Split

### 11-01: Add a repo-owned live registry preflight and decision record for publish readiness

Own:

- derive the exact publishable package list and intended versions from workspace manifests
- run live registry queries for `agent-badge`, `create-agent-badge`, and `@agent-badge/core`
- classify results per package as `safe`, `warn`, or `blocked`
- surface concrete failure modes such as package already exists at unexpected version, missing package, unexpected dist-tag, or inconsistent registry metadata
- print and optionally persist a machine-readable preflight report that later phases can reference

Likely files:

- `package.json`
- `scripts/release/preflight.ts` or `scripts/release/preflight.mjs`
- `scripts/release/preflight.test.ts` or a nearby vitest-owned test file
- `docs/RELEASE.md`
- `.planning/phases/11-registry-preflight-and-release-environment-validation/11-RESEARCH.md` only as reference input

Recommended outputs:

- one repo-owned command such as `npm run release:preflight`
- structured output with package-by-package status
- a final overall decision that is easy to stop on before publish

Keep this plan focused on live registry/package-state truth for `REL-07`. Do not fold in credential and workflow checks beyond the minimum needed to run registry lookups.

### 11-02: Validate release credentials, secrets, and GitHub Actions prerequisites before production publish

Own:

- local npm auth checks such as `npm whoami` and `npm ping`
- validation that the release workflow still uses the expected publish contract (`npm run release`, `changesets/action@v1`, `NPM_TOKEN`)
- release-input checks for workspace versions, publishable package list, and changeset/readiness assumptions
- optional GitHub-auth-aware checks when credentials are available, but with clear degraded behavior when they are not
- operator-facing guidance in `docs/RELEASE.md` for what is automatically checked versus what still requires maintainer confirmation

Likely files:

- `package.json`
- `scripts/release/preflight.ts` or a sibling file such as `scripts/release/environment.ts`
- `scripts/release/preflight.test.ts`
- `docs/RELEASE.md`
- `scripts/verify-docs.sh`
- `.github/workflows/release.yml` only if a drift-fixing change is actually required

Keep this plan focused on the environment and workflow prerequisites for Phase 12. Do not attempt the real publish here.

## Architecture Patterns

### Pattern 1: Repo-Owned Release Preflight with Structured Statuses

**What:** Run a single repo command that emits stable per-check statuses (`pass`, `warn`, `fail` or `safe`, `warn`, `blocked`) plus actionable fixes.

**When to use:** For registry, auth, workflow, and release-input checks that operators must interpret quickly before publish.

**Why it fits this repo:** The repo already uses structured health reporting in `agent-badge doctor`, and maintainers need a clear go/no-go signal.

### Pattern 2: Manifest-Derived Package Inventory

**What:** Read package names and versions directly from the workspace manifests instead of duplicating them in docs or scripts.

**When to use:** For any release preflight check that needs the package list or intended release version.

**Why it fits this repo:** The target packages are already encoded in the manifests, and Phase 09 deliberately stabilized those versions.

### Pattern 3: External-State Checks Stay Read-Only

**What:** Use live registry reads and auth probes that do not mutate publish state.

**When to use:** For preflight gates before the first public publish.

**Why it fits this repo:** Phase 11 must detect blockers before Phase 12 publishes anything.

### Pattern 4: Graceful Degradation for GitHub Prerequisites

**What:** Distinguish between checks that can be automated locally and checks that require operator confirmation or optional GitHub auth.

**When to use:** For workflow-secret and release-environment checks where the repo can inspect file contracts but may not always be able to inspect secret metadata.

**Why it fits this repo:** It avoids false confidence while keeping the repo-owned preflight useful on typical maintainer machines.

## Risks and Pitfalls

### 1. `npm view` alone is too weak for a preflight decision

Current docs only show `npm view <pkg> name version`. That is useful but insufficient. Phase 11 should classify outcomes explicitly and include the intended release version from local manifests so maintainers do not have to mentally compare states.

### 2. GitHub secret values are not locally observable in most environments

The preflight should verify workflow contract and auth availability separately from secret presence/value. If the environment cannot prove secret presence automatically, it must say so clearly and require manual confirmation instead of silently passing.

### 3. Release preflight must stay read-only

Running `npm publish --dry-run` or a workflow mutation can blur the line between validation and release. Phase 11 should stop short of any action that changes registry or repository state.

### 4. Script-only implementation can become opaque without tests

Because live registry checks are time-sensitive and branch on varied outcomes, the classification logic should be unit-tested with fixture outputs rather than relying only on ad-hoc manual runs.

### 5. Documentation drift remains likely unless mechanically enforced

If `docs/RELEASE.md` gains new preflight instructions, Phase 11 should extend `scripts/verify-docs.sh` so the release checklist and repo-owned command stay synchronized.

## Validation Architecture

Phase 11 should keep fast feedback for classification logic and reserve live external checks for explicit manual verification.

### Automated validation

- Add targeted vitest coverage for registry-result parsing, overall status classification, missing-auth handling, and workflow-contract inspection.
- Keep the preflight implementation split so pure logic can be tested without live network access.
- Maintain one repo-owned command surface, but test the decision engine through pure functions or controlled child-process stubs.

### Manual-only validation

- Run the preflight command from a maintainer environment with live npm auth available.
- Confirm it reports the current state for `agent-badge`, `create-agent-badge`, and `@agent-badge/core`.
- Confirm it blocks on missing npm auth or unexpected registry/package-state conflicts.
- Confirm the release checklist still points to the same command and explains any manual follow-up required for GitHub Actions prerequisites.

### Recommended verification commands

- Quick: targeted vitest file(s) for release-preflight parsing and classification
- Full: `npm run docs:check && npm run typecheck && npm test -- --run`
- Manual live check: `npm run release:preflight` from a networked maintainer environment immediately before Phase 12

## Planning Notes for Downstream Agents

- The safest design is a repo-owned release-preflight entrypoint rather than a published product CLI command.
- Reuse the repo's existing status-reporting tone: exact failures, exact fixes, no ambiguous "looks good" text.
- Derive package names and versions from manifests, not duplicated constants in docs.
- Treat GitHub Actions secret validation as a mixed automated/manual contract unless the chosen implementation can prove metadata access safely.
- Make the overall result impossible to misread before production publish.
