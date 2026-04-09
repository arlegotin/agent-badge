---
phase: 23-post-publish-registry-verification-and-version-alignment
verified: 2026-04-05T19:22:12Z
status: passed
score: 5/5 must-haves verified
---

# Phase 23: post-publish-registry-verification-and-version-alignment Verification Report

**Phase Goal:** post-publish registry verification and version alignment for the released 1.1.3 surface.
**Verified:** 2026-04-05T19:22:12Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | The exact released registry artifacts install and run successfully from a clean temp directory for `1.1.3`. | ✓ VERIFIED | `22-PUBLISH-EVIDENCE.json` records all three published packages at `1.1.3`; `23-REGISTRY-SMOKE.json` records `status: passed`, `version: 1.1.3`, `runtime.status: passed`, and `initializer.status: passed`. |
| 2 | `npm init agent-badge@latest` resolves to the intended initializer and works for the released version. | ✓ VERIFIED | `23-LATEST-RESOLUTION.md` records `dist-tags.latest` = `1.1.3` for all three packages, `npm init agent-badge@latest`, exit code `0`, and creation of `.agent-badge/config.json`, `.agent-badge/state.json`, and `.git/hooks/pre-push`. |
| 3 | Phase 23 owns its post-publish smoke evidence instead of reusing Phase 13 filenames. | ✓ VERIFIED | `scripts/smoke/verify-registry-install.sh` exposes `--artifact-prefix`, preserves the `13-REGISTRY-SMOKE` default, and writes `${ARTIFACT_PREFIX}.json` and `${ARTIFACT_PREFIX}.md`; the phase contains `23-REGISTRY-SMOKE.json` and `23-REGISTRY-SMOKE.md`. |
| 4 | Published versions, dist-tags, internal dependency references, lockfile entries, and operator docs align with the public `1.1.3` release. | ✓ VERIFIED | Package manifests and `package-lock.json` are aligned to `1.1.3`; `docs/RELEASE.md` and `scripts/verify-docs.sh` both enforce the Phase 23 `1.1.3` smoke contract. |
| 5 | Phase 23 ends with one explicit alignment verdict and does not require a repair release. | ✓ VERIFIED | `23-VERSION-ALIGNMENT.md` concludes `Aligned with released 1.1.3`; `.changeset/23-registry-surface-repair.md` is absent, which is correct because the repair path is only required when smoke or latest-alias verification is blocked. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `scripts/smoke/verify-registry-install.sh` | Phase-owned registry smoke writer with backward-compatible naming | ✓ VERIFIED | Parses `--artifact-prefix`, stores `ARTIFACT_PREFIX`, keeps `13-REGISTRY-SMOKE` as default, and writes `${ARTIFACT_PREFIX}.json` and `${ARTIFACT_PREFIX}.md`. |
| `.planning/phases/23-post-publish-registry-verification-and-version-alignment/23-REGISTRY-SMOKE.json` | Machine-readable exact-version registry smoke result | ✓ VERIFIED | Contains `status`, `version`, `packages`, `runtime`, `initializer`, and `blockingIssue`; values show a passed `1.1.3` smoke run. |
| `.planning/phases/23-post-publish-registry-verification-and-version-alignment/23-REGISTRY-SMOKE.md` | Operator-readable exact-version registry smoke summary | ✓ VERIFIED | Records `Version: 1.1.3`, passed runtime and initializer status, and `Blocking issue: none`. |
| `.planning/phases/23-post-publish-registry-verification-and-version-alignment/23-LATEST-RESOLUTION.md` | Explicit `@latest` initializer resolution record | ✓ VERIFIED | Includes `## Registry view`, `## Latest initializer run`, `## Outcome`, and records `npm init agent-badge@latest` passing at `1.1.3`. |
| `package-lock.json` | Lockfile aligned to released manifest versions | ✓ VERIFIED | Publishable package entries show `1.1.3` and internal ranges `^1.1.3`. |
| `packages/core/package.json` | Core package aligned to release | ✓ VERIFIED | Version is `1.1.3`. |
| `packages/agent-badge/package.json` | Runtime package aligned to release | ✓ VERIFIED | Version is `1.1.3` and depends on `@legotin/agent-badge-core` `^1.1.3`. |
| `packages/create-agent-badge/package.json` | Initializer package aligned to release | ✓ VERIFIED | Version is `1.1.3` and depends on `@legotin/agent-badge` `^1.1.3`. |
| `docs/RELEASE.md` | Current post-publish runbook | ✓ VERIFIED | Names the Phase 23 smoke command, `23-REGISTRY-SMOKE.json`, `23-REGISTRY-SMOKE.md`, `23-LATEST-RESOLUTION.md`, and the completion rule. |
| `scripts/verify-docs.sh` | Enforcement for the Phase 23 docs contract | ✓ VERIFIED | Requires the Phase 23 artifact names, smoke command, and completion wording. |
| `.planning/phases/23-post-publish-registry-verification-and-version-alignment/23-VERSION-ALIGNMENT.md` | Final alignment verdict | ✓ VERIFIED | Contains `## Registry truth`, `## Local repo alignment`, `## Docs alignment`, `## Final verdict`, and the aligned verdict. |
| `.changeset/23-registry-surface-repair.md` | Repair-release input if smoke remains blocked | N/A | Not required because the saved smoke and latest-alias artifacts both passed and the final verdict is aligned. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `22-PUBLISH-EVIDENCE.json` | `23-REGISTRY-SMOKE.json` | Released-version authority | ✓ VERIFIED | Phase 22 evidence records all three published package versions as `1.1.3`; the Phase 23 smoke artifact uses the same exact released version. |
| `scripts/smoke/verify-registry-install.sh` | `23-REGISTRY-SMOKE.json` / `23-REGISTRY-SMOKE.md` | `--artifact-prefix` and `write_evidence()` | ✓ VERIFIED | The script writes `${ARTIFACT_PREFIX}.json` and `${ARTIFACT_PREFIX}.md`, enabling Phase 23-owned evidence without breaking the Phase 13 default. |
| `docs/RELEASE.md` | `23-LATEST-RESOLUTION.md` | Post-publish contract | ✓ VERIFIED | The runbook requires Phase 23 completion only when smoke passes and `23-LATEST-RESOLUTION.md` confirms `npm init agent-badge@latest` still resolves correctly. |
| `23-REGISTRY-SMOKE.json` | `23-VERSION-ALIGNMENT.md` | Final verdict uses smoke result | ✓ VERIFIED | `23-VERSION-ALIGNMENT.md` explicitly cites the saved exact-version smoke status as `passed`. |
| `23-LATEST-RESOLUTION.md` | `23-VERSION-ALIGNMENT.md` | Final verdict uses latest-alias result | ✓ VERIFIED | `23-VERSION-ALIGNMENT.md` explicitly cites `npm init agent-badge@latest` passing at `1.1.3`. |
| `22-PUBLISH-EVIDENCE.json` | manifests, lockfile, and docs | Release truth propagated locally | ✓ VERIFIED | Published version `1.1.3` in Phase 22 matches all three manifests, the lockfile, docs, and the final alignment artifact. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `23-REGISTRY-SMOKE.json` | `status`, `version`, `runtime.status`, `initializer.status` | `scripts/smoke/verify-registry-install.sh` running real `npm install`, `agent-badge init`, imports, and optional initializer smoke | Yes | ✓ FLOWING |
| `23-LATEST-RESOLUTION.md` | registry versions, `dist-tags.latest`, latest-init outcome | Saved outputs from `npm view ... --json` and clean-room `npm init agent-badge@latest` run | Yes | ✓ FLOWING |
| `23-VERSION-ALIGNMENT.md` | final verdict | Derived from smoke evidence, latest-resolution evidence, manifests, lockfile, docs, and docs check result | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Smoke script is syntactically valid | `bash -n scripts/smoke/verify-registry-install.sh` | Exit `0` | ✓ PASS |
| Docs contract is enforced | `npm run docs:check` | Exit `0`; documentation verification passed | ✓ PASS |
| Release authority is exactly `1.1.3` | `node --input-type=module -e "...22-PUBLISH-EVIDENCE.json..."` | Parsed all Phase 22 published packages as `1.1.3` | ✓ PASS |
| Saved smoke evidence represents a passing run | `node --input-type=module -e "...23-REGISTRY-SMOKE.json..."` | Parsed `status: passed`, `runtime: passed`, `initializer: passed`, `blockingIssue: null` | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `REG-01` | `23-01`, `23-02` | A clean temp-directory smoke check passes for the exact released version, including runtime packages and `npm init agent-badge@latest`. | ✓ SATISFIED | `23-REGISTRY-SMOKE.json`, `23-REGISTRY-SMOKE.md`, and `23-LATEST-RESOLUTION.md` capture a passed `1.1.3` exact-version smoke and a passed `npm init agent-badge@latest` check. |
| `REG-02` | `23-01`, `23-02` | Published versions, dist-tags, internal dependency references, and operator docs align with npm immediately after release. | ✓ SATISFIED | `22-PUBLISH-EVIDENCE.json`, the three package manifests, `package-lock.json`, `docs/RELEASE.md`, `scripts/verify-docs.sh`, and `23-VERSION-ALIGNMENT.md` all align to public `1.1.3`. |

### Anti-Patterns Found

No blocking anti-patterns found in the phase-touched files. Pattern scans only hit benign literals (`mktemp ... XXXXXX` and a lockfile integrity hash containing `XXX`), not placeholders or stub implementations.

### Gaps Summary

No gaps found. Phase 23 achieves its goal: it preserves phase-owned post-publish registry proof for the released `1.1.3` surface, records the `@latest` initializer outcome separately, aligns repo/docs state to the public release, and closes with an explicit aligned verdict. `REG-01` and `REG-02` are satisfied.

---

_Verified: 2026-04-05T19:22:12Z_
_Verifier: Claude (gsd-verifier)_
