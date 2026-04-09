# Phase 18: Auth, Hook, And Publish Readiness Hardening - Research

**Researched:** 2026-04-02
**Domain:** GitHub auth detection, gist readiness classification, publish verification, and pre-push automation strictness for local-first badge publishing
**Confidence:** MEDIUM

<user_constraints>
## User Constraints

No phase `CONTEXT.md` exists for Phase 18. Planner must treat the following as the active constraints derived from `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`, Phase 17 artifacts, and the current codebase.

### Locked Decisions
- Goal: validate GitHub auth and publish readiness where operators need it, and give repos explicit control over how strict pre-push publish failures should be.
- Must satisfy `OPER-03`, `AUTH-01`, `AUTH-02`, and `CTRL-01`.
- `refresh` and `publish` must distinguish auth missing, gist access broken, remote write failure, and remote readback mismatch instead of collapsing failures into one generic error bucket.
- `doctor` and `init` must point operators to environment-specific fixes before the repo silently falls out of sync.
- Pre-push automation must remain explicit and repo-controlled rather than hidden in one default behavior.
- Preserve the product boundary: local-first, aggregate-only, stable gist-backed badge URL, failure-soft by default, and no leaking prompts, transcript text, local paths, or raw provider session ids.

### Claude's Discretion
- Choose the exact readiness-report and failure-code shape as long as it is additive and machine-readable.
- Choose where publish verification lives, as long as `refresh`, `publish`, `doctor`, and `init` consume one canonical readiness contract instead of per-command heuristics.
- Choose whether pre-push automation grows beyond the current `fail-soft` / `strict` pair, as long as the resulting behavior is explicit in config, hook wiring, and operator output.
- Choose how aggressively to probe remote readiness during `doctor`, as long as default behavior stays read-only unless the repo already uses explicit probe semantics.

### Deferred Ideas (OUT OF SCOPE)
- Supported recovery commands for clearing publish error state or repairing shared remote files. That is Phase 19 work.
- Hosted scheduling, background daemons, or server-side automation to keep badges fresh.
- New provider integrations or richer shared/team analytics.
- Any persistence of raw exception stacks, HTTP response bodies, local filesystem evidence, or provider session identifiers.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPER-03 | Pre-push automation reports degraded publish health clearly enough that a developer cannot mistake a stale badge for a successful update. | The hook path needs explicit degraded-mode output and configurable failure policy rather than only a hidden `|| true` difference. |
| AUTH-01 | Refresh and publish flows validate GitHub auth and gist write readiness before or during publish with concrete, local-environment-specific remediation. | Introduce a canonical publish readiness report that checks auth source, gist reachability/publicity/ownership, and write prerequisites before or during publish. |
| AUTH-02 | The runtime distinguishes auth-missing, gist-unreachable, write-failed, and remote-readback mismatch states instead of collapsing them into one generic publish error. | Expand failure-code vocabulary and publish-service verification so persisted diagnostics and command output classify each failure mode explicitly. |
| CTRL-01 | Repos can choose explicit automation strictness for badge publish failures rather than inheriting one hidden failure-soft default. | Promote pre-push behavior into an explicit, operator-visible automation policy that rewires the hook and command output coherently. |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- Keep the product local-first and serverless.
- Preserve the aggregate-only public boundary.
- Preserve the initializer-first npm UX and stable gist + Shields URL model.
- Keep incremental refresh and `pre-push` fast and failure-soft by default.
- Keep `init` idempotent and safe on reruns.

## Repo Reality

### What already exists
- Phase 17 already added canonical publish-attempt persistence under `publish.lastAttemptedAt`, `lastAttemptOutcome`, `lastSuccessfulSyncAt`, `lastAttemptCandidateHash`, `lastAttemptChangedBadge`, and `lastFailureCode`. [`packages/core/src/state/state-schema.ts`](../../../packages/core/src/state/state-schema.ts)
- `refresh`, `publish`, `status`, and `doctor` already share one live-badge trust vocabulary through `derivePublishTrustReport()` and `formatPublishTrustStatus()`. [`packages/core/src/publish/publish-trust.ts`](../../../packages/core/src/publish/publish-trust.ts), [`packages/agent-badge/src/commands/refresh.ts`](../../../packages/agent-badge/src/commands/refresh.ts), [`packages/agent-badge/src/commands/status.ts`](../../../packages/agent-badge/src/commands/status.ts), [`packages/core/src/diagnostics/doctor.ts`](../../../packages/core/src/diagnostics/doctor.ts)
- The publish path already computes a candidate badge hash before remote writes and tracks whether the badge would change. [`packages/core/src/publish/publish-service.ts`](../../../packages/core/src/publish/publish-service.ts)
- Current failure classification is still coarse: `remote-inspection-failed`, `remote-write-failed`, `deferred`, `not-configured`, and `unknown`. There is no explicit state for auth missing versus gist unreachable versus readback mismatch. [`packages/core/src/state/state-schema.ts`](../../../packages/core/src/state/state-schema.ts), [`packages/core/src/publish/publish-service.ts`](../../../packages/core/src/publish/publish-service.ts)
- GitHub auth detection is still binary. `detectGitHubAuth()` only reports whether one of `GH_TOKEN`, `GITHUB_TOKEN`, or `GITHUB_PAT` exists, or whether an injected checker passed. It does not describe the source beyond env/checker, and it does not verify that the token can read/write the configured gist. [`packages/core/src/init/github-auth.ts`](../../../packages/core/src/init/github-auth.ts)
- `ensurePublishTarget()` can tell init whether auth is unavailable, a gist is unreachable, non-public, or missing an owner, but that readiness logic is scoped to target setup and does not drive the ongoing publish/refresh/doctor contract. [`packages/core/src/publish/publish-target.ts`](../../../packages/core/src/publish/publish-target.ts)
- `doctor` already has separate `publish-auth`, `publish-write`, and `publish-trust` checks, but the write check only verifies gist reachability/publicity and optional probe-write behavior. It does not classify readback mismatch or reuse the exact same failure vocabulary as publish/refresh. [`packages/core/src/diagnostics/doctor.ts`](../../../packages/core/src/diagnostics/doctor.ts)
- Runtime wiring currently exposes only `refresh.prePush.enabled` and `refresh.prePush.mode`, with `mode` limited to `"fail-soft"` or `"strict"`. The managed hook behavior is just whether the command ends with `|| true`. [`packages/core/src/config/config-schema.ts`](../../../packages/core/src/config/config-schema.ts), [`packages/core/src/init/runtime-wiring.ts`](../../../packages/core/src/init/runtime-wiring.ts)
- Config mutation and hook rewiring for `refresh.prePush.*` already exist and are well-tested, so Phase 18 can extend automation behavior without inventing a new config pipeline. [`packages/agent-badge/src/commands/config.ts`](../../../packages/agent-badge/src/commands/config.ts), [`packages/agent-badge/src/commands/config.test.ts`](../../../packages/agent-badge/src/commands/config.test.ts), [`packages/core/src/init/runtime-wiring.test.ts`](../../../packages/core/src/init/runtime-wiring.test.ts)
- The release-readiness matrix already exercises init scenarios like no auth and idempotent reruns. It is a good place to add readiness/degraded-hook coverage without building a new fixture system. [`packages/agent-badge/src/commands/release-readiness-matrix.test.ts`](../../../packages/agent-badge/src/commands/release-readiness-matrix.test.ts)

### Gaps Phase 18 must close
- The runtime cannot currently answer, in a canonical way, whether a failed publish was caused by:
  - missing auth,
  - an unreachable or invalid configured gist,
  - a write failure after readiness checks passed,
  - a post-write remote readback mismatch.
- `publish` and `refresh` still resolve auth tokens locally and only classify most failures after they occur, which means the operator gets a generic error string rather than a durable readiness diagnosis.
- There is no post-write verification step. After `updateGistFile()` succeeds, the runtime assumes the remote state matches the candidate payload without readback confirmation.
- `doctor` and `init` expose related but not fully unified readiness guidance. Init knows about target-setup deferrals, doctor knows about auth/write/trust, and publish/refresh have their own failure wording.
- Pre-push automation strictness is not explicit enough for operators. The repo can choose `fail-soft` or `strict`, but the hook surface still looks like one silent command; degraded stale-badge risk is easy to miss when fail-soft remains enabled.
- The current config model conflates "should the hook fail the push?" with "how should degraded publish state be announced?" Those need to become explicit operator policy choices if `OPER-03` and `CTRL-01` are both going to hold.

## Summary

Phase 17 gave the repo canonical publish-attempt facts and live-badge trust messaging. Phase 18 should not replace that work. It should add one layer underneath it: a canonical publish-readiness and publish-verification contract that classifies *why* the badge is stale or at risk and feeds that same classification into `publish`, `refresh`, `doctor`, `init`, and pre-push automation.

The key repo-specific insight is that the code already has almost every ingredient needed for this phase:
- explicit persisted attempt facts,
- pre-write candidate hash calculation,
- a shared doctor framework,
- managed config and hook rewiring,
- and scenario-style integration tests.

The missing piece is unification. Readiness setup (`publish-target.ts`), publish execution (`publish-service.ts`), auth detection (`github-auth.ts`), and hook policy (`runtime-wiring.ts`) are still separate islands. Phase 18 should consolidate them into one readiness contract and then make automation policy explicit on top of that.

**Primary recommendation:** split the phase into two plans:
1. Add canonical auth/readiness classification plus post-write verification across `publish`, `refresh`, `doctor`, and `init`.
2. Build explicit pre-push automation strictness and degraded-mode UX on top of that canonical readiness contract.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | repo runtime (`>=20`, developed on 24.x) | auth env inspection, optional local CLI probing, and gist verification | No runtime change is needed; this phase is service + command orchestration. |
| TypeScript | repo line (`5.x`) | shared readiness/failure enums, reports, and command contracts | Existing repo standard and required for additive state/report safety. |
| `zod` | repo standard | additive validation for any expanded failure-code vocabulary or config schema | State/config changes must stay migration-safe and fail closed. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | repo standard | state, publish-service, doctor, init, config, hook, and command regression tests | Use for all new readiness and automation-policy coverage. |
| Existing gist client and publish helpers | repo code | gist inspection, write, and readback verification | Reuse current core publish modules instead of introducing a second remote layer. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| One canonical readiness report shared across commands | Command-local auth/write checks in `init`, `refresh`, `publish`, and `doctor` | Faster to patch, but guaranteed to drift and violate `AUTH-01` / `AUTH-02`. |
| Additive failure-code expansion plus post-write verification | Continue storing only `remote-inspection-failed` / `remote-write-failed` | Simpler schema, but operators still cannot tell whether the badge is stale because auth is missing, the gist is broken, or a write diverged after success. |
| Explicit automation policy surfaced in config and hook output | Keep `fail-soft` / `strict` as an implementation detail of `|| true` | Preserves behavior, but does not meet `OPER-03` or `CTRL-01` because degraded badge risk stays easy to miss. |

**Installation:**
```bash
# No new packages are required for Phase 18.
# Reuse the existing workspace dependencies and test infrastructure.
```

## Architecture Patterns

### Pattern 1: Separate publish readiness from live badge trust
**What:** Keep Phase 17's trust report, but feed it with a new readiness/verification layer that classifies the failure source.

**Why:** Trust answers "is the live badge current?". Readiness answers "why did publish succeed or fail?". They are adjacent but not the same concept.

**Recommended model:**
- Add a core readiness report, for example `inspectPublishReadiness()` or `verifyPublishReadiness()`, that returns:
  - `authStatus`
  - `targetStatus`
  - `writeStatus`
  - `readbackStatus`
  - `failureCode`
  - `fixes`
- Keep `derivePublishTrustReport()` focused on badge freshness, not auth diagnostics.
- Let commands render both:
  - readiness / degraded cause
  - live badge trust

### Pattern 2: Expand failure codes to match operator-relevant causes
**What:** Replace the coarse Phase 17 failure vocabulary with more precise additive codes.

**Why:** `AUTH-02` requires the runtime to distinguish auth missing, gist unreachable, write failure, and readback mismatch in persisted diagnostics and command output.

**Recommended additive failure codes:**
- `auth-missing`
- `gist-unreachable`
- `gist-not-public`
- `gist-missing-owner`
- `remote-write-failed`
- `remote-readback-failed`
- `remote-readback-mismatch`
- `remote-state-invalid`
- `not-configured`
- `deferred`
- `unknown`

**Rules:**
- Persist only machine-readable codes, not raw error bodies.
- Map exceptions to one of these codes at the publish-service or publish-target boundary.
- Keep init/scaffold backward-compatible by treating Phase 17 codes as legacy accepted values during migration if needed.

### Pattern 3: Verify remote state after writes
**What:** Add post-write readback verification to `publishBadgeIfChanged()`.

**Why:** A successful `updateGistFile()` call does not prove the gist ended in the expected state. `AUTH-02` explicitly requires a readback mismatch state.

**Recommended implementation shape:**
- Compute the candidate hash before writes, as the repo already does.
- After the write sequence, re-read the gist.
- Verify:
  - the expected badge file exists,
  - its payload hash matches `candidateHash`,
  - required shared files are present and parseable.
- On failure:
  - throw a typed `PublishBadgeError` with `failureCode = "remote-readback-failed"` or `"remote-readback-mismatch"`,
  - persist those facts through the existing publish-state helpers,
  - keep trust reporting honest by preserving the failed attempt and candidate hash.

### Pattern 4: Centralize environment-specific remediation
**What:** Generate fixes from one readiness contract instead of writing separate command copy.

**Why:** `init`, `doctor`, `publish`, and `refresh` currently have overlapping but different remediation wording. That will drift unless the repo chooses one source of truth.

**Recommended behaviors:**
- Auth missing:
  - tell the operator exactly which env vars are supported,
  - if the project later supports a CLI checker, report the source explicitly.
- Gist unreachable / invalid:
  - tell the operator to rerun `agent-badge init --gist-id <id>` or verify gist access.
- Remote readback mismatch:
  - instruct the operator to rerun publish/refresh and inspect doctor output before trusting the live badge.
- Hook degraded mode:
  - print an explicit stale-badge warning in pre-push output, not just an error line.

### Pattern 5: Treat hook strictness as explicit automation policy
**What:** Promote pre-push behavior from a hidden shell detail to a visible repo policy.

**Why:** `CTRL-01` requires explicit automation strictness, and `OPER-03` requires degraded publish health to be obvious when the repo keeps fail-soft behavior.

**Recommended implementation shape:**
- Preserve backward compatibility with `refresh.prePush.enabled`.
- Evolve `refresh.prePush.mode` into a policy with explicit semantics, for example:
  - `fail-soft` — push continues, but hook prints a loud degraded badge warning when publish trust is stale or readiness failed
  - `strict` — push fails on publish/readiness failures
- Optionally add a second config flag only if needed for clarity, but avoid multiplying knobs unless the single `mode` field becomes ambiguous.
- Keep the hook block managed and idempotent, but make the command output self-describing so an operator can tell which mode is active during a failing pre-push run.

## Recommended Delivery Shape

### 18-01: Harden auth and gist readiness checks across publish, refresh, and doctor
**Goal:** make readiness failures precise, durable, and shared across all operator surfaces before hook policy builds on them.

**Recommended scope:**
- add a core publish-readiness / failure-classification module
- expand state failure-code vocabulary additively
- upgrade `publish-service.ts` to classify auth missing, gist unreachable, write failure, and readback mismatch explicitly
- make `publish.ts` and `refresh.ts` persist and print the new codes and remediation
- align `doctor.ts` and `init.ts` to the same readiness vocabulary
- add tests for typed failure classification and post-write readback verification

### 18-02: Add explicit automation strictness and visible degraded-mode hook behavior
**Goal:** make pre-push automation policy deliberate and keep stale-badge risk visible even when the repo stays failure-soft.

**Recommended scope:**
- update config schema and config command wording so automation strictness is explicit and operator-readable
- update runtime wiring so managed hooks encode the selected policy unambiguously
- update `refresh --hook pre-push` output to report degraded publish health loudly and in a concise hook-specific format
- extend doctor/init/status or config output where needed so the current hook policy is inspectable
- add regression coverage for hook rewiring, config mutation, degraded fail-soft output, strict blocking behavior, and release-readiness scenarios

## Concrete Extension Points

### Auth and readiness seams
- [`packages/core/src/init/github-auth.ts`](../../../packages/core/src/init/github-auth.ts)
  - currently binary auth detection; likely place to grow source/fix detail
- [`packages/core/src/publish/publish-target.ts`](../../../packages/core/src/publish/publish-target.ts)
  - already knows `auth-unavailable`, `gist-not-public`, `gist-missing-owner`, `gist-unreachable`, `gist-create-failed`
- [`packages/core/src/publish/publish-service.ts`](../../../packages/core/src/publish/publish-service.ts)
  - already computes candidate hash and owns write sequencing; the right home for readback verification
- [`packages/core/src/publish/publish-state.ts`](../../../packages/core/src/publish/publish-state.ts)
  - canonical persistence seam for expanded failure codes

### Operator surfaces
- [`packages/agent-badge/src/commands/publish.ts`](../../../packages/agent-badge/src/commands/publish.ts)
  - direct publish path should surface precise readiness failure causes
- [`packages/agent-badge/src/commands/refresh.ts`](../../../packages/agent-badge/src/commands/refresh.ts)
  - pre-push and normal refresh both need precise degraded-state output
- [`packages/core/src/diagnostics/doctor.ts`](../../../packages/core/src/diagnostics/doctor.ts)
  - should reuse the same readiness vocabulary and fixes
- [`packages/agent-badge/src/commands/init.ts`](../../../packages/agent-badge/src/commands/init.ts)
  - should reuse the same readiness guidance for first-run/deferred setup

### Automation policy seams
- [`packages/core/src/config/config-schema.ts`](../../../packages/core/src/config/config-schema.ts)
  - current `refresh.prePush.mode` is the policy seam
- [`packages/agent-badge/src/commands/config.ts`](../../../packages/agent-badge/src/commands/config.ts)
  - existing mutation path for hook policy
- [`packages/core/src/init/runtime-wiring.ts`](../../../packages/core/src/init/runtime-wiring.ts)
  - managed hook block generation and idempotent rewiring
- [`packages/core/src/init/runtime-wiring.test.ts`](../../../packages/core/src/init/runtime-wiring.test.ts)
  - concrete place to lock policy-specific hook behavior

## Validation Architecture

Phase 18 already has strong infrastructure and does not need new frameworks. Validation should focus on the seams where readiness can silently drift:

- **State + schema:** `packages/core/src/state/state-schema.test.ts`, `packages/core/src/init/scaffold.test.ts`
- **Publish classification + verification:** `packages/core/src/publish/publish-service.test.ts`, `packages/core/src/publish/publish-target.test.ts`, `packages/core/src/publish/publish-state.test.ts`
- **Doctor + init readiness output:** `packages/core/src/diagnostics/doctor.test.ts`, `packages/agent-badge/src/commands/init.test.ts`
- **Command surfaces:** `packages/agent-badge/src/commands/publish.test.ts`, `packages/agent-badge/src/commands/refresh.test.ts`, `packages/agent-badge/src/commands/status.test.ts`, `packages/agent-badge/src/commands/doctor.test.ts`
- **Automation policy + hooks:** `packages/core/src/init/runtime-wiring.test.ts`, `packages/agent-badge/src/commands/config.test.ts`
- **Scenario coverage:** `packages/agent-badge/src/commands/release-readiness-matrix.test.ts`

The fast validation loop for execution should stay under roughly one minute by using a targeted command spanning those files, then a full `npm test -- --run` sweep after each wave.

## Planner Notes

- Plan 01 should own the new readiness/failure vocabulary and all stateful publish verification changes. That work is foundational and should land before hook policy changes rely on it.
- Plan 02 should depend on Plan 01 because degraded pre-push output needs the canonical readiness/trust contract from Plan 01.
- The planner should keep acceptance criteria grep-verifiable and anchored to exact strings such as `remote-readback-mismatch`, `Publish readiness:`, `Live badge trust:`, and explicit hook-command output.
- The planner should preserve local-first failure-soft defaults. Even if strict behavior expands, the repo must still support a safe failure-soft mode with loud degraded-state output.
