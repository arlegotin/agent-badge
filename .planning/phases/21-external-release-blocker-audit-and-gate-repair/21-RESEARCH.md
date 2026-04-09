# Phase 21: External Release Blocker Audit And Gate Repair - Research

**Researched:** 2026-04-05
**Domain:** external release-readiness blocker classification, trusted-publishing gate repair, and production-readiness evidence boundaries
**Confidence:** HIGH

<user_constraints>
## User Constraints

No phase `CONTEXT.md` exists for Phase 21. Planner must treat the following as the active constraints derived from `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`, `docs/RELEASE.md`, the current release tooling, and the current live preflight result captured during milestone kickoff.

### Locked Decisions
- Goal: close the gap between local release confidence and live external release readiness by making the remaining blockers explicit, reproducible, and actionable.
- Must satisfy `REL-01` and `REL-02`.
- Keep `.github/workflows/release.yml` as the canonical production publish path. Do not introduce a local CLI fallback as the supported production workflow.
- Do not claim the repo is production ready from local green gates alone.
- Preserve the current package set and lockstep publish model for `@legotin/agent-badge-core`, `@legotin/agent-badge`, and `create-agent-badge`.
- Keep release artifacts privacy-safe. No secrets, tokens, or local-only credential material should be written into phase evidence.

### Claude's Discretion
- Choose whether blocker classification lives entirely in `scripts/release/preflight.ts` or is split between machine-readable report fields and documentation tables, as long as the final contract is explicit and grep-verifiable.
- Choose the exact artifact name for the phase-owned readiness-gap summary, as long as it captures the live preflight result and the manual confirmations the repo still cannot prove automatically.
- Choose whether `trusted-publisher` and `package-ownership` appear as explicit preflight checks or as explicit unresolved manual confirmations, as long as they are no longer implicit tribal knowledge.

### Deferred Ideas (OUT OF SCOPE)
- Executing the actual production publish for this phase.
- Repairing registry artifacts after a publish.
- Net-new product behavior, telemetry paths, badge modes, or publish backends.
- Replacing the GitHub Actions OIDC release path with a maintainer-machine publish flow.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REL-01 | Maintainers can distinguish a locally green checkout from an externally blocked release state before claiming the repo is production ready. | The phase needs a repo-owned artifact and documentation that show local rehearsal can pass while live publish readiness is still blocked. |
| REL-02 | The canonical preflight and docs classify the concrete blocker type when release is blocked, including npm auth, package ownership, trusted-publisher configuration, or registry version drift. | The release-preflight contract needs explicit blocker categories instead of generic warn/blocked summaries, plus documentation for the categories that cannot be auto-proved from local context. |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- Keep the product local-first and serverless.
- Preserve the aggregate-only public boundary.
- Preserve the initializer-first npm UX and stable gist + Shields URL model.
- Keep incremental refresh and `pre-push` fast and failure-soft by default.
- Keep `init` idempotent and safe on reruns.
- Treat release evidence as operator-grade proof, not marketing copy.

## Repo Reality

### What already exists
- Local release rehearsal is strong. `npm run typecheck`, `npm test -- --run`, `npm run docs:check`, and `npm run verify:clean-checkout` all passed during milestone kickoff, including tarball packing and fresh packed-install smoke.
- `scripts/release/preflight.ts` already checks registry metadata, `npm ping`, `npm whoami`, manifest coherence, and required workflow markers. It returns machine-readable JSON and already blocks on same-version conflicts or missing npm auth.
- `docs/RELEASE.md` already states an important limitation: local preflight cannot prove GitHub Actions trusted-publisher state remotely, and maintainers must confirm trusted publishing separately.
- `.github/workflows/release.yml` already encodes the intended production contract: OIDC permissions, publish-impact detection, auto-versioning from the registry-visible runtime version, and publish from `main`.
- Phase 12 and Phase 13 already established the repo's evidence pattern for publish proof (`12-PUBLISH-EVIDENCE.*`) and post-publish registry proof (`13-REGISTRY-SMOKE.*`).

### Current blocker state observed during milestone kickoff
- Live preflight returned `overallStatus: "blocked"`.
- `npm whoami` returned `401 Unauthorized`, so the maintainer environment could not confirm npm auth.
- All three packages are already visible in the registry at `1.1.3`, while the checked-in manifests are still `1.1.2`.
- The workflow-contract check is safe, which means the repo wiring looks correct locally even though the external release gate is still blocked.

### Gaps Phase 21 must close
- The repo can tell that release is blocked, but it does not yet express the blocker taxonomy cleanly enough for a "production ready" claim boundary.
- The current preflight JSON uses summaries and statuses, but it does not expose a stable, explicit blocker vocabulary such as:
  - npm auth missing
  - registry version drift
  - same version already published
  - trusted-publisher remote confirmation pending
  - package ownership confirmation pending
- Trusted-publisher and ownership checks are still mostly procedural knowledge in `docs/RELEASE.md`, not first-class release-readiness categories.
- There is no Phase 21 artifact that freezes the exact current external readiness gap the milestone is supposed to close.

## Summary

Phase 21 should stay narrow and operational. The repo already has strong local proof. What is missing is an explicit external-readiness boundary and a repo-owned record of the remaining blockers. The safest split is:

1. Capture the exact current external readiness gap in a phase-owned artifact using the existing preflight entrypoint plus manual confirmation notes.
2. Repair the preflight contract and release docs so auth, ownership, trusted-publisher, and version-drift states are named explicitly and cannot be hand-waved as "local tests passed."

**Primary recommendation:** keep Phase 21 to exactly two plans:
- `21-01` audits and records the live blocker state in phase-owned artifacts.
- `21-02` upgrades `release:preflight` and `docs/RELEASE.md` so the repo has a stable blocker taxonomy and an explicit local-vs-external readiness distinction.

## Exact Artifact Targets

| Artifact | Action | Why It Matters | Recommended Plan |
|---------|--------|----------------|------------------|
| `.planning/phases/21-external-release-blocker-audit-and-gate-repair/21-preflight.json` | Create | Freezes the exact machine-readable live preflight result for the current source tree. | 21-01 |
| `.planning/phases/21-external-release-blocker-audit-and-gate-repair/21-EXTERNAL-READINESS.md` | Create | Converts the preflight result plus manual confirmations into one operator-readable readiness-gap artifact. | 21-01 |
| `scripts/release/preflight.ts` | Update | Adds explicit blocker classification and local-vs-external readiness vocabulary. | 21-02 |
| `scripts/release/preflight.test.ts` | Update | Locks the blocker taxonomy and report behavior with focused tests. | 21-02 |
| `docs/RELEASE.md` | Update | Makes the exact blocker categories and manual confirmations part of the canonical release runbook. | 21-02 |
| `.planning/STATE.md` | Update | Records the exact current blocker classes in planning state instead of generic concern text. | 21-02 |

## Recommended Delivery Shape

### 21-01: Audit live release blockers and reconcile the exact external readiness gap
**Goal:** capture the current external release state in a durable artifact so the milestone works from evidence, not memory.

**Recommended scope:**
- run `npm --silent run release:preflight -- --json`
- persist the result to `21-preflight.json`
- write `21-EXTERNAL-READINESS.md` with:
  - local gates that are already green
  - the exact live blocker result
  - manual confirmations still required for ownership and trusted publishing
  - the repo-owned follow-up work the next plan will implement

### 21-02: Repair preflight, docs, and planning state around blocker classification
**Goal:** make the blocker taxonomy explicit and stable in the repo-owned release contract.

**Recommended scope:**
- extend `scripts/release/preflight.ts` to expose explicit blocker codes or equivalent structured classifications
- add tests for npm-auth failure, registry version drift, same-version conflict, and unresolved manual confirmations
- update `docs/RELEASE.md` so maintainers can distinguish locally green from externally blocked
- update `.planning/STATE.md` blocker wording to match the new taxonomy once it exists

## Validation Architecture

### Focused validation
- `npm test -- --run scripts/release/preflight.test.ts`
- `npm run docs:check`
- phase-artifact grep checks for `21-preflight.json` and `21-EXTERNAL-READINESS.md`

### Manual validation
- real `npm whoami`, `npm view`, and registry-version checks in the current maintainer environment
- explicit confirmation of npm package ownership and GitHub Actions trusted-publisher settings when local tooling cannot prove them

## Concrete Extension Points

- [`scripts/release/preflight.ts`](../../../scripts/release/preflight.ts)
  - existing machine-readable release gate; best place for explicit blocker classification
- [`scripts/release/preflight.test.ts`](../../../scripts/release/preflight.test.ts)
  - focused contract tests for blocker categories
- [`docs/RELEASE.md`](../../../docs/RELEASE.md)
  - canonical operator runbook for interpreting preflight and publish-time blockers
- [`scripts/release/capture-publish-evidence.ts`](../../../scripts/release/capture-publish-evidence.ts)
  - useful reference for machine-readable evidence shape, but do not expand it yet unless Phase 21 truly needs a new artifact writer
- [`.github/workflows/release.yml`](../../../.github/workflows/release.yml)
  - the production contract Phase 21 must describe accurately, not replace

## Anti-Patterns to Avoid

- Treating local green tests as sufficient proof of production readiness.
- Inventing a local manual publish escape hatch because remote confirmation is annoying.
- Writing phase evidence that includes secrets, tokens, or local credential material.
- Hiding trusted-publisher and ownership checks inside prose footnotes instead of naming them explicitly.
- Reopening package/runtime implementation when the gap is release-operations classification.

## Key Insight

Phase 21 is not about making the codebase more correct. It is about making the release boundary more truthful.
