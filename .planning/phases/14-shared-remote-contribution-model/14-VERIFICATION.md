---
phase: 14-shared-remote-contribution-model
verified: 2026-04-02T00:08:00Z
status: passed
score: 3/3 must-haves verified
human_verification:
  - docs/HOW-IT-WORKS.md
  - docs/PRIVACY.md
---

# Phase 14: Shared Remote Contribution Model Verification Report

**Phase Goal:** Replace the single overwritten remote aggregate with a merge-safe shared state model that multiple contributors can publish into safely.  
**Verified:** 2026-04-02T00:08:00Z  
**Status:** passed  
**Re-verification:** Yes - completed after the Phase 14 full-suite gate surfaced and fixed the `publish-state` expectation drift

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Shared badge publishing now writes merge-safe remote contribution state instead of overwriting one machine's aggregate snapshot. | ✓ VERIFIED | `packages/core/src/publish/shared-model.ts`, `packages/core/src/publish/shared-merge.ts`, and `packages/core/src/publish/publish-service.ts` implement deterministic contributor files plus shared override merging; `packages/core/src/publish/shared-badge-aggregation.test.ts` proves the final badge payload is derived from authoritative remote contributor totals. |
| 2 | The shared remote model remains aggregate-only and does not publish prompts, transcript text, filenames, or local paths. | ✓ VERIFIED | `packages/core/src/publish/shared-model.ts` hashes shared override keys to `sha256:` digests, `packages/core/src/publish/publish-service.ts` rejects raw session keys, `packages/core/src/publish/publish-service.test.ts` covers malformed shared overrides rejection, and `docs/PRIVACY.md` plus `scripts/verify-docs.sh` lock the wording into the docs gate. |
| 3 | Shared ambiguous-session decisions now have a deterministic repo-level home instead of staying machine-local only. | ✓ VERIFIED | `agent-badge-overrides.json` is part of the shared model, local overrides are published through `buildSharedOverrideDigest()`, and `packages/core/src/publish/publish-service.ts` rereads the gist before deriving the published badge payload. |

**Score:** 3/3 truths verified

### Plan Completion Evidence

| Plan | Status | Evidence |
| --- | --- | --- |
| 14-01 | Complete | Commits `4b75bae`, `e2bf36d`, `d34dc10`, and `d26a671`; summary `.planning/phases/14-shared-remote-contribution-model/14-01-SUMMARY.md` |
| 14-02 | Complete | Commits `dfea0a6`, `bccc35a`, `a22ee17`, `da7e91a`, `57b73e6`, and `1784e66`; summary `.planning/phases/14-shared-remote-contribution-model/14-02-SUMMARY.md` |
| 14-03 | Complete | Commits `a7df733` and `a690ce5`; summary `.planning/phases/14-shared-remote-contribution-model/14-03-SUMMARY.md` |

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `packages/core/src/publish/shared-model.ts` | Strict shared contributor and overrides schemas | ✓ VERIFIED | Defines deterministic contributor filenames, opaque shared override digests, and schema-validated public shared files. |
| `packages/core/src/publish/publish-service.ts` | Shared publish orchestration | ✓ VERIFIED | Loads remote shared files, updates one contributor slot, merges shared overrides, rejects malformed keys, rereads the gist, and derives badge totals from remote contributor records. |
| `packages/core/src/publish/shared-badge-aggregation.test.ts` | Direct aggregation proof | ✓ VERIFIED | Covers `derives the badge payload from remote contributor totals` and `does not need the local includedTotals snapshot to contain every remote contributor`. |
| `packages/core/src/state/state-schema.ts` | Persisted opaque publisher identity and publish mode | ✓ VERIFIED | Adds `publisherId` and `mode` to local publish state without exposing raw session or host identity. |
| `docs/HOW-IT-WORKS.md` and `docs/PRIVACY.md` | Public shared publish contract | ✓ VERIFIED | Both docs describe deterministic contributor files, `agent-badge-overrides.json`, opaque digests, and the aggregate-only privacy boundary. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full Phase 14 automated suite | `npm test -- --run packages/core/src/publish packages/agent-badge/src/commands/publish.test.ts packages/core/src/state packages/core/src/init` | 15 files / 79 tests passed | ✓ PASS |
| Docs contract gate | `npm run docs:check` | passed | ✓ PASS |
| Shared badge aggregation | `npm test -- --run packages/core/src/publish/shared-badge-aggregation.test.ts` | 2 tests passed | ✓ PASS |
| Shared publish command persistence | `npm test -- --run packages/agent-badge/src/commands/publish.test.ts` | 3 tests passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `TEAM-01` | `14-01-PLAN.md`, `14-02-PLAN.md` | Multiple contributors can publish usage for the same repository without devolving into a last-writer-wins snapshot. | ✓ SATISFIED | Shared contributor files are deterministic per publisher and badge totals are recomputed from remote contributor records after every publish. |
| `TEAM-02` | `14-01-PLAN.md`, `14-02-PLAN.md`, `14-03-PLAN.md` | Shared totals are computed from mergeable remote contribution data rather than one overwritten aggregate payload. | ✓ SATISFIED | `deriveSharedIncludedTotals()` and `shared-badge-aggregation.test.ts` prove the badge payload is driven by the remote contributor set, not the local publish snapshot. |
| `TEAM-03` | `14-01-PLAN.md`, `14-03-PLAN.md` | The shared remote format remains aggregate-only and does not publish prompts, transcript text, filenames, or local paths. | ✓ SATISFIED | Shared override keys are opaque digests, malformed raw keys are rejected, and the public docs plus docs gate explicitly prohibit raw prompts, transcript text, filenames, and local paths. |

Phase 14 requirement IDs match `.planning/REQUIREMENTS.md`; no unresolved Phase 14 requirements remain.

### Human Verification Required

Manual doc review completed. `docs/HOW-IT-WORKS.md` and `docs/PRIVACY.md` still describe public gist contents as aggregate-only outputs plus deterministic shared-state files, without implying transcript text or local paths are published.

### Gaps Summary

No remaining Phase 14 gaps were found. The shared remote contract, shared publish wiring, privacy hardening, and public docs contract are complete.

---
_Verified: 2026-04-02T00:08:00Z_  
_Verifier: Codex inline fallback_
