# Phase 19: Recovery Paths And Production Reliability Verification - Research

**Researched:** 2026-04-05
**Domain:** supported recovery flows for publish error state, shared publish repair guidance, and production failure-and-recovery verification
**Confidence:** MEDIUM

<user_constraints>
## User Constraints

No phase `CONTEXT.md` exists for Phase 19. Planner must treat the following as the active constraints derived from `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`, Phase 17/18 artifacts, current docs, and the current codebase.

### Locked Decisions
- Goal: give operators supported recovery flows for publish error state and verify the real stale-badge failure-and-recovery path end to end.
- Must satisfy `CTRL-02` and `CTRL-03`.
- Recovery must happen through supported CLI flows without manual `.agent-badge/state.json` edits.
- Keep the existing local-first, aggregate-only, stable-gist-url, idempotent-init, and failure-soft-by-default constraints intact.
- Keep `doctor` primarily diagnostic and read-only by default. Phase 18 already established `--probe-write` as the explicit mutating exception for validation.
- Production-readiness proof must use real repo state and real operator messaging, not only mocked unit coverage.

### Claude's Discretion
- Choose whether recovery is surfaced as a new helper plus existing commands, or as a new top-level CLI command, as long as the end state is explicit, supported, and idempotent.
- Choose the exact recovery-state vocabulary and command output shape, as long as it is machine-readable in core and operator-readable in CLI output.
- Choose how production evidence is captured, as long as the repo ends with a durable artifact that proves the stale badge failure path, recovery path, and runbook wording against real state.
- Choose which docs become the canonical recovery runbook, as long as Quickstart/Troubleshooting/README do not drift.

### Deferred Ideas (OUT OF SCOPE)
- Hosted schedulers, background daemons, or backend-side self-healing.
- Destructive remote reset flows that delete contributor history or shared override state without explicit operator intent.
- New provider integrations or richer analytics surfaces.
- Editing publish state JSON by hand as an official recovery method.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CTRL-02 | Repos in publish error state can recover to a healthy shared publish state through supported CLI flows without manual `.agent-badge/state.json` edits. | The repo needs one canonical recovery contract that maps publish-readiness, publish-trust, and shared-health states to exact supported commands and safe repair behavior. |
| CTRL-03 | Production-readiness verification covers the real stale-badge failure path, recovery path, and operator-facing messaging. | The repo needs both automated regression coverage and a live evidence path that captures failure symptoms, recovery actions, and post-recovery healthy state using real repo wiring. |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- Keep the product local-first and serverless.
- Preserve the aggregate-only public boundary.
- Preserve the initializer-first npm UX and stable gist + Shields URL model.
- Keep incremental refresh and `pre-push` fast and failure-soft by default.
- Keep `init` idempotent and safe on reruns.

## Repo Reality

### What already exists
- The current local repo state is already the exact stale failed-publish scenario Phase 19 needs to prove: `.agent-badge/state.json` currently has `publish.status = "error"`, `lastAttemptOutcome = "failed"`, `lastAttemptChangedBadge = "yes"`, `lastFailureCode = "auth-missing"`, `publish.mode = "shared"`, and `refresh.lastPublishDecision = "failed"` while `.agent-badge/config.json` still points at the configured shared gist. That means the repo can use a real stale-badge recovery path instead of a synthetic fixture for final proof.
- `init` already reconnects or recreates publish targets safely through `agent-badge init` and `agent-badge init --gist-id <id>`. It is idempotent and already doubles as the shared-mode migration/repair entrypoint. [`packages/agent-badge/src/commands/init.ts`](../../../packages/agent-badge/src/commands/init.ts)
- `refresh` already rebuilds local totals, retries publish, and can recreate the local contributor record when shared mode reports `missing-local-contributor`. [`packages/agent-badge/src/commands/refresh.ts`](../../../packages/agent-badge/src/commands/refresh.ts)
- Phase 17 established `publish-trust` as a dedicated stale/unchanged/current/not-attempted contract. [`packages/core/src/publish/publish-trust.ts`](../../../packages/core/src/publish/publish-trust.ts)
- Phase 18 established `publish-readiness` as a separate contract that classifies auth and gist-target failures and already carries remediation text. [`packages/core/src/publish/publish-readiness.ts`](../../../packages/core/src/publish/publish-readiness.ts)
- Shared remote state already has its own health model: `healthy`, `stale`, `conflict`, `partial`, and `orphaned`. [`packages/core/src/publish/shared-health.ts`](../../../packages/core/src/publish/shared-health.ts)
- `doctor` already renders separate `publish-trust`, `shared-mode`, and `shared-health` checks with fix lines, so the repo already has a natural home for canonical recovery guidance. [`packages/core/src/diagnostics/doctor.ts`](../../../packages/core/src/diagnostics/doctor.ts)
- `status` already exposes the same shared-health vocabulary and live-badge trust summary, but it does not yet collapse those states into one operator-visible recovery plan. [`packages/agent-badge/src/commands/status.ts`](../../../packages/agent-badge/src/commands/status.ts)
- Troubleshooting and setup docs already contain symptom-level recovery advice for deferred publish, stale badge, partially migrated shared mode, conflicts, and orphaned local publishers. [`docs/TROUBLESHOOTING.md`](../../../docs/TROUBLESHOOTING.md), [`docs/QUICKSTART.md`](../../../docs/QUICKSTART.md), [`docs/MANUAL-GIST.md`](../../../docs/MANUAL-GIST.md)
- There is already precedent for live operational evidence artifacts and smoke scripts in earlier release phases. [`scripts/release/capture-publish-evidence.ts`](../../../scripts/release/capture-publish-evidence.ts), [`scripts/smoke/verify-registry-install.sh`](../../../scripts/smoke/verify-registry-install.sh)

### Gaps Phase 19 must close
- Recovery guidance is currently distributed across three different concepts:
  - publish readiness (`auth missing`, `gist unreachable`, `remote write failed`, etc.)
  - live badge trust (`stale after failed publish`, `failed but unchanged`, etc.)
  - shared remote health (`stale`, `conflict`, `partial`, `orphaned`)
- Those concepts are technically correct, but no single helper turns them into one supported recovery path such as:
  - rerun `agent-badge refresh`
  - rerun `agent-badge init --gist-id <id>`
  - rerun `agent-badge init` on the original publisher machine
  - ask stale contributors to rerun `agent-badge refresh`
- The repo has symptom-based remediation text, but not yet a canonical recovery-plan contract that `status`, `doctor`, `refresh`, and docs all share.
- There is no first-class machine-readable representation of "recoverable state" versus "diagnostic state". That makes it harder to test exact recovery routing and easier for command copy to drift again.
- Production-readiness proof is still fragmented. Phase 18 closed live UAT for readiness and hook behavior, but Phase 19 specifically needs evidence for the stale-badge failure path, operator recovery path, and return to healthy shared state.
- Current docs still leave operators to infer which command is the supported repair path for each failure mode. That is acceptable for troubleshooting notes, but not strong enough for `CTRL-02` and `CTRL-03`.

## Summary

The repo already has the right primitives. Phase 19 should not invent a second diagnostics model. It should add one layer above the existing three:

1. `publish-readiness` answers whether the repo can publish.
2. `publish-trust` answers whether the live badge is current.
3. `shared-health` answers whether the shared remote model is coherent.
4. Phase 19 should add a canonical **recovery-plan** contract that translates those facts into exact supported operator actions.

The most pragmatic delivery shape is to keep mutating repair behavior in the existing commands that already own it:

- `agent-badge refresh` for retrying publish and recreating the local contributor record
- `agent-badge init` / `agent-badge init --gist-id <id>` for reconnecting publish targets and repairing shared metadata
- `agent-badge doctor` and `agent-badge status` as the non-mutating places that print the exact recovery path

That approach preserves the existing CLI mental model, keeps `doctor` read-only, and avoids adding a destructive or ambiguous "repair everything" command. The missing piece is explicit orchestration and proof, not another low-level primitive.

**Primary recommendation:** split Phase 19 into two plans:
1. Add a canonical recovery-plan contract plus operator-visible supported recovery flows across `status`, `doctor`, and the command paths that already repair state.
2. Add production reliability verification artifacts and a single runbook that proves the stale-badge failure path, recovery path, and final healthy state against real repo wiring.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | repo runtime (`>=20`, developed on 24.x) | recovery orchestration, CLI output, and evidence capture scripts | Existing runtime and sufficient for all recovery/reporting work. |
| TypeScript | repo line (`5.x`) | typed recovery-plan contract and CLI/report surfaces | Existing repo standard and needed to keep state/report boundaries precise. |
| `zod` | repo standard | validate any new persisted or machine-readable recovery metadata if introduced | Keep new recovery structures additive and safe. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | repo standard | recovery-plan, command-surface, and evidence-script regression tests | Use for all new recovery-state and runbook assertions. |
| Existing gist client and doctor/publish helpers | repo code | inspect real gist state and classify repair paths | Reuse existing publish and diagnostics seams instead of inventing a second remote inspection layer. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Canonical recovery-plan helper on top of existing readiness/trust/shared-health models | Ad-hoc fix lines per command | Faster to patch once, but guarantees wording and routing drift again. |
| Reuse `init` and `refresh` as repair commands | Add a broad `agent-badge recover` command immediately | More explicit, but introduces a new surface before the repo has stabilized the recovery-state model. |
| Durable repo-owned evidence artifact plus human UAT checklist | Only unit tests and command snapshots | Easier, but does not satisfy `CTRL-03`, which explicitly requires the real failure-and-recovery path. |

**Installation:**
```bash
# No new dependencies are required for Phase 19.
# Reuse the existing workspace dependencies, smoke-script patterns, and Vitest suites.
```

## Architecture Patterns

### Pattern 1: Introduce a canonical recovery-plan contract
**What:** Add a core helper that consumes config/state/current gist inspection and returns exact supported recovery actions.

**Why:** The repo already has precise diagnostics, but not one answer to "what should the operator do next?"

**Recommended shape:**
- Add a helper such as `deriveRecoveryPlan()` or `inspectPublishRecovery()` under `packages/core/src/publish/`
- Inputs should include:
  - parsed config/state
  - publish-readiness report
  - publish-trust report
  - optional shared-health inspection
- Output should include:
  - `status`: `healthy` | `recoverable` | `manual-team-action` | `blocked`
  - `primaryAction`
  - `secondaryActions`
  - `reasonCodes`
  - exact commands to run

**Important:** keep the action values concrete, for example:
- `agent-badge refresh`
- `agent-badge init`
- `agent-badge init --gist-id <id>`
- `ask contributors with stale local state to run agent-badge refresh`

### Pattern 2: Keep `doctor` diagnostic and reuse existing mutating commands
**What:** `doctor` and `status` should surface the recovery plan; `refresh` and `init` should remain the commands that actually repair local or shared state.

**Why:** The repo already trained users that `doctor` inspects and `init`/`refresh` mutate. Reversing that now would create avoidable ambiguity.

**Recommended behaviors:**
- `status` prints a concise recovery line when the repo is not healthy
- `doctor` prints the same exact recovery commands with slightly more context
- `refresh` clears recoverable publish error state when a retry succeeds
- `init` remains the supported repair path for gist reconnection and shared metadata repair

### Pattern 3: Separate local repairable states from team-coordination states
**What:** Some recovery states can be repaired locally; others require other contributors or the original publisher machine.

**Why:** `CTRL-02` is about supported recovery flows, not pretending one machine can silently repair all shared-state scenarios.

**Recommended split:**
- **Locally recoverable**
  - auth restored + rerun `agent-badge refresh`
  - gist reconnected with `agent-badge init --gist-id <id>`
  - local contributor recreated with `agent-badge refresh`
  - missing shared overrides repaired with `agent-badge init`
- **Team-coordination required**
  - stale contributors
  - conflicting session observations
  - legacy migration that must happen on the original publisher machine

That distinction should be explicit in the recovery-plan contract and docs.

### Pattern 4: Centralize the operator runbook
**What:** Choose one canonical recovery document and make README/Quickstart/Troubleshooting link into it rather than each owning their own full recovery story.

**Why:** The repo already has symptom-level guidance scattered across docs. Phase 19 should reduce drift, not add a fourth copy.

**Recommended shape:**
- Add one recovery/runbook document such as `docs/RECOVERY.md` or a clearly titled recovery section in `docs/TROUBLESHOOTING.md`
- Keep README and Quickstart short:
  - symptom
  - exact command
  - link to the full runbook
- Keep manual gist reconnection guidance in `docs/MANUAL-GIST.md`, but point the shared failure/recovery workflow at the canonical runbook

### Pattern 5: Capture live failure-and-recovery evidence as a first-class artifact
**What:** Add a repo-owned script and/or evidence format for the real stale-badge failure path.

**Why:** `CTRL-03` requires proof against real operator flows, not only mocks.

**Recommended shape:**
- Use a phase artifact such as:
  - `19-HUMAN-UAT.md`
  - `19-RECOVERY-EVIDENCE.json`
  - `19-RECOVERY-EVIDENCE.md`
- Capture:
  - failing state (`Publish readiness`, `Live badge trust`, `shared-health`)
  - exact recovery command used
  - post-recovery healthy state
  - any environment assumptions
- Reuse existing smoke/evidence patterns from Phase 12/13 where possible instead of inventing ad-hoc text files.

## Recommended Delivery Shape

### 19-01: Implement supported recovery flows for publish error and stale shared state
**Goal:** turn the current diagnostics into one supported recovery path that operators can follow without editing local state files.

**Recommended scope:**
- add one canonical recovery-plan helper in core
- wire that helper into `status` and `doctor`
- update `refresh` and `init` summaries so successful repairs clear prior error-state ambiguity and echo the same recovery vocabulary
- make shared-health recovery routing explicit for:
  - missing local contributor
  - missing shared overrides / partial shared state
  - stale contributors
  - legacy migration from the original publisher machine
- add regression tests for recovery-plan routing and command output

### 19-02: Add production reliability verification and operational runbooks for stale badge recovery
**Goal:** prove the stale-badge failure path and recovery path end to end, and lock the docs to the actual workflow.

**Recommended scope:**
- add one canonical recovery/runbook document
- update README/Quickstart/Troubleshooting/Manual Gist references to match the new supported flow
- add a repo-owned recovery evidence path:
  - scripted evidence where possible
  - live human/UAT evidence where real auth/gist state is required
- verify that the exact wording in docs matches the command surfaces produced by `status`, `doctor`, `refresh`, and `init`

## Concrete Extension Points

### Core recovery routing
- [`packages/core/src/publish/publish-readiness.ts`](../../../packages/core/src/publish/publish-readiness.ts)
  - already owns readiness status and fix text
- [`packages/core/src/publish/publish-trust.ts`](../../../packages/core/src/publish/publish-trust.ts)
  - already owns live-badge trust classification
- [`packages/core/src/publish/shared-health.ts`](../../../packages/core/src/publish/shared-health.ts)
  - already owns remote shared-state health classification
- **Recommended new file:** `packages/core/src/publish/recovery-plan.ts`
  - should combine the three into exact recovery actions

### Command surfaces
- [`packages/core/src/diagnostics/doctor.ts`](../../../packages/core/src/diagnostics/doctor.ts)
  - best place for detailed operator recovery output
- [`packages/agent-badge/src/commands/status.ts`](../../../packages/agent-badge/src/commands/status.ts)
  - best place for concise recovery summaries
- [`packages/agent-badge/src/commands/refresh.ts`](../../../packages/agent-badge/src/commands/refresh.ts)
  - should confirm when a recovery retry restored healthy publish state
- [`packages/agent-badge/src/commands/init.ts`](../../../packages/agent-badge/src/commands/init.ts)
  - should confirm when gist reconnection or shared metadata repair closed a diagnosed recovery state
- [`packages/agent-badge/src/cli/main.ts`](../../../packages/agent-badge/src/cli/main.ts)
  - only needs changes if the phase chooses a new recovery-focused command or option surface

### Docs and evidence
- [`README.md`](../../../README.md)
- [`docs/QUICKSTART.md`](../../../docs/QUICKSTART.md)
- [`docs/TROUBLESHOOTING.md`](../../../docs/TROUBLESHOOTING.md)
- [`docs/MANUAL-GIST.md`](../../../docs/MANUAL-GIST.md)
- [`docs/RELEASE.md`](../../../docs/RELEASE.md) if the live recovery proof becomes part of release or post-release operations
- [`scripts/release/capture-publish-evidence.ts`](../../../scripts/release/capture-publish-evidence.ts) as a pattern reference
- [`scripts/smoke/`](../../../scripts/smoke/) for repo-owned proof scripts

## Validation Architecture

Phase 19 should keep fast feedback by testing the recovery-plan helper and command surfaces directly, then reserve live failure/recovery proof for one explicit evidence run.

### Quick automated loops
- **Recovery-plan core logic**
  - `npm test -- --run packages/core/src/publish/publish-readiness.test.ts packages/core/src/publish/publish-trust.test.ts packages/core/src/publish/shared-health.test.ts`
- **Doctor/status routing**
  - `npm test -- --run packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts`
- **Mutating recovery surfaces**
  - `npm test -- --run packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/refresh.test.ts`
- **If a new recovery helper or command is added**
  - add a focused test file and include it in the quick run set

### Full automated gate
- `npm test -- --run`
- `npm run docs:check` after runbook/doc updates

### Live evidence expectations
- Capture one real stale-badge failure state
- Capture the exact supported recovery command sequence
- Capture the healthy post-recovery state from `status` and `doctor`
- Store that evidence in phase artifacts so Phase 19 verification can cite it directly

## Testing And Verification Targets

### Existing suites likely to expand
- [`packages/core/src/diagnostics/doctor.test.ts`](../../../packages/core/src/diagnostics/doctor.test.ts)
- [`packages/agent-badge/src/commands/status.test.ts`](../../../packages/agent-badge/src/commands/status.test.ts)
- [`packages/agent-badge/src/commands/doctor.test.ts`](../../../packages/agent-badge/src/commands/doctor.test.ts)
- [`packages/agent-badge/src/commands/refresh.test.ts`](../../../packages/agent-badge/src/commands/refresh.test.ts)
- [`packages/agent-badge/src/commands/init.test.ts`](../../../packages/agent-badge/src/commands/init.test.ts)
- [`packages/agent-badge/src/commands/release-readiness-matrix.test.ts`](../../../packages/agent-badge/src/commands/release-readiness-matrix.test.ts) if the repo wants a scenario-style recovery proof harness

### New tests likely needed
- `packages/core/src/publish/recovery-plan.test.ts` if a new core helper is added
- a docs/runbook coherence test only if the repo already has a lightweight pattern for text assertions; otherwise keep doc verification in `npm run docs:check`

## Risks And Anti-Patterns

- Do not collapse publish-readiness, publish-trust, and shared-health into one overloaded status enum. They solve different problems and Phase 17/18 already invested in that separation.
- Do not add a destructive "reset remote state" command unless the phase can specify exact safety rules and recovery guarantees. The current roadmap does not require remote deletion semantics.
- Do not let docs describe recovery paths that the CLI cannot actually confirm. Recovery commands and runbook wording must be sourced from the same canonical contract.
- Do not treat contributor-coordination scenarios as if one machine can repair them silently. The supported flow may include asking other contributors to rerun `agent-badge refresh`.

## Recommended Planning Notes

- Keep the roadmap's two-plan split.
- Plan 19-01 should own code and tests.
- Plan 19-02 should own docs, evidence artifacts, and final production proof.
- Every task should include concrete read paths and exact test commands because this phase is cross-cutting and easy to under-specify.

## Suggested Verification Commands For Planning

```bash
npm test -- --run packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts
npm test -- --run packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/refresh.test.ts
npm run docs:check
npm test -- --run
```

## Research Conclusion

Phase 19 does not need brand-new publish primitives. It needs a canonical recovery layer, operator surfaces that expose exact supported flows, and live evidence that those flows recover the real repo from stale failed publish state back to healthy shared mode.

## RESEARCH COMPLETE
