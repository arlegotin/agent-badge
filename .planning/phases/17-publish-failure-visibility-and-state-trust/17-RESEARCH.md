# Phase 17: Publish Failure Visibility And State Trust - Research

**Researched:** 2026-04-02
**Domain:** canonical publish-attempt diagnostics and operator-visible badge trust across refresh, status, doctor, and persisted state
**Confidence:** MEDIUM

<user_constraints>
## User Constraints

No phase `CONTEXT.md` exists for Phase 17. Planner must treat the following as the active constraints derived from `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`, Phase 16 artifacts, and the current codebase.

### Locked Decisions
- Goal: make the difference between a fresh badge and a stale failed publish obvious from the normal operator surfaces already in use.
- Must satisfy `OPER-01` and `OPER-02`.
- `status`, `refresh`, and persisted state must distinguish successful local refresh from failed remote publish with explicit timestamps and stale-state messaging.
- Operators must be able to tell whether the live badge is stale because publish failed, because no publish was attempted, or because the remote badge payload genuinely did not change.
- Shared-mode health from Phase 16 remains in scope, but it must not drift from the new live-badge trust signals.
- Keep the product local-first, aggregate-only, failure-soft by default, and privacy-safe. No raw transcripts, local paths, prompts, or raw session identifiers may be exposed in persisted diagnostics or normal CLI output.

### Claude's Discretion
- Choose the exact additive state shape for canonical publish-attempt diagnostics.
- Choose whether to introduce one new core trust-report module or extend existing publish/diagnostic helpers.
- Choose how `doctor` should surface trust state, as long as it stays coherent with `status`, `refresh`, and persisted state.
- Choose the exact wording for stale, failed, unchanged, and not-attempted states, as long as the distinction is explicit and testable.

### Deferred Ideas (OUT OF SCOPE)
- Fine-grained auth/readiness classification such as auth-missing vs gist-unreachable vs readback mismatch. That is Phase 18 work.
- Supported recovery commands and end-to-end stale-badge recovery workflows. That is Phase 19 work.
- Hosted scheduling, backend coordination, dashboards, or new provider integrations.
- Any diagnostic surface that leaks raw exception stacks, local filesystem evidence, provider session ids, or other private artifacts.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPER-01 | Operators can immediately see when the live badge is stale because publish failed or was skipped for an actionable reason. | Persist explicit publish-attempt facts, derive a privacy-safe trust state from them, and surface that same state in `refresh`, `status`, and `doctor`. |
| OPER-02 | `status`, `refresh`, and `doctor` expose one coherent view of last successful publish, current failure state, and required recovery action. | Reuse one core publish-trust report that combines local refresh timestamps, publish-attempt diagnostics, and shared-health inspection without duplicating logic in each command. |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- Keep the product local-first and serverless.
- Preserve the aggregate-only public boundary.
- Preserve the initializer-first npm UX and stable gist + Shields URL model.
- Keep incremental refresh and `pre-push` fast and failure-soft.
- Keep `init` idempotent and safe on reruns.

## Repo Reality

### What already exists
- Local state already separates refresh facts from publish facts, but only coarsely. [`packages/core/src/state/state-schema.ts`](../../../packages/core/src/state/state-schema.ts) stores `refresh.lastRefreshedAt`, `refresh.lastPublishDecision`, `publish.status`, `publish.lastPublishedHash`, `publish.lastPublishedAt`, `publish.publisherId`, and `publish.mode`.
- `refresh` already persists local scan results before remote work, which is the right foundation for "local refresh succeeded, remote publish failed" semantics. [`packages/agent-badge/src/commands/refresh.ts`](../../../packages/agent-badge/src/commands/refresh.ts) writes the refresh cache and `state.json` before calling `publishBadgeIfChanged()`.
- On publish failure, `refresh` currently only records `publish.status = "error"` and `refresh.lastPublishDecision = "failed"`. It does not persist when the publish attempt happened, whether the live badge would have changed, or any privacy-safe failure classification. [`packages/agent-badge/src/commands/refresh.ts`](../../../packages/agent-badge/src/commands/refresh.ts)
- `publishBadgeIfChanged()` already returns enough high-level shape to start a trust contract: `decision`, `healthBeforePublish`, `healthAfterPublish`, and `migrationPerformed`. It also preserves `lastPublishedAt` on skipped writes, which is correct for "badge payload unchanged". [`packages/core/src/publish/publish-service.ts`](../../../packages/core/src/publish/publish-service.ts)
- Shared-mode health is already centralized. [`packages/core/src/publish/shared-health.ts`](../../../packages/core/src/publish/shared-health.ts) classifies remote shared state as `healthy`, `stale`, `conflict`, `partial`, or `orphaned`, and both `status` and `doctor` already consume that same report.
- `status` currently shows local publish status plus live shared-mode health, but it does not explain badge trust. [`packages/agent-badge/src/commands/status.ts`](../../../packages/agent-badge/src/commands/status.ts) prints `published/deferred/error`, `last published`, and shared issues, but it cannot say "stale because failed", "never attempted", or "unchanged".
- `doctor` currently checks auth, gist reachability, shields reachability, shared mode, and shared health, but it does not consume any persisted publish-failure diagnostics. [`packages/core/src/diagnostics/doctor.ts`](../../../packages/core/src/diagnostics/doctor.ts) can tell whether the remote is reachable now, not what happened on the last local refresh.

### Gaps Phase 17 must close
- The current state model cannot express the difference between:
  - local refresh succeeded but remote publish was never attempted,
  - remote publish was attempted and the badge payload was unchanged,
  - remote publish failed and the live badge is stale,
  - remote publish failed but the live badge value would not have changed anyway.
- `status` has no canonical trust summary. It can show `publish.status=error`, but that does not tell the operator whether the badge is stale, how stale it is, or whether the failure followed a newer local refresh.
- `refresh` prints `published`, `skipped`, `failed`, or `not configured`, but it does not print the relationship between `lastRefreshedAt`, `lastPublishedAt`, and the current trust state.
- `doctor` has no persisted view of "last successful local refresh vs last successful badge update vs last failed publish attempt", so it cannot meet `OPER-02` coherently.
- Phase 16's `shared-health: stale` means "a contributor record is older than seven days". Phase 17 needs a separate badge-trust vocabulary so operators do not confuse stale contributor observations with a stale live badge.

## Summary

Phase 16 solved shared remote state health, not live badge trust. The current implementation can already tell whether a shared gist is healthy, orphaned, conflicting, or stale by contributor age, but it still cannot explain the operator question that Phase 17 is about: "did my last local refresh actually update the live badge, and if not, why not?"

The key repo-level insight is that current state stores only the last successful badge write timestamp and a coarse last refresh decision. That is enough to show history after success, but not enough to classify the important failure modes. A failed refresh publish only leaves behind `publish.status = "error"` and `refresh.lastPublishDecision = "failed"`, which means `status` and `doctor` have to guess whether the badge is stale, unchanged, or never attempted.

**Primary recommendation:** add one canonical publish-trust contract that persists publish-attempt facts, not time-relative conclusions. Then derive all operator wording from that one report. Keep shared remote health separate from live badge trust, but show both side by side in `status`, `refresh`, and `doctor`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | repo runtime (`v22.14.0` locally; product support `>=20`) | CLI execution, timestamp handling, gist reads/writes | No runtime change is needed; this phase is state and command logic. |
| TypeScript | repo line (`5.x`) | Shared publish-trust types across core and CLI commands | Existing repo standard and the right fit for a typed state/report contract. |
| `zod` | repo standard | Additive validation for new persisted diagnostics fields | State must stay fail-closed and migration-safe. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | repo standard | State, publish-service, status, refresh, and doctor regressions | Use for all new trust-state fixtures and output assertions. |
| Existing gist client and publish helpers | repo code | Gist read/write and shared-state inspection | Reuse current core modules; no new network layer is needed. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| One reusable publish-trust report | Ad-hoc `status`/`refresh`/`doctor` formatting logic | Faster to patch once, but guaranteed drift against `OPER-02`. |
| Persisting attempt facts plus deriving stale messaging | Persisting only a final `stale: true/false` marker | Simpler schema, but the state ages and becomes misleading without recomputation. |
| Keeping shared health and badge trust as separate concepts | Reusing `shared-health` to represent badge freshness | Superficially convenient, but semantically wrong. Contributor staleness and badge staleness are different operator problems. |

**Installation:**
```bash
# No new packages are required for Phase 17.
# Reuse the existing workspace dependencies.
```

## Architecture Patterns

### Pattern 1: Separate local refresh freshness from live badge trust
**What:** Treat "local refresh completed" and "live badge reflects that refresh" as two separate states.

**Why:** The repo already persists local refresh results before remote writes. That is the product's local-first guarantee. Phase 17 should build on that by making the remote side explicit rather than collapsing everything into `publish.status`.

**Recommended model:**
- Local refresh facts remain under `refresh.*`.
- Remote publish attempt facts live under `publish.*` or `publish.diagnostics.*`.
- A derived report computes:
  - `localRefreshState`
  - `remotePublishState`
  - `liveBadgeTrust`
  - `actionableReason`

**Canonical operator distinctions to lock down:**

| Condition | Meaning to operator | Evidence needed |
|-----------|---------------------|-----------------|
| No publish attempt has ever been made | badge not attempted | missing `lastAttemptedAt` and no `lastPublishedAt` |
| Publish was skipped because config is missing or deferred | badge not attempted for an actionable reason | persisted decision + reason code |
| Publish succeeded but badge payload hash did not change | live badge already current | successful attempt timestamp + unchanged outcome + existing `lastPublishedAt` |
| Publish failed after a newer local refresh and the candidate badge hash differs from the last live hash | live badge is stale because publish failed | last refresh timestamp + failed attempt timestamp + candidate-vs-live hash comparison |
| Publish failed but the candidate hash equals the last live hash | publish failed, but the visible badge value is unchanged | failed attempt timestamp + equality marker |

### Pattern 2: Persist attempt facts, not human wording
**What:** Store additive, privacy-safe publish-attempt diagnostics in state and derive all human wording from them at read time.

**Why:** Time-relative labels like "stale" decay. Facts such as timestamps, last attempt outcome, and hash equality stay true and let `status`, `refresh`, and `doctor` compute the same answer later.

**Recommended additive fields:**
- `publish.lastAttemptedAt`
- `publish.lastAttemptOutcome`: `"published" | "unchanged" | "failed" | "not-attempted"`
- `publish.lastSuccessfulPublishAt`
  - keep `lastPublishedAt` as the last time the badge payload actually changed
- `publish.lastSuccessfulSyncAt`
  - update on both `published` and `unchanged`
- `publish.lastAttemptCandidateHash`
  - opaque hash only; no payload body
- `publish.lastAttemptChangedBadge`
  - `"yes" | "no" | "unknown"`
- `publish.lastFailureCode`
  - keep broad and privacy-safe in Phase 17, e.g. `not-configured`, `deferred`, `remote-write-failed`, `remote-inspection-failed`, `unknown`

**Privacy boundary:**
- Do not persist raw exception stacks, HTTP bodies, local paths, or session digests.
- Opaque hashes are already accepted in state and are sufficient for trust classification.

### Pattern 3: Compute the candidate badge hash before remote writes
**What:** Extend the core publish path so it can determine the intended badge payload hash before attempting remote writes.

**Why:** Without this, a failed publish can only be labeled `failed`. It cannot answer whether the live badge is now stale or whether the badge payload would have remained the same anyway.

**Repo-specific evidence:** [`packages/core/src/publish/publish-service.ts`](../../../packages/core/src/publish/publish-service.ts) already reads the gist, loads remote shared contributor records, constructs the local contributor record, and derives authoritative totals after replacing the local contributor record. That same merge can be computed from the pre-write gist snapshot before any `updateGistFile()` call.

**Recommended implementation shape:**
- Add a small helper in core, likely near `publish-service.ts`, that:
  - reads the current gist,
  - injects the local contributor record into the remote contributor set,
  - derives the next shared totals and next badge payload hash,
  - returns `candidateHash` and `wouldChangeBadge`.
- Persist those facts even when a later gist write fails.
- On success:
  - `published` updates `lastPublishedAt`, `lastSuccessfulSyncAt`, and `lastPublishedHash`
  - `unchanged` updates `lastSuccessfulSyncAt` and keeps `lastPublishedAt` unchanged

### Pattern 4: Keep live badge trust separate from shared remote health, but render them together
**What:** Status and doctor should show both:
- live badge trust
- shared-mode health

**Why:** A repo can have:
- healthy shared contributor state but a stale live badge because the last publish failed
- unchanged live badge payload but stale contributor records
- an orphaned local publisher but a still-correct current badge value

These are different operator conditions and need different fixes.

**Recommended responsibility split:**
- [`packages/agent-badge/src/commands/refresh.ts`](../../../packages/agent-badge/src/commands/refresh.ts)
  - owns writing the canonical publish-attempt facts
  - prints immediate trust messaging from the same derived report
- [`packages/agent-badge/src/commands/status.ts`](../../../packages/agent-badge/src/commands/status.ts)
  - reads persisted publish diagnostics plus live shared health
  - prints one stable summary of local refresh freshness, remote publish freshness, and shared health
- [`packages/core/src/diagnostics/doctor.ts`](../../../packages/core/src/diagnostics/doctor.ts)
  - reuses the same trust report
  - adds a dedicated `publish-trust` check instead of overloading `shared-health`
  - keeps `publish-write`, `publish-shields`, and `shared-health` as separate checks

## Recommended Delivery Shape

### 17-01: Add stale badge and failed publish visibility to status and refresh flows
**Goal:** make the operator-visible distinction explicit before doctor remediation work expands.

**Recommended scope:**
- add a reusable core trust-report formatter/deriver, likely alongside publish helpers
- extend `refresh` to print:
  - local refresh timestamp
  - remote publish outcome
  - whether the live badge is stale, unchanged, or not attempted
  - the last successful badge update timestamp when relevant
- extend `status` to print the same trust summary from persisted state
- keep shared health visible, but label it separately from badge trust
- add command tests for:
  - failed publish after successful local refresh
  - unchanged badge after successful attempt
  - no publish attempt because gist is missing or deferred
  - last publish failure that still leaves the visible badge current

### 17-02: Persist canonical publish failure diagnostics and attempt facts
**Goal:** make the persisted contract authoritative before the final trust vocabulary is aligned across every operator surface.

**Recommended scope:**
- extend the state schema additively with canonical publish-attempt facts
- enrich `publishBadgeIfChanged()` and refresh failure handling so the new fields are always written consistently
- preserve the new publish diagnostics through init reruns and scaffold reconciliation
- update existing tests so both publish write paths and init reruns preserve the same canonical attempt facts
- keep the command-surface trust vocabulary upgrade for a follow-on plan once the persistence contract exists
- keep any future finer-grained Phase 18 auth/readiness detail as additive enum expansion, not a schema rewrite

### 17-03: Align doctor and command trust output with canonical persisted diagnostics
**Goal:** eliminate drift between CLI output and persisted state by making every operator surface consume the same trust report.

**Recommended scope:**
- upgrade `publish-trust` to use the new persisted attempt facts instead of Phase 17-01 heuristics
- add one doctor-level `publish-trust` check derived from persisted diagnostics plus current config/gist availability
- update `status`, `refresh`, and `doctor` so they all render the same trust vocabulary
- keep any future finer-grained Phase 18 auth/readiness detail as additive enum expansion, not a schema rewrite

## Concrete Extension Points

| Area | Files | Why they matter |
|------|-------|-----------------|
| State schema | `packages/core/src/state/state-schema.ts`, `packages/core/src/state/state-schema.test.ts` | Phase 17 needs additive persisted diagnostics with defaults so old state files still parse and init reruns do not regress fields. |
| Publish attempt derivation | `packages/core/src/publish/publish-service.ts`, `packages/core/src/publish/publish-service.test.ts` | This is where the repo can compute the candidate badge hash and determine `published` vs `unchanged` vs `failed` against authoritative shared totals. |
| New trust helper | `packages/core/src/publish/` (new helper such as `publish-trust.ts`) | Central home for one derived trust report consumed by commands and doctor. |
| Shared health boundary | `packages/core/src/publish/shared-health.ts`, `packages/core/src/publish/shared-health.test.ts` | Keep shared contributor health separate from badge trust and avoid semantic drift around the word `stale`. |
| Refresh persistence | `packages/agent-badge/src/commands/refresh.ts`, `packages/agent-badge/src/commands/refresh.test.ts` | Refresh already owns state persistence before and after publish attempts. It is the right command to write canonical attempt facts. |
| Status rendering | `packages/agent-badge/src/commands/status.ts`, `packages/agent-badge/src/commands/status.test.ts` | Status is the normal operator summary surface and currently lacks a publish-trust section. |
| Doctor coherence | `packages/core/src/diagnostics/doctor.ts`, `packages/core/src/diagnostics/doctor.test.ts`, `packages/agent-badge/src/commands/doctor.ts` | Doctor must consume the same report as status/refresh and add remediation without inventing a second vocabulary. |

## Do Not Build The Wrong Thing

- Do not overload Phase 16 `shared-health` with badge-freshness meaning. Shared contributor staleness is not the same thing as a stale live badge.
- Do not treat `skipped` as "no publish attempt". In the current design, `publishBadgeIfChanged()` can still update contributor and override files before deciding that the badge payload hash is unchanged.
- Do not update `lastPublishedAt` on unchanged badge payloads. That timestamp should keep meaning "the visible badge value changed here".
- Do not persist raw `error.message` values blindly into `.agent-badge/state.json`; they can include environment-specific or private detail.
- Do not let `status`, `refresh`, and `doctor` each derive trust state independently from raw fields. One core report must own the mapping.

## Risks To Carry Into Planning

### Risk 1: false stale alarms if candidate-hash logic is incomplete
If the plan only records "publish failed" and skips candidate-hash comparison, operators will still be unable to tell whether the visible badge is actually stale. That misses the phase goal.

### Risk 2: shared-health and badge-trust wording can collide
The repo already uses `stale` for contributor age in [`packages/core/src/publish/shared-health.ts`](../../../packages/core/src/publish/shared-health.ts). If Phase 17 reuses the same label without qualification, `status` and `doctor` will become ambiguous instead of clearer.

### Risk 3: additive state changes can drift across commands
`refresh` is not the only write path. [`packages/agent-badge/src/commands/publish.ts`](../../../packages/agent-badge/src/commands/publish.ts) also persists publish state and should not silently lag behind new fields if Phase 17 expands the core publish result.

### Risk 4: privacy can regress through failure persistence
The phase wants better diagnostics, but the product boundary still forbids leaking raw operational detail that could include local paths, provider ids, or arbitrary server messages. Keep persisted failure markers enum-based and sanitized.

## Validation Architecture

### Test Framework
- `vitest` is already the established framework and should cover state-schema, core publish-service, and command-output regressions.

### Phase Requirements -> Test Map
| Requirement | Coverage |
|-------------|----------|
| OPER-01 | `refresh.test.ts` and `status.test.ts` should assert explicit stale/failed/not-attempted/unchanged messaging with timestamps and privacy-safe wording. |
| OPER-02 | `doctor.test.ts`, `status.test.ts`, and state-schema tests should assert one shared trust vocabulary and one canonical persisted contract. |

### Recommended Commands
- Core trust and schema: `npm test -- --run packages/core/src/state/state-schema.test.ts packages/core/src/publish/publish-service.test.ts packages/core/src/publish/shared-health.test.ts packages/core/src/diagnostics/doctor.test.ts`
- Command surfaces: `npm test -- --run packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts packages/agent-badge/src/commands/publish.test.ts`
- Full suite: `npm test -- --run`

### Sampling Rate
- After any state-schema or core publish-trust change: run targeted core tests.
- After any `status`, `refresh`, or `doctor` wording change: run the targeted command tests.
- Before phase completion: run `npm test -- --run`.

### Wave 0 Gaps
- Add fixtures for:
  - successful local refresh + failed remote publish + changed candidate hash
  - successful local refresh + failed remote publish + unchanged candidate hash
  - not-attempted because gist is missing
  - not-attempted because publish is deferred
  - successful unchanged publish attempt with shared-mode healthy
- Extend doctor tests beyond shared-mode health so they assert persisted publish trust, not just current remote reachability.
- Add state-schema tests for all new additive fields and old-state defaults.

## Sources

### Primary (HIGH confidence)
- [`packages/core/src/state/state-schema.ts`](../../../packages/core/src/state/state-schema.ts)
- [`packages/core/src/publish/publish-service.ts`](../../../packages/core/src/publish/publish-service.ts)
- [`packages/core/src/publish/shared-health.ts`](../../../packages/core/src/publish/shared-health.ts)
- [`packages/core/src/publish/shared-health.test.ts`](../../../packages/core/src/publish/shared-health.test.ts)
- [`packages/core/src/diagnostics/doctor.ts`](../../../packages/core/src/diagnostics/doctor.ts)
- [`packages/core/src/diagnostics/doctor.test.ts`](../../../packages/core/src/diagnostics/doctor.test.ts)
- [`packages/agent-badge/src/commands/status.ts`](../../../packages/agent-badge/src/commands/status.ts)
- [`packages/agent-badge/src/commands/status.test.ts`](../../../packages/agent-badge/src/commands/status.test.ts)
- [`packages/agent-badge/src/commands/refresh.ts`](../../../packages/agent-badge/src/commands/refresh.ts)
- [`packages/agent-badge/src/commands/refresh.test.ts`](../../../packages/agent-badge/src/commands/refresh.test.ts)
- [`packages/agent-badge/src/commands/publish.ts`](../../../packages/agent-badge/src/commands/publish.ts)
- [`packages/agent-badge/src/commands/doctor.ts`](../../../packages/agent-badge/src/commands/doctor.ts)
- [`.planning/ROADMAP.md`](../../ROADMAP.md)
- [`.planning/REQUIREMENTS.md`](../../REQUIREMENTS.md)
- [`.planning/STATE.md`](../../STATE.md)
- [`../16-migration-diagnostics-and-team-operator-ux/16-RESEARCH.md`](../16-migration-diagnostics-and-team-operator-ux/16-RESEARCH.md)
- [`../16-migration-diagnostics-and-team-operator-ux/16-VERIFICATION.md`](../16-migration-diagnostics-and-team-operator-ux/16-VERIFICATION.md)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new external stack decisions are required.
- Architecture: MEDIUM - the need for a canonical trust contract is strongly supported by repo evidence, but exact field names and helper placement remain design choices.
- Pitfalls: HIGH - the current code clearly shows where stale/shared/not-attempted semantics are conflated or absent.

**Research date:** 2026-04-02
**Valid until:** 2026-04-09
