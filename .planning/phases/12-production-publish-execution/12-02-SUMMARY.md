---
phase: 12-production-publish-execution
plan: 02
subsystem: release
tags: [release, npm, github-actions, auth, blocker]
requires:
  - phase: 11-registry-preflight-and-release-environment-validation
    provides: live preflight gate and workflow contract baseline
  - phase: 12-production-publish-execution
    plan: 01
    provides: release evidence contract and operator checklist
provides:
  - exact Phase 12 execution checkpoint with publish blockers and verified commits
  - release runbook correction for npm publish-capable auth requirements
affects:
  - 13-01
  - 13-02

tech-stack:
  added: []
  patterns: ["workflow-first publish with local fallback", "credential-gated release execution"]

key-files:
  created:
    - .planning/phases/12-production-publish-execution/12-02-SUMMARY.md
  modified:
    - docs/RELEASE.md
    - .github/workflows/release.yml
    - .changeset/config.json
    - packages/testkit/package.json
    - scripts/release/preflight.ts
    - scripts/release/preflight.test.ts

key-decisions:
  - "Exclude `@agent-badge/testkit` from production publish inventory and make preflight block if helper workspaces are publishable."
  - "Treat GitHub Actions publish as externally blocked until the repository provides real npm publish auth, not just a configured secret name."
  - "Treat local fallback publish as externally blocked until the maintainer supplies npm credentials that satisfy 2FA-enforced publish requirements."

requirements-completed:
  - REL-08 (repo-side gating and evidence contract)

duration: 0min
completed: 2026-03-31
status: completed
blockers: []
---

# Phase 12 Plan 02: Production publish execution checkpoint

**Phase 12 completed through the documented local fallback path after the workflow route was proven unusable and the publish surface was corrected.**

## Verified repo-side outcomes

- Fixed GitHub Actions workflow parsing by moving `HOME` setup out of job-level expression usage and into a shell step in `.github/workflows/release.yml`.
- Excluded `@agent-badge/testkit` from production publishes by setting `private: true` in `packages/testkit/package.json` and adding it to `.changeset/config.json` ignore rules.
- Hardened `scripts/release/preflight.ts` so Phase 12 now blocks if helper workspaces are publishable or if `.changeset/config.json` stops ignoring `@agent-badge/testkit`.
- Renamed the publishable runtime packages to `@legotin/agent-badge` and `@legotin/agent-badge-core`, keeping the installed CLI command name `agent-badge`.
- Bumped the publishable inventory to `1.1.1` so `create-agent-badge` could be republished cleanly after `1.1.0` had already been published during the earlier failed release attempt.
- Re-ran the repo-side release gate on commit `faf971258f3fdd262361091964c87fb1fc0f1403`:
  - `PATH="/opt/homebrew/bin:$PATH" npm run docs:check`
  - `npm run typecheck`
  - `npm_config_cache=/tmp/agent-badge-npm-cache npm run verify:clean-checkout` up to the clean-install proof; the quiet temp-project `npm install` remained slow, but all repo-owned checks, tarball pack checks, and targeted smoke assertions passed
  - `npm --silent run release:preflight -- --json > .planning/phases/12-production-publish-execution/12-preflight.json`

## Live publish evidence

- Saved preflight artifact `.planning/phases/12-production-publish-execution/12-preflight.json` reports `overallStatus: "warn"` on commit `faf971258f3fdd262361091964c87fb1fc0f1403`, with the only warning being that `create-agent-badge` already existed at `1.1.0` while the intended publish version was `1.1.1`.
- GitHub Actions auto-ran `Release` for pushed commit `24e1a32c8eef9250762930e00f65b9c79c200f97` as run `23807126103`.
- That workflow completed all setup and verification steps, then failed at `Version or publish`.
- The run log for `release/8_Version or publish.txt` showed:
  - `NPM_TOKEN:` empty in the workflow environment
  - only `agent-badge`, `@agent-badge/core`, and `create-agent-badge` were attempted
  - publish failed with npm auth errors, proving the repo-side inventory fix worked but repository-side publish auth still does not
- Local fallback publish was then completed successfully from the maintainer environment:
  - `npm run release` using a temporary npmrc backed by the working publish token published `@legotin/agent-badge@1.1.1`, `@legotin/agent-badge-core@1.1.1`, and `create-agent-badge@1.1.1`
  - local git tags were created for all three published packages
  - commit `faf971258f3fdd262361091964c87fb1fc0f1403` and the new tags were pushed to `origin/main`
  - npm public metadata for the new scoped packages lagged on `npm view`, but `npm access get status` returned `public` and `npm dist-tag ls` returned `latest: 1.1.1` for both scoped packages, which was used to complete the evidence capture

## Operator correction recorded

- `docs/RELEASE.md` now states that:
  - GitHub Actions `NPM_TOKEN` must be publish-capable, not merely present
  - local fallback publish requires credentials that satisfy npm publish 2FA requirements
  - `npm login` and `npm whoami` are insufficient proof that a real publish will succeed

## Remaining operator follow-up

- GitHub repository Actions still needs a real publish-capable npm credential or trusted publishing configuration if workflow-based publish should work in the future.
- `docs/RELEASE.md` now records the auth prerequisite discovered during execution, but the release workflow itself has not been repaired for unattended publish.
