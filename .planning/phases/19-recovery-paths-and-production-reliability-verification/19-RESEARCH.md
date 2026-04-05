# Phase 19: Recovery Paths And Production Reliability Verification - Research

**Researched:** 2026-04-05
**Domain:** supported recovery flows for stale publish error state, shared publish repair, and live production verification of the failure-and-recovery path
**Confidence:** MEDIUM

<user_constraints>
## User Constraints

No phase `CONTEXT.md` exists for Phase 19. Planner must treat the following as the active constraints derived from `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`, Phase 17 and 18 artifacts, the current codebase, and the live repo state.

### Locked Decisions
- Goal: give operators supported recovery flows for publish error state and verify the real production failure-and-recovery path end to end.
- Must satisfy `CTRL-02` and `CTRL-03`.
- Repos in publish error state must recover to a healthy shared publish state through supported CLI flows without manual `.agent-badge/state.json` edits.
- Production-readiness verification must prove the stale-badge failure path, recovery path, and operator-facing messaging against live repo state.
- Docs and checklists must match the actual failure signals and recovery workflow used by the CLI.
- Preserve the product boundary: local-first, aggregate-only, stable gist-backed badge URL, failure-soft by default, idempotent init, and no leaking prompts, transcript text, local paths, or raw provider session ids.

### Claude's Discretion
- Choose whether recovery remains a documented composition of existing commands or gains a dedicated CLI surface.
- Choose the exact operator flow for reconnecting publish targets versus retrying a healthy target after auth returns.
- Choose where recovery guidance is rendered, as long as `status`, `doctor`, docs, and live verification stay aligned.
- Choose the exact artifact shape for production reliability evidence and live-UAT capture.

### Deferred Ideas (OUT OF SCOPE)
- Hosted scheduling, background daemons, or backend-driven badge repair.
- New provider integrations or broader team analytics.
- Any workflow that requires manual JSON surgery in `.agent-badge/state.json`.
- Any diagnostic or verification flow that publishes raw private artifacts.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CTRL-02 | Repos in publish error state can recover to a healthy shared publish state through supported CLI flows without manual `.agent-badge/state.json` edits. | Reuse existing `init`, `refresh`, `publish`, `status`, and `doctor` state transitions; do not introduce manual state reset as the recovery primitive. |
| CTRL-03 | Production-readiness verification covers the real stale-badge failure path, recovery path, and operator-facing messaging. | Use the current repo's real stale/auth-missing state as the live starting point, add phase-specific automated regressions around the same flows, and record human UAT evidence before and after recovery. |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- Keep the product local-first and serverless.
- Preserve the aggregate-only public boundary.
- Preserve the initializer-first npm UX and stable gist + Shields URL model.
- Keep incremental refresh and `pre-push` fast and failure-soft by default, even though this repo currently uses `strict`.
- Keep `init` idempotent and safe on reruns.

## Summary

Phase 19 should not start by inventing a new state-reset command. The repo already has the right recovery primitives in code: `refresh` is the canonical republish path, `init --gist-id <id>` is the publish-target repair path, `doctor` already classifies readiness, trust, and shared-health separately, and successful publish attempts automatically clear stale error state through existing state helpers. The unsupported part today is operator experience and proof, not the low-level state transition model.

The strongest planning input is the current live repo state. On 2026-04-05, `npm run dev:agent-badge -- status` in this repo reported `Publish: error`, `Live badge trust: stale after failed publish`, `Shared mode: shared | health=healthy`, and `doctor` confirmed the real blocker is `publish-auth: warn` with missing GitHub auth, not shared-state corruption. That means the primary supported recovery lane for Phase 19 should be: diagnose with `status` and `doctor`, restore auth or reconnect the gist only when wiring is actually broken, rerun `refresh` as the canonical repair, then verify `status` and `doctor` return to a healthy trust/readiness state.

**Primary recommendation:** plan Phase 19 around one supported recovery workflow built from existing commands, not manual state edits: `doctor` to classify, `init --gist-id <id>` only when target wiring is broken, `refresh` as the normal recovery executor, and `status` plus `doctor` as the success gate. Prove that flow end to end on this repo's real stale/auth-missing state and update docs to match the exact CLI wording.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | local runtime `v22.14.0` | CLI execution, live operator verification, and test runtime | Already installed and used by the repo's dev/test scripts. |
| TypeScript | installed `5.9.3` | Typed recovery/report contracts across core and command surfaces | Existing repo line; no upgrade is required for this phase. Latest registry release is `6.0.2` published `2026-03-23`. |
| `zod` | installed `4.3.6` | Validate any additive recovery/report schema changes safely | Existing persisted state and config contracts already depend on it. Latest registry release is `4.3.6` published `2026-01-22`. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | installed `3.2.4` | Command and core regression coverage for recovery and live-trust behavior | Reuse for all Phase 19 automated recovery scenarios. Latest registry release is `4.1.2` published `2026-03-26`; do not upgrade in this phase. |
| `commander` | installed `14.0.3` | Existing CLI surface for any recovery-related command or option changes | Reuse if Phase 19 adds an explicit operator surface. Latest registry release is `14.0.3` published `2026-01-31`. |
| `octokit` | installed `5.0.5` | GitHub Gist read/write path used by publish and verification flows | Already powers publish and gist inspection; no second GitHub client should be introduced. Latest registry release is `5.0.5` published `2025-10-31`. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Supported recovery flow built from existing commands | New bespoke `recover` or `reset-publish-state` command | Faster to explain in one command, but risks duplicating trust/readiness logic and encouraging command-local state mutation. |
| Clearing stale error state by performing a real successful publish attempt | Manual edits to `.agent-badge/state.json` | Faster locally, but guarantees drift between persisted facts and remote badge state. |
| Reusing existing command tests plus live repo UAT | New custom verification harness or background simulator | More machinery with less confidence; Phase 19 needs proof against the real repo state. |

**Installation:**
```bash
# No new packages are required for Phase 19.
# Reuse the existing workspace dependencies and scripts.
```

## Repo Reality

### What already exists
- Canonical publish-attempt persistence already exists. [`packages/core/src/state/state-schema.ts`](../../../packages/core/src/state/state-schema.ts) and [`packages/core/src/publish/publish-state.ts`](../../../packages/core/src/publish/publish-state.ts) track `lastAttemptedAt`, `lastAttemptOutcome`, `lastSuccessfulSyncAt`, `lastAttemptCandidateHash`, `lastAttemptChangedBadge`, and `lastFailureCode`.
- Successful publish attempts already clear publish error state naturally. [`packages/core/src/publish/publish-state.ts`](../../../packages/core/src/publish/publish-state.ts) resets `lastFailureCode` to `null` and updates trust facts through `applySuccessfulPublishAttempt()`. This is the correct repair primitive.
- `refresh` is already the canonical recovery executor. [`packages/agent-badge/src/commands/refresh.ts`](../../../packages/agent-badge/src/commands/refresh.ts) writes local refresh state before remote work, retries shared publish with the current cache, persists failures with typed codes, and prints trust/readiness/policy output on both success and failure paths.
- `publish` is available as a full-rescan republish path, but it is not the normal automated recovery surface. [`packages/agent-badge/src/commands/publish.ts`](../../../packages/agent-badge/src/commands/publish.ts)
- `init --gist-id <id>` is already the supported target repair/reconnect surface. [`packages/agent-badge/src/commands/init.ts`](../../../packages/agent-badge/src/commands/init.ts), [`docs/MANUAL-GIST.md`](../../../docs/MANUAL-GIST.md)
- `doctor` already separates three distinct concepts:
  - publish readiness (`publish-auth`, `publish-write`, `publish-shields`)
  - live badge trust (`publish-trust`)
  - shared contributor health (`shared-mode`, `shared-health`)
  [`packages/core/src/diagnostics/doctor.ts`](../../../packages/core/src/diagnostics/doctor.ts)
- `shared-health` is already a typed report with `healthy`, `stale`, `conflict`, `partial`, and `orphaned` states. [`packages/core/src/publish/shared-health.ts`](../../../packages/core/src/publish/shared-health.ts)
- There is no dedicated recovery command in the CLI. [`packages/agent-badge/src/cli/main.ts`](../../../packages/agent-badge/src/cli/main.ts) exposes `init`, `publish`, `refresh`, `status`, `doctor`, `config`, `scan`, and `uninstall`, but nothing like `recover` or `repair`.

### Current live repo state
- The repo is already in a real stale failed-publish state:
  - [`status`](../../../packages/agent-badge/src/commands/status.ts) output on 2026-04-05: `Publish: error`, `Pre-push policy: strict`, `Live badge trust: stale after failed publish`, `Shared mode: shared | health=healthy | contributors=1`.
  - [`doctor`](../../../packages/core/src/diagnostics/doctor.ts) output on 2026-04-05: `publish-auth: warn`, `publish-write: pass`, `publish-shields: pass`, `publish-trust: fail`, `shared-health: pass`.
- The persisted state confirms the exact semantics:
  - [`.agent-badge/state.json`](../../../.agent-badge/state.json) has `publish.status = "error"`, `lastFailureCode = "auth-missing"`, `lastAttemptOutcome = "failed"`, `lastAttemptChangedBadge = "yes"`, and `lastAttemptCandidateHash != lastPublishedHash`.
  - That means the live badge is stale because the attempted badge value would have changed, but the publish attempt failed before sync.
- The shared model is healthy right now. The current failure is not a shared-state repair problem. It is an auth restoration plus republish problem.

### What is missing
- There is no first-class operator runbook that connects the existing surfaces into one supported recovery lane for `CTRL-02`.
- Current docs cover deferred setup, migration repair, stale shared contributors, and conflict repair, but they do not cover the real stale publish-error recovery path now visible in this repo:
  - `README.md` and [`docs/QUICKSTART.md`](../../../docs/QUICKSTART.md) cover deferred setup only.
  - [`docs/TROUBLESHOOTING.md`](../../../docs/TROUBLESHOOTING.md) has no section for `publish.status=error` plus `Live badge trust: stale after failed publish`.
  - The "badge looks stale after a push" section currently says rerun `refresh` and remember Shields caching; it does not mention typed publish failure state, auth restoration, or `doctor`.
- Phase 18 live UAT proved failure-path messaging, not recovery back to healthy state. [`18-HUMAN-UAT.md`](../18-auth-hook-and-publish-readiness-hardening/18-HUMAN-UAT.md)
- No existing automated test proves the full stale-error -> auth restored -> successful shared publish -> healthy trust transition as one supported operator flow.

## Architecture Patterns

### Recommended Project Structure
```text
packages/
├── core/src/publish/       # publish state transitions, readiness, trust, shared health
├── core/src/diagnostics/   # doctor checks and recovery fix text
├── core/src/init/          # idempotent reconnect/repair flows
├── agent-badge/src/commands/ # operator-facing recovery UX
└── testkit/                # fixture helpers for command-level integration tests
docs/
├── QUICKSTART.md
├── MANUAL-GIST.md
├── TROUBLESHOOTING.md
└── RELEASE.md
.planning/phases/19-.../    # live-UAT, validation, verification, and research artifacts
```

### Pattern 1: Use real publish success to clear error state
**What:** Recovery must be defined as a successful `refresh` or `publish` attempt, not as a state reset.

**When to use:** For all `CTRL-02` flows where the repo is stale after a failed publish but local state is still present.

**Why:** The repo already encodes the correct state transition in core helpers. A synthetic "clear error" mutation would bypass the exact contract that `status`, `doctor`, and pre-push policy already consume.

**Example:**
```ts
// Source: packages/core/src/publish/publish-state.ts
const nextState = applySuccessfulPublishAttempt({
  state,
  at: now,
  gistId,
  hash: candidateHash,
  publisherId,
  changedBadge
});
```

### Pattern 2: Split recovery into two lanes
**What:** Recovery should branch on the failure class already exposed by the CLI:
- target repair lane: `not-configured`, `deferred`, `gist-unreachable`, `gist-not-public`, `gist-missing-owner`
- republish lane: `auth-missing`, `remote-write-failed`, `remote-readback-failed`, `remote-readback-mismatch`, `remote-state-invalid`

**When to use:** In `doctor` fix text, troubleshooting docs, and any Phase 19 command UX.

**Recommended operator flow:**
```bash
agent-badge doctor

# If publish target is broken or not connected:
agent-badge init --gist-id <id>

# If target is healthy but publish is stale/failed:
export GH_TOKEN=...
agent-badge refresh

agent-badge status
agent-badge doctor
```

**Key rule:** use `init --gist-id <id>` only when the target wiring is broken. Do not tell operators to rerun init for plain missing-auth stale state unless they are also reconnecting a gist.

### Pattern 3: Keep shared-health separate from live badge recovery
**What:** A healthy shared model does not mean the live badge is current.

**When to use:** In docs, tests, and CLI wording for stale publish recovery.

**Why:** The live repo demonstrates the exact case:
- `publish-trust: stale after failed publish`
- `shared-health: healthy`

Planning must not add recovery messaging that treats shared-health as the cause of stale badge trust when auth or gist writes are the real issue.

### Pattern 4: Prove recovery with the real repo state, then lock docs to the same wording
**What:** Phase 19 should use this repository's current `auth-missing` stale state as the human UAT starting point.

**When to use:** For `CTRL-03` live verification and final docs updates.

**Recommended artifact flow:**
- capture pre-recovery `status` and `doctor` evidence from the live repo
- restore auth in the maintainer environment
- run `agent-badge refresh`
- capture post-recovery `status` and `doctor` evidence
- update docs and checklists so they use the same wording the CLI printed

### Anti-Patterns to Avoid
- **Manual `state.json` edits:** They can clear error flags without proving the live badge is current.
- **Using `shared-health` as the recovery gate:** It is a different problem space from live badge freshness.
- **Treating `init` as the universal fix:** `init` repairs wiring; `refresh` repairs a healthy target after auth returns.
- **Mock-only production verification:** `CTRL-03` explicitly requires live repo proof, not only unit tests.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Clearing publish error state | Custom JSON mutation or "reset" command | `refresh` or `publish` followed by existing state helpers | Only a real successful publish attempt can prove the live badge caught up. |
| Repairing gist wiring | Browser-only gist surgery instructions | `agent-badge init --gist-id <id>` | Existing init flow is idempotent and already preserves README/hook/state wiring safely. |
| Recovery status inference | New command-local logic | `inspectPublishReadiness()`, `derivePublishTrustReport()`, and `inspectSharedPublishHealth()` | Drift here would break `status`, `doctor`, and hook policy coherence. |
| Production reliability proof | Custom harness detached from the repo | Existing CLI commands, live repo state, and phase artifacts | The repo already has the real stale/auth-missing state to validate against. |

**Key insight:** the repo already has the state machine; Phase 19 should formalize and prove the operator workflow that drives it.

## Common Pitfalls

### Pitfall 1: Treating auth loss as shared-state corruption
**What goes wrong:** Planning assumes stale badge recovery needs remote shared-file repair when the real problem is missing auth.
**Why it happens:** `publish.status=error` and stale trust are easy to conflate with shared publish health.
**How to avoid:** Always inspect `doctor` readiness/trust/shared-health together and branch recovery based on the failure code.
**Warning signs:** `shared-health: pass` but `publish-auth: warn` and `publish-trust: fail`.

### Pitfall 2: Defining recovery as "clear the error"
**What goes wrong:** A new repair surface mutates local state but never proves the live gist or Shields badge actually updated.
**Why it happens:** Local state is easy to edit and the stale badge may still look unchanged after a failed write.
**How to avoid:** Only successful `refresh` or `publish` should clear stale failed-publish state.
**Warning signs:** A proposed plan step updates `.agent-badge/state.json` without invoking the real publish path.

### Pitfall 3: Telling operators to rerun `init` for everything
**What goes wrong:** Docs send users through unnecessary init flows when they only need to restore auth and rerun `refresh`.
**Why it happens:** `init --gist-id <id>` is the only documented reconnect path today, so it becomes a catch-all recommendation.
**How to avoid:** Separate target repair from republish recovery in both docs and CLI fixes.
**Warning signs:** Recovery instructions mention `init --gist-id <id>` even when `publish-write: pass` and the gist is already reachable.

### Pitfall 4: Using only mocked verification for CTRL-03
**What goes wrong:** Automated tests pass, but docs and checklists are still wrong for the real operator path.
**Why it happens:** Unit tests already cover many failure classifications, so it is tempting to stop there.
**How to avoid:** Add live human-UAT evidence against the current repo state and require docs updates to match exact CLI lines.
**Warning signs:** No artifact shows pre-recovery stale status and post-recovery healthy status on the real repo.

### Pitfall 5: Forgetting Shields caching after successful recovery
**What goes wrong:** Recovery succeeds, but operators think it failed because the README badge image lags for up to `cacheSeconds=300`.
**Why it happens:** `status` and `doctor` read truth faster than Shields re-renders.
**How to avoid:** Make docs explicit that `status` and `doctor` are the immediate trust gate after recovery; the visual badge may lag briefly.
**Warning signs:** Docs say "badge still old" without instructing operators to trust `status`/`doctor` first.

## Code Examples

Verified patterns from current repo code:

### Canonical readiness + trust summary
```ts
// Source: packages/core/src/publish/pre-push-policy.ts
const readiness = inspectPublishReadiness({ config, state });
const trust = derivePublishTrustReport({ state, now: new Date().toISOString() });

const degraded =
  readiness.status !== "ready" ||
  (trust.status !== "current" && trust.status !== "unchanged");
```

### Persist failed publish facts without leaking raw details
```ts
// Source: packages/agent-badge/src/commands/refresh.ts
const failedState = applyPublishAttemptFailure({
  state: persistedState,
  at: attemptedAt,
  failureCode: refreshError.failureCode,
  candidateHash: refreshError.candidateHash,
  changedBadge: toPublishAttemptChangedBadge(refreshError.changedBadge),
  gistId: persistedState.publish.gistId
});
```

### Supported recovery flow to document and verify
```bash
# Diagnose
agent-badge status
agent-badge doctor

# Repair only if target wiring is broken
agent-badge init --gist-id <id>

# Otherwise restore auth and rerun the canonical recovery path
agent-badge refresh

# Verify
agent-badge status
agent-badge doctor
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Generic publish failure with little trust context | Typed `publish.lastFailureCode`, candidate hash, and trust report | Phase 17 on 2026-04-02 | Recovery can now branch on durable facts rather than heuristics. |
| Coarse readiness/gist failure wording | Canonical readiness classification (`auth-missing`, `gist-unreachable`, `remote-readback-mismatch`, etc.) | Phase 18 on 2026-04-05 | Phase 19 can reuse one recovery vocabulary across CLI and docs. |
| Shared publish diagnostics without live badge trust separation | Separate `publish-trust` and `shared-health` checks | Phase 17 on 2026-04-02 | Recovery planning must preserve this split. |
| No live proof of recovery | Live proof of failure path only | Phase 18 on 2026-04-05 | Phase 19 must add the missing recovery-half evidence. |

**Deprecated/outdated:**
- "Rerun refresh and wait for Shields" as the only stale-badge advice in [`docs/TROUBLESHOOTING.md`](../../../docs/TROUBLESHOOTING.md): now incomplete, because the CLI can distinguish typed publish failure and auth loss.
- Treating `init` as the general recovery story: still valid for reconnecting targets, but incomplete for `auth-missing` stale publish state on an otherwise healthy gist.

## Open Questions

1. **Should Phase 19 add a dedicated recovery command?**
   - What we know: existing commands already cover diagnosis, target repair, republish, and verification.
   - What's unclear: whether the operator experience is still too indirect without a single entrypoint.
   - Recommendation: default to documenting and polishing the existing recovery lane first; add a new command only if planner finds a recovery case that cannot be expressed cleanly through `doctor`, `init`, and `refresh`.

2. **Should live production verification run against this repo's real gist or a disposable gist?**
   - What we know: `CTRL-03` explicitly wants proof against live repo state, and this repo is already in a real stale/auth-missing state.
   - What's unclear: whether maintainers want the primary proof on the canonical gist or a disposable dry-run target first.
   - Recommendation: use this repo's real gist for the final proof artifact, but keep any destructive experimentation on disposable fixtures before the final run.

3. **Should `refresh` or `publish` be the documented recovery command after auth restoration?**
   - What we know: `refresh` is the automated path and already rewrites cache, contributor state, and publish attempt facts; `publish` forces a full backfill.
   - What's unclear: whether operators should ever be told to prefer `publish` during normal recovery.
   - Recommendation: document `refresh` as the primary repair command and reserve `publish` for explicit full-rescan or troubleshooting scenarios.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | CLI, tests, live verification | ✓ | `v22.14.0` | — |
| npm | repo scripts, vitest runs, dev CLI entrypoints | ✓ | `11.6.0` | — |
| git | repo-aware init/doctor/status behavior | ✓ | `2.49.0` | — |
| Workspace install (`node_modules`) | `tsx`, vitest, local command execution | ✓ | present | — |
| GitHub Gist read access | live `status` and `doctor` shared/write checks | ✓ | live HTTP reachable at research time | — |
| Shields endpoint reachability | live badge verification via `doctor` | ✓ | live HTTP reachable at research time | — |
| GitHub auth env (`GH_TOKEN` / `GITHUB_TOKEN` / `GITHUB_PAT`) | real publish recovery and end-to-end republish proof | ✗ | — | none |

**Missing dependencies with no fallback:**
- GitHub auth token in the operator environment. The repo is currently blocked on this for an actual recovery publish. `doctor` confirms auth is the live blocker.

**Missing dependencies with fallback:**
- None. `agent-badge` does not currently support recovering a stale failed publish through `gh auth` or another credential source; Phase 19 must plan around env-var auth restoration.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest 3.2.4` |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- --run packages/agent-badge/src/commands/status.test.ts packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/core/src/publish/publish-service.test.ts` |
| Full suite command | `npm test -- --run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CTRL-02 | Recover stale failed-publish state to healthy shared publish mode without manual state edits | integration | `npm test -- --run packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/status.test.ts packages/core/src/diagnostics/doctor.test.ts packages/core/src/publish/publish-service.test.ts packages/agent-badge/src/commands/init.test.ts` | ✅ |
| CTRL-03 | Prove live failure path, auth/wiring recovery path, and post-recovery operator messaging against real repo state | manual + docs check | `npm run docs:check` | ✅ |

### Sampling Rate
- **Per task commit:** `npm test -- --run packages/agent-badge/src/commands/status.test.ts packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/core/src/publish/publish-service.test.ts`
- **Per wave merge:** `npm test -- --run`
- **Phase gate:** Full suite green, `npm run docs:check` green, and a fresh `19-HUMAN-UAT.md` showing stale -> recovered against the live repo before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/agent-badge/src/commands/refresh.test.ts` — add the full recovery transition from `auth-missing` stale state to successful shared publish with cleared trust failure.
- [ ] `packages/core/src/diagnostics/doctor.test.ts` — add post-recovery assertions proving `publish-trust` and `publish-auth` move to pass/warn states correctly after auth restoration and successful refresh.
- [ ] `packages/agent-badge/src/commands/status.test.ts` — add a recovered-state assertion that status returns to `current` or `unchanged` after the supported repair flow.
- [ ] `packages/agent-badge/src/commands/init.test.ts` — add target-repair scenarios covering when `init --gist-id <id>` is the correct recovery lane and when it is not.
- [ ] `.planning/phases/19-recovery-paths-and-production-reliability-verification/19-HUMAN-UAT.md` — capture live pre-recovery and post-recovery evidence from this repo.

## Sources

### Primary (HIGH confidence)
- Local repo code:
  - `packages/core/src/publish/publish-state.ts`
  - `packages/core/src/publish/publish-readiness.ts`
  - `packages/core/src/publish/publish-trust.ts`
  - `packages/core/src/publish/shared-health.ts`
  - `packages/core/src/publish/publish-service.ts`
  - `packages/core/src/diagnostics/doctor.ts`
  - `packages/agent-badge/src/commands/init.ts`
  - `packages/agent-badge/src/commands/publish.ts`
  - `packages/agent-badge/src/commands/refresh.ts`
  - `packages/agent-badge/src/commands/status.ts`
  - `packages/agent-badge/src/cli/main.ts`
- Live repo evidence gathered on 2026-04-05:
  - `npm run dev:agent-badge -- status`
  - `npm run dev:agent-badge -- doctor`
  - `.agent-badge/state.json`
  - `.agent-badge/config.json`
- Current test infrastructure:
  - `vitest.config.ts`
  - `npm test -- --run packages/agent-badge/src/commands/status.test.ts packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/core/src/publish/publish-service.test.ts packages/agent-badge/src/commands/release-readiness-matrix.test.ts`
  - Result: `5` files passed, `61` tests passed
- npm registry verification:
  - `npm list vitest typescript commander octokit zod --depth=0`
  - `npm view vitest version time --json`
  - `npm view zod version time --json`
  - `npm view commander version time --json`
  - `npm view octokit version time --json`
  - `npm view typescript version time --json`

### Secondary (MEDIUM confidence)
- Existing operator docs and prior phase artifacts:
  - `README.md`
  - `docs/QUICKSTART.md`
  - `docs/HOW-IT-WORKS.md`
  - `docs/MANUAL-GIST.md`
  - `docs/TROUBLESHOOTING.md`
  - `docs/RELEASE.md`
  - `18-HUMAN-UAT.md`
  - `17-RESEARCH.md`
  - `18-RESEARCH.md`

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM
  - Current installed and latest registry versions were verified directly, but no package upgrade evaluation was needed for this phase.
- Architecture: HIGH
  - Derived directly from current repo code, current live repo state, and passing phase-relevant tests.
- Pitfalls: HIGH
  - Backed by the live repo's current stale/auth-missing state and gaps in existing docs.

**Research date:** 2026-04-05
**Valid until:** 2026-04-12
