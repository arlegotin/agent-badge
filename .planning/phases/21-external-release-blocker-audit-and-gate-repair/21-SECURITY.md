---
phase: 21
slug: external-release-blocker-audit-and-gate-repair
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-05
---

# Phase 21 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Local maintainer environment -> phase evidence artifacts | Live npm and workflow-derived release facts are captured into repo-owned phase artifacts. | Package names, visible versions, status values, blocker categories |
| Repo-owned release contract -> operator decisions | `release:preflight`, release docs, and planning state shape whether maintainers call the repo production-ready. | Readiness status, blocker taxonomy, manual-confirmation guidance |
| Local tooling -> remote release systems | Local preflight inspects npm-visible state and the checked-in GitHub Actions workflow without proving remote ownership or trusted-publisher settings. | Registry metadata, workflow markers, auth success/failure status |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-21-01 | Integrity | Release-readiness evidence | mitigate | [21-EXTERNAL-READINESS.md](/Volumes/git/legotin/agent-badge/.planning/phases/21-external-release-blocker-audit-and-gate-repair/21-EXTERNAL-READINESS.md) explicitly separates locally green gates from externally blocked state and records `npm auth`, `version drift`, `package ownership`, and `trusted publisher` as explicit blocker categories instead of implying readiness. | closed |
| T-21-02 | Confidentiality | Phase evidence artifacts | mitigate | [21-preflight.json](/Volumes/git/legotin/agent-badge/.planning/phases/21-external-release-blocker-audit-and-gate-repair/21-preflight.json) stores package metadata, statuses, and check ids only; no tokens, secrets, or local credential values were written. | closed |
| T-21-03 | Integrity | Readiness summary wording | mitigate | [21-EXTERNAL-READINESS.md](/Volumes/git/legotin/agent-badge/.planning/phases/21-external-release-blocker-audit-and-gate-repair/21-EXTERNAL-READINESS.md) keeps unresolved ownership and trusted-publisher confirmations explicitly marked as manual rather than safe. | closed |
| T-21-04 | Integrity | Preflight machine-readable contract | mitigate | [preflight.ts](/Volumes/git/legotin/agent-badge/scripts/release/preflight.ts) now emits structured blocker categories for `npm auth`, `same version already published`, `version drift`, `package ownership`, and `trusted-publisher`, with focused coverage in [preflight.test.ts](/Volumes/git/legotin/agent-badge/scripts/release/preflight.test.ts). | closed |
| T-21-05 | Integrity | Release checklist language | mitigate | [RELEASE.md](/Volumes/git/legotin/agent-badge/docs/RELEASE.md) explicitly defines `locally green` versus `externally blocked` and preserves the limitation that trusted-publisher state cannot be auto-proved locally. | closed |
| T-21-06 | Integrity | Planning-state vocabulary | mitigate | [STATE.md](/Volumes/git/legotin/agent-badge/.planning/STATE.md) now mirrors the same blocker vocabulary as the repo-owned preflight and release docs, preventing drift back to generic concern wording. | closed |

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
| 2026-04-05 | 6 | 6 | 0 | Codex / `gsd-secure-phase` |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-05
