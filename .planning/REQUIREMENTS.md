# Requirements: agent-badge

**Defined:** 2026-04-05
**Milestone:** v1.5 Production Readiness Closure
**Status:** ACTIVE
**Core Value:** Any repository can display an accurate, privacy-preserving AI usage badge with one setup command and near-zero ongoing maintenance.

## Current Milestone Requirements

This milestone closes the gap between a locally green release rehearsal and an externally defensible production-ready claim. Success requires live publish readiness, canonical publish execution, and exact registry verification for the source that is about to ship.

### Release Gate Accuracy

- [x] **REL-01**: Maintainers can distinguish a locally green checkout from an externally blocked release state before claiming the repo is production ready.
- [x] **REL-02**: The canonical preflight and docs classify the concrete blocker type when release is blocked, including npm auth, package ownership, trusted-publisher configuration, or registry version drift.

### Live Publish Execution

- [ ] **PUB-01**: The maintained GitHub Actions trusted-publishing workflow can publish the current source for `@legotin/agent-badge-core`, `@legotin/agent-badge`, and `create-agent-badge` without a local CLI publish fallback.
- [ ] **PUB-02**: Release evidence records the exact workflow run, published version, and package/version alignment for the real production publish.

### Registry Verification

- [ ] **REG-01**: A clean temp-directory smoke check passes against the live npm registry for the exact released version, including the runtime packages and `npm init agent-badge@latest`.
- [ ] **REG-02**: Published versions, dist-tags, internal dependency references, and operator docs all align with the version visible in npm immediately after release.

### Production Ready Exit Criteria

- [ ] **READY-01**: The repo has an explicit production-ready go or no-go standard grounded in live publish proof, post-publish registry smoke, and operator-visible evidence.
- [ ] **READY-02**: Remaining external blockers are either resolved or recorded as blockers with concrete remediation instead of being hidden behind local test success.

## Future Requirements

### Product Expansion

- **LIVE-01**: Tool can optionally use Codex hooks for faster local freshness after the production baseline is fully closed.
- **LIVE-02**: Tool can optionally ingest Claude live session metrics for more immediate refreshes.
- **TEAM-04**: Team badges can expose richer contributor-aware history views or breakdowns after shared totals and production operations are fully stable.
- **HIST-01**: Tool can render richer history views such as charts or timeline summaries.
- **BACK-01**: Tool can publish badge data to backends other than public Gists.

## Out of Scope

| Feature | Reason |
|---------|--------|
| New provider integrations beyond Codex and Claude | Production closure should prove the current supported surface before expanding scope. |
| Richer history views, charts, or contributor breakdowns | Those are product-expansion decisions, not blockers to a truthful production-ready claim. |
| Alternative publish backends beyond public Gists | This milestone proves the existing serverless path rather than reopening the distribution model. |
| Hosted backend collection or central transcript processing | Still violates the local-first aggregate-only product boundary. |
| Replacing trusted publishing with a local manual publish path | The production contract is the GitHub Actions workflow, not a one-off maintainer machine path. |

## Traceability

| Requirement | Planned Phase | Status |
|-------------|---------------|--------|
| REL-01 | Phase 21 | Planned |
| REL-02 | Phase 21 | Planned |
| PUB-01 | Phase 22 | Planned |
| PUB-02 | Phase 22 | Planned |
| REG-01 | Phase 23 | Planned |
| REG-02 | Phase 23 | Planned |
| READY-01 | Phase 24 | Planned |
| READY-02 | Phase 24 | Planned |

**Coverage:**
- current milestone requirements: 8 total
- mapped to planned phases: 8
- unmapped: 0

---
*Requirements defined: 2026-04-05*
