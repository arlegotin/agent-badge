# agent-badge

## What This Is

`agent-badge` is a local-first, serverless CLI that lets a repository publish a stable GitHub README badge showing historical and ongoing AI-agent usage. It initializes a repo, scans local Codex and Claude data under `~/.codex` and `~/.claude`, attributes that usage to the current repo, publishes aggregate badge JSON to a public Gist, and renders the badge through a fixed Shields endpoint URL.

The product is for developers who want a low-friction, trustworthy way to show how much AI assistance a repository has consumed without running a backend or exposing raw transcripts.

## Core Value

Any repository can display an accurate, privacy-preserving AI usage badge with one setup command and near-zero ongoing maintenance.

## Current Milestone: v1.3 Team-Correct Shared Badge Totals

**Goal:** Replace last-writer-wins badge publishing with a merge-safe team model so multiple developers can contribute correct shared totals to one repo badge without breaking the local-first privacy boundary.

**Target features:**
- Publish per-contributor usage state to a shared remote shape that can be merged safely instead of overwritten.
- Deduplicate shared totals by stable session identity so the same underlying work is not double-counted across machines or users.
- Share repo-level ambiguous-session decisions so include/exclude outcomes stay consistent across contributors.
- Add migration, diagnostics, and operator UX for enabling team-correct badge publishing in existing repos.

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

### Active

- [ ] Multiple contributors can publish usage for the same repo without the badge becoming a last-writer-wins snapshot of one machine.
- [ ] Shared badge totals deduplicate by stable session identity across contributors and machines instead of summing opaque local aggregates.
- [ ] Repo-level include/exclude decisions for ambiguous sessions are consistent across contributors.
- [ ] Existing single-writer repos can migrate to the shared model safely without losing badge continuity or privacy guarantees.

### Out of Scope

- Hosted backend collection or server-managed badge rendering - v1 must stay local-first and serverless.
- Uploading raw transcripts, prompt content, filenames, or local absolute paths - publishing must expose aggregates only.
- Team dashboards, org analytics, or contributor leaderboards - the milestone is about correctness of one shared repo badge, not a broader analytics product.
- GitHub Actions-based collection from `~/.codex` or `~/.claude` - repository CI cannot access the local-first data sources reliably.
- Cross-provider identity stitching beyond stable provider session identity - useful later, but not required for correct shared totals in the current supported providers.

## Context

Phases 1 through 7 established the monorepo, shared schemas, init preflight, idempotent `.agent-badge` scaffolding, repo fingerprinting, provider parsing, historical backfill, conservative attribution, deterministic public Gist publishing, stable README badge insertion, incremental refresh flows, operator commands, and release-oriented docs/tests.

As of 2026-04-01 after Phases 11-13, the production release path is proven: maintainers can gate release readiness through a repo-owned preflight, publish via the GitHub Actions trusted-publishing workflow, and verify the actual published registry artifacts from npm after release.

That closes the shipping-confidence milestone and exposes the next product gap more sharply: multi-user correctness. Today the badge is still fundamentally published from one developer machine at a time. Multiple contributors on the same repo can all produce locally correct scans, but the shared published badge is not a true team aggregate because the remote payload is overwritten by whichever publisher ran last.

The next milestone is architectural rather than packaging-focused. It needs a merge-safe remote representation for shared repo usage, stable session-level deduplication across publishers, and shared override semantics for ambiguous sessions, all while preserving the local-first and aggregate-only promises that make the product trustworthy.

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
| Shared repo totals must move from single aggregate overwrite to merge-safe remote contribution state | Correct multi-user totals cannot be recovered from last-writer-wins aggregate payloads | Active for v1.3 |
| Cross-publisher deduplication should use stable provider session identity rather than publisher-local totals | Team correctness requires set-union semantics, not sum-of-summaries | Active for v1.3 |
| Shared ambiguous-session outcomes must become repo-level state rather than machine-local overrides | Team badge correctness breaks when different users resolve the same ambiguous session differently | Active for v1.3 |

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
*Last updated: 2026-04-01 after starting milestone v1.3*
