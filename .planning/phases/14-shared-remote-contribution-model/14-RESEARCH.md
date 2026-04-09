# Phase 14: Shared Remote Contribution Model - Research

**Researched:** 2026-04-01
**Domain:** GitHub Gist-backed shared publish state for a local-first CLI
**Confidence:** MEDIUM

<user_constraints>
## User Constraints

No phase `CONTEXT.md` exists for Phase 14. Planner must treat the following as the active constraints derived from `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`, and current code:

### Locked Decisions
- Goal: replace the single overwritten remote aggregate with a merge-safe shared state model that multiple contributors can publish into safely.
- Must satisfy `TEAM-01`, `TEAM-02`, and `TEAM-03`.
- Current publish path overwrites deterministic gist badge files with one aggregate payload.
- Local ambiguous-session overrides live in `state.overrides.ambiguousSessions` only.
- Shared badge publishing must stay aggregate-only and must not expose prompts, transcript text, filenames, or local paths.
- Phase 14 stops before cross-publisher deduplication semantics. `CONS-01`, `CONS-02`, and `CONS-03` belong to Phase 15.

### Claude's Discretion
- Choose the concrete remote file layout and merge model.
- Choose how publisher identity is represented remotely without exposing personal machine details.
- Choose how shared ambiguous-session decisions get a repo-level home.
- Choose whether local state/config needs new fields to support shared publishing.

### Deferred Ideas (OUT OF SCOPE)
- Cross-publisher deduplication by stable provider session identity.
- Conflict-resolution UX, stale/orphaned contributor diagnostics, and migration tooling.
- README badge URL changes or migration flows.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEAM-01 | Multiple contributors can publish usage for the same repository without the badge degrading into a last-writer-wins snapshot of one machine. | Use per-publisher remote contribution records as the source of truth; do not use one shared mutable aggregate file as the only state. |
| TEAM-02 | Shared totals are computed from mergeable remote contribution data rather than only one aggregate payload overwritten in place. | Recompute badge endpoint files from remote contribution records on every publish; treat badge files as derived cache, not source of truth. |
| TEAM-03 | Shared remote format remains aggregate-only and does not publish prompts, transcript text, filenames, or local paths. | Keep remote records limited to aggregate totals, freshness metadata, opaque publisher/session digests, and shared override decisions. |
</phase_requirements>

## Summary

The current implementation is explicitly single-writer. `packages/core/src/publish/publish-service.ts` serializes badge payloads and overwrites deterministic gist files in place, while `packages/core/src/state/state-schema.ts` keeps ambiguous-session overrides only in local repo state. That satisfies the current privacy model but guarantees last-writer-wins behavior for shared repositories.

GitHub Gists support partial file updates, and unchanged files remain untouched during an update. That is the key primitive to use. Do not move to one larger shared JSON document and do not rely on a fetch-merge-write cycle against a single file as the safety mechanism. GitHub documents `GET` and `PATCH` gist behavior, file truncation, and per-file updates, but it does not document an optimistic concurrency or compare-and-swap mechanism for gist updates. A single shared file would still race. The canonical state must therefore live in per-publisher files, while badge endpoint files are regenerated from a fresh remote reread after the publisher file write.

**Primary recommendation:** store one deterministic remote contribution file per publisher, keep repo-level shared overrides in a separate deterministic file, and regenerate the existing badge endpoint files from those remote records on each publish.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 22.x runtime in workspace, support policy `>=20` | CLI runtime, `crypto`, file IO, HTTP client transport | Already the repo runtime; Phase 14 needs no runtime change. |
| TypeScript | 5.x in repo line | Shared schemas and publish-state logic | Existing repo line; avoids a Phase 14 upgrade unrelated to shared publishing. |
| `octokit` | 5.0.5 current, repo uses `^5.0.0` | GitHub Gist `get` and `update` operations | Already wrapped in `github-gist-client.ts`; no reason to replace it. |
| `zod` | 4.3.6 current, repo uses `^4.0.0` | Remote shared-state schema validation | Existing schema boundary library; use it for every remote file shape. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `commander` | 14.0.3 current, repo uses `^14.0.0` | CLI wiring for any status/debug flags touched by this phase | Only if Phase 14 adds operator-visible publish/status output. |
| `vitest` | 3.2.x in repo line, 4.1.2 current | Unit and integration coverage for merge and privacy behavior | Stay on the repo line for this phase; add tests, not a framework upgrade. |
| `node:crypto` | built-in | Opaque digests for publisher ids or shared override keys | Prefer built-in SHA-256; do not add hashing dependencies. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Per-publisher gist files | One shared `agent-badge-shared.json` file | Simpler shape, but still race-prone because gist `PATCH` is whole-file content replacement for that file. |
| Opaque local publisher id | GitHub login as contributor key | Easier to debug, but leaks identity publicly and ties state to auth choice. |
| Separate shared overrides file | Keep overrides local until Phase 15 | Simpler implementation, but fails Phase 14 success criterion 3. |

**Installation:**
```bash
# No new packages are required for Phase 14.
# Reuse the existing workspace dependencies.
```

**Version verification:** verified on 2026-04-01 with npm registry queries.
- `octokit` latest `5.0.5`, published 2025-10-31
- `zod` latest `4.3.6`, published 2026-01-22
- `commander` latest `14.0.3`, published 2026-01-31
- `vitest` latest `4.1.2`, published 2026-03-26
- `tsx` latest `4.21.0`, published 2025-11-30
- `better-sqlite3` latest `12.8.0`, published 2026-03-14

## Architecture Patterns

### Recommended Project Structure
```text
packages/core/src/publish/
├── badge-payload.ts           # existing derived badge endpoint payloads
├── github-gist-client.ts      # existing gist transport; expand to read file content
├── shared-model.ts            # new Zod schemas for contributor and override remote files
├── shared-merge.ts            # new deterministic merge/recompute helpers
└── publish-service.ts         # existing publish orchestration; extend for shared mode

packages/core/src/state/
└── state-schema.ts            # add local publisher identity and shared-publish metadata

packages/agent-badge/src/commands/
├── publish.ts                 # fetch remote shared state, update local publisher record
└── status.ts                  # optional shared-state visibility if Phase 14 touches UX
```

### Pattern 1: Per-Publisher Remote Records
**What:** Write one deterministic contribution file per local publisher id, not one shared mutable aggregate file.

**When to use:** Any repository where multiple contributors can publish to the same gist.

**Why:** GitHub documents that gist updates can update specific files while leaving untouched files unchanged. That makes separate contributor files the only merge-safe primitive currently available in this backend.

**Recommended file layout:**
```text
agent-badge.json                    # existing main Shields payload, derived
agent-badge-combined.json           # existing preview payload, derived
agent-badge-tokens.json             # existing preview payload, derived
agent-badge-cost.json               # existing preview payload, derived
agent-badge-contrib-<publisher>.json
agent-badge-overrides.json
```

**Example:**
```typescript
// Source: GitHub Gist update semantics + current publish-service.ts
export interface SharedContributorRecord {
  schemaVersion: 1;
  publisherId: string; // opaque, stable, repo-local identity
  updatedAt: string;
  totals: {
    sessions: number;
    tokens: number;
    estimatedCostUsdMicros: number | null;
  };
}
```

### Pattern 2: Badge Files Are Derived Cache
**What:** Treat the four badge endpoint files as render outputs generated from remote shared state, not as the canonical source of truth.

**When to use:** Always. The remote contribution files are the source; badge files are the view.

**Why:** This preserves the stable README URL while allowing the backend state model to change behind it. It also lets publish use a two-step convergence flow: write the local publisher file first, reread the remote contributor set, then regenerate badge files from that authoritative remote view.

**Example:**
```typescript
// Source: packages/core/src/publish/publish-service.ts
const remoteContributors = await loadContributorRecords(gist);
const remoteOverrides = await loadSharedOverrides(gist);
const merged = mergeSharedRecords({ remoteContributors, remoteOverrides, local });
const badgeFiles = buildSerializedBadgeFiles({
  config,
  includedTotals: merged.totals
});
```

### Pattern 3: Shared Override Home Uses Opaque Session Keys
**What:** Introduce a repo-level shared overrides file keyed by an opaque digest of the stable session key, not by raw `provider:providerSessionId`.

**When to use:** For any override that needs to be shareable across contributors.

**Why:** Raw override keys are stable and useful locally, but they are unnecessary to expose publicly. An opaque digest keeps cross-machine matching possible while avoiding direct publication of provider session ids.

**Example:**
```typescript
// Source: current buildAmbiguousSessionKey() + node:crypto
const sharedOverrideKey = sha256(
  `${session.provider}:${session.providerSessionId}`
);
```

### Anti-Patterns to Avoid
- **One shared contribution file:** fetch-merge-write on a single file is still last-writer-wins under concurrent publishers.
- **Publishing GitHub login or machine name:** identity leakage is unnecessary for correctness.
- **Using badge endpoint files as canonical state:** they are render outputs only.
- **One remote file per session or per override:** GitHub documents file-list truncation after 300 files; that design does not scale even to modest shared repos.
- **Publishing raw `cwd`, transcript correlation, or evidence reasons:** this violates the existing privacy model and Phase 3 decisions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gist API transport | Manual `fetch` wrappers for auth, read, patch, and delete | Existing `octokit` wrapper in `github-gist-client.ts` | The wrapper already exists and is the repo-standard GitHub boundary. |
| Remote schema validation | Ad-hoc `typeof` trees | `zod` schemas for every remote file | Shared state will become public and cross-versioned; strict validation is required. |
| Stable badge URL generation | String concatenation repeated in multiple places | Existing `buildStableBadgeUrl()` | The stable raw gist URL is already an explicit product guarantee. |
| Opaque ids and hashes | Custom hash code | `node:crypto` SHA-256 | Built-in, deterministic, and already available. |

**Key insight:** the hard part here is not serialization. It is choosing a remote state layout that remains correct under concurrent writers with only Gist's documented file-update behavior available.

## Common Pitfalls

### Pitfall 1: Assuming Fetch-Merge-Write Makes One File Safe
**What goes wrong:** Two contributors read the same shared file, both merge locally, and the later patch overwrites the earlier patch.

**Why it happens:** GitHub documents file patching, but not optimistic concurrency for gist `PATCH`.

**How to avoid:** Put each contributor's source-of-truth record in its own file. Only derived badge files may be overwritten.

**Warning signs:** The design still has exactly one public JSON file containing all contributor state.

### Pitfall 2: Leaking Identity or Session Keys Publicly
**What goes wrong:** The shared model publishes GitHub usernames, machine names, or raw stable session ids.

**Why it happens:** Those values are convenient local keys.

**How to avoid:** Use an opaque publisher id stored locally and opaque digest keys for shared override references.

**Warning signs:** Public gist content contains recognizable account names, workstation names, or raw `provider:sessionId` values.

### Pitfall 3: Treating Shared Overrides as an Afterthought
**What goes wrong:** Contribution state is shared, but ambiguous-session decisions still diverge by machine.

**Why it happens:** Current overrides live only in `.agent-badge/state.json`.

**How to avoid:** Add a deterministic shared overrides file in Phase 14, even if richer conflict semantics land in Phase 15.

**Warning signs:** Publish logic merges contributions remotely but still reads only `state.overrides.ambiguousSessions`.

### Pitfall 4: Designing for Per-Session Files
**What goes wrong:** The gist file list becomes large, truncated, and expensive to enumerate.

**Why it happens:** GitHub truncates gist file listings after 300 files and file content after 1 MB per file.

**How to avoid:** Use one file per publisher, not one file per session.

**Warning signs:** The proposed model creates unbounded file counts as usage grows.

## Code Examples

Verified patterns from official sources and current repo code:

### Gist Partial File Update
```typescript
// Source: https://docs.github.com/en/rest/gists/gists?apiVersion=2022-11-28
await octokit.rest.gists.update({
  gist_id: gistId,
  files: {
    "agent-badge-contrib-abc123.json": {
      content: serializedContributor
    },
    "agent-badge.json": {
      content: serializedBadge
    }
  }
});
```

### Current Repo Badge Serialization Boundary
```typescript
// Source: packages/core/src/publish/publish-service.ts
function buildSerializedBadgeFiles(
  options: Pick<PublishBadgeIfChangedOptions, "config" | "includedTotals">
): Record<string, { readonly content: string }> {
  return {
    [AGENT_BADGE_GIST_FILE]: {
      content: buildSerializedBadgePayload({
        label: options.config.badge.label,
        mode: options.config.badge.mode,
        includedTotals: options.includedTotals
      })
    }
  };
}
```

### Recommended Shared Override Schema
```typescript
// Source: current override-store.ts + Phase 14 recommendation
const sharedOverrideSchema = z.object({
  schemaVersion: z.literal(1),
  overrides: z.record(
    z.string(),
    z.object({
      decision: z.enum(["include", "exclude"]),
      updatedAt: z.string().datetime({ offset: true }),
      updatedByPublisherId: z.string().min(1)
    }).strict()
  )
}).strict();
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| One overwritten aggregate endpoint payload (`agent-badge.json`) | Per-publisher contribution records plus derived badge endpoint files | Phase 14 recommendation, researched 2026-04-01 | Removes single-writer source-of-truth and makes shared publish state recoverable. |
| Machine-local ambiguous overrides only | Repo-level shared override file plus local cache of applied decisions | Phase 14 recommendation, researched 2026-04-01 | Gives ambiguous decisions a team-visible home without exposing local paths or transcript text. |

**Deprecated/outdated:**
- Single-file remote aggregate as canonical state: insufficient for shared repositories.
- Raw contributor identity in public state: avoid unless the product explicitly chooses a public contributor model later.

## Open Questions

1. **Where should the local publisher id live?**
   - What we know: `.agent-badge/state.json` is already the mutable local runtime state and is gitignored.
   - What's unclear: whether the team wants identity in config or state.
   - Recommendation: store it in `state.publish.publisherId` and generate it lazily on first shared publish.

2. **Should shared override keys use raw stable session ids or opaque digests?**
   - What we know: local overrides already use raw `provider:providerSessionId`; Phase 14 wants a shared repo-level home and the milestone todos call out session identity privacy.
   - What's unclear: whether raw provider session ids are acceptable in a public gist.
   - Recommendation: use deterministic SHA-256 digest keys now. This is the safest compatible default and keeps Phase 15 dedupe options open.

3. **How much shared-state visibility belongs in Phase 14 status output?**
   - What we know: richer stale/conflict/orphan diagnostics are explicitly scoped to Phase 16.
   - What's unclear: whether Phase 14 should expose minimal shared mode indicators.
   - Recommendation: keep Phase 14 status additions minimal: shared mode on/off, local publisher id present, shared files discovered.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build, tests, CLI execution | ✓ | `v22.14.0` | — |
| npm | scripts, registry version verification | ✓ | `11.6.0` | — |
| Vitest | automated verification | ✓ | repo script `vitest` | `npm test -- --run` |
| GitHub Gist auth token | live manual publish smoke only | unknown | — | use mocked gist client in tests |

**Missing dependencies with no fallback:**
- None for implementation planning. Live publish smoke needs operator-provided GitHub auth, but code-level verification does not.

**Missing dependencies with fallback:**
- GitHub auth token for live smoke. Fallback: mocked `GitHubGistClient` tests.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (repo line `3.2.x`, config at `vitest.config.ts`) |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- --run packages/core/src/publish/*.test.ts packages/agent-badge/src/commands/publish.test.ts` |
| Full suite command | `npm test -- --run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEAM-01 | Multiple publishers create merge-safe remote contribution state without one source-of-truth file being overwritten | unit + integration | `npm test -- --run packages/core/src/publish/shared-merge.test.ts packages/agent-badge/src/commands/publish.test.ts` | ❌ Wave 0 |
| TEAM-02 | Badge totals are recomputed from remote contributor records, not one local aggregate payload | unit | `npm test -- --run packages/core/src/publish/shared-badge-aggregation.test.ts` | ❌ Wave 0 |
| TEAM-03 | Shared remote format stays aggregate-only and shared overrides get a repo-level home | unit | `npm test -- --run packages/core/src/publish/shared-model.test.ts packages/core/src/publish/publish-service.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- --run packages/core/src/publish/*.test.ts packages/agent-badge/src/commands/publish.test.ts`
- **Per wave merge:** `npm test -- --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/core/src/publish/shared-model.test.ts` — validates new remote shared-state schemas and privacy boundary
- [ ] `packages/core/src/publish/shared-merge.test.ts` — covers per-publisher file merge rules and derived total recomputation
- [ ] `packages/core/src/publish/shared-badge-aggregation.test.ts` — proves badge files are derived from remote contribution records
- [ ] Extend `packages/agent-badge/src/commands/publish.test.ts` — covers fetch-merge-patch flow, remote read failures, and shared override persistence

## Sources

### Primary (HIGH confidence)
- GitHub REST API: Gists — `GET`/`PATCH` semantics, truncation, file-update behavior: https://docs.github.com/en/rest/gists/gists?apiVersion=2022-11-28
- Local repo code:
  - `packages/core/src/publish/publish-service.ts`
  - `packages/core/src/publish/github-gist-client.ts`
  - `packages/core/src/state/state-schema.ts`
  - `packages/core/src/attribution/override-store.ts`
  - `packages/agent-badge/src/commands/publish.ts`
  - `packages/agent-badge/src/commands/scan.ts`
- npm registry checks executed on 2026-04-01:
  - `npm view octokit version time --json`
  - `npm view zod version time --json`
  - `npm view commander version time --json`
  - `npm view vitest version time --json`
  - `npm view tsx version time --json`
  - `npm view better-sqlite3 version time --json`

### Secondary (MEDIUM confidence)
- `docs/PRIVACY.md`, `docs/HOW-IT-WORKS.md`, and `docs/ATTRIBUTION.md` for current product guarantees and operator-facing privacy language

### Tertiary (LOW confidence)
- Inference that raw provider session ids should not be published publicly even though the milestone text does not explicitly forbid them; recommend validating this product decision during planning.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - existing repo stack is explicit, and package versions were verified against npm.
- Architecture: MEDIUM - GitHub gist file-update behavior is verified, but publisher-id and shared-override privacy choices remain product decisions.
- Pitfalls: HIGH - current code plus GitHub docs make the main failure modes clear.

**Research date:** 2026-04-01
**Valid until:** 2026-04-08
