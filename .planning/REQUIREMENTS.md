# Requirements: agent-badge

**Defined:** 2026-03-31
**Core Value:** Any repository can display an accurate, privacy-preserving AI usage badge with one setup command and near-zero ongoing maintenance.

## v1.2 Requirements

This milestone turns the local release candidate into an externally proven production release.

### Release Quality

- [x] **REL-07**: Maintainer can verify live npm registry state for `agent-badge`, `create-agent-badge`, and `@agent-badge/core` immediately before publish, including whether the planned package names and ownership state are safe to use.
- [x] **REL-08**: Maintainer can execute the intended production publish path with real release credentials and observe a successful release run for the current source.
- [x] **REL-09**: Maintainer can install the published `agent-badge`, `create-agent-badge`, and `@agent-badge/core` artifacts from the npm registry in a clean environment and confirm the shipped CLI and initializer behavior.

### Release Operations

- [ ] **OPER-07**: Maintainer can follow one production release checklist that covers registry preflight, publish execution, GitHub Actions confirmation, and post-publish smoke verification.

## Future Requirements

### Product Expansion

- **LIVE-01**: Tool can optionally use Codex hooks for faster local freshness after the core scanner is stable.
- **LIVE-02**: Tool can optionally ingest Claude live session metrics for more immediate refreshes.
- **TEAM-01**: Multiple maintainers can share a badge publishing target safely.
- **HIST-01**: Tool can render richer history views such as charts or timeline summaries.
- **BACK-01**: Tool can publish badge data to backends other than public Gists.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Net-new provider integrations or attribution-model expansion | This milestone is about shipping the existing product, not widening scope. |
| Hosted backend collection or team dashboards | Still conflicts with the local-first, serverless product boundary. |
| Major onboarding UX redesign | Release proof is the priority; installer and runtime ergonomics are already sufficient for first ship. |
| Automatic registry-name fallback or package renaming before a concrete publish blocker is observed | The milestone should prove the intended release path first; naming changes are only justified by real registry evidence. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REL-07 | Phase 11 | Complete |
| REL-08 | Phase 12 | Complete |
| REL-09 | Phase 13 | Complete |
| OPER-07 | Phase 13 | Pending |

**Coverage:**
- v1.2 requirements: 4 total
- Mapped to phases: 4
- Unmapped: 0

---
*Requirements defined: 2026-03-31*
*Last updated: 2026-03-31 for milestone v1.2*
