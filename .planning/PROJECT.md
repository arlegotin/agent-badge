# agent-badge

## What This Is

`agent-badge` is a local-first, serverless CLI that lets a repository publish a stable GitHub README badge showing historical and ongoing AI-agent usage. It initializes a repo, scans local Codex and Claude data under `~/.codex` and `~/.claude`, attributes that usage to the current repo, publishes aggregate badge JSON to a public Gist, and renders the badge through a fixed Shields endpoint URL.

The product is for developers who want a low-friction, trustworthy way to show how much AI assistance a repository has consumed without running a backend or exposing raw transcripts.

## Core Value

Any repository can display an accurate, privacy-preserving AI usage badge with one setup command and near-zero ongoing maintenance.

## Current Milestone: v1.2 Production Launch and Publish Proof

**Goal:** Turn the current release candidate into an externally proven production release by validating live registry state, executing the real publish path, and verifying the published artifacts.

**Target features:**
- Verify live npm registry/package-name state and release-environment readiness immediately before publish.
- Execute the real production publish path and confirm the intended GitHub Actions release workflow succeeds from current source.
- Verify the published packages from the npm registry, including CLI and initializer behavior, with a post-publish production checklist.

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

### Active

- [ ] Maintainer can verify live npm registry availability and ownership for the planned package names immediately before publish.
- [ ] Maintainer can execute the real publish path with release credentials and observe a successful production release workflow from current source.
- [ ] Maintainer can install and validate the actual published packages from the npm registry, not just locally packed tarballs.
- [ ] Maintainer can follow one production release checklist covering registry preflight, publish execution, workflow confirmation, and post-publish verification.

### Out of Scope

- Hosted backend collection or server-managed badge rendering - v1 must stay local-first and serverless.
- Uploading raw transcripts, prompt content, filenames, or local absolute paths - publishing must expose aggregates only.
- Multi-maintainer shared badge state and team dashboards - valuable later, but not required for a credible single-repo v1.
- GitHub Actions-based collection from `~/.codex` or `~/.claude` - repository CI cannot access the local-first data sources reliably.

## Context

Phases 1 through 7 established the monorepo, shared schemas, init preflight, idempotent `.agent-badge` scaffolding, repo fingerprinting, provider parsing, historical backfill, conservative attribution, deterministic public Gist publishing, stable README badge insertion, incremental refresh flows, operator commands, and release-oriented docs/tests.

As of 2026-03-31 after Phase 10, the v1.1 release-hardening milestone is complete from current source: build, tests, docs, pack integrity, and clean-checkout verification are green; publishable workspace versions and tarball contents are deliberate; the packed-install smoke rehearsal rebuilds from a cleaned tree and installs the exact artifacts; and maintainers now have one enforced release checklist for constrained-machine rehearsal and live publish-time registry checks.

The next milestone, v1.2, is narrower and external-facing: prove that the release candidate can actually ship under real registry and credential conditions. That means validating live npm package-name state, executing the real publish path, confirming the release workflow in GitHub, and performing post-publish install verification against registry artifacts rather than local tarballs.

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
*Last updated: 2026-03-31 after starting milestone v1.2*
