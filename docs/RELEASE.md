# Release Checklist

Use this checklist when preparing to publish `@legotin/agent-badge`, `create-agent-badge`, and `@legotin/agent-badge-core`.

## 1. Prepare the environment

- Run release steps from the repository root.
- On constrained machines, keep npm cache and scratch space under `/tmp` instead of `/Volumes/git`.
- Export an isolated cache before any rehearsal that installs dependencies:

```bash
export npm_config_cache=/tmp/agent-badge-npm-cache
```

## 2. Run the required local gates

Run the maintained repo entrypoints in this order:

```bash
npm run docs:check
npm run typecheck
npm run verify:clean-checkout
npm run release:preflight
```

`npm run verify:clean-checkout` is the canonical full release rehearsal. It rebuilds from a clean tree, runs tests, checks tarball contents, and runs the packed-install proof using temporary scratch space.

`npm run release:preflight` is the required publish gate immediately before the production workflow run. It performs the live registry checks, runs `npm ping` and `npm whoami`, validates release-input coherence from the workspace manifests and `.changeset/config.json`, and confirms the checked-in GitHub Actions workflow still references the expected trusted-publishing contract.

Passing these local gates means the checkout is **locally green**. It does not mean the release is externally ready.

If the packed-install step fails and you only need to rerun that proof after fixing it, use:

```bash
npm run smoke:pack
```

## 3. Publish-time registry preflight

Run preflight right before publish and persist a machine-readable artifact:

```bash
npm --silent run release:preflight -- --json > .planning/phases/12-production-publish-execution/12-preflight.json
```

Use the silent npm form when redirecting to a file. Plain `npm run` prepends the script banner to stdout, which makes the saved artifact invalid JSON.

If `12-preflight.json` reports `OVERALL: blocked`, stop and resolve the blocker before publishing.

Interpret the preflight result in two layers:

- `locally green`: local rehearsal succeeded (`typecheck`, tests, docs, clean-checkout, and the preflight command itself ran).
- `externally blocked`: a live external condition still prevents a truthful production-ready claim or publish attempt.

The repo-owned preflight contract now names the exact external blocker categories that matter for release decisions:

- `npm auth`
- `same version already published`
- `version drift`
- `package ownership`
- `trusted-publisher`

This command wraps live registry checks for the three publishable packages:

```bash
npm view @legotin/agent-badge version dist-tags.latest --json
npm view create-agent-badge version dist-tags.latest --json
npm view @legotin/agent-badge-core version dist-tags.latest --json
```

It also runs `npm ping` and `npm whoami` from the maintainer environment. If `npm run release:preflight` reports `OVERALL: blocked`, stop and resolve the reported blocker before publishing.

Use the categories this way:

- `npm auth`: the maintainer environment cannot prove a valid npm publisher identity. Fix this before treating the machine as publish-ready.
- `same version already published`: the exact intended version is already visible in npm. Do not republish blindly.
- `version drift`: npm and the checked-in manifests disagree about the publishable version. Resolve the drift before claiming the source is externally ready.
- `package ownership`: local tooling can see that the packages exist, but it cannot prove the intended publisher account has owner permissions. Treat this as a manual confirmation.
- `trusted-publisher`: local tooling can verify the checked-in workflow markers, but it cannot prove the remote npm package settings trust the `arlegotin/agent-badge` repository and `release.yml` workflow. Treat this as a manual confirmation unless external evidence says otherwise.

The local preflight cannot prove GitHub Actions trusted-publisher state remotely. Before publish, confirm each npm package trusts the `arlegotin/agent-badge` repository with workflow file `release.yml`, and keep `.github/workflows/release.yml` on the OIDC path (`permissions.id-token: write`). `npm whoami` is still useful for local operator sanity checks, but it is not the production publish credential. A release can be locally green while still being externally blocked.

## 4. Publish via workflow (automatic main-branch path)

Use `.github/workflows/release.yml` as the production publish path.

- Pushes to `main` automatically publish when they change publishable workspace inputs.
- The workflow computes publish impact from `packages/core`, `packages/agent-badge`, `packages/create-agent-badge`, plus root build inputs like `package.json`, `package-lock.json`, and `tsconfig.base.json`.
- Qualifying pushes auto-bump the three publishable packages in lockstep by one patch version, publish through npm trusted publishing, then commit the released versions back to `main`.
- Auto-release commits use the form `chore(release): publish <version>` and are skipped by the workflow itself to prevent publish loops.
- `workflow_dispatch` remains available as a manual recovery path for maintainers.

- For the automatic path, record the run URL and run ID from the completed workflow page.
- For recovery, start the workflow manually with `workflow_dispatch`.
- Do not switch to a local publish path. If the workflow cannot publish, fix the trusted-publisher or workflow configuration first.
- If successful, write release evidence with publish-path metadata:

```bash
npm run release:evidence \
  -- --phase-dir .planning/phases/12-production-publish-execution \
  --publish-path github-actions \
  --preflight-json .planning/phases/12-production-publish-execution/12-preflight.json \
  --artifact-prefix 12-PUBLISH-EVIDENCE \
  --workflow-run-url <workflow-url> \
  --workflow-run-id <workflow-run-id> \
  --workflow-run-conclusion success \
  --published-git-sha <released-commit-sha> \
  --published-at <ISO8601>
```

`12-PUBLISH-EVIDENCE.md` and `12-PUBLISH-EVIDENCE.json` are the required evidence artifacts for this path.

When the current checkout has moved past the released commit, capture evidence from a clean checkout of the released source and keep the artifacts phase-owned with the same command shape. For Phase 22, that means using the Phase 22 paths and artifact prefix:

```bash
npm run release:evidence \
  -- --phase-dir .planning/phases/22-trusted-publish-execution-and-evidence-capture \
  --publish-path github-actions \
  --preflight-json .planning/phases/22-trusted-publish-execution-and-evidence-capture/22-preflight.json \
  --artifact-prefix 22-PUBLISH-EVIDENCE \
  --workflow-run-url <workflow-url> \
  --workflow-run-id <workflow-run-id> \
  --workflow-run-conclusion success \
  --published-git-sha <released-commit-sha> \
  --published-at <ISO8601>
```

## 5. Post-publish registry smoke

After Phase 12 publish evidence is captured, prove the live registry artifacts still work from a clean temp directory:

```bash
bash scripts/smoke/verify-registry-install.sh --version 1.1.2 --check-initializer --write-evidence --phase-dir .planning/phases/13-post-publish-registry-verification-and-final-operations
```

This writes:

- `.planning/phases/13-post-publish-registry-verification-and-final-operations/13-REGISTRY-SMOKE.json`
- `.planning/phases/13-post-publish-registry-verification-and-final-operations/13-REGISTRY-SMOKE.md`

Phase 13 is only complete when `13-REGISTRY-SMOKE.json` reports `"status": "passed"`. If the smoke is blocked, publish the repair release through `.github/workflows/release.yml`, refresh the Phase 12 publish evidence, and rerun the same smoke against the repaired published version.

## 6. Troubleshooting notes

- `npm run verify:clean-checkout` already creates its scratch directory under `/tmp` and isolates npm cache usage for the clean release rehearsal.
- `npm run smoke:pack` is the focused rerun for the tarball install proof, not a replacement for the full release rehearsal.
