# Release Checklist

Use this checklist when preparing to publish `agent-badge`, `create-agent-badge`, and `@agent-badge/core`.

## 1. Prepare the environment

- Run release rehearsal work from the repository root.
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

Run the repo-owned preflight immediately before publish. Registry state changes over time, so results observed on 2026-03-31 are not durable proof for a later release:

```bash
npm run release:preflight
```

Capture a machine-readable record when needed:

```bash
npm run release:preflight -- --json
```

The command wraps the equivalent live registry reads for the three publishable packages:

```bash
npm view agent-badge name version
npm view create-agent-badge name version
npm view @agent-badge/core name version
```

It also runs `npm ping` and `npm whoami` from the maintainer environment. If `npm run release:preflight` reports `OVERALL: blocked`, stop and resolve the reported blocker before publishing.

The local preflight cannot prove that GitHub Actions secrets exist remotely. Before `npm run release`, confirm that the repository still has the `NPM_TOKEN` secret configured for the release workflow and that the workflow can access it.

## 4. Publish

When the local gates are green and `npm run release:preflight` is safe or intentionally acknowledged as warn-only, publish through the existing workflow command:

```bash
npm run release
```

## 5. Troubleshooting notes

- `npm run verify:clean-checkout` already creates its scratch directory under `/tmp` and isolates npm cache usage for the clean-checkout rehearsal.
- `npm run smoke:pack` is the focused rerun for the tarball install proof, not a replacement for the full release rehearsal.
