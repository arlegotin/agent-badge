---
phase: 22
slug: trusted-publish-execution-and-evidence-capture
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-05
---

# Phase 22 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Local planning checkout -> released-source checkout | Phase 22 had to distinguish the stale planning branch from the exact released `db3ff4f` source before capturing evidence. | git commit identity, manifest versions, phase-owned evidence |
| GitHub Actions / GitHub API -> repo evidence | Workflow-run metadata was recovered from GitHub and then recorded into phase-owned artifacts. | run URL, run ID, job timing, release commit metadata |
| Repo release tooling -> npm registry | Repo-owned preflight and evidence capture read live registry version state to prove package alignment. | package names, published versions, dist-tags, release timestamps |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-22-01 | Integrity | release execution decision | mitigate | Closed by [22-WORKFLOW-RUN.md](/Volumes/git/legotin/agent-badge/.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-WORKFLOW-RUN.md), which recovers the successful `24005943027` workflow run and explicitly records `Recovered existing trusted publish`, preventing a duplicate release from the stale `1.1.2` checkout. | closed |
| T-22-02 | Integrity | workflow/run attribution | mitigate | Closed by [22-WORKFLOW-RUN.md](/Volumes/git/legotin/agent-badge/.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-WORKFLOW-RUN.md) and [22-PUBLISH-EVIDENCE.json](/Volumes/git/legotin/agent-badge/.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.json), which bind one exact workflow run, published commit, published version, and publish path together. | closed |
| T-22-03 | Operational safety | release commit inspection | mitigate | Closed by the plan- and summary-backed use of a clean temporary worktree for `db3ff4f`, documented in [22-01-SUMMARY.md](/Volumes/git/legotin/agent-badge/.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-01-SUMMARY.md), which avoided disturbing unrelated local work while inspecting the released source. | closed |
| T-22-04 | Integrity | evidence git SHA capture | mitigate | Closed by [capture-publish-evidence.ts](/Volumes/git/legotin/agent-badge/scripts/release/capture-publish-evidence.ts), which now accepts `--published-git-sha`, and by [22-PUBLISH-EVIDENCE.json](/Volumes/git/legotin/agent-badge/.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.json), which records the released commit `db3ff4f...` rather than the planning checkout `HEAD`. | closed |
| T-22-05 | Ownership / traceability | evidence artifact naming | mitigate | Closed by [capture-publish-evidence.ts](/Volumes/git/legotin/agent-badge/scripts/release/capture-publish-evidence.ts), [capture-publish-evidence.test.ts](/Volumes/git/legotin/agent-badge/scripts/release/capture-publish-evidence.test.ts), and [22-PUBLISH-EVIDENCE.md](/Volumes/git/legotin/agent-badge/.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.md), which moved Phase 22 evidence off the hard-coded `12-PUBLISH-EVIDENCE.*` names. | closed |
| T-22-06 | Regression control | release evidence contract | mitigate | Closed by the focused test suite in [capture-publish-evidence.test.ts](/Volumes/git/legotin/agent-badge/scripts/release/capture-publish-evidence.test.ts) and the operator guidance in [RELEASE.md](/Volumes/git/legotin/agent-badge/docs/RELEASE.md), which keep the phase-owned evidence command shape and released-checkout flow from drifting silently. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

No accepted risks.

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-05 | 6 | 6 | 0 | Codex / gsd-secure-phase |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-05
