# Requirements: agent-badge

**Defined:** 2026-04-02
**Core Value:** Any repository can display an accurate, privacy-preserving AI usage badge with one setup command and near-zero ongoing maintenance.

## v1.4 Requirements

This milestone makes the live badge operationally trustworthy under local-first, failure-soft developer workflows.

### Publish Visibility

- [x] **OPER-01**: Operators can immediately see when the live badge is stale because publish failed or was skipped for an actionable reason.
- [x] **OPER-02**: `status`, `refresh`, and `doctor` expose one coherent view of last successful publish, current failure state, and required recovery action.
- [x] **OPER-03**: Pre-push automation reports degraded publish health clearly enough that a developer cannot mistake a stale badge for a successful update.

### Auth And Readiness

- [x] **AUTH-01**: Refresh and publish flows validate GitHub auth and gist write readiness before or during publish with concrete, local-environment-specific remediation.
- [x] **AUTH-02**: The runtime distinguishes auth-missing, gist-unreachable, write-failed, and remote-readback mismatch states instead of collapsing them into one generic publish error.

### Recovery And Controls

- [x] **CTRL-01**: Repos can choose explicit automation strictness for badge publish failures rather than inheriting one hidden failure-soft default.
- [x] **CTRL-02**: Repos in publish error state can recover to a healthy shared publish state through supported CLI flows without manual `.agent-badge/state.json` edits.
- [x] **CTRL-03**: Production-readiness verification covers the real stale-badge failure path, recovery path, and operator-facing messaging.

## Future Requirements

### Product Expansion

- **LIVE-01**: Tool can optionally use Codex hooks for faster local freshness after the core scanner is stable.
- **LIVE-02**: Tool can optionally ingest Claude live session metrics for more immediate refreshes.
- **TEAM-04**: Team badges can expose richer contributor-aware history views or breakdowns after shared totals are correct.
- **HIST-01**: Tool can render richer history views such as charts or timeline summaries.
- **BACK-01**: Tool can publish badge data to backends other than public Gists.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Team dashboards, org analytics, or contribution leaderboards | This milestone is about one trustworthy shared badge, not a broader analytics surface. |
| New provider integrations beyond Codex and Claude | Team correctness should be solved against the current provider set first. |
| Hosted backend collection or central transcript processing | Still violates the local-first aggregate-only product boundary. |
| Branch-level or PR-level badge segmentation | Shared repo correctness is the problem to solve first; branch analytics are a separate product decision. |
| Replacing local-first automation with a hosted scheduler | The goal is to harden the current local publish model, not introduce backend infrastructure. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| OPER-01 | Phase 17 | Complete |
| OPER-02 | Phase 17 | Complete |
| OPER-03 | Phase 18 | Complete |
| AUTH-01 | Phase 18 | Complete |
| AUTH-02 | Phase 18 | Complete |
| CTRL-01 | Phase 18 | Complete |
| CTRL-02 | Phase 19 | Complete |
| CTRL-03 | Phase 19 | Complete |

**Coverage:**
- v1.4 requirements: 8 total
- Mapped to phases: 8
- Unmapped: 0

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-05 for milestone v1.4*
