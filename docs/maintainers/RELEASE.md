# Release Process

Use this checklist when preparing to publish `@legotin/agent-badge`, `create-agent-badge`, and `@legotin/agent-badge-core`.

## Release Truth

A release is not done until these surfaces agree:

- the three publishable package manifests
- the npm registry `latest` tags for all three packages
- Git tags for the published version
- the GitHub release entry for the published version
- `CHANGELOG.md`

Current published truth should come from the manifests plus live npm checks, not from hardcoded historical version numbers in docs.

## 1. Run the local gates

From the repository root:

```bash
npm run docs:check
npm run typecheck
npm run verify:clean-checkout
npm run release:preflight
```

`npm run verify:clean-checkout` is the full local rehearsal. It rebuilds from a clean tree, runs tests, checks tarball contents, and verifies the packed-install path for explicit runtime package installs.

`npm run release:preflight` is the live registry and workflow contract gate. It validates:

- aligned publishable versions
- npm auth visibility
- npm ownership visibility
- trusted-publishing workflow markers
- support metadata such as `engines.node` and the root `packageManager`

## 2. Capture preflight output

Persist the machine-readable preflight report with placeholders that match the version you are releasing:

```bash
mkdir -p artifacts/releases/<release-version>
npm --silent run release:preflight -- --json > artifacts/releases/<release-version>/preflight.json
```

Use `npm --silent run` when redirecting to a file so the output stays valid JSON.

## 3. Publish through GitHub Actions

The production publish path is `.github/workflows/release.yml`.

Expected behavior:

- qualifying pushes to `main` auto-bump the three publishable packages in lockstep
- npm publish uses trusted publishing through OIDC
- the workflow commits the released versions back to the branch
- the workflow creates Git tags for the released version
- the workflow creates or updates a GitHub release entry for that version

Do not switch to a one-off local publish path when the workflow is the source of truth. Fix the workflow or trusted-publisher configuration instead.

## 4. Capture publish evidence

After the workflow succeeds, write repo-local evidence for that exact published version:

```bash
npm run release:evidence \
  -- --phase-dir artifacts/releases/<release-version> \
  --publish-path github-actions \
  --preflight-json artifacts/releases/<release-version>/preflight.json \
  --artifact-prefix PUBLISH-EVIDENCE \
  --workflow-run-url <workflow-url> \
  --workflow-run-id <workflow-run-id> \
  --workflow-run-conclusion success \
  --published-git-sha <released-commit-sha> \
  --published-at <ISO8601>
```

The important part is the placeholder contract:

- `artifacts/releases/<release-version>/...`
- `PUBLISH-EVIDENCE`

The release doc should stay template-driven. It must not hardcode an old published version.

## 5. Run post-publish registry smoke

Verify that the released packages and initializer resolve from a clean directory:

```bash
bash scripts/smoke/verify-registry-install.sh \
  --version <release-version> \
  --check-initializer \
  --write-evidence \
  --phase-dir artifacts/releases/<release-version> \
  --artifact-prefix REGISTRY-SMOKE
```

That should leave:

- `artifacts/releases/<release-version>/REGISTRY-SMOKE.json`
- `artifacts/releases/<release-version>/REGISTRY-SMOKE.md`

This is the authoritative initializer proof for the default contract. `verify-registry-install.sh --check-initializer --write-evidence` must show that `npm init agent-badge@latest` leaves minimal repo artifacts, writes `.agent-badge/*`, and installs the direct shared-runtime hook without requiring repo-local `node_modules/.bin/agent-badge`.

The smoke result must report `"status": "passed"` before the release is treated as complete.

## 6. Backfill missing tags or releases

If npm says `latest` is newer than the public Git tags or GitHub Releases page, backfill the missing metadata before calling the release story complete. The current repo history already contains `chore(release): publish <version>` commits that can be used as the source of truth for missing tags.

Typical manual backfill commands:

```bash
git tag -a v<release-version> <released-commit-sha> -m "Release v<release-version>"
git tag -a @legotin/agent-badge-core@<release-version> <released-commit-sha> -m "Release @legotin/agent-badge-core@<release-version>"
git tag -a @legotin/agent-badge@<release-version> <released-commit-sha> -m "Release @legotin/agent-badge@<release-version>"
git tag -a create-agent-badge@<release-version> <released-commit-sha> -m "Release create-agent-badge@<release-version>"
git push origin v<release-version> @legotin/agent-badge-core@<release-version> @legotin/agent-badge@<release-version> create-agent-badge@<release-version>
gh release create v<release-version> --title "v<release-version>" --generate-notes
```

## 7. Update changelog and docs

Make sure:

- `CHANGELOG.md` includes the published version
- user docs still point only to user-facing pages
- maintainer docs stay under `docs/maintainers/`
