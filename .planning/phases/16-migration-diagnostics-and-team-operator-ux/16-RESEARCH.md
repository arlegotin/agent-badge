# Phase 16: Migration, Diagnostics, And Team Operator UX - Research

**Researched:** 2026-04-02
**Domain:** safe migration from legacy single-writer badge publishing to the shared contributor model with operator-visible health and recovery flows
**Confidence:** MEDIUM

<user_constraints>
## User Constraints

No phase `CONTEXT.md` exists for Phase 16. Planner must treat the following as the active constraints derived from `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`, Phase 14/15 artifacts, and the current codebase.

### Locked Decisions
- Goal: move existing repos to the shared model safely without changing the stable README badge URL.
- Must satisfy `MIGR-01`, `MIGR-02`, and `MIGR-03`.
- Shared publishing remains local-first, aggregate-only, and gist-backed. No prompts, transcript text, filenames, local paths, or raw `provider:providerSessionId` values may leave the machine.
- The public badge URL stays the same by reusing the existing gist id and `agent-badge.json` payload files rather than rotating publish targets.
- `init` stays idempotent and failure-soft behavior for refresh and `pre-push` stays intact.
- Phase 15 already locked the canonical shared payload to schema-version-2 per-session observation files plus one derived shared overrides file.

### Claude's Discretion
- Choose the exact migration contract for legacy repos that do not yet have shared contributor files.
- Choose the exact shared-health classification model exposed to operators.
- Choose which CLI surfaces own remote health inspection versus local-only status.
- Choose the exact doc split and recovery runbooks for team operators.

### Deferred Ideas (OUT OF SCOPE)
- Contributor leaderboards, dashboards, or org-wide analytics.
- New providers beyond Codex and Claude.
- Hosted coordination or a backend outside public Gists.
- Any attempt to publish raw per-session identifiers or reconstruct private evidence remotely.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MIGR-01 | Existing single-writer repositories can migrate to the shared publishing model without losing badge continuity or requiring README badge URL changes. | Reuse the existing gist id and badge file names, detect legacy-only publish state, and seed the first shared publish from a full local scan before switching local state to shared mode. |
| MIGR-02 | Operators can inspect whether a badge is in single-writer or shared mode and diagnose stale, conflicting, or orphaned contributor state. | Add one shared-health inspection service that reads remote shared files and local state, then reuse it in `status` and `doctor`. |
| MIGR-03 | Team publish flows document the limits of correctness clearly, including what still depends on local machine data and what is now shared remotely. | Update README and operator docs so migration, normal team publishing, stale contributors, and recovery flows are explicit and test-locked. |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- Keep the product local-first and serverless.
- Preserve the aggregate-only public boundary.
- Preserve the initializer-first npm UX and stable gist + Shields URL model.
- Keep incremental refresh and `pre-push` fast and failure-soft.
- Keep `init` idempotent and safe on reruns.

## Repo Reality

### What already exists
- Local state already distinguishes `publish.mode` as `"legacy"` or `"shared"` in [`packages/core/src/state/state-schema.ts`](../../../packages/core/src/state/state-schema.ts).
- Shared publish is now authoritative: [`packages/core/src/publish/publish-service.ts`](../../../packages/core/src/publish/publish-service.ts) writes one schema-version-2 contributor file per publisher, derives badge totals from merged remote contributor observations, and always persists `mode: "shared"` after publish.
- The shared reducer in [`packages/core/src/publish/shared-merge.ts`](../../../packages/core/src/publish/shared-merge.ts) can already detect conflicting observations implicitly because it groups duplicate session digests and resolves one canonical winner plus one repo-level override outcome.
- `init`, `publish`, and `refresh` already build `publisherObservations`, so the product has one shared publish contract across the main write paths.

### Gaps Phase 16 must close
- There is no explicit migration path for repos that previously published only the legacy single-writer badge payload. On the first shared publish, authoritative totals come only from schema-version-2 contributor files, so there is no operator-visible migration gate or continuity proof.
- `status` is local-only today. [`packages/agent-badge/src/commands/status.ts`](../../../packages/agent-badge/src/commands/status.ts) does not inspect remote shared files, contributor freshness, or conflict conditions.
- `doctor` checks gist reachability and README/hook wiring but not shared-state health. [`packages/core/src/diagnostics/doctor.ts`](../../../packages/core/src/diagnostics/doctor.ts) has no concept of stale contributors, orphaned local publisher ids, or mixed legacy/shared state.
- Docs are behind the implementation. [`docs/HOW-IT-WORKS.md`](../../../docs/HOW-IT-WORKS.md) still says contributor files carry aggregate totals, while the code now publishes per-session observations.

## Summary

Phase 14 and 15 solved safe multi-publisher storage and deterministic deduplication, but they did not finish the operator story. The repo can already publish shared contributor observations, yet a legacy repo has no explicit upgrade contract, and operators have no trustworthy answer to basic questions like "am I still in legacy mode?", "is my local publisher slot missing remotely?", or "are contributors disagreeing on shared sessions right now?".

The cleanest Phase 16 shape is:

1. Add a migration-and-health layer in core that classifies a repo as `legacy`, `shared-healthy`, `shared-stale`, `shared-conflict`, `partially-migrated`, or `orphaned-local-publisher` from local state plus remote gist files.
2. Make `init`, `publish`, and `refresh` use that layer so legacy repos switch to shared mode only through the existing gist id and badge files, with operator-visible migration results instead of silent behavior changes.
3. Reuse the same health report in `status`, `doctor`, and the docs so operators get one coherent model instead of three drifting descriptions.

**Primary recommendation:** do not invent a second backend or a lossy remote "history import". Migrate by reusing the original gist target and seeding shared state from the same local full-scan data the product already trusts, then surface any continuity uncertainty explicitly through shared-health diagnostics and docs.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | local environment `v22.14.0`, product support `>=20` | CLI runtime, fs, HTTP, gist reads, timestamp math | Existing runtime; Phase 16 is product logic, not a runtime migration. |
| TypeScript | 5.x repo line | Shared migration/diagnostic contracts and command wiring | Existing repo line; strong fit for cross-command shared types. |
| `zod` | repo standard | Strict parsing for any new shared-health or migration records | Remote public files and local state must stay fail-closed. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | repo standard | Migration, health, status, doctor, and docs regression tests | Use the existing test runner only. |
| `commander` | repo standard | Existing CLI surface | No new parser is needed; wire into current commands. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reusing `init`/`publish`/`refresh` for migration | A new `agent-badge migrate` command | Clearer naming, but it adds surface area and duplicates the existing publish/setup paths. |
| Shared-health inspection service reused by commands | Ad-hoc per-command remote reads | Faster to patch initially, but guarantees drift between `status`, `doctor`, and docs. |
| Local-source-seeded migration | Trying to recover prior totals from legacy badge payload JSON | Unsafe and incomplete because the public badge payload is not a lossless source of prior shared totals. |

**Installation:**
```bash
# No new packages are required for Phase 16.
# Reuse the existing workspace dependencies.
```

## Architecture Patterns

### Pattern 1: Treat migration as a state transition, not as a one-off script
**What:** Add one core migration preflight/helper that reads local state plus remote gist contents and decides whether the repo is still legacy-only, already shared, partially migrated, or orphaned.

**Why:** `init`, `publish`, and `refresh` all already touch publish state. The migration decision must be identical in every path or operators will see different behavior depending on which command they happen to run first.

**Recommended shape:**
- Add a new core module such as `packages/core/src/publish/shared-health.ts` or `packages/core/src/diagnostics/shared-publish-health.ts`.
- Input: local config/state, gist contents, current time.
- Output: a parsed report containing:
  - `mode`: `"legacy" | "shared"`
  - `health`: `"healthy" | "stale" | "conflict" | "partial" | "orphaned"`
  - `localPublisherId`
  - `remoteContributorCount`
  - `hasSharedOverrides`
  - `legacyBadgePresent`
  - `issues[]` with machine-readable ids and short human messages

**Concrete classification rules to carry into planning:**
- `legacy`: gist has badge payloads but no shared contributor files for this repo.
- `partial`: local state says shared but gist lacks required shared files, or gist mixes shared files with missing overrides/metadata expected after migration.
- `orphaned`: local state has `publisherId`, but the matching contributor file is missing remotely.
- `conflict`: at least one shared session digest has contradictory remote observations or override intent across publishers.
- `stale`: one or more contributor files are old enough to warn operators, but the model is otherwise coherent. Pick one explicit age threshold in implementation and print the actual age.
- `healthy`: shared files are coherent and local publisher state lines up with remote state.

### Pattern 2: Preserve continuity by reusing the same gist target and first shared publish contract
**What:** Migration should reuse the already-configured gist id and the same stable badge files (`agent-badge.json`, plus preview payloads when cost exists). The badge URL must not rotate.

**Why:** The product guarantee is a stable README badge URL. Any migration that swaps gist targets or README markup breaks the core promise.

**Implementation guidance:**
- Reuse the current gist id from config. Do not mint a second gist for migration.
- Run the same full-scan/shared-publish path already used by `init` and `publish` so the first shared write is sourced from local data the tool already trusts.
- Persist explicit migration state in local state after the first successful shared publish, for example:
  - `publish.mode = "shared"`
  - `publish.publisherId` locked
  - optional `publish.migratedAt` / `publish.migrationSource`

**Important limit:** legacy public badge payloads are not a lossless source of prior session-level history. Phase 16 should not fake exact continuity when the current machine cannot reconstruct it. The operator experience must surface that limit clearly rather than inventing a second remote source of truth.

### Pattern 3: `status` and `doctor` must read the same shared-health report
**What:** `status` should become the fast operator summary, while `doctor` stays the remediation surface. Both should consume one shared-health inspection API.

**Why:** Operators need consistent language. If `status` says "shared" while `doctor` says "publish-write: pass" but ignores an orphaned local publisher, the tool becomes untrustworthy.

**Recommended responsibilities:**
- [`packages/agent-badge/src/commands/status.ts`](../../../packages/agent-badge/src/commands/status.ts):
  - print local totals and checkpoints as today
  - add shared publish mode / health / contributor count / local publisher alignment
  - keep privacy-safe output; do not print raw digests or local paths
- [`packages/core/src/diagnostics/doctor.ts`](../../../packages/core/src/diagnostics/doctor.ts):
  - add one or two shared-state checks rather than overloading existing generic publish checks
  - include concrete remediation like rerun `agent-badge init`, `agent-badge refresh`, or migrate from the original publisher machine
- [`packages/agent-badge/src/commands/doctor.ts`](../../../packages/agent-badge/src/commands/doctor.ts):
  - reuse the richer core results, no bespoke shared-state logic

### Pattern 4: Docs must explain what is shared remotely versus what still depends on local machine history
**What:** Update docs to reflect the actual shared observation model and migration limits.

**Why:** `MIGR-03` is as much about trust as mechanics. The tool must explain that shared correctness improves from the moment repos publish shared contributor observations, but old single-writer history is still only as trustworthy as the local machine that performs the migration.

**Docs to update:**
- [`README.md`](../../../README.md) — explain shared mode at a high level and add a migration note for existing repos
- [`docs/HOW-IT-WORKS.md`](../../../docs/HOW-IT-WORKS.md) — fix contributor-file description to per-session observations and add shared-health overview
- [`docs/PRIVACY.md`](../../../docs/PRIVACY.md) — keep the aggregate-only boundary explicit even with diagnostics
- [`docs/TROUBLESHOOTING.md`](../../../docs/TROUBLESHOOTING.md) — add stale/orphaned/conflict/partial-migration recovery steps
- [`docs/MANUAL-GIST.md`](../../../docs/MANUAL-GIST.md) or a new team-operator doc — document rerun-`init` migration and normal team publish workflow

## Recommended Delivery Shape

### 16-01: Add migration path and diagnostics for existing repos
**Goal:** make legacy-to-shared transition safe and observable in code before polishing the operator-facing UX.

**Recommended scope:**
- add the core shared-health inspection/migration classification layer
- wire `init`, `publish`, and `refresh` through that layer
- persist any new migration metadata in local state/scaffold reconciliation
- add reducer/service tests for mixed legacy/shared gist contents, orphaned local publisher ids, conflict detection, and first-shared-publish migration behavior

### 16-02: Finalize team operator UX, docs, and verification
**Goal:** turn the migration and health foundation into an operator workflow that is understandable and reviewable.

**Recommended scope:**
- extend `status` and `doctor` output to surface shared-mode health clearly
- update docs and troubleshooting around migration, stale contributors, conflicts, and recovery
- add docs verification and command-level integration tests that lock the operator language down

## Concrete Extension Points

| Area | Files | Why they matter |
|------|-------|-----------------|
| Shared publish inspection | `packages/core/src/publish/publish-service.ts`, `packages/core/src/publish/shared-model.ts`, `packages/core/src/publish/shared-merge.ts` | Migration and health must understand the remote shared file layout already used for authoritative totals. |
| Local state evolution | `packages/core/src/state/state-schema.ts`, `packages/core/src/init/scaffold.ts`, `packages/core/src/init/scaffold.test.ts` | Any migration metadata or new shared-health state must survive init reruns safely. |
| Shared diagnostics | `packages/core/src/diagnostics/doctor.ts`, `packages/core/src/diagnostics/doctor.test.ts` | The existing doctor layer is the right home for actionable shared-state remediation. |
| Command wiring | `packages/agent-badge/src/commands/init.ts`, `packages/agent-badge/src/commands/publish.ts`, `packages/agent-badge/src/commands/refresh.ts`, `packages/agent-badge/src/commands/status.ts`, `packages/agent-badge/src/commands/*.test.ts` | Migration and health need consistent behavior across the main operator commands. |
| Docs | `README.md`, `docs/HOW-IT-WORKS.md`, `docs/PRIVACY.md`, `docs/TROUBLESHOOTING.md`, `docs/MANUAL-GIST.md`, `scripts/verify-docs.sh` | The current docs still describe Phase 14-era contributor files inaccurately. |

## Do Not Build The Wrong Thing

- Do not add a second publish backend or hosted migration store.
- Do not rotate gist ids or README badge URLs during migration.
- Do not invent raw session exports or leak digest samples into normal CLI output.
- Do not let `status` and `doctor` implement separate notions of shared health.
- Do not pretend remote legacy badge payloads are enough to reconstruct exact prior session history.

## Risks To Carry Into Planning

### Risk 1: continuity can be overstated
If planning treats the legacy public badge payload as a lossless source of historical truth, the migration path will overpromise. Keep the system explicit that trusted continuity comes from local data plus the existing gist target, not from reverse-engineering the rendered badge payload.

### Risk 2: stale/conflict rules can become vague
If the health report uses fuzzy wording like "looks stale" or "may be inconsistent", operator UX will be noisy and tests will be weak. Pick exact classifications and exact evidence fields.

### Risk 3: command drift
`init`, `publish`, `refresh`, `status`, and `doctor` all touch the same concept. If the phase is not centered on one shared-health contract, bugs will reappear as inconsistent operator output.

### Risk 4: docs can lag the code again
Phase 15 already left `docs/HOW-IT-WORKS.md` behind the real shared observation model. Phase 16 needs doc assertions in `scripts/verify-docs.sh`, not just prose edits.

## Validation Architecture

### Test Framework
- `vitest` is already established and should cover migration/service/command regressions.
- `bash scripts/verify-docs.sh` should remain the docs contract gate.

### Phase Requirements -> Test Map
| Requirement | Coverage |
|-------------|----------|
| MIGR-01 | publish-service/init/refresh tests prove legacy repos can switch to shared mode on the same gist id without changing the badge URL and with explicit migration state. |
| MIGR-02 | shared-health unit tests plus status/doctor command tests prove healthy/stale/conflict/orphaned/partial classifications and remediation output. |
| MIGR-03 | docs verification plus command output tests prove the operator wording matches the implementation and privacy boundary. |

### Recommended Commands
- Shared publish + migration core: `npm test -- --run packages/core/src/publish/*.test.ts packages/core/src/diagnostics/doctor.test.ts`
- Command surfaces: `npm test -- --run packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts`
- Docs gate: `npm run docs:check`
- Full suite: `npm test -- --run`

### Sampling Rate
- After any core shared-health or migration logic change: run the targeted core publish/diagnostics tests.
- After any command output or wiring change: run the targeted command tests.
- After any doc update: run `npm run docs:check`.
- After every plan wave: run `npm test -- --run`.

### Wave 0 Gaps
- Add shared-health fixtures that represent legacy-only, healthy shared, orphaned local publisher, stale contributor, and conflicting shared-observation gist states.
- Extend status and doctor tests so they assert the new shared-mode wording instead of only legacy publish state.
- Extend docs verification so shared observation terminology and migration guidance are locked down.

## Sources

### Primary (HIGH confidence)
- `packages/core/src/publish/publish-service.ts`
- `packages/core/src/publish/shared-model.ts`
- `packages/core/src/publish/shared-merge.ts`
- `packages/core/src/state/state-schema.ts`
- `packages/core/src/init/scaffold.ts`
- `packages/core/src/diagnostics/doctor.ts`
- `packages/agent-badge/src/commands/init.ts`
- `packages/agent-badge/src/commands/publish.ts`
- `packages/agent-badge/src/commands/refresh.ts`
- `packages/agent-badge/src/commands/status.ts`
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`

### Secondary (MEDIUM confidence)
- `docs/HOW-IT-WORKS.md`
- `docs/PRIVACY.md`
- `docs/TROUBLESHOOTING.md`
- `README.md`
- `scripts/verify-docs.sh`

## Metadata

- No external web research was required; this phase is constrained by the current repo state and roadmap.
- Research is intentionally biased toward repo-evidenced behavior rather than speculative feature expansion.
