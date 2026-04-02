# Phase 18: Auth, Hook, And Publish Readiness Hardening - Research

**Researched:** 2026-04-02
**Domain:** GitHub auth/readiness classification, pre-push automation strictness, and operator-visible publish degradation for local-first Gist publishing
**Confidence:** HIGH

<user_constraints>
## User Constraints

No phase `CONTEXT.md` exists for Phase 18. Planner must treat the following as the active constraints derived from `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`, the user prompt, and the current codebase.

### Locked Decisions
- Goal: validate GitHub auth and publish readiness where operators need it, and give repos explicit control over how strict pre-push publish failures should be.
- Must satisfy `OPER-03`, `AUTH-01`, `AUTH-02`, and `CTRL-01`.
- Refresh and publish must report whether auth is missing, gist access is broken, writes fail, or remote readback is inconsistent.
- Pre-push automation must be configurable deliberately and must warn loudly when the badge did not update.
- Doctor and init must point operators to environment-specific fixes before the repo silently falls out of sync.
- Keep the product local-first, aggregate-only, privacy-safe, failure-soft by default, and idempotent on `init` reruns.
- Phase 17's persisted publish-attempt facts are the foundation. Phase 18 should extend them additively, not replace them.

### Claude's Discretion
- Choose the exact shared readiness-report shape and where it lives in core.
- Choose whether auth detection stays env-first only or adds an optional checker path such as GitHub CLI detection behind the existing checker boundary.
- Choose the exact additive failure/readiness enum expansion and operator wording.
- Choose how much degraded-mode visibility appears in `refresh`, `status`, `doctor`, and managed hook wiring, as long as one control surface remains authoritative.

### Deferred Ideas (OUT OF SCOPE)
- Supported recovery commands and end-to-end stale-badge recovery flows. That is Phase 19.
- Hosted scheduling, backend coordination, new provider integrations, dashboards, or richer remote analytics.
- Any persisted diagnostic that stores raw exception text, HTTP bodies, local filesystem paths, prompts, transcript text, or raw provider session IDs.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPER-03 | Pre-push automation reports degraded publish health clearly enough that a developer cannot mistake a stale badge for a successful update. | Reuse the existing `refresh.prePush.enabled` / `refresh.prePush.mode` config surface, but add explicit degraded-mode output and doctor/status visibility so strict vs fail-soft is obvious and testable. |
| AUTH-01 | Refresh and publish flows validate GitHub auth and gist write readiness before or during publish with concrete, local-environment-specific remediation. | Add one shared readiness inspector for init/doctor and attempt-time classification for refresh/publish so read-only checks and mutating checks stay consistent but distinct. |
| AUTH-02 | The runtime distinguishes auth-missing, gist-unreachable, write-failed, and remote-readback mismatch states instead of collapsing them into one generic publish error. | Extend the publish failure taxonomy additively and classify Octokit `RequestError.status` plus post-write verification results into privacy-safe failure codes. |
| CTRL-01 | Repos can choose explicit automation strictness for badge publish failures rather than inheriting one hidden failure-soft default. | Keep `refresh.prePush.mode` as the single source of truth, route hook/script/status/doctor messaging through it, and avoid introducing a second hidden toggle. |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- Keep the product local-first and serverless.
- Preserve the aggregate-only public boundary.
- Preserve the initializer-first npm UX and stable public Gist + Shields badge URL model.
- Keep incremental refresh fast enough for `pre-push` and failure-soft by default.
- Keep `init` idempotent: reruns must not duplicate hooks, README badge blocks, or Gist wiring.

## Repo Reality

### What already exists
- Fine-grained automation control already exists in config and hook wiring. `packages/core/src/config/config-schema.ts` defines `refresh.prePush.enabled` and `refresh.prePush.mode: "fail-soft" | "strict"`. `packages/agent-badge/src/commands/config.ts` can already mutate both, and `packages/core/src/init/runtime-wiring.ts` already toggles `|| true` in the managed hook block.
- The managed pre-push command is already centralized. `packages/core/src/runtime/local-cli.ts` emits either `agent-badge refresh --hook pre-push --fail-soft` or `agent-badge refresh --hook pre-push`.
- `refresh` already persists local refresh state before any remote publish work. That is the correct foundation for local-first failure-soft behavior and should not change.
- `doctor` already has a useful split between read-only checks and an explicit `--probe-write` path. `packages/core/src/diagnostics/doctor.ts` validates auth presence, gist reachability, Shields reachability, publish trust, shared mode/health, README markers, and hook wiring. The probe-write path intentionally performs a no-op Gist overwrite only when the operator asks for it.
- Init preflight already has an auth abstraction seam. `packages/core/src/init/github-auth.ts` supports env-token detection plus an injected `checker`, and `packages/core/src/init/preflight.ts` already threads that result into init/doctor.
- Phase 17 already persisted canonical attempt facts such as `lastAttemptedAt`, `lastAttemptOutcome`, `lastSuccessfulSyncAt`, `lastAttemptCandidateHash`, `lastAttemptChangedBadge`, and `lastFailureCode`. The current failure enum is intentionally broad: `not-configured`, `deferred`, `remote-write-failed`, `remote-inspection-failed`, `unknown`.

### Gaps Phase 18 must close
- `refresh` and `publish` still mostly collapse runtime failures into `unknown`, `remote-write-failed`, or `remote-inspection-failed`. There is no typed distinction between auth missing, public gist unreachable/not found, write denied, and post-write readback mismatch.
- `publish-service.ts` computes `candidateHash` before remote writes, but it does not perform any post-write verification. That means AUTH-02's "remote readback mismatch" state requires real new logic, not just a renamed enum.
- `doctor` can currently tell whether a Gist is reachable and whether a write probe succeeds, but it does not produce the same readiness vocabulary the runtime publish path would use.
- `status` does not surface hook strictness or degraded publish-readiness state directly; it only prints persisted publish state plus shared-mode health.
- `init` reports only coarse GitHub auth availability and deferred badge-setup reasons. It does not yet give the same explicit environment-specific readiness vocabulary that Phase 18 needs for refresh/publish/doctor.
- Current auth detection is env-token-only unless an injected checker is provided by the caller. There is a seam for optional richer detection, but no repo-owned implementation yet.

## Summary

Phase 18 should not invent a new hook model, a new config surface, or a new GitHub transport. The repo already has the right structural pieces: one Gist client wrapper, one config field for pre-push strictness, one managed hook writer, one init preflight auth seam, and Phase 17's canonical publish-attempt facts. The missing piece is a shared readiness and failure-classification layer that turns GitHub and Gist outcomes into stable, privacy-safe operator signals.

The implementation should split cleanly into two concerns. First, add a reusable read-only publish-readiness inspector for `init`, `doctor`, and optional `status` output. Second, enrich the mutating publish path so `refresh` and `publish` classify actual failures using Octokit `RequestError.status` and a final post-write readback verification step. Keep failure-soft as the default repo behavior, but make degraded mode loud enough that developers cannot misread "push succeeded" as "badge updated."

**Primary recommendation:** add one core `inspectPublishReadiness()` / `classifyPublishFailure()` boundary, extend the Phase 17 failure enums additively, and keep `refresh.prePush.mode` as the only strictness control while surfacing it explicitly in hook, status, and doctor output.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Existing Gist wrapper over `octokit` | repo pins `^5.0.0`; npm latest `5.0.5` | GitHub Gist read/write transport and typed error handling | Already the repo-standard GitHub boundary; Phase 18 should extend it rather than add `fetch` wrappers or CLI-only publishing. |
| `zod` | repo pins `^4.0.0`; npm latest `4.3.6` | Additive state-schema and readiness-report validation | Phase 18 needs enum expansion and possibly a shared readiness result contract without breaking old state files. |
| Existing config + runtime wiring modules | repo code | Single source of truth for pre-push enablement and strictness | `refresh.prePush.mode` already exists; this phase should reuse it rather than add a second hidden policy knob. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `commander` | repo pins `^14.0.0`; npm latest `14.0.3` | Existing CLI surface for `doctor`, `status`, `refresh`, `publish`, and `config` | Reuse current commands; no new top-level command is required for Phase 18. |
| `vitest` | repo pins `^3.2.0`; npm latest `4.1.2` | Unit and command regression coverage | Use the existing test harness. Do not turn Phase 18 into a dependency-upgrade phase. |
| Optional GitHub auth checker via existing `DetectGitHubAuthOptions.checker` seam | repo code | Non-env auth detection if the project decides to support it | Only use as an additive convenience path; env-token detection remains the canonical supported baseline. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing `octokit` wrapper + typed status classification | Manual `fetch` wrappers and string parsing | Worse error fidelity, more auth/header code, and more drift from official GitHub behavior. |
| Existing `refresh.prePush.mode` config | New env vars or hook-only flags | Hidden control surfaces violate `CTRL-01` and drift from `config` / `runtime-wiring` reconciliation. |
| Read-only readiness inspection plus explicit `--probe-write` | Always mutating no-op writes to "test" auth | Breaks the current safety model and adds unnecessary remote churn to normal status/doctor flows. |
| Optional checker integration behind existing seam | Hard dependency on `gh` CLI | GitHub CLI is not installed everywhere, including this environment; it must remain optional if supported at all. |

**Installation:**
```bash
# No new packages are required for Phase 18.
# Reuse the existing workspace dependencies and extend current modules.
```

**Version verification (2026-04-02):**
- `commander` latest `14.0.3` (published 2026-01-31)
- `octokit` latest `5.0.5` (published 2025-10-31)
- `zod` latest `4.3.6` (published 2026-01-22)
- `vitest` latest `4.1.2` (published 2026-03-26) but repo stays on `^3.2.0` for this phase
- `tsx` latest `4.21.0` (published 2025-11-30) but Phase 18 does not require changes here

## Architecture Patterns

### Recommended Project Structure
```text
packages/core/src/
├── init/                 # auth detection + init/readiness preflight
├── publish/              # typed readiness inspection, failure classification, publish service
├── diagnostics/          # doctor checks rendered from shared facts
└── state/                # additive enums and persisted attempt facts

packages/agent-badge/src/commands/
├── init.ts               # preflight + readiness remediation
├── refresh.ts            # attempt-time classification and hook output
├── publish.ts            # explicit publish path using the same classifier
├── status.ts             # persisted trust + strictness/degraded-mode summary
└── config.ts             # authoritative strictness control surface
```

### Pattern 1: One Read-Only Publish Readiness Report
**What:** Add a shared core helper that inspects auth presence, configured Gist target, Gist reachability/public-ness, and optional write-readiness without mutating state by default.

**When to use:** `init`, `doctor`, and optionally `status` when operators need environment-specific readiness fixes before a publish attempt.

**Recommended shape:**
- `auth`: `available | missing | unknown`
- `target`: `not-configured | deferred | ready`
- `read`: `ok | forbidden | not-found | unreachable | malformed`
- `write`: `not-checked | ok | auth-missing | forbidden | failed`
- `remediation`: stable fix strings derived from the same result

**Why:** It keeps `init` and `doctor` aligned while preserving the current safety model where write probes are explicit.

### Pattern 2: Attempt-Time Failure Classification Owns Runtime Truth
**What:** Classify real publish failures at the transport boundary using Octokit `RequestError.status`, then persist only privacy-safe enums plus candidate-hash metadata.

**When to use:** `refresh` and `publish`, where the runtime is already making mutating Gist calls.

**Recommended additive failure codes:**
- `auth-missing`
- `gist-unreachable`
- `gist-forbidden`
- `gist-not-found`
- `remote-write-forbidden`
- `remote-write-failed`
- `remote-readback-failed`
- `remote-readback-mismatch`
- retain `not-configured`, `deferred`, and `unknown`

**Why:** The current Phase 17 schema was explicitly designed for additive refinement in Phase 18. This path should extend enums, not redesign persistence.

### Pattern 3: Verify Final Remote State After the Last Write
**What:** After the final publish write, perform one final authoritative readback and compare the resulting badge payload hash to `candidateHash`.

**When to use:** The normal `publishBadgeIfChanged()` path after the badge file, contributor file, and shared overrides file have all been updated.

**Recommended behavior:**
- If the final `getGist()` succeeds and the endpoint file hash matches `candidateHash`, treat the publish as successful.
- If the final `getGist()` succeeds but the endpoint file hash does not match `candidateHash`, persist `remote-readback-mismatch`.
- If the final `getGist()` fails, persist `remote-readback-failed`.

**Why:** AUTH-02 explicitly requires a distinct readback-mismatch state, and the current code does no post-write verification.

### Pattern 4: One Strictness Control, Multiple Visibility Surfaces
**What:** Keep `refresh.prePush.mode` as the only automation strictness knob, but surface its effect in:
- managed hook content
- `config get`
- `status`
- `doctor`
- pre-push refresh output

**When to use:** Any operator-facing view that can otherwise make degraded fail-soft behavior look invisible.

**Recommended messaging:**
- `fail-soft`: push is allowed to continue, but output must clearly say the badge may be stale
- `strict`: publish/readiness failure returns non-zero and blocks push

### Anti-Patterns to Avoid
- **String-matching raw `error.message`:** use `RequestError.status` and privacy-safe classification, not ad-hoc message parsing.
- **Always-on write probes in doctor/init:** keep normal readiness inspection read-only and reserve remote writes for publish or explicit `--probe-write`.
- **A second hidden strictness toggle:** do not add env-only or hook-only policy that can drift from `refresh.prePush.mode`.
- **Persisting raw HTTP or filesystem details:** keep state aggregate-only and privacy-safe.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GitHub failure taxonomy | Manual substring parsing of thrown errors | Octokit `RequestError` classification plus official Gist status semantics | Official docs define the meaningful HTTP states; Octokit exposes them directly. |
| Hook strictness policy | Shell-only `|| true` logic scattered across templates | Existing `refresh.prePush.mode` + `applyRepoLocalRuntimeWiring()` | One authority keeps `config`, scripts, and hooks in sync. |
| Publish readiness checks | Separate ad-hoc checks in `init`, `doctor`, `refresh`, and `status` | Shared core readiness inspector reused by commands | Prevents wording drift and contradictory remediation. |
| Readback verification | Assuming `PATCH` success means final remote state is correct | Final `getGist()` verification against `candidateHash` | AUTH-02 explicitly requires distinguishing write success from readback mismatch. |

**Key insight:** the hard part here is not adding more output. It is making every output surface derive from the same transport-aware, privacy-safe facts.

## Common Pitfalls

### Pitfall 1: Confusing Anonymous Gist Reads With Authenticated Gist Writes
**What goes wrong:** A repo can read a public Gist successfully and still fail every write because no token is present or the token lacks Gists write permission.
**Why it happens:** GitHub allows public Gist reads without special permissions, but Gist updates require authenticated write access.
**How to avoid:** Treat read readiness and write readiness as separate checks and separate failure codes.
**Warning signs:** `doctor`/`status` can inspect the Gist, but `refresh`/`publish` fail at the first write call.

### Pitfall 2: Collapsing 403/404/Auth Failures Into One Generic Remote Error
**What goes wrong:** Operators cannot tell whether they need a token, a different Gist id, a public Gist, or just a retry.
**Why it happens:** The current wrapper returns normalized Gist objects but does not yet normalize transport failures.
**How to avoid:** Classify `RequestError.status` at the Gist-client boundary and persist only stable enums.
**Warning signs:** state only says `remote-inspection-failed` or `unknown`, and remediation text becomes generic.

### Pitfall 3: Declaring Success Without Post-Write Verification
**What goes wrong:** The local machine believes publish succeeded even though the final endpoint file is stale or inconsistent.
**Why it happens:** `publish-service.ts` currently computes `candidateHash` before writes but never verifies the final remote badge payload after the last update.
**How to avoid:** Do one final `getGist()` and compare the endpoint badge payload hash to the candidate hash before returning success.
**Warning signs:** write calls succeed, but the live badge or fetched Gist payload does not reflect the intended hash.

### Pitfall 4: Failure-Soft Hooks That Are Too Quiet
**What goes wrong:** Pushes succeed and developers assume the badge updated when it did not.
**Why it happens:** Exit behavior is configurable today, but degraded-mode messaging is still thinner than the requirement demands.
**How to avoid:** Make `refresh --hook pre-push --fail-soft` print an unmistakable stale/degraded message and expose current mode in `status`/`doctor`.
**Warning signs:** operators can see `status: error` later, but the pre-push path did not make the risk obvious at the time.

### Pitfall 5: Environment Probes That Mutate the Repo
**What goes wrong:** A "harmless" availability check edits tracked files and dirties the worktree.
**Why it happens:** In this environment, `pnpm --version` via Corepack attempted to inject a `packageManager` field into `package.json`.
**How to avoid:** Prefer non-mutating presence checks (`command -v pnpm`) or document that some package-manager probes are not read-only.
**Warning signs:** worktree changes appear immediately after a version probe.

## Code Examples

Verified patterns from official sources:

### Classify Octokit Request Errors For Gist Operations
```ts
// Source: https://github.com/octokit/octokit.js/
import { RequestError } from "octokit";

function classifyGistError(error: unknown) {
  if (!(error instanceof RequestError)) {
    return "unknown";
  }

  switch (error.status) {
    case 401:
      return "auth-missing";
    case 403:
      return "gist-forbidden";
    case 404:
      return "gist-not-found";
    default:
      return "remote-write-failed";
  }
}
```

### Keep Readiness Inspection Read-Only Unless The Operator Opts Into A Probe Write
```ts
// Sources:
// - https://docs.github.com/en/rest/gists/gists
// - packages/core/src/diagnostics/doctor.ts
async function inspectPublishReadiness({
  gistId,
  probeWrite,
  client,
  currentPayload
}: {
  gistId: string;
  probeWrite: boolean;
  client: GitHubGistClient;
  currentPayload: string;
}) {
  const gist = await client.getGist(gistId);

  if (!probeWrite) {
    return { read: "ok", write: "not-checked", gist };
  }

  await client.updateGistFile({
    gistId,
    files: { "agent-badge.json": { content: currentPayload } }
  });

  return { read: "ok", write: "ok", gist };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Broad Phase 17 failure buckets like `remote-write-failed` / `remote-inspection-failed` | Additive typed classification driven by HTTP status and post-write verification | Phase 17 explicitly deferred fine-grained readiness/auth detail to Phase 18 | Planner should extend enums and helpers, not replace the persistence model. |
| Hidden fail-soft hook behavior inferred from hook content | Explicit repo-controlled strictness via `refresh.prePush.mode`, surfaced in command output | Control surface already exists from earlier phases; Phase 18 hardens visibility | No new config key is needed; planner should focus on output clarity and trust signals. |
| Trusting successful write calls as final success | Verifying final remote badge payload against `candidateHash` | Required now by `AUTH-02` | One extra read after the last write is the cleanest way to detect mismatch without persisting payload bodies. |

**Deprecated/outdated:**
- Raw error-message persistence or string matching as the primary failure taxonomy.
- Adding a second hidden hook strictness mechanism outside `config`.
- Treating public Gist readability as proof of publish readiness.

## Open Questions

1. **Should Phase 18 add optional GitHub CLI-backed auth detection, or stay env-token-only?**
   - What we know: `detectGitHubAuth()` already supports an injected checker seam; `gh` is not installed in this environment; env-token detection is already the product baseline.
   - What's unclear: whether the project wants to support "logged into `gh`" as a first-class readiness path.
   - Recommendation: keep env tokens as the canonical supported path for Phase 18. If a CLI checker is added, keep it optional and behind the existing checker seam so the product does not depend on `gh`.

2. **Should readback verification use the final `PATCH` response, a final `GET`, or both?**
   - What we know: GitHub's Update Gist endpoint returns a `200` response with Gist data, and the current publish path performs three sequential updates with no final verification.
   - What's unclear: whether relying only on the final update response is sufficient once badge, contributor, and override files have all changed.
   - Recommendation: prefer one final authoritative `getGist()` after the last update. Use returned `PATCH` data only as a fallback optimization, not as the sole proof of final state.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | CLI runtime, tests | ✓ | `v22.14.0` | Product support remains `>=20` |
| npm | Workspace scripts, initializer UX | ✓ | `11.6.0` | — |
| git | init, repo detection, hooks | ✓ | `2.49.0` | — |
| GitHub CLI (`gh`) | Optional richer auth detection only | ✗ | — | Keep env-token detection as the supported baseline |
| pnpm | Cross-package-manager hook/script test cases | ✓, but probe is not read-only here | `9.15.0` | Use `command -v pnpm` or mocked package-manager tests instead of mutating probes |
| bun | Cross-package-manager hook/script test cases | ✓ | `1.3.6` | Mocked package-manager tests are still sufficient |
| Live GitHub auth token / Gist API access | End-to-end readiness verification | Not locally provable from repo state | — | Use mocked `GitHubGistClient` tests plus `doctor --probe-write` when an operator has real credentials |

**Missing dependencies with no fallback:**
- None for implementation work. Live end-to-end auth/write verification still requires a real operator environment and credentials.

**Missing dependencies with fallback:**
- `gh` CLI is absent; fall back to env-token detection.
- Live GitHub token presence is intentionally not inferred from repo files; fall back to mocked transport tests and explicit operator probes.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest` via `vitest.config.ts` |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- --run packages/core/src/publish/publish-service.test.ts packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/config.test.ts packages/agent-badge/src/commands/status.test.ts` |
| Full suite command | `npm test -- --run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OPER-03 | Pre-push fail-soft vs strict behavior is explicit and degraded publish health is visible | command/unit | `npm test -- --run packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/config.test.ts packages/agent-badge/src/commands/status.test.ts packages/core/src/diagnostics/doctor.test.ts` | ✅ extend existing |
| AUTH-01 | Init/doctor/refresh/publish classify auth and publish readiness with actionable remediation | unit/command | `npm test -- --run packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/publish.test.ts` | ✅ extend existing |
| AUTH-02 | Runtime distinguishes auth-missing, gist-unreachable, write-failed, and readback mismatch | unit/integration | `npm test -- --run packages/core/src/publish/publish-service.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/publish.test.ts` | ✅ extend existing |
| CTRL-01 | Repo strictness control stays explicit and authoritative through config + runtime wiring | unit/command | `npm test -- --run packages/agent-badge/src/commands/config.test.ts packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/refresh.test.ts` | ✅ existing |

### Sampling Rate
- **Per task commit:** targeted Vitest command covering changed command/core files
- **Per wave merge:** `npm test -- --run`
- **Phase gate:** full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/core/src/publish/publish-readiness.test.ts` — new shared readiness-inspector coverage for auth/read/write classification and remediation
- [ ] Extend `packages/core/src/publish/publish-service.test.ts` — add final readback-failed and readback-mismatch cases
- [ ] Extend `packages/agent-badge/src/commands/refresh.test.ts` — add hook-mode degraded messaging assertions for auth-missing, gist-unreachable, and readback mismatch
- [ ] Extend `packages/agent-badge/src/commands/status.test.ts` — add strictness/degraded-mode visibility assertions
- [ ] Extend `packages/core/src/diagnostics/doctor.test.ts` and `packages/agent-badge/src/commands/init.test.ts` — align readiness vocabulary and environment-specific fixes across doctor/init

## Sources

### Primary (HIGH confidence)
- GitHub REST API docs for Gists: https://docs.github.com/en/rest/gists/gists
  - Verified public Gist read semantics, update permissions, and response status codes for Get/Update Gist.
- Octokit official README: https://github.com/octokit/octokit.js/
  - Verified `RequestError` handling and `error.status` availability.
- npm package registry metadata:
  - https://www.npmjs.com/package/commander
  - https://www.npmjs.com/package/octokit
  - https://www.npmjs.com/package/zod
  - https://www.npmjs.com/package/vitest
  - https://www.npmjs.com/package/tsx
  - Versions were also verified with live `npm view` queries on 2026-04-02.
- Repo source of truth:
  - `packages/core/src/publish/publish-service.ts`
  - `packages/core/src/diagnostics/doctor.ts`
  - `packages/core/src/init/runtime-wiring.ts`
  - `packages/core/src/config/config-schema.ts`
  - `packages/agent-badge/src/commands/{init,refresh,publish,status,config}.ts`

### Secondary (MEDIUM confidence)
- Existing Phase 17 research and plans in `.planning/phases/17-publish-failure-visibility-and-state-trust/`
  - Used to keep the Phase 18 recommendation additive to the Phase 17 persistence contract.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Phase 18 reuses the existing repo stack and the current package lines were verified against the registry.
- Architecture: HIGH - The recommended split is directly grounded in current code seams plus official GitHub/Octokit behavior.
- Pitfalls: HIGH - Most are directly evidenced by the current implementation or official API semantics; one environment pitfall (`pnpm --version` via Corepack mutating `package.json`) was observed locally during research.

**Research date:** 2026-04-02
**Valid until:** 2026-05-02
