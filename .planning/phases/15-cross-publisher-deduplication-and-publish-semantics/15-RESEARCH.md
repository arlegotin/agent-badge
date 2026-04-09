# Phase 15: Cross-Publisher Deduplication And Publish Semantics - Research

**Researched:** 2026-04-02
**Domain:** Deterministic shared session-level merge for gist-backed badge publishing
**Confidence:** MEDIUM

<user_constraints>
## User Constraints

No phase `CONTEXT.md` exists for Phase 15. Planner must treat the following as the active constraints derived from `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`, Phase 14 artifacts, and current code.

### Locked Decisions
- Goal: make merged shared totals converge deterministically and avoid double counting when the same underlying session is seen by more than one publisher.
- Must satisfy `CONS-01`, `CONS-02`, and `CONS-03`.
- Phase 14 already locked the shared remote layout to deterministic per-publisher contribution files plus one shared overrides file.
- Shared publishing must remain aggregate-only and must not publish prompt text, transcript text, filenames, local paths, or raw `provider:providerSessionId` values.
- Stable gist badge filenames and stable README badge URLs must remain derived render outputs, not new canonical state.
- Refresh and pre-push behavior must stay fast and failure-soft; Phase 15 must not require a full rescan on every publish just to compute shared totals.

### Claude's Discretion
- Choose the concrete Phase 15 contributor-file schema that makes cross-publisher dedup possible.
- Choose the deterministic winner rule when multiple publishers report the same session with different watermarks.
- Choose how repo-level ambiguous include/exclude outcomes are derived without reintroducing last-writer-wins behavior.
- Choose how `publish-service`, `refresh-cache`, and command flows exchange per-session data instead of only aggregate totals.

### Deferred Ideas (OUT OF SCOPE)
- Mixed-schema migration UX, orphan/stale contributor diagnostics, and operator recovery flows belong to Phase 16.
- Identity-rich contributor views, leaderboards, and team analytics remain out of scope.
- Hosted coordination or any backend beyond public Gists remains out of scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONS-01 | Shared totals deduplicate usage by stable provider session identity across contributors and machines instead of summing opaque local totals. | Replace totals-only contributor files with per-session observation records keyed by opaque digests of `provider:providerSessionId`, then derive badge totals by grouped session identity. |
| CONS-02 | When the same underlying session is observed by more than one publisher, the merged result converges deterministically without double counting. | Add a canonical session reducer that chooses one winner per session digest using a stable watermark comparator, then compute badge totals from the reduced set only once. |
| CONS-03 | Repo-level include/exclude outcomes for ambiguous sessions are shared so contributors do not publish conflicting decisions for the same session. | Publish ambiguous-session observations plus local override intent per publisher, then derive one repo-level include/exclude outcome with an order-independent reducer and write `agent-badge-overrides.json` from that resolved view. |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- Keep the product local-first and serverless. Collection happens on the developer machine because source data lives under `~/.codex` and `~/.claude`.
- Preserve the aggregate-only publish boundary. No raw transcripts, prompt text, filenames, or local paths may leave the machine.
- Preserve the initializer-first npm UX and the stable Gist plus Shields badge URL model.
- Keep incremental refresh fast enough for normal `pre-push` use and default to failure-soft behavior.
- Keep `init` idempotent. Phase 15 must not introduce publish semantics that require duplicate README edits, duplicate hooks, or duplicate Gist targets.

## Summary

Phase 14 made the remote layout merge-safe at the file level, but it did not make the published totals dedup-safe. The current shared contributor record in [`packages/core/src/publish/shared-model.ts`](../../../packages/core/src/publish/shared-model.ts) stores only per-publisher totals, and the current reducer in [`packages/core/src/publish/shared-merge.ts`](../../../packages/core/src/publish/shared-merge.ts) simply sums those totals. That cannot satisfy `CONS-01` or `CONS-02` because there is no remote representation of the underlying session identity to deduplicate.

The second gap is the publish input boundary. `publish-service.ts` currently accepts only `includedTotals`, while the incremental refresh cache in [`packages/core/src/scan/refresh-cache.ts`](../../../packages/core/src/scan/refresh-cache.ts) stores token and cost totals only for already-included sessions. Ambiguous sessions therefore lose the raw aggregate usage needed for a later shared include decision. `agent-badge-overrides.json` is also currently written by blind overwrite merge, but local attribution still reads only `state.overrides.ambiguousSessions`, so the shared override file is not yet the source of one deterministic repo-level outcome.

**Primary recommendation:** version the contributor file to a per-session observation model keyed by opaque session digests, derive canonical totals and resolved ambiguous-session outcomes from those observations on every publish, and extend the refresh cache so `refresh`, `publish`, and `init` can all feed the same deterministic reducer without full rescans.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | Local environment `v22.14.0`, product support `>=20` | CLI runtime, `node:crypto`, fs, JSON serialization | Already the repo runtime; Phase 15 needs no runtime change. |
| TypeScript | 5.x repo line | Shared schemas, reducers, and publish orchestration | Existing repo line; Phase 15 is a schema and reducer change, not a language/tooling migration. |
| `octokit` | `5.0.5` current, repo uses `^5.0.0` | Gist read/update transport | Existing transport boundary in `github-gist-client.ts`; do not replace it. |
| `zod` | `4.3.6` current, repo uses `^4.0.0` | Strict parsing for v2 contributor and override files | Remote public state must stay versioned and fail closed. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | `4.1.2` current, repo line `^3.2.0` | Reducer, publish-service, cache, and command regression tests | Use the repo test framework; add cases rather than changing frameworks. |
| `commander` | `14.0.3` current, repo uses `^14.0.0` | CLI/status output if Phase 15 surfaces shared-mode details | Only if status or operator output changes. |
| `node:crypto` | built-in | Opaque session digests and stable tie-break helpers | Prefer built-in hashing over new dependencies. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Per-session contributor observations | Keep Phase 14 totals-only contributor files | Simpler shape, but impossible to deduplicate or converge by stable session identity. |
| Extending `refresh-cache` with candidate-session aggregates | Force a full backfill scan before every shared publish | Simpler implementation, but violates the fast `pre-push` refresh requirement. |
| Deriving shared override outcomes from per-publisher observations | Keep blind overwrite merge in one shared overrides file | Simpler write path, but still order-dependent and not semantically convergent. |
| Opaque session digests as remote keys | Publish raw `provider:providerSessionId` | Easier debugging, but violates the current public privacy contract. |

**Installation:**
```bash
# No new packages are required for Phase 15.
# Reuse the existing workspace dependencies.
```

**Version verification:** verified on 2026-04-02 with registry checks and local environment probes.
- `npm view octokit version` → `5.0.5`
- `npm view zod version` → `4.3.6`
- `npm view commander version` → `14.0.3`
- `npm view vitest version` → `4.1.2`
- `node --version` → `v22.14.0`
- `npm --version` → `11.6.0`

## Architecture Patterns

### Recommended Project Structure
```text
packages/core/src/publish/
├── shared-model.ts          # v2 contributor + override schemas and filename helpers
├── shared-merge.ts          # session grouping, watermark selection, override resolution
├── publish-service.ts       # gist orchestration only; no hand-rolled merge logic
└── shared-badge-aggregation.test.ts

packages/core/src/scan/
└── refresh-cache.ts         # extend cache entries so incremental refresh retains candidate-session aggregates

packages/agent-badge/src/commands/
├── publish.ts               # full-scan publish path produces contributor observations
├── refresh.ts               # incremental publish path passes cache-backed contributor observations
└── init.ts                  # first publish uses the same Phase 15 service contract
```

### Pattern 1: Contributor Files Become Per-Session Observation Snapshots
**What:** Change the shared contributor record from one totals blob to one per-publisher map of session observations keyed by the opaque digest of `provider:providerSessionId`.

**When to use:** Always in shared publish mode. Totals-only records cannot satisfy Phase 15.

**Recommended shape:**
```typescript
// Source: current shared-model.ts + current refresh-cache.ts + Phase 15 recommendation
type SharedContributorRecordV2 = {
  schemaVersion: 2;
  publisherId: string;
  updatedAt: string;
  observations: Record<
    string,
    {
      attributionStatus: "included" | "ambiguous";
      overrideDecision: "include" | "exclude" | null;
      sessionUpdatedAt: string | null;
      tokens: number;
      estimatedCostUsdMicros: number | null;
    }
  >;
};
```

**Why:** The reducer must see one identity-bearing observation per session in order to deduplicate across publishers and still preserve the privacy boundary.

### Pattern 2: Reduce Duplicates By Canonical Session Watermark
**What:** Group all contributor observations by session digest, then choose exactly one canonical observation for each digest before computing totals.

**When to use:** Whenever more than one publisher contributes shared state.

**Recommended winner rule:**
1. Prefer the observation with the latest non-null `sessionUpdatedAt`.
2. If timestamps tie or are both null, prefer the observation with the larger `tokens`.
3. If tokens tie, prefer the larger non-null `estimatedCostUsdMicros`.
4. Final tie-break: lexicographically smallest `publisherId`.

**Why:** The same provider session is expected to be cumulative over time. This comparator is deterministic, idempotent, and avoids double counting even when publishers observe the same session at different moments.

**Example:**
```typescript
// Source: current shared-merge.ts pattern, extended for Phase 15
function compareObservationWatermark(a: SharedObservation, b: SharedObservation): number {
  return (
    compareNullableIsoDateDesc(a.sessionUpdatedAt, b.sessionUpdatedAt) ||
    compareNumberDesc(a.tokens, b.tokens) ||
    compareNullableNumberDesc(a.estimatedCostUsdMicros, b.estimatedCostUsdMicros) ||
    a.publisherId.localeCompare(b.publisherId)
  );
}
```

### Pattern 3: Shared Override Outcomes Must Be Derived, Not Blindly Overwritten
**What:** Resolve repo-level ambiguous-session decisions from the merged observation set, then rewrite `agent-badge-overrides.json` from that resolved view.

**When to use:** For every publish in shared mode.

**Recommended resolution rule:**
1. If any canonical observation for the session is `included`, include it. Strong local evidence wins over ambiguity.
2. Otherwise, if any publisher override says `exclude`, resolve to `exclude`.
3. Otherwise, if one or more publisher overrides say `include`, resolve to `include`.
4. Otherwise, default unresolved ambiguous sessions to `exclude` from published totals.

**Why:** This rule is conservative, order-independent, and prevents inflation. It also gives `agent-badge-overrides.json` one consistent repo-level outcome without depending on last-writer-wins file semantics.

### Pattern 4: Refresh Cache Must Retain Candidate-Session Aggregates
**What:** Extend the session-index cache so incremental refresh can publish the same contributor observation model as the full-scan publish command.

**When to use:** Always. `refresh.ts` currently publishes from summary totals only.

**Required cache additions:**
- stable session digest or reconstructible raw key fields
- `attributionStatus` for included vs ambiguous
- `tokens` even when the session is ambiguous
- `estimatedCostUsdMicros` even when the session is ambiguous and cost mode is enabled
- `sessionUpdatedAt`
- `overrideDecision` if a local explicit decision exists

**Why:** Without this, an ambiguous session later resolved to include can never be counted during incremental refresh because the cache already discarded its usage totals.

### Anti-Patterns to Avoid
- **Summing per-publisher totals:** this is exactly the bug Phase 15 exists to remove.
- **Using publish time as the session winner:** publish order should not decide badge totals.
- **Dropping ambiguous-session usage from the cache:** shared include decisions then cannot affect incremental publish totals.
- **Treating `agent-badge-overrides.json` as the sole source of truth for conflicts:** one shared file cannot be the safe carrier of per-publisher disagreement.
- **Mixing totals-only Phase 14 contributor files into Phase 15 session-level totals:** that reintroduces non-deduplicable counts.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stable session identity | New repo-specific ids or filename-derived ids | Existing local `provider:providerSessionId` key plus SHA-256 public digest | The codebase already treats this as the stable local identity; only the public representation needs hashing. |
| Shared publish convergence | Badge-hash comparisons or total-sum heuristics | Pure session reducer in `shared-merge.ts` | Convergence must happen before badge serialization, not after. |
| Shared override semantics | Timestamp races in one mutable overrides file | Order-independent resolution from per-publisher observations | The Gist backend gives file updates, not compare-and-swap semantics. |
| Incremental shared publish input | Ad-hoc partial summaries | Extended `refresh-cache` reused by `refresh.ts` | The cache already exists and is the right local-first state boundary. |

**Key insight:** Phase 15 is not a badge-rendering change. It is a canonical-state change. The remote contributor record must carry enough information to count one underlying session exactly once.

## Common Pitfalls

### Pitfall 1: Keeping the Phase 14 Contributor Schema and Hoping Merge Logic Alone Fixes It
**What goes wrong:** The reducer still only sees one opaque total per publisher, so duplicate sessions remain invisible.
**Why it happens:** Phase 14 solved file-level merge safety, not semantic deduplication.
**How to avoid:** Make the contributor file session-aware before changing totals logic.
**Warning signs:** `deriveSharedIncludedTotals()` still accepts only contributor totals and never groups by session key.

### Pitfall 2: Publishing Only Included Sessions and Throwing Away Ambiguous Usage
**What goes wrong:** A later shared include decision cannot add the session back because its tokens and cost were discarded upstream.
**Why it happens:** The current refresh cache stores `includedTokens` only for already-included sessions.
**How to avoid:** Persist candidate-session aggregates for both `included` and `ambiguous` states.
**Warning signs:** Ambiguous cache entries still have zero tokens by construction.

### Pitfall 3: Letting Publish Order Decide Which Duplicate Observation Wins
**What goes wrong:** Repeated publishes flip the canonical total even when the underlying shared state is logically unchanged.
**Why it happens:** The merge rule uses `updatedAt` from publish time or simple overwrite order instead of a session watermark.
**How to avoid:** Compare session-level fields, not publish timestamps.
**Warning signs:** The reducer never looks at `sessionUpdatedAt` or token totals.

### Pitfall 4: Treating Mixed Phase 14 and Phase 15 Contributor Files as Equally Countable
**What goes wrong:** Totals-only and session-level records get added together, producing inflation.
**Why it happens:** Backward compatibility is handled by naive summation instead of an explicit schema boundary.
**How to avoid:** Do not mix v1 totals-only contributor files into v2 authoritative totals. Prefer temporary undercount until republish over double counting.
**Warning signs:** A read path accepts schema v1 and v2, then feeds both into one total-summing reducer.

## Code Examples

Verified patterns from current code and recommended Phase 15 extensions:

### Opaque Public Session Key
```typescript
// Source: packages/core/src/attribution/override-store.ts + packages/core/src/publish/shared-model.ts
const sessionKey = `${session.provider}:${session.providerSessionId}`;
const sessionDigest = buildSharedOverrideDigest(sessionKey);
```

### Canonical Shared Session Reduction
```typescript
// Source: Phase 15 recommendation grounded in current shared-merge.ts reducer style
for (const [sessionDigest, observations] of groupedBySessionDigest) {
  const winner = [...observations].sort(compareObservationWatermark)[0];
  const resolvedDecision = resolveSharedDecision(observations);

  if (winner.attributionStatus === "included" || resolvedDecision === "include") {
    totals.sessions += 1;
    totals.tokens += winner.tokens;
    totals.estimatedCostUsdMicros =
      accumulateNullableCost(totals.estimatedCostUsdMicros, winner.estimatedCostUsdMicros);
  }
}
```

### Refresh Cache Entry Must Preserve Candidate Usage
```typescript
// Source: packages/core/src/scan/refresh-cache.ts, extended for Phase 15
type RefreshCacheEntryV2 = {
  provider: "codex" | "claude";
  providerSessionId: string;
  sessionUpdatedAt: string | null;
  attributionStatus: "included" | "ambiguous" | "excluded";
  overrideDecision: "include" | "exclude" | null;
  tokens: number;
  estimatedCostUsdMicros: number | null;
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-publisher totals are the only shared contributor payload | Per-publisher session observations keyed by opaque session digest | Phase 15 recommendation, researched 2026-04-02 | Enables true cross-publisher dedup by stable session identity. |
| Shared totals are derived by summing contributor totals | Shared totals are derived by grouping session digests and reducing duplicates once | Phase 15 recommendation, researched 2026-04-02 | Removes double counting when multiple publishers see the same session. |
| Shared override file is merged by blind overwrite | Shared override outcome is derived from merged per-publisher observations | Phase 15 recommendation, researched 2026-04-02 | Gives one deterministic repo-level include/exclude result for ambiguous sessions. |
| Incremental refresh publishes from summary totals | Incremental refresh publishes from cache-backed contributor observations | Phase 15 recommendation, researched 2026-04-02 | Preserves fast `pre-push` behavior without losing dedup correctness. |

**Deprecated/outdated:**
- Totals-only shared contributor files as canonical shared state.
- Blind overwrite merge of shared override decisions.
- Any design that requires a full backfill scan before every refresh publish.

## Open Questions

1. **How should Phase 15 treat existing Phase 14 contributor files during the mixed-schema period?**
   - What we know: Phase 14 contributor files are schema-version `1` totals only, so they cannot be deduplicated by session identity.
   - What's unclear: whether temporary undercount during rollout is acceptable until each publisher republishes.
   - Recommendation: do not blend schema v1 totals into schema v2 authoritative totals. Ignore v1 files for deduped shared totals and let Phase 16 own migration UX and diagnostics.

2. **Are provider session totals always monotonic enough for the watermark comparator?**
   - What we know: both providers expose stable `providerSessionId`, and the existing code treats per-session totals as cumulative local aggregates.
   - What's unclear: whether either provider can shrink token totals or regress `updatedAt` in real-world edge cases.
   - Recommendation: encode the comparator defensively as timestamp-first, max-token-second, and add explicit stale-vs-fresh regression tests. If real data later disproves monotonicity, only the comparator should need adjustment.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build, tests, CLI execution | ✓ | `v22.14.0` | — |
| npm | scripts and registry verification | ✓ | `11.6.0` | — |
| Git | repo fixture setup in tests and normal workflow | ✓ | `2.49.0` | — |
| Vitest | automated verification | ✓ | repo script `vitest` | `npm test -- --run` |
| GitHub auth token | live publish smoke only | unknown | — | mocked `GitHubGistClient` tests |

**Missing dependencies with no fallback:**
- None for implementation planning.

**Missing dependencies with fallback:**
- GitHub auth token for live end-to-end smoke. Fallback: mocked publish-service and command tests, which are sufficient for Phase 15 execution.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (repo line `^3.2.0`, current registry `4.1.2`) |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- --run packages/core/src/publish/*.test.ts packages/core/src/scan/refresh-cache.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts` |
| Full suite command | `npm test -- --run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONS-01 | Shared contributor state is keyed by stable session identity and totals are derived per session, not per publisher total | unit | `npm test -- --run packages/core/src/publish/shared-model.test.ts packages/core/src/scan/refresh-cache.test.ts` | ❌ Wave 0 |
| CONS-02 | Duplicate stale/fresh observations converge to one canonical result and repeated publishes do not inflate totals | unit + integration | `npm test -- --run packages/core/src/publish/shared-merge.test.ts packages/core/src/publish/publish-service.test.ts packages/core/src/publish/shared-badge-aggregation.test.ts` | ⚠️ Extend existing |
| CONS-03 | Shared ambiguous-session outcomes resolve once for the repo and affect published totals consistently across publish paths | integration | `npm test -- --run packages/core/src/publish/publish-service.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts` | ⚠️ Extend existing |

### Sampling Rate
- **Per task commit:** `npm test -- --run packages/core/src/publish/*.test.ts packages/core/src/scan/refresh-cache.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts`
- **Per wave merge:** `npm test -- --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Extend `packages/core/src/publish/shared-model.test.ts` for schema-version `2`, observation maps, and privacy rejection of raw session keys.
- [ ] Extend `packages/core/src/publish/shared-merge.test.ts` for session grouping, duplicate watermark selection, and order-independent override conflict resolution.
- [ ] Extend `packages/core/src/publish/publish-service.test.ts` for repeated publish order convergence, mixed-publisher duplicate sessions, and schema v1 isolation.
- [ ] Extend `packages/core/src/publish/shared-badge-aggregation.test.ts` so the badge payload is derived from canonical session observations rather than contributor totals.
- [ ] Extend `packages/core/src/scan/refresh-cache.test.ts` and `packages/core/src/scan/incremental-refresh.test.ts` so ambiguous candidate usage survives into publishable cache state.
- [ ] Extend `packages/agent-badge/src/commands/refresh.test.ts` and `packages/agent-badge/src/commands/publish.test.ts` so both command paths feed the new publish-service contract.

## Sources

### Primary (HIGH confidence)
- GitHub REST API: Gists — truncation semantics and gist file update behavior: https://docs.github.com/en/rest/gists/gists?apiVersion=2022-11-28
- Local repo code:
  - `packages/core/src/publish/shared-model.ts`
  - `packages/core/src/publish/shared-merge.ts`
  - `packages/core/src/publish/publish-service.ts`
  - `packages/core/src/scan/refresh-cache.ts`
  - `packages/core/src/attribution/override-store.ts`
  - `packages/core/src/attribution/attribution-engine.ts`
  - `packages/agent-badge/src/commands/publish.ts`
  - `packages/agent-badge/src/commands/refresh.ts`
- Phase 14 planning artifacts:
  - `.planning/phases/14-shared-remote-contribution-model/14-RESEARCH.md`
  - `.planning/phases/14-shared-remote-contribution-model/14-01-PLAN.md`
  - `.planning/phases/14-shared-remote-contribution-model/14-02-PLAN.md`
  - `.planning/phases/14-shared-remote-contribution-model/14-03-PLAN.md`
  - `.planning/phases/14-shared-remote-contribution-model/14-VERIFICATION.md`

### Secondary (MEDIUM confidence)
- `docs/PRIVACY.md` and `docs/HOW-IT-WORKS.md` for the current public privacy and shared-state contract
- Registry/version checks run on 2026-04-02:
  - `npm view octokit version`
  - `npm view zod version`
  - `npm view commander version`
  - `npm view vitest version`

### Tertiary (LOW confidence)
- The watermark comparator assumption that later session timestamps and larger token totals always represent the same session more completely. This is reasonable from the current provider data model but still needs direct regression coverage.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Phase 15 can reuse the current repo stack without new dependencies, and package/runtime versions were verified.
- Architecture: MEDIUM - the need for session-level contributor records is certain, but the exact duplicate-watermark comparator is still an implementation choice that should be validated against fixture data.
- Pitfalls: HIGH - the current Phase 14 code makes the failure modes explicit, especially totals-only contributor records and cache data loss for ambiguous sessions.

**Research date:** 2026-04-02
**Valid until:** 2026-04-09
