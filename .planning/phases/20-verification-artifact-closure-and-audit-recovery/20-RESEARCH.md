# Phase 20: Verification Artifact Closure And Audit Recovery - Research

**Researched:** 2026-04-05
**Domain:** milestone audit gap closure, phase verification artifact recovery, and validation reconciliation
**Confidence:** HIGH

<user_constraints>
## User Constraints

No phase `CONTEXT.md` exists for Phase 20. Planner must treat the following as the active constraints derived from `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`, `v1.4-MILESTONE-AUDIT.md`, and the Phase 15/16/17/18/19 artifacts named in the prompt.

### Locked Decisions
- Phase 20 is gap-closure work, not new product behavior.
- Focus on existing artifacts, audit blockers, requirement orphaning, and the smallest safe plan structure to close them.
- Must address `CTRL-02` and `CTRL-03`.
- The closure must come from formal verification and validation artifacts, not from reopening implementation by default.
- Phase 15 and Phase 19 each need a formal `*-VERIFICATION.md` report grounded in their existing summaries, UAT, validation, and live evidence artifacts.
- Validation debt for Phases 15 and 17 must be closed or intentionally reconciled before the next milestone audit.
- Treat roadmap, requirements, and milestone-audit artifacts as the planning context for this phase.

### Claude's Discretion
- Choose the exact order of artifact creation and reconciliation as long as the phase stays artifact-only unless a verification rerun fails.
- Choose whether `CTRL-02` and `CTRL-03` remain mapped to Phase 20 in `.planning/REQUIREMENTS.md` or are remapped back to Phase 19 only if the rerun audit requires that consistency.
- Choose the exact artifact checks used in Phase 20, as long as they verify the missing reports, validation closure, and milestone audit recovery.

### Deferred Ideas (OUT OF SCOPE)
- Reopening runtime or CLI implementation without a fresh verification failure.
- New recovery behavior, new publish behavior, or new docs beyond what is needed to close the audit.
- Regenerating live recovery evidence by default when the existing Phase 19 proof artifacts already exist and are cited by the audit.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CTRL-02 | Repos in publish error state can recover to a healthy shared publish state through supported CLI flows without manual `.agent-badge/state.json` edits. | Phase 20 should attach this requirement to a new `19-VERIFICATION.md` backed by existing Phase 19 summaries, UAT, validation, and recovery evidence artifacts. |
| CTRL-03 | Production-readiness verification covers the real stale-badge failure path, recovery path, and operator-facing messaging. | Phase 20 should formalize the existing Phase 19 live proof and runbook evidence inside `19-VERIFICATION.md`, then clear audit blockers and rerun the milestone audit. |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- Keep the product local-first and serverless.
- Preserve the aggregate-only public boundary.
- Preserve the initializer-first npm UX and stable gist + Shields URL model.
- Keep incremental refresh and `pre-push` fast and failure-soft by default.
- Keep `init` idempotent and safe on reruns.
- Follow the GSD workflow and treat planning artifacts as first-class deliverables.

## Summary

The milestone audit is blocked by missing and stale artifacts, not by a known product regression. The smallest safe Phase 20 plan is therefore artifact-first: create the missing `15-VERIFICATION.md` and `19-VERIFICATION.md`, reconcile the two draft validation files that the audit explicitly calls out, then rerun the milestone audit and only widen scope if one of those verification reruns fails.

The authoritative evidence already exists. Phase 15 has complete summaries, UAT, validation commands, and downstream verification support from Phase 16. Phase 19 has complete summaries, UAT, human UAT, validation, and live recovery evidence in both Markdown and JSON. What is missing is the formal verification layer that turns those artifacts into milestone-acceptable requirement coverage, plus closure of the draft validation bookkeeping in Phases 15 and 17.

**Primary recommendation:** keep Phase 20 split into exactly two artifact-only plans:
1. Create `15-VERIFICATION.md` and `19-VERIFICATION.md`, and reattach `CTRL-02` / `CTRL-03` through the new Phase 19 verification report.
2. Reconcile Phase 15 and 17 validation docs, update traceability/audit artifacts as needed, and rerun the milestone audit without reopening implementation unless a rerun command fails.

## Exact Artifact Targets

| Artifact | Action | Why It Matters | Recommended Plan |
|---------|--------|----------------|------------------|
| `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-VERIFICATION.md` | Create | Explicitly closes the audit blocker that Phase 15 is unverified. | 20-01 |
| `.planning/phases/19-recovery-paths-and-production-reliability-verification/19-VERIFICATION.md` | Create | Reattaches `CTRL-02` and `CTRL-03` to formal verification. | 20-01 |
| `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-VALIDATION.md` | Update | Audit calls out draft state and `wave_0_complete: false`. | 20-02 |
| `.planning/phases/17-publish-failure-visibility-and-state-trust/17-VALIDATION.md` | Update | Audit calls out draft state and `wave_0_complete: false`. | 20-02 |
| `.planning/v1.4-MILESTONE-AUDIT.md` | Update or regenerate | Must show the blockers are closed after artifact reconciliation. | 20-02 |
| `.planning/REQUIREMENTS.md` | Update status rows after verification closes | `CTRL-02` and `CTRL-03` are still marked pending. | 20-02 |
| `.planning/ROADMAP.md` | Update phase completion checklist and progress once work is done | Normal phase bookkeeping. | 20-02 |
| `.planning/STATE.md` | Update current phase/progress metadata once work is done | Normal phase bookkeeping. | 20-02 |
| `.planning/phases/20-verification-artifact-closure-and-audit-recovery/20-VALIDATION.md` | Create | Phase 20 still needs its own Nyquist contract. | Wave 0 for Phase 20 |
| `.planning/phases/20-verification-artifact-closure-and-audit-recovery/20-UAT.md` | Create | Phase 20 still needs normal closure artifacts. | Phase close |
| `.planning/phases/20-verification-artifact-closure-and-audit-recovery/20-VERIFICATION.md` | Create | Phase 20 itself should end with a verification report. | Phase close |
| `.planning/phases/20-verification-artifact-closure-and-audit-recovery/20-01-SUMMARY.md` | Create | Normal plan summary. | 20-01 close |
| `.planning/phases/20-verification-artifact-closure-and-audit-recovery/20-02-SUMMARY.md` | Create | Normal plan summary. | 20-02 close |

**Do not update by default:**
- `.planning/phases/19-recovery-paths-and-production-reliability-verification/19-HUMAN-UAT.md`
- `.planning/phases/19-recovery-paths-and-production-reliability-verification/19-RECOVERY-EVIDENCE.md`
- `.planning/phases/19-recovery-paths-and-production-reliability-verification/19-RECOVERY-EVIDENCE.json`

Those artifacts already exist and the audit treats them as valid supporting evidence. Re-run them only if the new Phase 19 verification report exposes an actual contradiction.

## Authoritative Evidence Map

### Phase 15 Verification Inputs

| Evidence File | Authority | Why It Is Authoritative |
|--------------|-----------|-------------------------|
| `15-01-SUMMARY.md` | HIGH | Captures the schema-v2 observation model, deterministic reducers, cache-v2 decisions, touched files, and completed requirements. |
| `15-02-SUMMARY.md` | HIGH | Captures the publish-service wiring, init/refresh/publish parity, convergence regressions, and completed requirements. |
| `15-UAT.md` | HIGH | Records the four explicit user-facing outcomes the phase was meant to prove. |
| `15-VALIDATION.md` | MEDIUM | Defines the original task-to-command map; stale status fields need reconciliation but the command inventory remains authoritative. |
| `16-VERIFICATION.md` | MEDIUM | Downstream proof that the shared model built in Phase 15 is actually consumed by migration, status, and doctor flows. Useful support, not a substitute for `15-VERIFICATION.md`. |

### Phase 19 Verification Inputs

| Evidence File | Authority | Why It Is Authoritative |
|--------------|-----------|-------------------------|
| `19-01-SUMMARY.md` | HIGH | Captures the canonical recovery routing work that implemented `CTRL-02` behavior in product code. |
| `19-02-SUMMARY.md` | HIGH | Captures the recovery runbook, harness, live-proof artifact creation, and claims completion of `CTRL-02` and `CTRL-03`. |
| `19-UAT.md` | HIGH | Records the intended operator outcomes for recovery guidance, repair-result behavior, docs, and proof harness behavior. |
| `19-HUMAN-UAT.md` | HIGH | Live operator evidence captured by the repo-owned recovery harness. |
| `19-RECOVERY-EVIDENCE.md` | HIGH | Human-readable captured pre/post recovery evidence. |
| `19-RECOVERY-EVIDENCE.json` | HIGH | Machine-readable captured pre/post recovery evidence. |
| `19-VALIDATION.md` | HIGH | Fully completed Nyquist contract with green task rows and exact commands tied to `CTRL-02` and `CTRL-03`. |
| `18-VERIFICATION.md` | MEDIUM | Useful supporting context for the auth/readiness semantics that Phase 19 recovery builds on, but not the primary proof artifact for `CTRL-02` / `CTRL-03`. |

## Standard Stack

### Core
| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| Markdown planning artifacts | repo standard | Verification reports, validation docs, audit output, and phase summaries | This milestone is closed by artifact quality, not by new runtime code. |
| `vitest` | `^3.2.0` from `package.json` | Re-run the existing Phase 15 and 17 focused suites before reconciling validation docs | Existing repo test runner and already referenced by the validation artifacts. |
| `bash` | `3.2.57` | Repo-owned audit and artifact checks | Existing script runtime, including the recovery harness. |
| `rg` | `15.1.0` | Artifact existence/content checks | Fast and already used across repo verification scripts. |

### Supporting
| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| `node` | `v22.14.0` | Run repo scripts and inspect JSON-backed evidence | Use for repo-owned tooling only; no new Node tooling is needed. |
| `npm` | `11.6.0` | Execute existing focused test commands and repo scripts | Use the commands already documented in the validation artifacts. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Create `15-VERIFICATION.md` and `19-VERIFICATION.md` using the existing verification report format | Write an ad-hoc “audit closure” memo | Faster once, but the milestone audit explicitly wants formal phase verification artifacts. |
| Reconcile `15-VALIDATION.md` and `17-VALIDATION.md` using existing tests and evidence | Add new tests preemptively | Unnecessary unless rerun commands fail; current debt is mostly stale status bookkeeping. |
| Reuse existing Phase 19 live evidence | Regenerate live recovery proof during Phase 20 | Adds risk and scope without closing a currently identified blocker. |

**Installation:**
```bash
# No new packages are required for Phase 20.
# Reuse the existing repo-owned test and artifact-checking entrypoints.
```

## Architecture Patterns

### Pattern 1: Treat Phase 20 as artifact closure, not behavior work
**What:** The phase should create missing reports and reconcile stale planning artifacts before touching runtime code.

**When to use:** For every task in Phase 20 unless a rerun verification command fails.

**Why:** The milestone audit reports missing verification and stale validation status, not broken operator flows.

### Pattern 2: Build verification reports from phase-owned evidence, not downstream inference
**What:** `15-VERIFICATION.md` should be grounded in Phase 15 summaries/UAT/validation first, with Phase 16 verification only as supporting evidence. `19-VERIFICATION.md` should be grounded in Phase 19 summaries/UAT/human-UAT/recovery-evidence/validation first, with Phase 18 verification only as supporting context.

**When to use:** While drafting the new verification reports.

**Why:** The audit explicitly says Phase 15 and Phase 19 are unverified because the formal report layer is missing.

### Pattern 3: Reconcile draft validations by rerunning the documented commands
**What:** Use the command inventory already recorded in `15-VALIDATION.md` and `17-VALIDATION.md`, then update frontmatter and task-row status from draft/pending to complete/green.

**When to use:** Plan 20-02.

**Why:** The test files and behaviors already exist:
- Phase 15 wave-0 topics are present in `shared-model.test.ts`, `shared-merge.test.ts`, `publish-service.test.ts`, `shared-badge-aggregation.test.ts`, `refresh-cache.test.ts`, `incremental-refresh.test.ts`, `publish.test.ts`, and `refresh.test.ts`.
- Phase 17 wave-0 topics are present in `state-schema.test.ts`, `scaffold.test.ts`, `publish-trust.test.ts`, `doctor.test.ts`, `status.test.ts`, `refresh.test.ts`, `publish.test.ts`, and `doctor.test.ts`.

### Pattern 4: Re-audit only after both missing verification files and both draft validation files are closed
**What:** The milestone audit rerun should be the last step, not the first.

**When to use:** Plan 20-02 closeout.

**Why:** The current audit blockers are deterministic and known in advance; rerunning the audit earlier just produces the same failure.

### Anti-Patterns to Avoid
- **Reopening implementation by default:** Do not turn Phase 20 into a stealth bugfix phase. If a rerun test fails, stop and scope that separately.
- **Using traceability as proof:** `REQUIREMENTS.md` rows alone do not close the audit. The missing `*-VERIFICATION.md` files are the actual blocker.
- **Overclaiming Phase 19 live proof:** The Phase 19 evidence proves the supported recovery path, captured operator messaging, and healthy shared-mode outcome. Do not rewrite it as proof that auth was restored or the live badge became current unless the artifact actually says that.
- **Generating fresh live evidence without cause:** Current blockers do not require a new live run; reuse the existing evidence unless reconciliation exposes a contradiction.

## Recommended Plan Split

### 20-01: Create formal verification reports for Phases 15 and 19 and reattach orphaned requirements
**Goal:** close the two explicit missing-verification blockers and formally attach `CTRL-02` / `CTRL-03` to milestone verification.

**Recommended scope:**
- Create `15-VERIFICATION.md` from existing Phase 15 summaries, UAT, validation, and phase-owned test evidence.
- Create `19-VERIFICATION.md` from existing Phase 19 summaries, UAT, human UAT, recovery evidence, and completed validation.
- Put `CTRL-02` and `CTRL-03` in the `Requirements Coverage` table inside `19-VERIFICATION.md`.
- Do not regenerate Phase 19 live proof in this plan.

**Required verification gates:**
```bash
test -f .planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-VERIFICATION.md
test -f .planning/phases/19-recovery-paths-and-production-reliability-verification/19-VERIFICATION.md
rg -n 'CONS-01|CONS-02|CONS-03' .planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-VERIFICATION.md
rg -n 'CTRL-02|CTRL-03' .planning/phases/19-recovery-paths-and-production-reliability-verification/19-VERIFICATION.md
rg -n '15-01-SUMMARY.md|15-02-SUMMARY.md|15-UAT.md|15-VALIDATION.md' .planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-VERIFICATION.md
rg -n '19-01-SUMMARY.md|19-02-SUMMARY.md|19-UAT.md|19-HUMAN-UAT.md|19-RECOVERY-EVIDENCE.md|19-RECOVERY-EVIDENCE.json|19-VALIDATION.md' .planning/phases/19-recovery-paths-and-production-reliability-verification/19-VERIFICATION.md
```

### 20-02: Resolve remaining validation debt and rerun the milestone audit
**Goal:** convert the two draft validation files into completed reconciliation artifacts, then rerun the milestone audit and close remaining bookkeeping.

**Recommended scope:**
- Re-run the focused commands already listed in `15-VALIDATION.md` and `17-VALIDATION.md`.
- Update both validation files from `status: draft` / `wave_0_complete: false` to completed states with green task rows.
- Update `.planning/REQUIREMENTS.md` only after the new verification artifacts exist.
- Rerun or rewrite `.planning/v1.4-MILESTONE-AUDIT.md` so it reflects the closed blockers.
- Update normal phase bookkeeping (`ROADMAP.md`, `STATE.md`, Phase 20 summaries/UAT/verification).

**Required verification gates:**
```bash
npm test -- --run packages/core/src/publish/shared-model.test.ts packages/core/src/publish/shared-merge.test.ts packages/core/src/scan/refresh-cache.test.ts packages/core/src/scan/incremental-refresh.test.ts packages/core/src/publish/publish-service.test.ts packages/core/src/publish/shared-badge-aggregation.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts
npm test -- --run packages/core/src/publish/publish-trust.test.ts packages/core/src/state/state-schema.test.ts packages/core/src/init/scaffold.test.ts packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts
rg -n 'status: complete|wave_0_complete: true|Approval: complete' .planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-VALIDATION.md .planning/phases/17-publish-failure-visibility-and-state-trust/17-VALIDATION.md
rg -n 'CTRL-02|CTRL-03' .planning/phases/19-recovery-paths-and-production-reliability-verification/19-VERIFICATION.md
rg -n '15-VERIFICATION.md|19-VERIFICATION.md' .planning/v1.4-MILESTONE-AUDIT.md
```

**Escalation rule:** if either focused test rerun fails, stop treating the work as process-only reconciliation and explicitly scope the failing implementation gap before finishing Phase 20.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Missing verification closure | A custom one-off audit note | The existing phase `*-VERIFICATION.md` report format used by Phases 16, 17, and 18 | The audit already expects that format. |
| Validation reconciliation | New tests invented for Phase 20 | The exact commands already recorded in `15-VALIDATION.md` and `17-VALIDATION.md` | The debt is stale status, not obviously missing test files. |
| Requirement reattachment | A new Phase 20 behavioral proof | `19-VERIFICATION.md` grounded in existing Phase 19 evidence | `CTRL-02` / `CTRL-03` were implemented in Phase 19; Phase 20 is closing the artifact gap. |
| Audit recovery | Manual “looks good” prose | An updated `.planning/v1.4-MILESTONE-AUDIT.md` with no remaining requirement/phase blockers | The milestone audit file is the canonical closure artifact. |

**Key insight:** Phase 20 should reuse the repo’s existing proof artifacts and report structures. The safest plan is to formalize and reconcile, not to recreate.

## Common Pitfalls

### Pitfall 1: Mistaking draft validation docs for missing implementation
**What goes wrong:** The planner assumes `wave_0_complete: false` means tests do not exist and reopens runtime work.
**Why it happens:** The frontmatter is stale, but the test files and named behaviors are already present.
**How to avoid:** Re-run the exact validation commands first; only expand scope if they fail.
**Warning signs:** Proposed tasks start editing `packages/core` or `packages/agent-badge` before any validation rerun has failed.

### Pitfall 2: Writing verification reports that cite only downstream evidence
**What goes wrong:** `15-VERIFICATION.md` or `19-VERIFICATION.md` becomes a narrative based mostly on later-phase verification instead of phase-owned artifacts.
**Why it happens:** Downstream verification files are easier to reuse than reconstructing phase-owned evidence.
**How to avoid:** Treat phase-owned summaries, UAT, validation, and evidence as primary; use downstream verification only as support.
**Warning signs:** The new report barely references the original phase directory.

### Pitfall 3: Overclaiming what Phase 19 live proof demonstrates
**What goes wrong:** The verification report claims Phase 19 proved full auth restoration or a current live badge.
**Why it happens:** The evidence artifact is rich and easy to summarize too broadly.
**How to avoid:** State exactly what the artifact shows: supported recovery command, captured operator messaging, and healthy shared-mode outcome.
**Warning signs:** Requirement wording gets silently widened beyond the captured evidence.

### Pitfall 4: Re-auditing before prerequisite artifacts are closed
**What goes wrong:** The milestone audit is rerun while 15/19 verification or 15/17 validation docs are still incomplete, producing a redundant failure and wasted work.
**Why it happens:** Audit reruns feel like fast progress, but the blockers are already known.
**How to avoid:** Make the audit the final step in Plan 20-02.
**Warning signs:** `.planning/v1.4-MILESTONE-AUDIT.md` is touched before both new verification files exist.

## Code Examples

Verified repo-aligned patterns for this phase are shell artifact checks and report-structure reuse, not new runtime code.

### Artifact closure checks
```bash
# Source: existing repo verification style (`rg`, `test -f`, validation docs)
test -f .planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-VERIFICATION.md
test -f .planning/phases/19-recovery-paths-and-production-reliability-verification/19-VERIFICATION.md
rg -n 'CONS-01|CONS-02|CONS-03' .planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-VERIFICATION.md
rg -n 'CTRL-02|CTRL-03' .planning/phases/19-recovery-paths-and-production-reliability-verification/19-VERIFICATION.md
```

### Validation reconciliation checks
```bash
# Source: 15-VALIDATION.md and 17-VALIDATION.md
npm test -- --run packages/core/src/publish/shared-model.test.ts packages/core/src/publish/shared-merge.test.ts packages/core/src/scan/refresh-cache.test.ts packages/core/src/scan/incremental-refresh.test.ts packages/core/src/publish/publish-service.test.ts packages/core/src/publish/shared-badge-aggregation.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts

npm test -- --run packages/core/src/publish/publish-trust.test.ts packages/core/src/state/state-schema.test.ts packages/core/src/init/scaffold.test.ts packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Requirement traceability and UAT without a phase verification report | Formal phase `*-VERIFICATION.md` reports with requirements coverage tables | Established before v1.4; Phase 20 is restoring compliance for missing phases | Milestone audit can accept or reject phases based on verification presence, not only traceability. |
| Draft validation docs left behind after implementation | Validation docs reconciled to the commands and evidence that actually passed | Current audit on 2026-04-05 identifies the leftover debt | Phase 20 can close this without new behavior work if reruns stay green. |
| Audit blocker recorded but not closed | Updated milestone audit file with no requirement or phase blockers | Phase 20 target state | Milestone becomes archive-ready again. |

**Deprecated/outdated:**
- Treating `REQUIREMENTS.md` checkboxes as sufficient proof for `CTRL-02` / `CTRL-03`.
- Treating `wave_0_complete: false` in Phases 15 and 17 as automatic evidence of missing implementation.

## Open Questions

1. **Should `CTRL-02` and `CTRL-03` stay mapped to Phase 20 or move back to Phase 19 after closure?**
   - What we know: `.planning/REQUIREMENTS.md` currently maps both to Phase 20 pending, while the audit narrative says they were implemented in Phase 19 but orphaned from verification.
   - What's unclear: whether the milestone-audit workflow requires the traceability phase to match the verification file number.
   - Recommendation: keep Phase 20 ownership during execution and only remap back to Phase 19 if the rerun audit or planner logic requires that consistency.

2. **Does Phase 20 need fresh live recovery evidence?**
   - What we know: the current audit cites missing verification, not stale or failed Phase 19 evidence.
   - What's unclear: whether there is any freshness rule outside the artifact set already present.
   - Recommendation: do not rerun live proof by default. Reuse the existing Phase 19 evidence unless the new `19-VERIFICATION.md` exposes a contradiction.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `node` | repo scripts and JSON-backed artifact checks | ✓ | `v22.14.0` | — |
| `npm` | focused Vitest reruns | ✓ | `11.6.0` | — |
| `bash` | repo-owned validation and smoke scripts | ✓ | `3.2.57` | — |
| `rg` | artifact content checks | ✓ | `15.1.0` | use `grep` if needed |

**Missing dependencies with no fallback:**
- None.

**Missing dependencies with fallback:**
- None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest` + repo-owned shell artifact checks |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- --run packages/core/src/publish/shared-model.test.ts packages/core/src/publish/shared-merge.test.ts packages/core/src/scan/refresh-cache.test.ts packages/core/src/scan/incremental-refresh.test.ts packages/core/src/publish/publish-service.test.ts packages/core/src/publish/shared-badge-aggregation.test.ts packages/core/src/publish/publish-trust.test.ts packages/core/src/state/state-schema.test.ts packages/core/src/init/scaffold.test.ts packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts` |
| Full suite command | `npm test -- --run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CTRL-02 | Formal verification exists for Phase 19 and attaches recovery behavior to `CTRL-02` without reopening implementation | artifact audit | `test -f .planning/phases/19-recovery-paths-and-production-reliability-verification/19-VERIFICATION.md && rg -n 'CTRL-02|19-HUMAN-UAT.md|19-RECOVERY-EVIDENCE.md|19-RECOVERY-EVIDENCE.json' .planning/phases/19-recovery-paths-and-production-reliability-verification/19-VERIFICATION.md` | ❌ Wave 0 |
| CTRL-03 | Formal verification and audit closure cite the existing runbook and live proof artifacts for production-readiness recovery | artifact audit | `rg -n 'status: passed|recovery_command: agent-badge|source: scripts/smoke/verify-recovery-flow.sh' .planning/phases/19-recovery-paths-and-production-reliability-verification/19-HUMAN-UAT.md && rg -n '\"status\": \"passed\"|\"source\": \"scripts/smoke/verify-recovery-flow.sh\"' .planning/phases/19-recovery-paths-and-production-reliability-verification/19-RECOVERY-EVIDENCE.json && test -f .planning/v1.4-MILESTONE-AUDIT.md` | ✅ |

### Sampling Rate
- **Per task commit:** run the focused artifact checks for the file being closed.
- **Per wave merge:** run the full Phase 15 or Phase 17 focused suite that matches the validation doc being reconciled.
- **Phase gate:** both new verification files exist, both validation docs are closed, and the milestone audit file reflects no remaining Phase 15/19 verification blockers.

### Wave 0 Gaps
- [ ] `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-VERIFICATION.md` — missing blocker-closing artifact
- [ ] `.planning/phases/19-recovery-paths-and-production-reliability-verification/19-VERIFICATION.md` — missing blocker-closing artifact and requirement reattachment point
- [ ] `.planning/phases/20-verification-artifact-closure-and-audit-recovery/20-VALIDATION.md` — Phase 20’s own validation contract

## Sources

### Primary (HIGH confidence)
- `.planning/ROADMAP.md` - Phase 20 goal, success criteria, and two-plan structure
- `.planning/REQUIREMENTS.md` - current requirement status and traceability for `CTRL-02` / `CTRL-03`
- `.planning/v1.4-MILESTONE-AUDIT.md` - exact blockers, orphaned requirements, and validation debt
- `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-01-SUMMARY.md` - Phase 15 implementation evidence
- `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-02-SUMMARY.md` - Phase 15 implementation evidence
- `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-UAT.md` - Phase 15 acceptance evidence
- `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-VALIDATION.md` - Phase 15 validation contract needing reconciliation
- `.planning/phases/17-publish-failure-visibility-and-state-trust/17-VALIDATION.md` - Phase 17 validation contract needing reconciliation
- `.planning/phases/17-publish-failure-visibility-and-state-trust/17-VERIFICATION.md` - completed verification proving Phase 17 debt is likely process-only
- `.planning/phases/16-migration-diagnostics-and-team-operator-ux/16-VERIFICATION.md` - downstream supporting evidence for Phase 15
- `.planning/phases/18-auth-hook-and-publish-readiness-hardening/18-VERIFICATION.md` - upstream supporting evidence for Phase 19 semantics
- `.planning/phases/19-recovery-paths-and-production-reliability-verification/19-01-SUMMARY.md` - Phase 19 recovery implementation evidence
- `.planning/phases/19-recovery-paths-and-production-reliability-verification/19-02-SUMMARY.md` - Phase 19 runbook and evidence-capture evidence
- `.planning/phases/19-recovery-paths-and-production-reliability-verification/19-UAT.md` - Phase 19 acceptance evidence
- `.planning/phases/19-recovery-paths-and-production-reliability-verification/19-HUMAN-UAT.md` - live recovery evidence
- `.planning/phases/19-recovery-paths-and-production-reliability-verification/19-VALIDATION.md` - completed validation contract for `CTRL-02` / `CTRL-03`
- `.planning/phases/19-recovery-paths-and-production-reliability-verification/19-RECOVERY-EVIDENCE.md` - human-readable live proof
- `.planning/phases/19-recovery-paths-and-production-reliability-verification/19-RECOVERY-EVIDENCE.json` - machine-readable live proof
- `package.json` - actual repo script entrypoints and tool versions
- `vitest.config.ts` - test framework config
- `scripts/verify-docs.sh` - current doc-verification pattern
- `scripts/smoke/verify-recovery-flow.sh` - current evidence-capture pattern

### Secondary (MEDIUM confidence)
- `packages/core/src/publish/shared-model.test.ts`, `shared-merge.test.ts`, `publish-service.test.ts`, `shared-badge-aggregation.test.ts`, `refresh-cache.test.ts`, `incremental-refresh.test.ts` - direct evidence that Phase 15 validation topics already exist in code
- `packages/core/src/state/state-schema.test.ts`, `scaffold.test.ts`, `publish-trust.test.ts`, `doctor.test.ts`, `packages/agent-badge/src/commands/status.test.ts`, `refresh.test.ts`, `publish.test.ts`, `doctor.test.ts` - direct evidence that Phase 17 validation topics already exist in code

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new stack decisions are needed; repo-owned tooling and versions are directly inspectable.
- Architecture: HIGH - the roadmap and milestone audit are explicit that this is artifact closure, not feature expansion.
- Pitfalls: HIGH - the current audit report names the exact blockers, and the repo already contains the tests and evidence those draft validations point at.

**Research date:** 2026-04-05
**Valid until:** 2026-04-12
