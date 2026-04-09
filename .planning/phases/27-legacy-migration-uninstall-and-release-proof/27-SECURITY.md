---
phase: 27
slug: legacy-migration-uninstall-and-release-proof
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-09
---

# Phase 27 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| legacy repo manifest and hook content -> cleanup logic | Migration cleanup must remove only managed legacy runtime markers and preserve user-owned content. | Existing `package.json` scripts and dependencies, legacy hook bodies, custom hook lines |
| persisted publish state -> migration reporting | Legacy-to-shared transitions must preserve gist identity and badge continuity while switching publish mode. | `gistId`, `badgeUrl`, shared-mode migration messages |
| command output -> operator recovery decisions | Status/doctor/init/publish/refresh output guides high-risk migration and recovery actions. | Recovery reason codes, migration status lines, original-publisher guidance |
| implementation truth -> docs | Public docs must match the shared-runtime/minimal-artifact default and avoid stale repo-local guidance. | Setup instructions, uninstall and recovery instructions |
| docs verification -> release confidence | `scripts/verify-docs.sh` guards must block stale wording from re-entering the default operator flow. | Fixed-string checks, denylist checks |
| published package behavior -> smoke scripts | Registry smoke must validate the real initializer contract, not historical repo-local binary assumptions. | Init-generated scaffold, hook content, managed manifest ownership checks |
| direct package-install proof -> initializer proof | Packed-install smoke and initializer smoke must stay explicitly separated to avoid false release confidence. | Tarball install checks, registry initializer checks, clean-checkout comments |
| release checklist -> operator release decision | Maintainer docs must point to the authoritative initializer smoke command and artifacts. | `--check-initializer`, `REGISTRY-SMOKE` evidence files |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-27-01-01 | Tampering | `packages/core/src/init/runtime-wiring.ts`, `packages/core/src/init/runtime-wiring.test.ts` | mitigate | Closed by ownership-preservation regression coverage in [runtime-wiring.test.ts](/Volumes/git/legotin/agent-badge/packages/core/src/init/runtime-wiring.test.ts#L288), [runtime-wiring.test.ts](/Volumes/git/legotin/agent-badge/packages/core/src/init/runtime-wiring.test.ts#L582), and [init.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/init.test.ts#L633), which verifies user-owned `@legotin/agent-badge` dependencies are preserved when managed script ownership is absent. | closed |
| T-27-01-02 | Integrity | `packages/agent-badge/src/commands/init.ts`, `publish.test.ts`, `refresh.test.ts` | mitigate | Closed by migration-report assertions in [publish.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/publish.test.ts#L841), [publish.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/publish.test.ts#L895), [refresh.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/refresh.test.ts#L1108), [refresh.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/refresh.test.ts#L1189), and legacy `gistId`/`badgeUrl` continuity checks in [init.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/init.test.ts#L973), [init.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/init.test.ts#L1001), [init.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/init.test.ts#L1004). | closed |
| T-27-01-03 | Repudiation | `status.ts`, `doctor.ts`, `uninstall.ts` | mitigate | Closed by aligned recovery and migration evidence in [status.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/status.test.ts#L232), [doctor.test.ts](/Volumes/git/legotin/agent-badge/packages/core/src/diagnostics/doctor.test.ts#L491), and managed-hook-removal coverage that preserves custom lines in [uninstall.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/uninstall.test.ts#L206). | closed |
| T-27-02-01 | Denial of service | README and user docs | mitigate | Closed by shared-runtime/default-init wording in [README.md](/Volumes/git/legotin/agent-badge/README.md#L35), [docs/INSTALL.md](/Volumes/git/legotin/agent-badge/docs/INSTALL.md#L3), [docs/QUICKSTART.md](/Volumes/git/legotin/agent-badge/docs/QUICKSTART.md#L5), [docs/CLI.md](/Volumes/git/legotin/agent-badge/docs/CLI.md#L3), and [docs/HOW-IT-WORKS.md](/Volumes/git/legotin/agent-badge/docs/HOW-IT-WORKS.md#L5), plus stale-language denylist guards in [verify-docs.sh](/Volumes/git/legotin/agent-badge/scripts/verify-docs.sh#L154). | closed |
| T-27-02-02 | Tampering | `docs/UNINSTALL.md`, `docs/RECOVERY.md`, `docs/MANUAL-GIST.md` | mitigate | Closed by uninstall and recovery guidance aligned to current behavior in [UNINSTALL.md](/Volumes/git/legotin/agent-badge/docs/UNINSTALL.md#L3), [RECOVERY.md](/Volumes/git/legotin/agent-badge/docs/RECOVERY.md#L26), [RECOVERY.md](/Volumes/git/legotin/agent-badge/docs/RECOVERY.md#L107), and [MANUAL-GIST.md](/Volumes/git/legotin/agent-badge/docs/MANUAL-GIST.md#L29). | closed |
| T-27-02-03 | Integrity | `scripts/verify-docs.sh` | mitigate | Closed by fixed-string and denylist gates that enforce shared-runtime vocabulary and reject stale repo-local wording in [verify-docs.sh](/Volumes/git/legotin/agent-badge/scripts/verify-docs.sh#L127), [verify-docs.sh](/Volumes/git/legotin/agent-badge/scripts/verify-docs.sh#L134), [verify-docs.sh](/Volumes/git/legotin/agent-badge/scripts/verify-docs.sh#L155), [verify-docs.sh](/Volumes/git/legotin/agent-badge/scripts/verify-docs.sh#L157). | closed |
| T-27-03-01 | Integrity | `scripts/smoke/verify-registry-install.sh` | mitigate | Closed by initializer-contract assertions in [verify-registry-install.sh](/Volumes/git/legotin/agent-badge/scripts/smoke/verify-registry-install.sh#L361), [verify-registry-install.sh](/Volumes/git/legotin/agent-badge/scripts/smoke/verify-registry-install.sh#L373), and [verify-registry-install.sh](/Volumes/git/legotin/agent-badge/scripts/smoke/verify-registry-install.sh#L385), plus release-readiness regression checks in [release-readiness-matrix.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/release-readiness-matrix.test.ts#L173) and [index.test.ts](/Volumes/git/legotin/agent-badge/packages/create-agent-badge/src/index.test.ts#L96). | closed |
| T-27-03-02 | Denial of service | `scripts/smoke/verify-packed-install.sh`, `scripts/verify-clean-checkout.sh` | mitigate | Closed by preserving explicit direct-runtime tarball proof in [verify-packed-install.sh](/Volumes/git/legotin/agent-badge/scripts/smoke/verify-packed-install.sh#L79) and explicit separation from initializer smoke in [verify-clean-checkout.sh](/Volumes/git/legotin/agent-badge/scripts/verify-clean-checkout.sh#L34) and [verify-clean-checkout.sh](/Volumes/git/legotin/agent-badge/scripts/verify-clean-checkout.sh#L35). | closed |
| T-27-03-03 | Repudiation | `docs/maintainers/RELEASE.md` | mitigate | Closed by release-checklist authority on published-version initializer smoke in [RELEASE.md](/Volumes/git/legotin/agent-badge/docs/maintainers/RELEASE.md#L95), [RELEASE.md](/Volumes/git/legotin/agent-badge/docs/maintainers/RELEASE.md#L98), and [RELEASE.md](/Volumes/git/legotin/agent-badge/docs/maintainers/RELEASE.md#L106), including required `REGISTRY-SMOKE` evidence artifacts. | closed |

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
| 2026-04-09 | 9 | 9 | 0 | Codex / `gsd-secure-phase` |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-09
