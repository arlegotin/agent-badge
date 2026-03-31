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

`npm run release:preflight` is the required publish gate immediately before `npm run release`. It performs the live registry checks, runs `npm ping` and `npm whoami`, validates release-input coherence from the workspace manifests and `.changeset/config.json`, and confirms the checked-in GitHub Actions workflow still references the expected `changesets/action@v1` + `NPM_TOKEN` publish contract.

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

This command wraps live registry checks for the three publishable packages:

```bash
npm view @legotin/agent-badge version dist-tags.latest --json
npm view create-agent-badge version dist-tags.latest --json
npm view @legotin/agent-badge-core version dist-tags.latest --json
```

It also runs `npm ping` and `npm whoami` from the maintainer environment. If `npm run release:preflight` reports `OVERALL: blocked`, stop and resolve the reported blocker before publishing.

The local preflight cannot prove GitHub Actions secret state remotely. Before publish, confirm the repository still has `NPM_TOKEN` configured for `.github/workflows/release.yml`, and that the secret is actually publish-capable for npm. A token that only supports read auth or lacks 2FA bypass will still let `npm whoami` succeed locally while the real publish fails with `ENEEDAUTH` or `E403`.

## 4. Publish via workflow (primary operator path)

Use `.github/workflows/release.yml` as the production publish path. Trigger it using `workflow_dispatch` in the repository’s GitHub Actions tab after the preflight file is green:

- Start the workflow run for the production publish.
- Record the run URL and run ID from the completed workflow page.
- If successful, write release evidence with publish-path metadata:

```bash
npm run release:evidence \
  -- --phase-dir .planning/phases/12-production-publish-execution \
  --publish-path github-actions \
  --preflight-json .planning/phases/12-production-publish-execution/12-preflight.json \
  --workflow-run-url <workflow-url> \
  --workflow-run-id <workflow-run-id> \
  --workflow-run-conclusion success \
  --published-at <ISO8601>
```

`12-PUBLISH-EVIDENCE.md` and `12-PUBLISH-EVIDENCE.json` are the required evidence artifacts for this path.

## 5. Fallback local publish path (recovery only)

Use local `npm run release` only if the workflow path cannot be used.

The local fallback requires real publish auth, not just maintainer read auth:

- `npm login` + `npm whoami` only prove the machine can read npm metadata.
- If the maintainer account enforces npm 2FA, the fallback publish must use a publish-capable token with bypass 2FA enabled, or another publish path that satisfies npm's 2FA policy.
- When using `NPM_TOKEN` locally, route npm through a temporary user config so the token is the active publish credential for the command being run.

After the fallback publish, persist evidence with a required fallback reason:

```bash
npm run release:evidence \
  -- --phase-dir .planning/phases/12-production-publish-execution \
  --publish-path local-cli \
  --preflight-json .planning/phases/12-production-publish-execution/12-preflight.json \
  --fallback-reason "<why workflow path could not be used>" \
  --published-at <ISO8601>
```

## 6. Troubleshooting notes

- `npm run verify:clean-checkout` already creates its scratch directory under `/tmp` and isolates npm cache usage for the clean release rehearsal.
- `npm run smoke:pack` is the focused rerun for the tarball install proof, not a replacement for the full release rehearsal.
