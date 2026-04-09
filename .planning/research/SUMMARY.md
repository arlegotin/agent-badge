# Project Research Summary

**Project:** agent-badge
**Domain:** Local-first AI usage badge tooling for GitHub repositories
**Researched:** 2026-03-29
**Confidence:** HIGH

## Executive Summary

`agent-badge` is best treated as a two-package Node.js workspace: a runtime CLI plus an npm initializer, sharing typed core services for repo discovery, provider scanning, attribution, publishing, and recovery. The product wins by being boring in the right places: local source-of-truth scanning, one deterministic Gist publish target, one stable README badge URL, and a small derived state footprint.

The research strongly supports the product brief's direction. The hardest parts are not rendering the badge; they are trustworthy attribution, fast incremental refresh, and privacy-safe failure handling. The roadmap should therefore build the repo model and provider normalization early, delay publish automation until aggregate outputs are stable, and reserve a dedicated hardening phase for idempotency, logging, privacy, and recovery UX.

## Key Findings

### Recommended Stack

Use a Node.js 24.x LTS / TypeScript 5.x workspace and keep the implementation ESM-first. `commander` fits the command surface, `octokit` is the right choice for Gist operations, and `zod` should guard every config/state/provider boundary. `vitest`, `tsx`, and `changesets` are enough for a production-ready two-package release flow.

**Core technologies:**
- Node.js 24.x LTS - supported modern CLI runtime; test against Node 20, 22, and 24
- TypeScript 5.x - typed scanner and attribution model across both packages
- npm workspaces - shared development and release flow for `agent-badge` and `create-agent-badge`

### Expected Features

The domain has clear table stakes: one-command initialization, full historical backfill, cross-provider scanning, stable README badge insertion, manual recovery commands, and a fast failure-soft refresh path. The differentiators are conservative attribution, ambiguity review, repo-local runtime installation, and an aggregate-only privacy model.

**Must have (table stakes):**
- One-command init - users expect complete onboarding
- Historical backfill - the badge must be useful immediately
- Cross-provider scan and normalized totals - the product promise depends on both providers
- Stable Gist-backed Shields badge - remote rendering without server infra
- Manual recovery commands - required for trust in local tooling
- Failure-soft automatic refresh - required for daily usability

**Should have (competitive):**
- Ambiguity review with persisted overrides - increases trust without inflating totals
- Repo-local runtime install - keeps hooks and scripts reproducible
- Idempotent re-init and uninstall - makes adoption safe in active repos

**Defer (v2+):**
- Live hook-based freshness from Codex or Claude
- Shared badge ownership and dashboards
- Rich historical charts

### Architecture Approach

Keep the architecture layered: thin CLI and initializer entrypoints above shared domain services, with provider adapters and GitHub/Git integrations below them. The major components are repo context/fingerprinting, provider scanners, attribution engine, derived state/logging, publisher, and hook manager. This split keeps the product testable and makes it possible to ship the runtime and initializer packages without duplicating logic.

**Major components:**
1. Repo context service - discovers git root, README, package manager, remotes, and repo fingerprint
2. Provider adapters - normalize Codex and Claude local data into one session model
3. Attribution engine - decides whether sessions belong to the current repo and surfaces ambiguity
4. Publisher - turns totals into Shields endpoint JSON and updates the public Gist
5. Operations layer - `refresh`, `status`, `doctor`, config, uninstall, logs, and hooks

### Critical Pitfalls

1. **Double-counting session usage** - dedupe to one session summary before aggregating
2. **Crediting the wrong repository** - use ordered evidence and ambiguity review
3. **Punitive `pre-push` behavior** - keep refresh incremental and failure-soft
4. **Sensitive data leakage** - enforce aggregate-only outbound schemas
5. **Non-idempotent setup** - treat init as reconciliation, not one-shot creation

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Workspace and Init Foundation
**Rationale:** The product ships two npm packages and must establish repo-local runtime installation before anything else.
**Delivers:** Monorepo/package structure, shared config/state primitives, init preflight, and local scaffolding.
**Addresses:** Onboarding table stakes and idempotent setup groundwork.
**Avoids:** Non-idempotent setup drift.

### Phase 2: Repo Identity and Provider Parsing
**Rationale:** Accurate attribution depends on a stable repo fingerprint and normalized provider data.
**Delivers:** Repo fingerprint service plus Codex and Claude adapters.
**Uses:** TypeScript domain models, `zod`, fixture-heavy tests.
**Implements:** Provider adapter architecture.

### Phase 3: Historical Backfill and Attribution Review
**Rationale:** The badge is not credible until full backfill and ambiguous-session handling exist.
**Delivers:** Historical scan orchestration, conservative attribution scoring, and override persistence.
**Uses:** Phase 2 normalized session models.
**Implements:** Evidence-based attribution.

### Phase 4: Publish and README Badge Integration
**Rationale:** Publishing should happen only after totals are stable and privacy boundaries are explicit.
**Delivers:** Gist create/connect flows, aggregate Shields JSON, and one-time README insertion.
**Uses:** `octokit`, badge model formatter, publish-state bookkeeping.
**Avoids:** Sensitive data leakage and README churn.

### Phase 5: Refresh, Status, and Config Operations
**Rationale:** Day-to-day usability depends on fast incremental refresh and operator visibility.
**Delivers:** Incremental checkpoints, `refresh`, `status`, `config`, and failure-soft `pre-push`.
**Uses:** Existing scan and publish primitives with diff-aware publishing.
**Implements:** Main operational UX.

### Phase 6: Doctor, Uninstall, and Hardening
**Rationale:** Production-ready local tooling lives or dies on recovery, privacy, and safe re-entry.
**Delivers:** `doctor`, `uninstall`, rotating logs, degraded-mode messaging, and re-init safety.
**Uses:** Full integration surface from earlier phases.
**Implements:** Recovery and trust layer.

### Phase 7: Release Readiness
**Rationale:** The product is only shippable once packaging, docs, and scenario coverage are proven.
**Delivers:** Release CI, fixture coverage, quickstart, troubleshooting, privacy, and manual Gist docs.
**Uses:** `changesets`, CI matrix, end-to-end smoke flows.
**Implements:** Public-release gate.

### Phase Ordering Rationale

- Fingerprinting and provider normalization must exist before attribution.
- Attribution must be trustworthy before publishing and README integration.
- Incremental refresh should be built on top of stable full-scan semantics, not before them.
- Hardening deserves its own phase because privacy, idempotency, and recovery bugs are release blockers.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** provider artifact details can change and need fixture-driven validation
- **Phase 4:** Gist auth fallback and Shields cache behavior need precise implementation decisions
- **Phase 7:** npm packaging and release ergonomics need concrete publish/runbook details

Phases with standard patterns (skip research-phase if time is tight):
- **Phase 1:** workspace/package scaffolding and config/state primitives are standard
- **Phase 5:** incremental refresh and CLI status/config flows are standard once core models exist

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Tooling choices are standard and supported by official docs/npm package state |
| Features | HIGH | The product brief is unusually explicit about v1 scope and UX |
| Architecture | HIGH | The system boundaries are clear and driven by the local-first model |
| Pitfalls | HIGH | Risks are direct consequences of attribution, privacy, and hook behavior |

**Overall confidence:** HIGH

### Gaps to Address

- Exact Codex local artifact fields still need fixture-backed validation during implementation.
- Claude local backfill details need implementation-time confirmation beyond the documented status-line schema.
- npm package-name availability for `agent-badge` must be checked at publish time.

## Sources

### Primary (HIGH confidence)
- https://docs.npmjs.com/creating-a-package-json-file/ - initializer and package conventions
- https://docs.github.com/en/rest/gists - Gist create/update support
- https://shields.io/badges/endpoint-badge - endpoint badge schema
- https://developers.openai.com/codex/cli/features/ - Codex local storage direction
- https://developers.openai.com/codex/hooks - optional future hook path and current limitations
- https://code.claude.com/docs/en/statusline - Claude session metadata and cumulative totals
- https://nodejs.org/en/about/eol - supported Node release guidance

### Secondary (MEDIUM confidence)
- https://github.com/tj/commander.js - CLI framework fit
- https://github.com/octokit/octokit.js/ - GitHub SDK fit
- https://www.npmjs.com/package/vitest - current stable test tooling line
- https://www.npmjs.com/package/tsx - current dev runner line
- https://www.npmjs.com/package/%40changesets/cli - release tooling line

### Tertiary (LOW confidence)
- Product-ecosystem inferences from common badge tooling patterns - validate during implementation if behavior assumptions become concrete requirements

---
*Research completed: 2026-03-29*
*Ready for roadmap: yes*
