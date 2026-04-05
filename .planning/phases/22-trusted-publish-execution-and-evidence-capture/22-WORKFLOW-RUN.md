# Phase 22 Workflow Run Record

## Reconciliation

- The current local `main` checkout at `d158ab8d6cb7b070bb26721277da53049532efaa` is not the release source. It is `ahead 12, behind 1` relative to the locally known `origin/main`, and the missing remote commit is `db3ff4fa76905fac713a3ee7677d143de25e2b2c` (`chore(release): publish 1.1.3`).
- The exact release commit `db3ff4fa76905fac713a3ee7677d143de25e2b2c` is authored and committed by `github-actions[bot]` at `2026-04-05T16:46:36Z`.
- A released-source preflight was generated from a clean temporary checkout of `db3ff4f`. That artifact is [22-preflight.json](/Volumes/git/legotin/agent-badge/.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-preflight.json).
- The released-source preflight shows all three publishable packages at intended version `1.1.3`, and each package is blocked only because `1.1.3` is already published. That is the expected post-release state, not evidence that a new publish is needed.
- The maintained workflow file remains `.github/workflows/release.yml` with the trusted-publishing markers preserved, and the recovered Actions job includes the expected `Publish npm packages` and `Commit and push released versions` steps.

## Canonical workflow run

- Workflow file: `.github/workflows/release.yml`
- Publish path: `github-actions`
- Workflow run ID: `24005943027`
- Workflow run URL: `https://github.com/arlegotin/agent-badge/actions/runs/24005943027`
- Workflow run conclusion: `success`
- Workflow job URL: `https://github.com/arlegotin/agent-badge/actions/runs/24005943027/job/70009557155`
- Triggering commit: `385f65284fa6b379e63b6a94ea58df009b1e9ee7` (`chore: complete v1.4 milestone`)
- Published commit: `db3ff4fa76905fac713a3ee7677d143de25e2b2c` (`chore(release): publish 1.1.3`)
- Published version: `1.1.3`
- Run started at: `2026-04-05T16:45:50Z`
- Publish step window: `2026-04-05T16:46:32Z` to `2026-04-05T16:46:36Z`
- Commit-and-push step window: `2026-04-05T16:46:36Z` to `2026-04-05T16:46:37Z`

Recovered job evidence:

- Step `Verify clean checkout release path` completed with `success`.
- Step `Detect publish impact` completed with `success`.
- Step `Read current npm version` completed with `success`.
- Step `Auto-bump publishable package versions` completed with `success`.
- Step `Publish npm packages` completed with `success`.
- Step `Commit and push released versions` completed with `success`.

These timings align exactly with the `github-actions[bot]` release commit timestamp and with npm showing all three packages published as `1.1.3`.

## Release decision

Recovered existing trusted publish.

Reasoning:

- The exact GitHub Actions run is recoverable and successful.
- The workflow executed the maintained trusted-publishing path and includes the expected publish and release-commit steps.
- The resulting release commit `db3ff4f` moved all three publishable manifests to `1.1.3`.
- The released-source preflight confirms the expected post-release state: `1.1.3` is already published for all three packages.
- Triggering a fresh publish from the stale local `1.1.2` checkout would risk an unnecessary higher version and would not improve the proof.

## Follow-up into Plan 22-02

- Use workflow run ID `24005943027`, run URL `https://github.com/arlegotin/agent-badge/actions/runs/24005943027`, and conclusion `success` as the canonical workflow metadata for Phase 22 evidence capture.
- Use published commit `db3ff4fa76905fac713a3ee7677d143de25e2b2c` and published version `1.1.3` as the release truth.
- Keep the evidence path on `github-actions` only.
- Plan 22-02 must repair the current evidence writer so the final artifacts are phase-owned as `22-PUBLISH-EVIDENCE.json` and `22-PUBLISH-EVIDENCE.md`.
