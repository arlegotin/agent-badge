# agent-badge

## What This Is

`agent-badge` is a local-first, serverless CLI that lets a repository publish a stable GitHub README badge showing historical and ongoing AI-agent usage. It initializes a repo, scans local Codex and Claude data under `~/.codex` and `~/.claude`, attributes that usage to the current repo, publishes aggregate badge JSON to a public Gist, and renders the badge through a fixed Shields endpoint URL.

The product is for developers who want a low-friction, trustworthy way to show how much AI assistance a repository has consumed without running a backend or exposing raw transcripts. The shipped product now supports shared multi-contributor publishing, deterministic cross-publisher deduplication, operator-visible trust and readiness checks, and supported recovery flows for degraded publish state.

## Core Value

Any repository can display an accurate, privacy-preserving AI usage badge with one setup command and near-zero ongoing maintenance.

## Current State

**Latest shipped milestone:** v1.4 Publish Reliability Hardening (2026-04-05)

The current released planning state covers:
- merge-safe shared contributor publishing and repo-level ambiguous-session decisions
- deterministic cross-publisher deduplication across publish, refresh, and init
- migration and shared-health operator flows for legacy repos
- explicit badge-trust, readiness, and pre-push policy reporting
- supported recovery flows plus live proof artifacts for returning degraded repos to healthy shared mode

## Next Milestone Goals

- Decide which post-v1.4 expansion matters most: faster local freshness, richer history surfaces, or broader publish targets.
- Start a fresh milestone with newly scoped requirements instead of carrying archived v1.4 planning context forward.

<details>
<summary>Archived Milestone Focus: v1.4 Publish Reliability Hardening</summary>

**Goal:** Make the live badge operationally trustworthy by ensuring publish failures are visible, diagnosable, and recoverable before a repo silently drifts away from its local usage state.

**Target features:**
- Surface failed or skipped publish state clearly in normal CLI and pre-push flows instead of letting badge staleness hide behind failure-soft automation.
- Validate GitHub auth, gist reachability, and write readiness at the points where operators actually need them.
- Detect when the remote badge is stale relative to local refresh state and explain why.
- Provide explicit recovery paths that bring repos back to a healthy shared publish state without manual state-file surgery.

</details>

## Requirements

### Validated

- [x] Historical Codex and Claude usage can be backfilled, attributed conservatively, and reviewed through `agent-badge scan` without creating a second primary ledger. Validated in Phase 3.
- [x] Ambiguous historical sessions stay out of totals until explicitly included or excluded, and those override decisions are reused on later scans. Validated in Phase 3.
- [x] One-command initialization configures an existing or new repo end to end, including local runtime install, repo fingerprinting, badge publishing, README setup, and refresh integration. Validated in Phase 4.
- [x] The published badge stays stable in `README.md` while the underlying aggregate JSON is refreshed through public Gist updates. Validated in Phase 4.
- [x] Future Codex and Claude usage can be refreshed incrementally from local machine data without full historical rescans or a second primary ledger. Validated in Phase 5.
- [x] Refresh is fast and failure-soft by default so normal `git push` workflows stay unblocked. Validated in Phase 5.
- [x] Developers can inspect attribution, publishing, and hook health through clear `status`, `doctor`, `config`, and `uninstall` flows. Validated across Phases 5-7, with release hardening continuing in v1.1.
- [x] Maintainers can run `npm run build`, `npm test`, `npm run docs:check`, and clean-checkout package smoke verification successfully from current source on a supported Node toolchain. Validated in Phase 8.
- [x] Published workspace packages use deliberate release versions, correct internal dependency references, and ship only runtime artifacts needed for install and execution. Validated in Phase 9.
- [x] Maintainers can prove the packed-install release path from a cleaned tree and follow one enforced release checklist covering constrained-machine operation and live publish-time checks. Validated in Phase 10.
- [x] Maintainers can run one repo-owned release preflight that checks live registry state, npm auth, release-input coherence, and workflow prerequisites before production publish. Validated in Phase 11.
- [x] Maintainers can execute the real trusted-publishing release path from `main` and verify the actual published registry artifacts after release. Validated across Phases 12-13.
- [x] Multiple contributors can publish usage for the same repo without the badge becoming a last-writer-wins snapshot of one machine. Validated across Phases 14-15.
- [x] Shared badge totals deduplicate by stable session identity across contributors and machines instead of summing opaque local aggregates. Validated in Phase 15.
- [x] Repo-level include/exclude decisions for ambiguous sessions are consistent across contributors. Validated in Phase 15.
- [x] Existing single-writer repos can migrate to the shared model safely without losing badge continuity or privacy guarantees. Validated in Phase 16.
- [x] Operators can immediately tell when the live badge is stale, unchanged, or not attempted from the normal CLI surfaces they already use. Validated in Phase 17.
- [x] `status`, `refresh`, and `doctor` expose one coherent live-badge trust view with last successful publish state and recovery guidance. Validated in Phase 17.
- [x] Refresh and publish validate GitHub auth and publish readiness with canonical remediation before or during live publish flows. Validated in Phase 18.
- [x] Repos can choose explicit fail-soft versus strict pre-push publish behavior instead of inheriting a hidden default. Validated in Phase 18.
- [x] Shared-mode repos can recover from publish error state without manual local-state edits. Validated in Phase 19.
- [x] Production-readiness verification covers the real stale-badge failure path, recovery path, and operator-facing messaging. Validated in Phase 19.

### Active

- [ ] Evaluate Codex hook integration for lower-latency local freshness after the current shared/reliability baseline.
- [ ] Decide whether richer history views should ship as badge-adjacent outputs or remain future product expansion.
- [ ] Reassess whether additional publish backends materially improve the local-first story over the current public Gist model.

### Out of Scope

- Hosted backend collection or server-managed badge rendering - v1 must stay local-first and serverless.
- Uploading raw transcripts, prompt content, filenames, or local absolute paths - publishing must expose aggregates only.
- Team dashboards, org analytics, or contributor leaderboards - the milestone is about reliability of one shared repo badge, not a broader analytics product.
- GitHub Actions-based collection from `~/.codex` or `~/.claude` - repository CI cannot access the local-first data sources reliably.
- Cross-provider identity stitching beyond stable provider session identity - useful later, but not required for correct shared totals in the current supported providers.
- Replacing the local-first publish model with a hosted backend - this milestone hardens the current operational model instead of changing the product architecture.

## Context

Phases 1 through 7 established the monorepo, shared schemas, init preflight, idempotent `.agent-badge` scaffolding, repo fingerprinting, provider parsing, historical backfill, conservative attribution, deterministic public Gist publishing, stable README badge insertion, incremental refresh flows, operator commands, and release-oriented docs/tests.

As of 2026-04-05 after milestone v1.4, shared publish correctness and publish reliability are both shipped. Contributor observations merge safely, duplicate sessions deduplicate deterministically, legacy repos can migrate to shared mode, and operators can inspect shared publish health through `status`, `doctor`, and the public docs.

The live CLI now classifies missing auth and gist readiness problems with canonical remediation, normal refresh failures print both readiness and trust lines, managed pre-push automation encodes explicit `fail-soft` versus `strict` behavior, and supported recovery flows can return degraded repos to healthy shared publish mode without manual state surgery.

The next product decisions are expansion choices, not missing baseline trust work. Any next milestone should be scoped from the shipped local-first shared/reliability baseline rather than reopening the v1.4 verification set.

The initializer package is `create-agent-badge`, enabling `npm init agent-badge@latest`, while `agent-badge` is the runtime CLI if the npm name is available at publish time. The intended onboarding is one command that leaves the repository fully configured: README badge inserted once, historical usage backfilled immediately, public Gist created or connected, first badge JSON published, and lightweight refresh installed for future pushes.

The v1 source of truth is the developer machine's local agent directories: `~/.codex/**` and `~/.claude/**`. Scanning must attribute sessions conservatively, prefer cumulative session totals over naive event summing, exclude ambiguous sessions unless the user approves an override, and keep only small derived local state for checkpoints, publish bookkeeping, and attribution overrides.

Publishing follows the standard dynamic-badge model: aggregate totals are normalized into Shields endpoint JSON, written to a public Gist, then rendered through a fixed badge URL embedded in the repository README. After setup, README edits should not be repeated on normal refreshes.

## Constraints

- **Architecture**: Local-first and serverless - collection happens on the developer machine because that is where the source data lives.
- **Privacy**: Aggregate-only publishing - no raw transcripts, prompt text, filenames, or local paths may leave the machine.
- **Distribution**: Initializer-first npm UX - setup must work from `npm init agent-badge@latest` without requiring a global install.
- **GitHub Integration**: Public Gist plus Shields endpoint badge - README badge URLs must remain stable after first insertion.
- **Performance**: Incremental refresh must usually be fast enough for `pre-push` and must default to failure-soft behavior.
- **Reliability**: `init` must be idempotent - re-running setup cannot duplicate README badges, hooks, or Gists.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use `create-agent-badge` as the initializer package and `agent-badge` as the runtime CLI | Matches npm initializer conventions while keeping the product name clean for normal usage | Implemented in Phase 1 |
| Use local directory scanning as the v1 system of record | It keeps trust high and avoids introducing a second opaque ledger | Implemented in Phases 2-3 for historical backfill and attribution |
| Publish only Shields endpoint JSON through a public Gist | This is the simplest serverless way to render a stable dynamic README badge | Implemented in Phase 4 |
| Insert the README badge once and refresh only the remote JSON afterward | Stable badge URLs avoid repeated README churn and match common badge patterns | Implemented in Phase 4 |
| Use a lightweight `pre-push` hook as the default automation path | It captures normal developer workflow while remaining bypassable with `--no-verify` | Implemented in Phase 1 as a failure-soft managed hook |
| Treat ambiguous historical sessions as opt-in rather than auto-counted | Credibility matters more than inflating totals with weak attribution | Implemented in Phase 3 |
| Persist attribution overrides by stable `provider:providerSessionId` keys | Reuses decisions safely without storing raw cwd or transcript evidence | Implemented in Phase 3 |
| Keep init preflight privacy-safe by reporting normalized provider home labels instead of absolute paths | Prevents local path leakage while still showing actionable provider availability | Implemented in Phase 1 |
| Keep git inspection read-only and perform bootstrap through a separate helper | Preserves non-mutating preflight semantics while still supporting non-git init when allowed | Implemented in Phase 1 |
| Treat v1.1 as release hardening rather than net-new feature expansion | The current gap is production confidence, not missing core capability | Active across Phases 8-10 |
| Use one repo-owned clean-checkout verifier for release-critical validation | Prevents CI/release drift and makes stale artifact failures reproducible locally | Implemented in Phase 8 |
| Clean rebuild verification must clear `*.tsbuildinfo` as well as `dist/` | TypeScript project references can otherwise skip re-emitting deleted runtime artifacts | Implemented in Phase 8 |
| The packed-install smoke rehearsal must rebuild before packing and resolve exact tarball names before install | Clean-tree release proof must not depend on prior build state or overlapping tarball globs | Implemented in Phase 10 |
| Release operators should follow one repo-owned checklist that includes `/tmp` scratch-space guidance, isolated npm cache usage, and live `npm view` checks immediately before publish | Constrained-machine release work and registry state are real operational constraints, not side notes | Implemented in Phase 10 |
| Production publish must be gated by one repo-owned `npm run release:preflight` command | Registry conflicts, missing npm auth, and workflow drift should block before the real publish path starts | Implemented in Phase 11 |
| Shared repo totals must move from single aggregate overwrite to merge-safe remote contribution state | Correct multi-user totals cannot be recovered from last-writer-wins aggregate payloads | Implemented across Phases 14-16 |
| Cross-publisher deduplication should use stable provider session identity rather than publisher-local totals | Team correctness requires set-union semantics, not sum-of-summaries | Implemented in Phase 15 |
| Shared ambiguous-session outcomes must become repo-level state rather than machine-local overrides | Team badge correctness breaks when different users resolve the same ambiguous session differently | Implemented in Phase 15 |
| Local-first publish automation must make remote failure visible instead of silently letting the badge drift stale | A trustworthy badge cannot depend on operators noticing hidden fail-soft background failures | Active for v1.4 |
| Publish readiness must use one canonical auth/gist failure vocabulary across init, publish, refresh, and doctor | Operators need consistent remediation text instead of command-local error wording | Implemented in Phase 18 |
| Managed pre-push hooks must encode `fail-soft` or `strict` explicitly in the generated command | Badge automation policy should be inspectable and deliberate, not inferred from shell fallthrough | Implemented in Phase 18 |
| Supported recovery must be phase-owned proof, not only operator docs or traceability | Recovery trust is only credible when the owning phase verification cites refreshed live evidence | Implemented in Phases 19-20 |
| Milestone closeout must archive roadmap, requirements, and audit artifacts before next planning begins | Keeping one active planning surface avoids long-lived milestone drift in root docs | Implemented at v1.4 milestone completion |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check -> still the right priority?
3. Audit Out of Scope -> reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-05 after completing the v1.4 milestone*
