# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v2.0 — Global Runtime and Minimal Repo Footprint

**Shipped:** 2026-04-09
**Phases:** 3 | **Plans:** 7 | **Sessions:** 7

### What Was Built
- Replaced repo-local runtime assumptions with a shared `agent-badge` command contract resolved from `PATH`.
- Reworked init and config behavior to preserve a minimal repo artifact footprint by default.
- Completed migration, uninstall, docs, and release-proof alignment for global-first onboarding.

### What Worked
- Contract-first execution across runtime, hook generation, diagnostics, and docs reduced cross-surface drift.
- Plan-level atomic commits and targeted test gates kept each phase verifiable and recoverable.

### What Was Inefficient
- Some phase closeout context remained split across docs and planning artifacts, requiring manual consolidation.
- Milestone closeout still needed manual root-doc collapse after archival tooling completed.

### Patterns Established
- Keep `ROADMAP.md` and active requirements milestone-light while archiving full details under `.planning/milestones/`.

### Key Lessons
1. Distribution-model changes need explicit proof separation: initializer behavior and direct runtime install behavior are different verification surfaces.
2. Minimal-artifact guarantees should be enforced simultaneously in command code, docs text, and smoke checks.

### Cost Observations
- Model mix: Not explicitly tracked in milestone metadata (balanced profile used by default).
- Sessions: 7 plan executions in this milestone.
- Notable: Verification-first closeout avoided unnecessary implementation churn for already-satisfied migration behavior.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.4 | 18 | 7 | Shifted to shared-publish correctness and reliability hardening. |
| v1.5 | 8 | 4 | Closed external production-readiness proof and release evidence gaps. |
| v2.0 | 7 | 3 | Completed global-first runtime distribution and minimal-artifact onboarding contract. |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.4 | UAT and verification suites passed | Phase-level verification complete | 0 |
| v1.5 | Release smoke plus trusted-publish checks passed | Milestone audit passed | 0 |
| v2.0 | Runtime/init/config/docs/smoke regressions passed | Milestone audit `passed` (8/8 req, 3/3 integration, 3/3 flows) | 0 |

### Top Lessons (Verified Across Milestones)

1. Reliability claims must be backed by explicit operator-facing evidence, not only passing local tests.
2. Milestone archival keeps active planning context small and lowers follow-on coordination cost.
