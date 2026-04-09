## Registry truth

Public npm registry results for the three publishable packages:

- `@legotin/agent-badge`: version `1.1.3`, `dist-tags.latest` `1.1.3`
- `@legotin/agent-badge-core`: version `1.1.3`, `dist-tags.latest` `1.1.3`
- `create-agent-badge`: version `1.1.3`, `dist-tags.latest` `1.1.3`

Saved exact-version smoke status from `23-REGISTRY-SMOKE.json`: `passed`

Saved latest-alias outcome from `23-LATEST-RESOLUTION.md`: `npm init agent-badge@latest` passed at `1.1.3`

## Local repo alignment

The three publishable manifests and `package-lock.json` match the released `1.1.3` surface:

- `packages/core/package.json`: `1.1.3`
- `packages/agent-badge/package.json`: `1.1.3` with `@legotin/agent-badge-core` on `^1.1.3`
- `packages/create-agent-badge/package.json`: `1.1.3` with `@legotin/agent-badge` on `^1.1.3`
- `package-lock.json`: publishable package entries aligned to `1.1.3`

## Docs alignment

The maintained release runbook and docs checker both point to the Phase 23 contract:

- `docs/RELEASE.md` uses `bash scripts/smoke/verify-registry-install.sh --version 1.1.3 --check-initializer --write-evidence --phase-dir .planning/phases/23-post-publish-registry-verification-and-version-alignment --artifact-prefix 23-REGISTRY-SMOKE`
- `docs/RELEASE.md` names `23-REGISTRY-SMOKE.json`, `23-REGISTRY-SMOKE.md`, and `23-LATEST-RESOLUTION.md`
- `scripts/verify-docs.sh` enforces the same Phase 23 smoke command and artifact names
- `npm run docs:check` passes against the updated runbook

## Final verdict

Aligned with released 1.1.3
