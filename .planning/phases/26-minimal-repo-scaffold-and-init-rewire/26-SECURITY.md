---
phase: 26
slug: minimal-repo-scaffold-and-init-rewire
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-09
---

# Phase 26 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| initializer entrypoint -> target repo | `npm init agent-badge@latest` writes into arbitrary repositories and must not create extra runtime ownership artifacts. | Repo-local scaffold files, README edits, hook text, package manifest mutations |
| legacy manifest content -> cleanup logic | Init reconciliation may remove stale managed keys from `package.json` and must preserve user-owned content. | Existing dependency entries, existing scripts, manifest ownership assumptions |
| shared runtime contract -> generated hook | The direct Phase 25 hook contract must survive the artifact-footprint cleanup unchanged. | Generated shell hook body, PATH guard text, refresh command text |
| config mutation -> repo scaffold | Operator config changes rewrite repo automation and must not recreate deprecated runtime ownership artifacts. | Stored refresh policy values, regenerated hook content, scaffold state |
| legacy repos -> rerun cleanup | Existing repos may contain managed manifest entries from the old model and must converge safely without user-content loss. | Legacy manifest entries, README marker blocks, gitignore blocks, hook blocks |
| scenario-matrix proof -> future planning/execution | Tests define the contract for later phases, so stale repo-local expectations become a planning risk if not corrected. | Regression expectations, release-readiness assertions, future planning assumptions |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-26-01-01 | Tampering | `packages/core/src/init/runtime-wiring.ts` | accept | Accepted risk. [runtime-wiring.ts](/Volumes/git/legotin/agent-badge/packages/core/src/init/runtime-wiring.ts#L499) can still prune a user-owned `@legotin/agent-badge` dependency when the version matches the cleanup heuristic. The risk is documented in [26-REVIEW.md](/Volumes/git/legotin/agent-badge/.planning/phases/26-minimal-repo-scaffold-and-init-rewire/26-REVIEW.md#L59) and tracked in the Accepted Risks Log as `R-26-01`. | closed |
| T-26-01-02 | Denial of service | `packages/create-agent-badge/src/index.ts`, `packages/agent-badge/src/commands/init.ts` | mitigate | Closed by [index.ts](/Volumes/git/legotin/agent-badge/packages/create-agent-badge/src/index.ts#L16), [init.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/init.ts#L161), [runtime-wiring.ts](/Volumes/git/legotin/agent-badge/packages/core/src/init/runtime-wiring.ts#L172), [index.test.ts](/Volumes/git/legotin/agent-badge/packages/create-agent-badge/src/index.test.ts#L49), and [init.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/init.test.ts#L321), which keep shared-runtime remediation visible instead of failing silently when repo-local runtime installation was removed. | closed |
| T-26-01-03 | Tampering | `.git/hooks/pre-push` generation | mitigate | Closed by [runtime-wiring.ts](/Volumes/git/legotin/agent-badge/packages/core/src/init/runtime-wiring.ts#L172), [runtime-wiring.test.ts](/Volumes/git/legotin/agent-badge/packages/core/src/init/runtime-wiring.test.ts#L535), and [release-readiness-matrix.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/release-readiness-matrix.test.ts#L408), which preserve the direct shared hook contract and deny legacy wrapper runners. | closed |
| T-26-02-01 | Tampering | `packages/agent-badge/src/commands/config.ts` | mitigate | Closed by [config.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/config.ts#L492), [config.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/config.test.ts#L264), and [config.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/config.test.ts#L297), which route refresh-setting rewrites through `applyMinimalRepoScaffold()` and verify that config changes do not recreate repo-local runtime ownership. | closed |
| T-26-02-02 | Tampering | `packages/agent-badge/src/commands/init.test.ts`, `packages/core/src/init/runtime-wiring.test.ts` | accept | Accepted risk. [init.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/init.test.ts#L495) and [runtime-wiring.test.ts](/Volumes/git/legotin/agent-badge/packages/core/src/init/runtime-wiring.test.ts#L146) do not yet prove preservation of a user-owned `@legotin/agent-badge` dependency for the review-identified edge case. This gap is documented in [26-REVIEW.md](/Volumes/git/legotin/agent-badge/.planning/phases/26-minimal-repo-scaffold-and-init-rewire/26-REVIEW.md#L59) and tracked in the Accepted Risks Log as `R-26-02`. | closed |
| T-26-02-03 | Denial of service | `packages/agent-badge/src/commands/release-readiness-matrix.test.ts` | mitigate | Closed by [release-readiness-matrix.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/release-readiness-matrix.test.ts#L157) and [release-readiness-matrix.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/release-readiness-matrix.test.ts#L394), which replaced stale package-script assumptions with assertions over the real minimal-artifact contract. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-26-01 | T-26-01-01 | Accepted to unblock Phase 26 while the manifest-cleanup ownership heuristic is revisited. Current behavior can remove a user-owned `@legotin/agent-badge` dependency if it looks tool-managed. | User | 2026-04-09 |
| R-26-02 | T-26-02-02 | Accepted to unblock Phase 26 while targeted regression coverage for the user-owned dependency case is deferred. Existing tests prove idempotency but not preservation for that edge case. | User | 2026-04-09 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-09 | 6 | 4 | 2 | Codex / `gsd-secure-phase` |
| 2026-04-09 | 6 | 6 | 0 | Codex / `gsd-secure-phase` |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-09
