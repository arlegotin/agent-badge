# Requirements: agent-badge

**Defined:** 2026-04-01
**Core Value:** Any repository can display an accurate, privacy-preserving AI usage badge with one setup command and near-zero ongoing maintenance.

## v1.3 Requirements

This milestone makes shared repo totals correct when multiple contributors publish usage for the same repository.

### Shared Publishing Model

- [x] **TEAM-01**: Multiple contributors can publish usage for the same repository without the badge degrading into a last-writer-wins snapshot of one machine.
- [x] **TEAM-02**: Shared totals are computed from mergeable remote contribution data rather than only one aggregate payload overwritten in place.
- [x] **TEAM-03**: The shared remote format remains aggregate-only and does not publish prompts, transcript text, filenames, or local paths.

### Deduplication And Consistency

- [ ] **CONS-01**: Shared totals deduplicate usage by stable provider session identity across contributors and machines instead of summing opaque local totals.
- [ ] **CONS-02**: When the same underlying session is observed by more than one publisher, the merged result converges deterministically without double counting.
- [ ] **CONS-03**: Repo-level include/exclude outcomes for ambiguous sessions are shared so contributors do not publish conflicting decisions for the same session.

### Migration And Operator UX

- [ ] **MIGR-01**: Existing single-writer repositories can migrate to the shared publishing model without losing badge continuity or requiring README badge URL changes.
- [ ] **MIGR-02**: Operators can inspect whether a badge is in single-writer or shared mode and diagnose stale, conflicting, or orphaned contributor state.
- [ ] **MIGR-03**: Team publish flows document the limits of correctness clearly, including what still depends on local machine data and what is now shared remotely.

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
| Team dashboards, org analytics, or contribution leaderboards | This milestone is about one correct shared badge, not a broader analytics surface. |
| New provider integrations beyond Codex and Claude | Team correctness should be solved against the current provider set first. |
| Hosted backend collection or central transcript processing | Still violates the local-first aggregate-only product boundary. |
| Branch-level or PR-level badge segmentation | Shared repo correctness is the problem to solve first; branch analytics are a separate product decision. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEAM-01 | Phase 14 | Complete |
| TEAM-02 | Phase 14 | Complete |
| TEAM-03 | Phase 14 | Complete |
| CONS-01 | Phase 15 | Pending |
| CONS-02 | Phase 15 | Pending |
| CONS-03 | Phase 15 | Pending |
| MIGR-01 | Phase 16 | Pending |
| MIGR-02 | Phase 16 | Pending |
| MIGR-03 | Phase 16 | Pending |

**Coverage:**
- v1.3 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0

---
*Requirements defined: 2026-04-01*
*Last updated: 2026-04-02 for milestone v1.3*
