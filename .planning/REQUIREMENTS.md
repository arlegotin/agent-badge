# Requirements: agent-badge

**Defined:** 2026-04-08
**Milestone:** v2.0 Global Runtime and Minimal Repo Footprint
**Status:** READY FOR CLOSEOUT
**Core Value:** Any repository can display an accurate, privacy-preserving AI usage badge with one setup command and near-zero ongoing maintenance.

## Current Milestone Requirements

This milestone changes the runtime distribution model so repositories can be initialized with minimal local artifacts while `agent-badge` lives globally or at user scope instead of inside each target repo.

### Global Runtime Distribution

- [x] **DIST-01**: Developer can install `agent-badge` once at global or user scope and reuse that CLI across repositories without adding `@legotin/agent-badge` to each repo's dependencies.
- [x] **DIST-02**: `npm init agent-badge@latest` initializes the current repository without creating repo-local `node_modules` or adding the runtime package to the repo manifest or lockfile by default.
- [x] **DIST-03**: Init and normal commands explain how to satisfy the shared CLI prerequisite when a usable global or user-scoped runtime cannot be resolved.

### Automation And Repo Artifacts

- [x] **AUTO-01**: Managed refresh and other generated repo entrypoints invoke `agent-badge` without relying on repo-local binaries, `npx --no-install`, or package-manager script wiring that exists only to reach a local runtime.
- [x] **ART-01**: After init, the repo only contains repo-specific agent-badge artifacts needed for operation: `.agent-badge/` data, README badge markup, gitignore entries, and optional git hook content.
- [x] **ART-02**: Re-running init remains idempotent under the new model and does not duplicate hook blocks, README badges, or repo-owned config while keeping the artifact footprint minimal.

### Migration And Verification

- [x] **MIG-01**: Repositories previously initialized with repo-local runtime wiring can migrate to the new model without losing refresh, publish, status, doctor, or uninstall behavior.
- [x] **MIG-02**: Docs, help text, uninstall flows, and clean temp verification explicitly cover the global install model and assert the absence of repo-local runtime artifacts by default.

## Future Requirements

### Installation Options

- **OPT-01**: Tool can optionally offer an explicit repo-local install mode for teams that still prefer vendoring the runtime after the global-first path is stable.

### Product Expansion

- **LIVE-01**: Tool can optionally use Codex hooks for faster local freshness after the global-runtime baseline is stable.
- **LIVE-02**: Tool can optionally ingest Claude live session metrics for more immediate refreshes.
- **TEAM-04**: Team badges can expose richer contributor-aware history views or breakdowns after shared totals and runtime migration are stable.
- **HIST-01**: Tool can render richer history views such as charts or timeline summaries.
- **BACK-01**: Tool can publish badge data to backends other than public Gists.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Keeping repo-local `@legotin/agent-badge` installation as the default init behavior | This milestone explicitly reverses that default to minimize repo-local artifact churn. |
| Hosted backend collection or server-managed badge rendering | Still outside the local-first, serverless product boundary. |
| New provider integrations beyond Codex and Claude | This milestone is about distribution and artifact footprint, not provider expansion. |
| Richer history views, charts, or contributor dashboards | Defer until the install model and migration path are settled. |
| Alternative publish backends beyond public Gists | Not part of the runtime distribution change. |
| GitHub Actions-based collection from `~/.codex` or `~/.claude` | Repository CI still cannot access the local-first source data reliably. |

## Traceability

| Requirement | Planned Phase | Status |
|-------------|---------------|--------|
| DIST-01 | Phase 26 | Complete |
| DIST-02 | Phase 26 | Complete |
| DIST-03 | Phase 25 | Complete |
| AUTO-01 | Phase 25 | Complete |
| ART-01 | Phase 26 | Complete |
| ART-02 | Phase 26 | Complete |
| MIG-01 | Phase 27 | Complete |
| MIG-02 | Phase 27 | Complete |

**Coverage:**
- current milestone requirements: 8 total
- mapped to planned phases: 8
- unmapped: 0

---
*Requirements defined: 2026-04-08*
*Last updated: 2026-04-09 after completing Phase 27*
