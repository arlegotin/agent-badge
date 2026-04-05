# Phase 22: trusted-publish-execution-and-evidence-capture - Research

**Researched:** 2026-04-05
**Domain:** Trusted npm publishing via GitHub Actions, release reconciliation, and evidence capture
**Confidence:** MEDIUM

<user_constraints>
## User Constraints

- No `CONTEXT.md` exists for this phase. [VERIFIED: `node ~/.codex/get-shit-done/bin/gsd-tools.cjs init phase-op '22-trusted-publish-execution-and-evidence-capture'` returned `"has_context": false`]
- Keep research focused on Phase 22 only; do not expand into Phase 23 registry smoke or Phase 24 closeout. [VERIFIED: user prompt additional context]
- Use the roadmap, requirements, prior shipped publish phases, and current Phase 21 blocker evidence as the planning source of truth. [VERIFIED: user prompt additional context]
- Follow `AGENTS.md` and existing GSD artifact conventions. [VERIFIED: [AGENTS.md](../../../../AGENTS.md)]
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PUB-01 | The maintained GitHub Actions trusted-publishing workflow can publish the current source for `@legotin/agent-badge-core`, `@legotin/agent-badge`, and `create-agent-badge` without a local CLI publish fallback. [VERIFIED: [.planning/REQUIREMENTS.md](../../REQUIREMENTS.md)] | The current workflow already encodes the canonical path (`push` to `main` plus `workflow_dispatch`, `id-token: write`, auto-impact detection, auto-version bump, and `changeset publish`), but the local branch is behind a known remote-tracking release commit `db3ff4f chore(release): publish 1.1.3`, so planning must reconcile source-of-truth before triggering any new publish. [VERIFIED: [.github/workflows/release.yml](../../../../.github/workflows/release.yml); VERIFIED: `git branch -avv`; VERIFIED: `git log --oneline HEAD..origin/main`; VERIFIED: `git show --stat db3ff4f`] |
| PUB-02 | Release evidence records the exact workflow run, published version, and package/version alignment for the real production publish. [VERIFIED: [.planning/REQUIREMENTS.md](../../REQUIREMENTS.md)] | The repo already has a repo-owned evidence writer (`release:evidence`) and existing evidence conventions from Phases 12-13, but there is no Phase 22 evidence artifact yet and no recorded run ID for the apparent `1.1.3` release, so the plan must recover the exact run metadata before declaring the phase complete. [VERIFIED: [scripts/release/capture-publish-evidence.ts](../../../../scripts/release/capture-publish-evidence.ts); VERIFIED: [docs/RELEASE.md](../../../../docs/RELEASE.md); VERIFIED: `find .planning/phases/22-trusted-publish-execution-and-evidence-capture -maxdepth 2 -type f`; VERIFIED: `npm view @legotin/agent-badge version dist-tags.latest --json`] |
</phase_requirements>

## Summary

Phase 22 should not be planned as a blind “run the workflow now” release. The strongest current evidence is that npm already shows `1.1.3` for all three publishable packages, each published at `2026-04-05T16:46:35Z`, while the local working branch still declares `1.1.2` and is `behind 1` relative to the locally known `origin/main`, which points to `db3ff4f chore(release): publish 1.1.3`. [VERIFIED: `npm view @legotin/agent-badge version dist-tags.latest --json`; VERIFIED: `npm view @legotin/agent-badge time --json | rg '"1.1.3"'`; VERIFIED: `npm view @legotin/agent-badge-core version dist-tags.latest --json`; VERIFIED: `npm view create-agent-badge version dist-tags.latest --json`; VERIFIED: `git branch -avv`; VERIFIED: `git log --oneline HEAD..origin/main`; VERIFIED: `git show --stat db3ff4f`]

That means the highest-value Phase 22 plan is: first reconcile branch truth, then recover the exact GitHub Actions run metadata and write formal evidence for the already-published `1.1.3` release, and only trigger a new workflow publish if that reconciliation proves `1.1.3` was not the canonical trusted-publishing run for the current milestone. Triggering `workflow_dispatch` or pushing publishable changes from the stale local branch before reconciliation would likely create an unnecessary `1.1.4`, because the workflow reads the registry version and auto-bumps from the higher of registry or manifest state. [VERIFIED: [scripts/release/auto-version.ts](../../../../scripts/release/auto-version.ts); VERIFIED: [.github/workflows/release.yml](../../../../.github/workflows/release.yml); VERIFIED: [.planning/ROADMAP.md](../../ROADMAP.md); CITED: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow]

The existing repo architecture is already close to sufficient. The maintained workflow is on the OIDC path, the repo has purpose-built preflight, impact, version, and evidence scripts, and the test suite covers those local mechanics. The missing proof is external and phase-specific: exact workflow run URL/ID/conclusion for `1.1.3`, confirmation that the release commit and manifests align, and a phase-owned evidence file in the new Phase 22 directory. [VERIFIED: [.github/workflows/release.yml](../../../../.github/workflows/release.yml); VERIFIED: [scripts/release/preflight.ts](../../../../scripts/release/preflight.ts); VERIFIED: [scripts/release/publish-impact.ts](../../../../scripts/release/publish-impact.ts); VERIFIED: [scripts/release/auto-version.ts](../../../../scripts/release/auto-version.ts); VERIFIED: [scripts/release/capture-publish-evidence.ts](../../../../scripts/release/capture-publish-evidence.ts); VERIFIED: [scripts/release/preflight.test.ts](../../../../scripts/release/preflight.test.ts); VERIFIED: [scripts/release/auto-version.test.ts](../../../../scripts/release/auto-version.test.ts); VERIFIED: [scripts/release/publish-impact.test.ts](../../../../scripts/release/publish-impact.test.ts); VERIFIED: [scripts/release/capture-publish-evidence.test.ts](../../../../scripts/release/capture-publish-evidence.test.ts)]

**Primary recommendation:** Reconcile local `main` with the locally known `origin/main` release commit `db3ff4f`, recover the exact GitHub Actions run that produced `1.1.3`, and treat Phase 22 as evidence capture for that release unless that run cannot be verified. [VERIFIED: `git branch -avv`; VERIFIED: `git log --oneline HEAD..origin/main`; VERIFIED: `npm view @legotin/agent-badge version dist-tags.latest --json`]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| GitHub Actions release workflow | `actions/checkout@v6`, `actions/setup-node@v6`, Node `24.x` in the workflow. [VERIFIED: [.github/workflows/release.yml](../../../../.github/workflows/release.yml)] | Canonical production publish path for this repo. [VERIFIED: [.planning/REQUIREMENTS.md](../../REQUIREMENTS.md); VERIFIED: [.planning/ROADMAP.md](../../ROADMAP.md)] | npm trusted-publishing docs still require GitHub Actions on GitHub-hosted runners with `id-token: write`; the repo workflow already matches that contract. [CITED: https://docs.npmjs.com/trusted-publishers/; CITED: https://docs.github.com/en/actions/reference/security/oidc; VERIFIED: [.github/workflows/release.yml](../../../../.github/workflows/release.yml)] |
| npm CLI trusted publishing | Minimum supported by npm docs: npm `11.5.1+`, Node `22.14.0+`; local environment has npm `11.6.0` and Node `v22.14.0`. [CITED: https://docs.npmjs.com/trusted-publishers/; VERIFIED: `npm --version`; VERIFIED: `node --version`] | OIDC-backed publish auth during `npm publish`. [CITED: https://docs.npmjs.com/trusted-publishers/] | This phase must prove the trusted-publishing path, not fall back to long-lived tokens or local CLI publish. [VERIFIED: [.planning/REQUIREMENTS.md](../../REQUIREMENTS.md); CITED: https://docs.npmjs.com/trusted-publishers/] |
| `@changesets/cli` | Repo pin `^2.29.0`; current registry `2.30.0` published `2026-03-03`. [VERIFIED: [package.json](../../../../package.json); VERIFIED: `npm view @changesets/cli version time --json`] | Actual publish command (`changeset publish`) once versions are prepared. [VERIFIED: [package.json](../../../../package.json)] | Reusing the repo’s current publish primitive avoids reopening release architecture during an evidence phase. [VERIFIED: [package.json](../../../../package.json); VERIFIED: [.github/workflows/release.yml](../../../../.github/workflows/release.yml)] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` | Repo pin `^4.20.0`; local version prints `4.21.0`; current registry `4.21.0`. [VERIFIED: [package.json](../../../../package.json); VERIFIED: `npm exec -- tsx --version`; VERIFIED: `npm view tsx version time --json`] | Runs repo-owned release helper scripts. [VERIFIED: [package.json](../../../../package.json)] | Use for preflight, impact, version, and evidence scripts, but plan around the known sandbox IPC `EPERM` caveat for this environment. [VERIFIED: `npm exec -- tsx --version`; VERIFIED: [.planning/STATE.md](../../STATE.md)] |
| `vitest` | Repo pin `^3.2.0`; local installed version `3.2.4`; current registry `4.1.2`. [VERIFIED: [package.json](../../../../package.json); VERIFIED: `npm exec -- vitest --version`; VERIFIED: `npm view vitest version time --json`] | Fast unit coverage for release helpers. [VERIFIED: [vitest.config.ts](../../../../vitest.config.ts)] | Use the repo-installed `3.2.4` line for Phase 22 verification; a major-version test-runner upgrade is out of scope for this phase. [VERIFIED: [package.json](../../../../package.json); VERIFIED: `npm exec -- vitest --version`] |
| GitHub web UI / REST workflow controls | `workflow_dispatch` is documented; local `gh` is missing. [CITED: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow; VERIFIED: `gh --version | head -1`] | Manual recovery run and run-metadata lookup when no local CLI is available. [CITED: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow] | Use this as the fallback path for exact run URL/ID retrieval in this environment. [CITED: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow; VERIFIED: `gh --version | head -1`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reconcile and capture evidence for the already-visible `1.1.3` release. [VERIFIED: `npm view @legotin/agent-badge version dist-tags.latest --json`; VERIFIED: `git log --oneline HEAD..origin/main`] | Trigger a fresh `workflow_dispatch` or new `main` publish from the stale local branch. [CITED: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow] | The fresh run would likely publish `1.1.4`, because the workflow reads the higher registry version and auto-bumps from there, which would blur whether PUB-01/PUB-02 were already satisfied by `1.1.3`. [VERIFIED: [scripts/release/auto-version.ts](../../../../scripts/release/auto-version.ts); VERIFIED: [.github/workflows/release.yml](../../../../.github/workflows/release.yml)] |
| Repo-owned custom workflow plus `changeset publish`. [VERIFIED: [.github/workflows/release.yml](../../../../.github/workflows/release.yml); VERIFIED: [package.json](../../../../package.json)] | `changesets/action@v1` with `NPM_TOKEN`. [CITED: https://github.com/changesets/action] | The official `changesets/action` publishing example still assumes `NPM_TOKEN`, while this repo’s active production contract is npm trusted publishing via OIDC. [CITED: https://github.com/changesets/action; CITED: https://docs.npmjs.com/trusted-publishers/; VERIFIED: [.planning/STATE.md](../../STATE.md)] |

**Installation:** No new package installation is recommended for Phase 22; use the repo-pinned toolchain already wired into CI and the release workflow. [VERIFIED: [package.json](../../../../package.json); VERIFIED: [.github/workflows/ci.yml](../../../../.github/workflows/ci.yml); VERIFIED: [.github/workflows/release.yml](../../../../.github/workflows/release.yml)]

## Architecture Patterns

### Recommended Project Structure

```text
.github/workflows/release.yml                   # Canonical publish path
scripts/release/preflight.ts                    # Local gate and blocker taxonomy
scripts/release/publish-impact.ts               # Skip-loop prevention for non-publishable pushes
scripts/release/auto-version.ts                 # Lockstep version bump from registry/source state
scripts/release/capture-publish-evidence.ts     # Durable publish evidence writer
.planning/phases/22-.../22-RESEARCH.md          # Planner-facing research
.planning/phases/22-.../22-PUBLISH-EVIDENCE.*   # Phase 22 evidence target
```

### Pattern 1: Reconcile Branch Truth Before Any New Publish
**What:** Check `HEAD`, `origin/main`, registry versions, and the release commit history before triggering a release. [VERIFIED: `git branch -avv`; VERIFIED: `git log --oneline HEAD..origin/main`; VERIFIED: `npm view @legotin/agent-badge version dist-tags.latest --json`]
**When to use:** At the start of Phase 22, because local `main` is currently ahead by planning commits and behind by one remote-tracking release commit. [VERIFIED: `git branch -avv`]
**Example:**
```bash
# Source: repo + git state
git branch -avv
git log --oneline HEAD..origin/main
npm view @legotin/agent-badge version dist-tags.latest --json
```

### Pattern 2: Treat Local Preflight as Advisory, Not as Trusted-Publisher Proof
**What:** Keep `release:preflight` as the local gate, but do not let `npm whoami` be the deciding proof for OIDC publish readiness. [VERIFIED: [scripts/release/preflight.ts](../../../../scripts/release/preflight.ts); CITED: https://docs.npmjs.com/trusted-publishers/]
**When to use:** Before evidence capture and before deciding whether a new publish is actually required. [VERIFIED: [docs/RELEASE.md](../../../../docs/RELEASE.md)]
**Example:**
```bash
# Source: docs/RELEASE.md
npm --silent run release:preflight -- --json > .planning/phases/22-trusted-publish-execution-and-evidence-capture/22-preflight.json
```

### Pattern 3: Capture Evidence Against the Exact Released Commit and Workflow Run
**What:** Evidence must bind together workflow run URL/ID, commit SHA, published version, and registry-visible package results. [VERIFIED: [scripts/release/capture-publish-evidence.ts](../../../../scripts/release/capture-publish-evidence.ts); VERIFIED: [.planning/REQUIREMENTS.md](../../REQUIREMENTS.md)]
**When to use:** Immediately after identifying the exact `1.1.3` GitHub Actions run, or immediately after a new release if reconciliation disproves the existing one. [VERIFIED: [docs/RELEASE.md](../../../../docs/RELEASE.md); VERIFIED: `npm view @legotin/agent-badge version dist-tags.latest --json`]
**Example:**
```bash
# Source: docs/RELEASE.md + package.json
npm run release:evidence -- \
  --phase-dir .planning/phases/22-trusted-publish-execution-and-evidence-capture \
  --publish-path github-actions \
  --preflight-json .planning/phases/22-trusted-publish-execution-and-evidence-capture/22-preflight.json \
  --workflow-run-url <workflow-url> \
  --workflow-run-id <workflow-run-id> \
  --workflow-run-conclusion success \
  --published-at <ISO8601>
```

### Anti-Patterns to Avoid

- **Do not trigger a new release before reconciling local `main` with `origin/main`.** That is the shortest path to an unnecessary `1.1.4`. [VERIFIED: `git branch -avv`; VERIFIED: [scripts/release/auto-version.ts](../../../../scripts/release/auto-version.ts)]
- **Do not treat `npm whoami` failure as proof that trusted publishing cannot work.** npm documents that OIDC auth is only exercised during `npm publish`, and `npm whoami` does not reflect that status. [CITED: https://docs.npmjs.com/trusted-publishers/]
- **Do not close PUB-02 with commit SHA plus npm timestamps alone.** The requirement explicitly asks for the exact workflow run. [VERIFIED: [.planning/REQUIREMENTS.md](../../REQUIREMENTS.md)]
- **Do not switch back to local CLI publish for convenience.** That would contradict the milestone requirement and the release contract in the docs. [VERIFIED: [.planning/REQUIREMENTS.md](../../REQUIREMENTS.md); VERIFIED: [docs/RELEASE.md](../../../../docs/RELEASE.md)]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| npm publish authentication | Custom OIDC token exchange or revived `NPM_TOKEN` automation. [CITED: https://docs.npmjs.com/trusted-publishers/; CITED: https://github.com/changesets/action] | npm trusted publishers plus GitHub Actions `id-token: write`. [CITED: https://docs.npmjs.com/trusted-publishers/; CITED: https://docs.github.com/en/actions/reference/security/oidc] | npm already handles the short-lived credential exchange during `npm publish`, and the docs recommend trusted publishing over long-lived tokens. [CITED: https://docs.npmjs.com/trusted-publishers/] |
| Publish/no-publish gating | Ad hoc git-diff shell logic in the workflow. [VERIFIED: [.github/workflows/release.yml](../../../../.github/workflows/release.yml)] | `scripts/release/publish-impact.ts`. [VERIFIED: [scripts/release/publish-impact.ts](../../../../scripts/release/publish-impact.ts)] | The repo already knows which files count as publishable inputs and excludes test-only noise. [VERIFIED: [scripts/release/publish-impact.ts](../../../../scripts/release/publish-impact.ts); VERIFIED: [scripts/release/publish-impact.test.ts](../../../../scripts/release/publish-impact.test.ts)] |
| Version alignment | Manual manifest editing during release. [VERIFIED: [packages/core/package.json](../../../../packages/core/package.json); VERIFIED: [packages/create-agent-badge/package.json](../../../../packages/create-agent-badge/package.json)] | `scripts/release/auto-version.ts` plus `changeset publish`. [VERIFIED: [scripts/release/auto-version.ts](../../../../scripts/release/auto-version.ts); VERIFIED: [package.json](../../../../package.json)] | The helper keeps all three publishable manifests and internal dependency ranges in lockstep. [VERIFIED: [scripts/release/auto-version.ts](../../../../scripts/release/auto-version.ts); VERIFIED: [scripts/release/auto-version.test.ts](../../../../scripts/release/auto-version.test.ts)] |
| Release proof | Terminal-history recollection or handwritten notes. [VERIFIED: [.planning/REQUIREMENTS.md](../../REQUIREMENTS.md)] | `scripts/release/capture-publish-evidence.ts` writing JSON and Markdown evidence. [VERIFIED: [scripts/release/capture-publish-evidence.ts](../../../../scripts/release/capture-publish-evidence.ts)] | PUB-02 needs durable, replayable evidence bound to workflow metadata, git SHA, and registry results. [VERIFIED: [.planning/REQUIREMENTS.md](../../REQUIREMENTS.md); VERIFIED: [scripts/release/capture-publish-evidence.ts](../../../../scripts/release/capture-publish-evidence.ts)] |

**Key insight:** This phase is not blocked by missing release machinery; it is blocked by source-of-truth reconciliation and missing external proof for the exact `1.1.3` run. [VERIFIED: [.github/workflows/release.yml](../../../../.github/workflows/release.yml); VERIFIED: `git branch -avv`; VERIFIED: `find .planning/phases/22-trusted-publish-execution-and-evidence-capture -maxdepth 2 -type f`]

## Common Pitfalls

### Pitfall 1: Publishing From the Wrong Branch State
**What goes wrong:** A maintainer triggers the workflow from the local `1.1.2` branch state and accidentally creates `1.1.4`. [VERIFIED: `git branch -avv`; VERIFIED: `npm view @legotin/agent-badge version dist-tags.latest --json`; VERIFIED: [scripts/release/auto-version.ts](../../../../scripts/release/auto-version.ts)]
**Why it happens:** The workflow reads the higher registry version before bumping, and local `main` is behind the remote-tracking release commit. [VERIFIED: [scripts/release/auto-version.ts](../../../../scripts/release/auto-version.ts); VERIFIED: `git branch -avv`]
**How to avoid:** Make branch reconciliation the first task in the plan and refuse to publish until the exact source commit for `1.1.3` is identified. [VERIFIED: `git log --oneline HEAD..origin/main`; VERIFIED: `git show --stat db3ff4f`]
**Warning signs:** `git branch -avv` shows `behind 1`, and `npm view` shows a higher version than local manifests. [VERIFIED: `git branch -avv`; VERIFIED: `npm view @legotin/agent-badge version dist-tags.latest --json`; VERIFIED: `node -e "const p=require('./packages/agent-badge/package.json'); console.log(p.version)"`]

### Pitfall 2: Treating `npm whoami` as Trusted-Publisher Readiness Proof
**What goes wrong:** The plan stops too early because local `npm whoami` looks blocked even though OIDC publish could still succeed. [CITED: https://docs.npmjs.com/trusted-publishers/]
**Why it happens:** npm documents that trusted-publishing OIDC auth is limited to `npm publish`, and `npm whoami` will not reflect it. [CITED: https://docs.npmjs.com/trusted-publishers/]
**How to avoid:** Keep `release:preflight` for blocker vocabulary, but use the actual GitHub Actions run as the authority for PUB-01. [VERIFIED: [scripts/release/preflight.ts](../../../../scripts/release/preflight.ts); VERIFIED: [.planning/REQUIREMENTS.md](../../REQUIREMENTS.md)]
**Warning signs:** Phase 21 preflight is blocked on `npm auth` while npm registry and the remote-tracking branch already indicate a release happened. [VERIFIED: [.planning/phases/21-external-release-blocker-audit-and-gate-repair/21-preflight.json](../21-external-release-blocker-audit-and-gate-repair/21-preflight.json); VERIFIED: `git log --oneline HEAD..origin/main`; VERIFIED: `npm view @legotin/agent-badge version dist-tags.latest --json`]

### Pitfall 3: Missing Per-Package Trusted-Publisher Scope
**What goes wrong:** One package is misconfigured on npm even though the workflow looks correct in git. [CITED: https://docs.npmjs.com/trusted-publishers/]
**Why it happens:** npm requires trusted-publisher configuration per package, and each package can only have one trusted publisher at a time. [CITED: https://docs.npmjs.com/trusted-publishers/]
**How to avoid:** Include a manual npm settings check for all three packages as a distinct checklist item before closing the phase. [CITED: https://docs.npmjs.com/trusted-publishers/; VERIFIED: [.planning/REQUIREMENTS.md](../../REQUIREMENTS.md)]
**Warning signs:** The workflow is OIDC-correct in git, but publish evidence is missing or one package does not align in the registry. [VERIFIED: [.github/workflows/release.yml](../../../../.github/workflows/release.yml); VERIFIED: `find .planning/phases/22-trusted-publish-execution-and-evidence-capture -maxdepth 2 -type f`]

### Pitfall 4: Capturing Evidence Against the Wrong Commit
**What goes wrong:** Evidence is recorded from the current local `HEAD` instead of the actual released commit. [VERIFIED: [scripts/release/capture-publish-evidence.ts](../../../../scripts/release/capture-publish-evidence.ts); VERIFIED: `git rev-parse HEAD`; VERIFIED: `git show --no-patch --format=fuller db3ff4f`]
**Why it happens:** The evidence script records `git rev-parse HEAD`, so running it on the wrong checkout produces technically valid but phase-invalid evidence. [VERIFIED: [scripts/release/capture-publish-evidence.ts](../../../../scripts/release/capture-publish-evidence.ts)]
**How to avoid:** Run evidence capture only from a checkout aligned to the released commit, or check out the exact released commit before running the evidence writer. [VERIFIED: [scripts/release/capture-publish-evidence.ts](../../../../scripts/release/capture-publish-evidence.ts); VERIFIED: [.planning/REQUIREMENTS.md](../../REQUIREMENTS.md)]
**Warning signs:** `gitSha` in evidence would equal local `ea5e274...` while the known release commit is `db3ff4f...`. [VERIFIED: `git rev-parse HEAD`; VERIFIED: `git show --no-patch --format=fuller db3ff4f`]

## Code Examples

Verified patterns from official and repo sources:

### OIDC Permission Minimum
```yaml
# Source: https://docs.github.com/en/actions/reference/security/oidc
permissions:
  id-token: write
  contents: read
```

### Repo Release Contract Skeleton
```yaml
# Source: .github/workflows/release.yml
on:
  workflow_dispatch:
  push:
    branches:
      - main

permissions:
  contents: write
  id-token: write
```

### Evidence Capture Command Shape
```bash
# Source: docs/RELEASE.md
npm run release:evidence -- \
  --phase-dir .planning/phases/22-trusted-publish-execution-and-evidence-capture \
  --publish-path github-actions \
  --preflight-json .planning/phases/22-trusted-publish-execution-and-evidence-capture/22-preflight.json \
  --workflow-run-url <workflow-url> \
  --workflow-run-id <workflow-run-id> \
  --workflow-run-conclusion success \
  --published-at <ISO8601>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Long-lived `NPM_TOKEN` or local CLI publish fallback. [CITED: https://github.com/changesets/action; VERIFIED: [.planning/phases/12-production-publish-execution/12-02-SUMMARY.md](../12-production-publish-execution/12-02-SUMMARY.md)] | npm trusted publishing via GitHub Actions OIDC. [CITED: https://docs.npmjs.com/trusted-publishers/; VERIFIED: [.planning/phases/13-post-publish-registry-verification-and-final-operations/13-02-SUMMARY.md](../13-post-publish-registry-verification-and-final-operations/13-02-SUMMARY.md)] | Repo switched by Phase 13; npm docs still endorse the OIDC model as current. [CITED: https://docs.npmjs.com/trusted-publishers/; VERIFIED: [.planning/phases/13-post-publish-registry-verification-and-final-operations/13-02-SUMMARY.md](../13-post-publish-registry-verification-and-final-operations/13-02-SUMMARY.md)] | Phase 22 should not reintroduce tokens or local publish shortcuts. [VERIFIED: [.planning/REQUIREMENTS.md](../../REQUIREMENTS.md)] |
| One-off manual release execution from a chosen branch. [VERIFIED: [.planning/phases/12-production-publish-execution/12-02-SUMMARY.md](../12-production-publish-execution/12-02-SUMMARY.md)] | Auto-impact `push` to `main` plus `workflow_dispatch` recovery. [VERIFIED: [.github/workflows/release.yml](../../../../.github/workflows/release.yml); CITED: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow] | Repo changed after Phase 13 and Phase 21 planning assumes this current workflow. [VERIFIED: [.github/workflows/release.yml](../../../../.github/workflows/release.yml); VERIFIED: [.planning/ROADMAP.md](../../ROADMAP.md)] | Phase 22 evidence must reference the exact automatic or manual GitHub Actions run, not just the publish result. [VERIFIED: [.planning/REQUIREMENTS.md](../../REQUIREMENTS.md)] |

**Deprecated/outdated:**

- Using `changesets/action@v1` with `NPM_TOKEN` as this repo’s production publish pattern is outdated for the current milestone contract. [CITED: https://github.com/changesets/action; VERIFIED: [.planning/STATE.md](../../STATE.md)]
- Using `npm whoami` as trusted-publisher proof is outdated; npm documents that OIDC status appears only during `npm publish`. [CITED: https://docs.npmjs.com/trusted-publishers/]

## Assumptions Log

All substantive claims in this research were verified from the repo, the npm registry, or official documentation in this session. [VERIFIED: repo inspection; VERIFIED: npm registry; CITED: official docs]

## Open Questions

1. **Which exact GitHub Actions run produced `1.1.3`?**
   - What we know: npm shows `1.1.3` published at `2026-04-05T16:46:35Z`, and the locally known `origin/main` points to `db3ff4f chore(release): publish 1.1.3` at `2026-04-05 16:46:36Z`. [VERIFIED: `npm view @legotin/agent-badge time --json | rg '"1.1.3"'`; VERIFIED: `git show --no-patch --format=fuller db3ff4f`]
   - What's unclear: the exact run URL, run ID, and conclusion are not captured anywhere in the repo yet. [VERIFIED: `rg -n "1\\.1\\.3|db3ff4f|workflow run" .planning docs`; VERIFIED: `find .planning/phases/22-trusted-publish-execution-and-evidence-capture -maxdepth 2 -type f`]
   - Recommendation: make “recover exact run metadata from the GitHub Actions UI or REST API” the first blocking task of the plan. [CITED: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow; VERIFIED: [.planning/REQUIREMENTS.md](../../REQUIREMENTS.md)]

2. **Should the planner work from local `main` or the locally known `origin/main` release commit?**
   - What we know: local `main` is `ahead 10, behind 1`, and the one missing commit is the release commit. [VERIFIED: `git branch -avv`; VERIFIED: `git log --oneline HEAD..origin/main`]
   - What's unclear: whether the user wants to preserve unpushed Phase 21 planning work as-is before any reconciliation. [VERIFIED: `git status --short`; VERIFIED: `git branch -avv`]
   - Recommendation: add an explicit checkpoint in the plan before any branch-moving command; the rest of the phase depends on that decision. [VERIFIED: current git state]

3. **Are all three npm packages currently configured with the intended trusted publisher settings?**
   - What we know: the local workflow is OIDC-correct, and npm’s docs require package-by-package trusted-publisher setup with exact repo/workflow names. [VERIFIED: [.github/workflows/release.yml](../../../../.github/workflows/release.yml); CITED: https://docs.npmjs.com/trusted-publishers/]
   - What's unclear: the remote npm package settings were not visible from this session. [VERIFIED: repo inspection]
   - Recommendation: keep a manual npm settings confirmation task in the plan even if the `1.1.3` workflow run is found, because PUB-01 wants the maintained trusted-publishing path proven, not assumed. [VERIFIED: [.planning/REQUIREMENTS.md](../../REQUIREMENTS.md); CITED: https://docs.npmjs.com/trusted-publishers/]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Local release scripts; npm trusted-publishing minimum. [VERIFIED: [package.json](../../../../package.json); CITED: https://docs.npmjs.com/trusted-publishers/] | ✓ [VERIFIED: `node --version`] | `v22.14.0` [VERIFIED: `node --version`] | Workflow uses Node `24.x` in GitHub Actions. [VERIFIED: [.github/workflows/release.yml](../../../../.github/workflows/release.yml)] |
| npm CLI | Registry reads, preflight, release evidence, trusted publishing. [VERIFIED: [package.json](../../../../package.json); CITED: https://docs.npmjs.com/trusted-publishers/] | ✓ [VERIFIED: `npm --version`] | `11.6.0` [VERIFIED: `npm --version`] | None needed. [VERIFIED: environment audit] |
| git | Branch reconciliation, commit evidence, release-commit inspection. [VERIFIED: repo workflow] | ✓ [VERIFIED: `git --version`] | `2.49.0` [VERIFIED: `git --version`] | None needed. [VERIFIED: environment audit] |
| `tsx` | Repo-owned `release:*` script execution. [VERIFIED: [package.json](../../../../package.json)] | Partial: installed but sandbox-sensitive. [VERIFIED: `npm exec -- tsx --version`] | `4.21.0` printed before sandbox IPC failure. [VERIFIED: `npm exec -- tsx --version`] | Run outside the sandbox or from a normal shell when a script needs live execution. [VERIFIED: `.planning/STATE.md`](../../STATE.md) |
| GitHub CLI (`gh`) | Faster workflow-run lookup and dispatch from terminal. [CITED: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow] | ✗ [VERIFIED: `gh --version | head -1`] | — | Use the GitHub web UI or REST API. [CITED: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow] |

**Missing dependencies with no fallback:**
- None locally, but the exact `1.1.3` workflow run metadata and npm package settings remain external prerequisites that were not probeable from this session. [VERIFIED: repo inspection; CITED: https://docs.npmjs.com/trusted-publishers/]

**Missing dependencies with fallback:**
- `gh` is missing; use the GitHub Actions web UI to find and record the exact run. [VERIFIED: `gh --version | head -1`; CITED: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest` repo-installed `3.2.4` on `vitest.config.ts`. [VERIFIED: `npm exec -- vitest --version`; VERIFIED: [vitest.config.ts](../../../../vitest.config.ts)] |
| Config file | `vitest.config.ts`. [VERIFIED: [vitest.config.ts](../../../../vitest.config.ts)] |
| Quick run command | `npm test -- --run scripts/release/preflight.test.ts scripts/release/publish-impact.test.ts scripts/release/auto-version.test.ts scripts/release/capture-publish-evidence.test.ts` [VERIFIED: [package.json](../../../../package.json); VERIFIED: test files present] |
| Full suite command | `npm run verify:clean-checkout` [VERIFIED: [package.json](../../../../package.json); VERIFIED: [scripts/verify-clean-checkout.sh](../../../../scripts/verify-clean-checkout.sh)] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PUB-01 | The canonical workflow path is still wired for trusted publishing and lockstep release flow. [VERIFIED: [.planning/REQUIREMENTS.md](../../REQUIREMENTS.md)] | Unit + manual live workflow evidence. [VERIFIED: [scripts/release/preflight.test.ts](../../../../scripts/release/preflight.test.ts); VERIFIED: [.github/workflows/release.yml](../../../../.github/workflows/release.yml)] | `npm test -- --run scripts/release/preflight.test.ts scripts/release/publish-impact.test.ts scripts/release/auto-version.test.ts && npm run release:preflight` plus manual GitHub Actions run recovery or execution. [VERIFIED: [package.json](../../../../package.json); VERIFIED: [docs/RELEASE.md](../../../../docs/RELEASE.md)] | Partial: unit files exist; live workflow proof is manual by design. [VERIFIED: test files present; VERIFIED: [.planning/phases/12-production-publish-execution/12-RESEARCH.md](../12-production-publish-execution/12-RESEARCH.md)] |
| PUB-02 | The release evidence binds exact run metadata, published version, and package alignment. [VERIFIED: [.planning/REQUIREMENTS.md](../../REQUIREMENTS.md)] | Unit + manual evidence capture. [VERIFIED: [scripts/release/capture-publish-evidence.test.ts](../../../../scripts/release/capture-publish-evidence.test.ts)] | `npm test -- --run scripts/release/capture-publish-evidence.test.ts && npm run release:evidence -- ...` on the exact released checkout. [VERIFIED: [package.json](../../../../package.json); VERIFIED: [docs/RELEASE.md](../../../../docs/RELEASE.md)] | Partial: writer tests exist; Phase 22 evidence files do not yet exist. [VERIFIED: `find .planning/phases/22-trusted-publish-execution-and-evidence-capture -maxdepth 2 -type f`] |

### Sampling Rate

- **Per task commit:** `npm test -- --run scripts/release/preflight.test.ts scripts/release/publish-impact.test.ts scripts/release/auto-version.test.ts scripts/release/capture-publish-evidence.test.ts` [VERIFIED: [package.json](../../../../package.json)]
- **Per wave merge:** `npm run verify:clean-checkout` [VERIFIED: [package.json](../../../../package.json)]
- **Phase gate:** The exact GitHub Actions run for `1.1.3` must be identified and Phase 22 evidence must exist before `/gsd-verify-work`. [VERIFIED: [.planning/REQUIREMENTS.md](../../REQUIREMENTS.md); VERIFIED: `find .planning/phases/22-trusted-publish-execution-and-evidence-capture -maxdepth 2 -type f`]

### Wave 0 Gaps

- None for local test infrastructure; repo-owned unit coverage already exists for the helper scripts. [VERIFIED: [scripts/release/preflight.test.ts](../../../../scripts/release/preflight.test.ts); VERIFIED: [scripts/release/publish-impact.test.ts](../../../../scripts/release/publish-impact.test.ts); VERIFIED: [scripts/release/auto-version.test.ts](../../../../scripts/release/auto-version.test.ts); VERIFIED: [scripts/release/capture-publish-evidence.test.ts](../../../../scripts/release/capture-publish-evidence.test.ts)]
- Manual-only gap: no automated test can prove the exact external GitHub Actions run that published `1.1.3`; the plan must treat run recovery/evidence capture as a human-in-the-loop task. [VERIFIED: [.planning/REQUIREMENTS.md](../../REQUIREMENTS.md); CITED: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes. [CITED: https://docs.npmjs.com/trusted-publishers/] | npm trusted publishing via OIDC; do not use long-lived publish tokens. [CITED: https://docs.npmjs.com/trusted-publishers/] |
| V3 Session Management | no direct app session layer in this phase. [VERIFIED: repo scope] | N/A. [VERIFIED: repo scope] |
| V4 Access Control | yes. [CITED: https://docs.npmjs.com/trusted-publishers/; CITED: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow] | Exact npm package trusted-publisher settings plus GitHub repo write access for workflow dispatch and release-commit pushback. [CITED: https://docs.npmjs.com/trusted-publishers/; VERIFIED: [.github/workflows/release.yml](../../../../.github/workflows/release.yml)] |
| V5 Input Validation | yes. [VERIFIED: [scripts/release/preflight.ts](../../../../scripts/release/preflight.ts); VERIFIED: [scripts/release/capture-publish-evidence.ts](../../../../scripts/release/capture-publish-evidence.ts)] | Repo-owned argument parsing and explicit invariant checks in release helper scripts. [VERIFIED: helper script source] |
| V6 Cryptography | yes, but platform-provided. [CITED: https://docs.npmjs.com/trusted-publishers/; CITED: https://docs.github.com/en/actions/reference/security/oidc] | Rely on GitHub OIDC + npm short-lived token exchange + automatic provenance, never custom crypto. [CITED: https://docs.npmjs.com/trusted-publishers/] |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Long-lived npm token leakage | Information Disclosure / Elevation of Privilege. [CITED: https://docs.npmjs.com/trusted-publishers/] | Use trusted publishing and consider disallowing tokens after verifying the workflow. [CITED: https://docs.npmjs.com/trusted-publishers/] |
| Workflow-name or package-setting mismatch | Spoofing / Tampering. [CITED: https://docs.npmjs.com/trusted-publishers/] | Verify exact repo name, workflow filename, and package-by-package trusted publisher settings. [CITED: https://docs.npmjs.com/trusted-publishers/] |
| Wrong-commit evidence capture | Repudiation. [VERIFIED: [scripts/release/capture-publish-evidence.ts](../../../../scripts/release/capture-publish-evidence.ts)] | Run evidence capture only on the exact released commit and include run URL/ID plus git SHA. [VERIFIED: helper source; VERIFIED: [.planning/REQUIREMENTS.md](../../REQUIREMENTS.md)] |
| Accidental extra release from stale branch state | Tampering. [VERIFIED: `git branch -avv`; VERIFIED: [scripts/release/auto-version.ts](../../../../scripts/release/auto-version.ts)] | Reconcile branch truth before any publish action and inspect `HEAD..origin/main`. [VERIFIED: `git log --oneline HEAD..origin/main`] |

## Sources

### Primary (HIGH confidence)

- [`.github/workflows/release.yml`](../../../../.github/workflows/release.yml) - current canonical workflow contract, permissions, auto-impact gating, auto-versioning, and commit-back behavior.
- [`scripts/release/preflight.ts`](../../../../scripts/release/preflight.ts) - current local blocker taxonomy and workflow-contract validation logic.
- [`scripts/release/publish-impact.ts`](../../../../scripts/release/publish-impact.ts) - current publish-input detection rules.
- [`scripts/release/auto-version.ts`](../../../../scripts/release/auto-version.ts) - current version bump logic from registry/source state.
- [`scripts/release/capture-publish-evidence.ts`](../../../../scripts/release/capture-publish-evidence.ts) - current evidence capture contract.
- [`docs/RELEASE.md`](../../../../docs/RELEASE.md) - current release checklist and evidence command shape.
- [`npm trusted publishers docs`](https://docs.npmjs.com/trusted-publishers/) - OIDC requirements, package-level trusted publisher settings, per-package limitation, provenance behavior, and `npm whoami` limitation.
- [`GitHub OIDC docs`](https://docs.github.com/en/actions/reference/security/oidc) - `id-token: write` requirement.
- [`GitHub manual workflow docs`](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow) - `workflow_dispatch` behavior and UI/manual-run fallback.
- npm registry queries run in this session:
  - `npm view @legotin/agent-badge version dist-tags.latest --json`
  - `npm view @legotin/agent-badge-core version dist-tags.latest --json`
  - `npm view create-agent-badge version dist-tags.latest --json`
  - `npm view @changesets/cli version time --json`
  - `npm view tsx version time --json`
  - `npm view vitest version time --json`
- Git state queries run in this session:
  - `git branch -avv`
  - `git log --oneline HEAD..origin/main`
  - `git show --stat db3ff4f`
  - `git show --no-patch --format=fuller db3ff4f`

### Secondary (MEDIUM confidence)

- [`changesets/action README`](https://github.com/changesets/action) - official alternative pattern that still documents `NPM_TOKEN`-based publishing, useful only as a contrast to the repo’s current OIDC contract.

### Tertiary (LOW confidence)

- None. [VERIFIED: all claims above are backed by repo inspection, official docs, or live registry queries]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - the workflow, helper scripts, and registry state were all verified directly. [VERIFIED: repo inspection; VERIFIED: npm registry]
- Architecture: MEDIUM - the local-vs-remote split is verified, but the exact `1.1.3` workflow run metadata is still missing. [VERIFIED: git state; VERIFIED: missing Phase 22 artifacts]
- Pitfalls: HIGH - they follow directly from the verified branch divergence, registry drift, and official OIDC limitations. [VERIFIED: git state; VERIFIED: npm docs]

**Research date:** 2026-04-05
**Valid until:** 2026-04-12
