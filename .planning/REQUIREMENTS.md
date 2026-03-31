# Requirements: agent-badge

**Defined:** 2026-03-31
**Core Value:** Any repository can display an accurate, privacy-preserving AI usage badge with one setup command and near-zero ongoing maintenance.

## v1.1 Requirements

This milestone hardens the existing v1 feature set so it can be shipped confidently from current source.

### Release Quality

- [x] **REL-04**: Maintainer can run `npm run build` successfully from committed source on a supported Node version without TypeScript errors. Validated in Phase 8.
- [x] **REL-05**: Maintainer can run `npm test` successfully from committed source, including doctor coverage and Claude incremental refresh coverage. Validated in Phase 8.
- [x] **REL-06**: Maintainer can verify release-critical checks against the current config/state schemas and current source behavior without fixture drift or stale build artifacts. Validated in Phase 8.

### Packaging

- [x] **PACK-01**: Maintainer can publish `@agent-badge/core`, `agent-badge`, and `create-agent-badge` with deliberate non-placeholder versions and correct internal dependency references. Validated in Phase 9.
- [x] **PACK-02**: Maintainer can produce package tarballs that exclude test artifacts and include only the runtime files required for imports and CLI execution. Validated in Phase 9.
- [x] **PACK-03**: Maintainer can install the locally packed tarballs in a clean temporary project and invoke both exported CLIs successfully. Validated in Phase 10.

### Release Operations

- [x] **OPER-06**: Maintainer can follow one documented release checklist that covers isolated npm cache usage, workspace disk constraints, and npm package-name verification before publish. Validated in Phase 10.

## v2 Requirements

### Product Expansion

- **LIVE-01**: Tool can optionally use Codex hooks for faster local freshness after the core scanner is stable.
- **LIVE-02**: Tool can optionally ingest Claude live session metrics for more immediate refreshes.
- **TEAM-01**: Multiple maintainers can share a badge publishing target safely.
- **HIST-01**: Tool can render richer history views such as charts or timeline summaries.
- **BACK-01**: Tool can publish badge data to backends other than public Gists.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Net-new provider integrations or major attribution-model expansion | This milestone is about shipping the existing v1 surface reliably, not widening scope. |
| Hosted backend collection or team dashboards | Conflicts with the current local-first, serverless ship target and adds operational risk. |
| UI/reporting expansions beyond the existing badge and operator CLI flows | Release confidence is a higher priority than richer presentation. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REL-04 | Phase 8 | Validated |
| REL-05 | Phase 8 | Validated |
| REL-06 | Phase 8 | Validated |
| PACK-01 | Phase 9 | Validated |
| PACK-02 | Phase 9 | Validated |
| PACK-03 | Phase 10 | Validated |
| OPER-06 | Phase 10 | Validated |

**Coverage:**
- v1.1 requirements: 7 total
- Mapped to phases: 7
- Unmapped: 0

---
*Requirements defined: 2026-03-31*
*Last updated: 2026-03-31 after completing Phase 10*
