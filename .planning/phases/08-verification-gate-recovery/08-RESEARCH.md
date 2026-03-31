# Phase 8: Verification Gate Recovery - Research

**Researched:** 2026-03-31
**Domain:** TypeScript build recovery, schema/test drift repair, and clean-checkout verification rebasing
**Confidence:** HIGH (repo facts from current source and local verification)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
No phase CONTEXT file exists (`.planning/phases/08-verification-gate-recovery/*-CONTEXT.md` not found).

### Claude's Discretion
Plan from roadmap requirements, current repo state, and observed verification failures.

### Deferred Ideas (OUT OF SCOPE)
Phase 8 is recovery only. Do not widen scope into package publishing metadata, tarball trimming, or new product behavior.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REL-04 | `npm run build` succeeds from committed source on a supported Node version with no TypeScript errors | Current failure is isolated to `packages/core/src/publish/github-gist-client.ts` and the local Octokit adapter type contract |
| REL-05 | `npm test` succeeds from committed source, including doctor coverage and Claude incremental refresh coverage | Current test failures split cleanly into doctor fixture/schema drift and one Claude incremental fixture/assertion drift |
| REL-06 | Release-critical verification matches current schemas and runtime behavior from a clean checkout | Current release-readiness matrix passes, but clean-checkout verification still needs rebasing around current config/state schema and artifact expectations |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- Local-first and serverless behavior must remain intact.
- Aggregate-only publishing remains mandatory; no raw transcript/path leakage in tests or fixtures.
- `init` must stay idempotent and failure-soft behavior must remain true for pre-push refresh.
- Phase 8 should restore confidence in current gates, not redesign product architecture.

## Summary

Phase 8 is a recovery phase, not a feature phase. The repo already has the release-readiness scaffolding from Phase 7: docs exist, CI/release workflows exist, and the scenario-matrix proof file passes. The blocking issue is that source-of-truth verification no longer matches current code and schema reality.

Local verification from current source shows three concrete breakpoints:

1. `npm run build` fails on `packages/core/src/publish/github-gist-client.ts` with `TS2352` because the dynamic `import("octokit")` cast does not match the actual Octokit type surface. The local adapter expects `rest.gists.remove`, but the imported type surface no longer overlaps cleanly with the hand-rolled `OctokitLike` shape.
2. `npm test -- --run` fails in `packages/core/src/diagnostics/doctor.test.ts` because the fixture builds `.agent-badge/state.json` from parsed config shape instead of current state schema shape. The thrown `ZodError` shows missing `init`, `checkpoints`, `refresh.lastRefreshedAt`, `refresh.summary`, and `overrides`, plus stale/unrecognized keys like `providers`, `repo`, `badge`, `privacy`, and `refresh.prePush`.
3. `npm test -- --run` fails in `packages/core/src/providers/claude/claude-adapter.test.ts` because the incremental fixture mutates a file path that the current Claude fixture set no longer treats as the changed project file. The test expects one changed session and receives zero.

**Primary recommendation:** keep the roadmap's three-plan split and treat each gate as a separate recovery lane:

- 08-01 restores TypeScript build truth around the Octokit boundary.
- 08-02 repairs test fixture/schema drift and Claude incremental coverage.
- 08-03 rebaselines clean-checkout verification so release-critical checks reflect current config/state schema and artifact behavior.

## Repo Reality

- `package.json` defines the authoritative gates:
  - `build`: `tsc -b packages/core/tsconfig.json packages/agent-badge/tsconfig.json packages/create-agent-badge/tsconfig.json packages/testkit/tsconfig.json`
  - `test`: `vitest`
  - `typecheck`: same workspace project graph as build
- The current build failure is isolated to:
  - `packages/core/src/publish/github-gist-client.ts`
- The current failing test files are isolated to:
  - `packages/core/src/diagnostics/doctor.test.ts`
  - `packages/core/src/providers/claude/claude-adapter.test.ts`
- Existing healthy evidence worth preserving:
  - `packages/agent-badge/src/commands/release-readiness-matrix.test.ts` passes
  - publish/readme/runtime wiring tests largely pass
  - config and state schema tests already exist and should be the source of truth for repair

## Recommended Delivery Shape

Keep the roadmap's three plans and make the dependency chain explicit.

### 08-01: Recover the TypeScript build gate and Octokit integration errors

Own the compiler failure first. No later verification matters if `npm run build` stays red.

- Repair the dynamic Octokit import contract in `packages/core/src/publish/github-gist-client.ts`.
- Prefer narrowing the locally required Gist API shape from actual runtime usage instead of forcing a broad cast over the whole imported module.
- Keep test injection via `CreateGitHubGistClientOptions.octokit` intact so unit tests stay fast and deterministic.
- Add or update targeted coverage in `packages/core/src/publish/github-gist-client.test.ts` only if needed to lock the corrected adapter contract.

**Why first:** REL-04 is an absolute gate and blocks every clean-checkout proof.

### 08-02: Repair doctor-test drift and Claude incremental refresh coverage

Own fixture and schema drift second.

- Update `packages/core/src/diagnostics/doctor.test.ts` fixtures so `.agent-badge/state.json` is built from `defaultAgentBadgeState` or another current state-source-of-truth shape, not config-shaped data.
- Ensure doctor fixtures represent current scaffolded config/state fields, including `init`, `checkpoints`, `refresh`, and `overrides`.
- Reconcile the Claude incremental fixture mutation in `packages/core/src/providers/claude/claude-adapter.test.ts` with the current fixture layout under `packages/testkit/fixtures/claude/...`.
- Verify the incremental cursor/watermark contract against `packages/core/src/providers/claude/claude-adapter.ts` rather than assuming old file paths or timestamps still trigger changed-session detection.

**Why second:** these failures are independent of packaging/release flows and are the remaining blockers for REL-05.

### 08-03: Rebaseline clean-checkout verification for current schemas and artifact expectations

Own the release-critical verification layer last.

- Audit current clean-checkout and release-critical commands/workflows against the recovered build/test gates.
- Add or update one deterministic verification path that proves current source can be checked from a clean checkout without stale build output or stale fixtures.
- Make the verification path explicitly schema-aware: it must assume current `.agent-badge/config.json` and `.agent-badge/state.json` shapes, not pre-Phase-5 or pre-Phase-6 layouts.
- Reuse existing workflow/scripts where possible instead of inventing another parallel verification harness.

**Why third:** clean-checkout proof depends on the build and test gates being trustworthy again.

## Failure Analysis

### Failure 1: Octokit typing boundary drift

**Observed error**

- `packages/core/src/publish/github-gist-client.ts(101,25): error TS2352`
- Compiler notes that the imported `octokit` module does not sufficiently overlap with the local `{ Octokit: new (...) => OctokitLike }` cast.
- The mismatch specifically calls out `rest.gists.remove`.

**Likely cause**

- The repo hand-rolls a minimal `OctokitLike` contract and force-casts the imported module into it.
- Current Octokit types expose a narrower or differently named Gist REST surface than the local interface expects.

**Planning implication**

- Plan 08-01 should touch only the Gist client boundary and any tests needed to lock that contract.
- Avoid mixing build recovery with publish-feature changes.

### Failure 2: Doctor fixture/state schema drift

**Observed error**

- `packages/core/src/diagnostics/doctor.test.ts` constructs `.agent-badge/state.json` with:
  - `parseAgentBadgeState({ ...parseAgentBadgeConfig(config), publish: ... })`
- Current `agentBadgeStateSchema` requires:
  - `init`
  - `checkpoints`
  - `publish`
  - `refresh`
  - `overrides`
- The failing fixture instead carries config-shaped keys such as:
  - `providers`
  - `repo`
  - `badge`
  - `privacy`
  - `refresh.prePush`

**Likely cause**

- The doctor fixture predates current state-schema evolution and was never rebased after Phase 5/6 scaffold changes.

**Planning implication**

- Plan 08-02 should treat fixture construction as the primary repair, then verify doctor behavior still matches the intended check IDs and statuses.

### Failure 3: Claude incremental fixture drift

**Observed error**

- `packages/core/src/providers/claude/claude-adapter.test.ts` appends to:
  - `.claude/projects/project-with-dedupe/session-main.jsonl`
- The current fixture tree under `packages/testkit/fixtures/claude/projects/...` contains:
  - `project-with-index/session-tertiary.jsonl`
  - `project-with-index/sessions-index.json`
  - `project-with-dedupe/session-main.jsonl`
  - `project-no-index/session-secondary.jsonl`
- The assertion expects `scanClaudeSessionsIncremental()` to return exactly one changed session and updated totals, but receives none.

**Likely causes to test**

- Watermark logic based on file `mtime` and `size` no longer aligns with how the fixture helper copies or timestamps files.
- The changed file path or project grouping used by the fixture helper may differ from what the test assumes after copy/setup.
- The cursor contract may be correct while the test's timestamp mutation no longer crosses the effective watermark boundary.

**Planning implication**

- Plan 08-02 should inspect the fixture helper plus `isClaudeFileChanged()` contract before changing core logic.
- Prefer fixing stale test assumptions unless runtime evidence shows the adapter logic is actually wrong.

## Concrete File Guidance

Files most likely involved in Phase 8:

- `packages/core/src/publish/github-gist-client.ts`
- `packages/core/src/publish/github-gist-client.test.ts`
- `packages/core/src/diagnostics/doctor.test.ts`
- `packages/core/src/diagnostics/doctor.ts`
- `packages/core/src/state/state-schema.ts`
- `packages/core/src/init/default-state.ts`
- `packages/core/src/providers/claude/claude-adapter.ts`
- `packages/core/src/providers/claude/claude-adapter.test.ts`
- `packages/testkit/src/claude-fixtures.ts`
- `packages/testkit/fixtures/claude/**`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `scripts/smoke/verify-packed-install.sh`

## Anti-Patterns to Avoid

- Do not "fix" the build by weakening type safety with broad `any` casts over the whole Octokit boundary.
- Do not update tests to match stale or invalid state shapes; the source of truth is current scaffold/schema code.
- Do not widen Phase 8 into package metadata/versioning work. That belongs to Phase 9.
- Do not rely on existing `dist/` output or previously generated artifacts when proving clean-checkout verification.

## Validation Architecture

Phase 8 should stay almost entirely automated. The phase is about restoring trust in machine-run verification, so the plans must close with exact commands and file-anchored assertions.

### Required automated coverage

- Build gate:
  - `npm run build` must exit 0 from committed source.
  - `packages/core/src/publish/github-gist-client.ts` must preserve Gist get/create/update/delete behavior.
- Doctor/schema drift:
  - `npm test -- --run packages/core/src/diagnostics/doctor.test.ts` must exit 0.
  - Doctor fixture files must serialize current state schema fields and no longer rely on config-shaped keys.
- Claude incremental coverage:
  - `npm test -- --run packages/core/src/providers/claude/claude-adapter.test.ts` must exit 0.
  - The changed-session test must prove one session is returned when a tracked project file changes after the cursor watermark.
- Clean-checkout verification:
  - CI/release-critical commands should run from a clean tree using current config/state expectations.
  - Verification should not depend on pre-existing build output.

### Recommended commands

- Quick targeted runs:
  - `npm run build`
  - `npm test -- --run packages/core/src/diagnostics/doctor.test.ts`
  - `npm test -- --run packages/core/src/providers/claude/claude-adapter.test.ts`
- Full suite:
  - `npm test -- --run`

## Open Questions

1. Should the Octokit client boundary keep a handwritten `OctokitLike` interface or switch to a narrower local wrapper/factory that isolates runtime usage from upstream type churn?
   - Recommendation: keep a narrow local wrapper if possible; do not leak raw Octokit types throughout the codebase.

2. Is the Claude incremental failure a runtime bug or a stale test assumption?
   - Recommendation: inspect fixture-copy timestamps first. The current evidence suggests a stale test/setup assumption is more likely than a production regression because only one targeted incremental test fails while the rest of the adapter coverage passes.

3. What exact command should serve as the release-critical clean-checkout proof?
   - Recommendation: reuse existing CI/release scripts and make one documented, deterministic clean-checkout sequence instead of inventing another bespoke verifier.

## Environment Availability

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| Node.js + npm | build/test/verification | ✓ | Local `npm run build` and `npm test -- --run` both execute |
| Workspace deps | TypeScript/Vitest | ✓ | Dependencies are installed in current checkout |
| GitHub network access | not required for Phase 8 planning | n/a | Gist interactions are already mocked in tests |

