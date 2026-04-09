# Phase 7: Release Readiness - Research

**Researched:** 2026-03-31
**Domain:** CI, packaging validation, docs hardening, and npm release operations for a workspace CLI
**Confidence:** HIGH (repo facts), MEDIUM-HIGH (external release guidance)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
No phase CONTEXT file exists (`.planning/phases/07-release-readiness/*-CONTEXT.md` not found).

### Claude's Discretion
No phase-specific discretion block exists.

### Deferred Ideas (OUT OF SCOPE)
None listed for this phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REL-01 | Verify supported scenario matrix: fresh repo, existing repo, one/both providers, no README, no origin, no auth, idempotent re-init | Existing fixture and command tests already cover most dimensions; add one explicit matrix harness and CI job that runs it as a release gate |
| REL-02 | CI validates build/tests/docs without live provider directories | Use fixture-backed tests only, block real home directory access in CI env, run `npm ci`, `npm run typecheck`, `npm run build`, `npm test -- --run` |
| REL-03 | Public docs: quickstart, attribution, privacy, troubleshooting, manual Gist connection | Add dedicated docs set plus doc verification step in CI (presence + link checks) and a publish runbook |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- Local-first and serverless architecture; CI must not depend on real `~/.codex` / `~/.claude`.
- Aggregate-only privacy model; no prompt/path/file leakage in docs, tests, or release outputs.
- Initializer-first onboarding (`npm init agent-badge@latest`) must stay intact.
- Badge URL stability through GitHub Gist + Shields model.
- Failure-soft refresh behavior and idempotent init semantics must remain true after release hardening.

## Summary

Phase 7 is mostly release engineering and evidence orchestration, not core feature invention. The codebase already has strong fixture infrastructure (`packages/testkit`) and broad command-level tests, but there are no GitHub workflows yet and public docs are still minimal. That means readiness is currently blocked by process gaps rather than scanner/attribution logic.

The highest-risk finding is packaging behavior: current published tarballs keep `file:../...` workspace dependencies in package manifests, and smoke installs in clean temp projects fail at runtime (`Cannot find package '@agent-badge/core'` and `Cannot find package 'agent-badge'`). This must be fixed before external release, and Phase 7 should include automated `npm pack` + clean-install smoke checks to prevent recurrence.

**Primary recommendation:** implement a two-workflow release system (`ci.yml` + `release.yml`) with fixture-only scenario gates, tarball smoke tests, and a Changesets-driven publish path (prefer npm trusted publishing/OIDC when feasible).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| GitHub Actions | current | CI + release automation | Native workflow engine for matrix testing and publish orchestration |
| `actions/checkout` | v6 | Source checkout in workflows | Current major with updated runtime/security defaults |
| `actions/setup-node` | v6 | Node runtime + dependency cache | Current major; supports Node version pinning and npm caching |
| Node.js | 20.x, 22.x, 24.x | CI compatibility matrix | Matches project support floor and current LTS lines |
| npm CLI | 11.x | Deterministic install, pack, publish | `npm ci`, `npm pack --dry-run`, workspace publish support |
| `@changesets/cli` | 2.30.0 | Versioning + release intent | Standard monorepo release flow, already configured in repo |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `changesets/action` | v1 | Automated release PR + optional publish | Use in `release.yml` on main branch |
| `vitest` | 3.2.x (repo), 4.1.2 latest | Scenario and smoke tests | Keep current major for this phase unless upgrading is explicitly scoped |
| `npm pack` | npm 11.x command | Package content + installability verification | Mandatory gate before publishing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Changesets action | Handwritten tag/publish scripts | Higher drift and harder multi-package version integrity |
| OIDC trusted publishing | Long-lived `NPM_TOKEN` secret | Token approach is simpler initially but weaker security posture |
| CI-only unit tests | CI + tarball smoke install/import checks | Unit-only misses packaging/runtime breakages seen in this repo |

**Installation:**
```bash
npm install -D @changesets/cli vitest tsx typescript
```

**Version verification:** validated from npm registry on 2026-03-31 using `npm view <pkg> version time.modified --json`.
- `@changesets/cli` `2.30.0` (modified `2026-03-03`)
- `vitest` `4.1.2` (modified `2026-03-26`)
- `tsx` `4.21.0` (modified `2025-11-30`)
- `typescript` `6.0.2` (modified `2026-03-28`)
- `commander` `14.0.3` (modified `2026-02-21`)
- `octokit` `5.0.5` (modified `2025-10-31`)
- `zod` `4.3.6` (modified `2026-01-25`)

## Architecture Patterns

### Recommended Project Structure
```text
.github/
└── workflows/
    ├── ci.yml            # build/typecheck/test + scenario matrix + pack smoke
    └── release.yml       # changesets release PR/publish flow
docs/
├── QUICKSTART.md
├── ATTRIBUTION.md
├── PRIVACY.md
├── TROUBLESHOOTING.md
└── MANUAL-GIST.md
scripts/
└── smoke/
    └── verify-packed-install.sh
packages/
└── testkit/             # fixture utilities for provider/repo simulation
```

### Pattern 1: Separate CI and Release Workflows
**What:** keep validation (`ci.yml`) independent from publish orchestration (`release.yml`).
**When to use:** always; release should never be the only place tests run.
**Example:**
```yaml
# Source: https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs
name: CI
on: [pull_request, push]
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: ['20.x', '22.x', '24.x']
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run build
      - run: npm test -- --run
```

### Pattern 2: Fixture-Only Scenario Matrix
**What:** all matrix scenarios run against generated temp repos/home dirs via `packages/testkit`.
**When to use:** for REL-01 and REL-02 checks in CI.
**Example:**
```typescript
// Source: repo pattern from packages/testkit/src/{repo-fixtures,provider-fixtures}.ts
const repo = await createRepoFixture({ git: true, readme: false });
const providers = await createProviderFixture({ codex: true, claude: false });
// Run init/scan/publish flow with homeRoot: providers.homeRoot
```

### Pattern 3: Pack Then Smoke Install/Import
**What:** gate release with `npm pack --dry-run --json` and clean temp install/import.
**When to use:** every publish candidate.
**Example:**
```bash
# Source: https://docs.npmjs.com/cli/v11/commands/npm-pack
npm pack --workspace packages/agent-badge --dry-run --json
npm pack --workspace packages/create-agent-badge --dry-run --json
```

### Anti-Patterns to Avoid
- **Publishing without tarball smoke checks:** current repo can install tarballs but fail at runtime due unresolved `file:../` deps.
- **CI reading developer home directories:** violates local-first constraints and makes CI nondeterministic.
- **Combining test and publish in one opaque script:** hides failures and weakens release traceability.
- **Relying only on README for user docs:** REL-03 requires structured publish-time documentation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Monorepo version orchestration | custom version bump + changelog scripts | `@changesets/cli` + `changesets/action` | Handles dependency graph bumping and release PR flow reliably |
| Package content validation | ad-hoc `ls dist` checks | `npm pack --dry-run --json` gate | Uses npm's real publish packing rules |
| CI scenario setup | shell scripts mutating real `~/.codex`/`~/.claude` | `@agent-badge/testkit` fixtures | Deterministic and privacy-safe in CI |
| Publish security | permanent write token in CI by default | npm trusted publishing (OIDC) | Removes long-lived publish secret exposure |

**Key insight:** release failures here are mostly distribution/runtime mismatches, so only npm-native pack/install checks and fixture-isolated scenario tests close the real risk.

## Common Pitfalls

### Pitfall 1: Tarball Installs Succeed but Runtime Imports Fail
**What goes wrong:** `npm install` of packed tarball appears successful, then CLI/import fails in clean environment.
**Why it happens:** package manifests currently retain workspace `file:../...` dependencies.
**How to avoid:** add mandatory pack + clean-install + import smoke job.
**Warning signs:** errors like `Cannot find package '@agent-badge/core'` or `Cannot find package 'agent-badge'`.

### Pitfall 2: Test Files Leak into Published Dist
**What goes wrong:** `.test.js` artifacts are included in published package payload.
**Why it happens:** TS build includes all `src/**/*.ts` in package projects.
**How to avoid:** exclude tests from package build tsconfig or add publish-time pack assertions.
**Warning signs:** `npm pack --dry-run --json` file list includes `*.test.js`.

### Pitfall 3: CI Reliability Depends on Developer Machine State
**What goes wrong:** workflows pass locally but fail in CI due missing provider dirs.
**Why it happens:** tests implicitly assume live `~/.codex`/`~/.claude`.
**How to avoid:** enforce fixture-only provider inputs and explicit `homeRoot` injection.
**Warning signs:** tests reading absolute home paths or hidden env assumptions.

### Pitfall 4: Release Pipeline Stalls on Credentials
**What goes wrong:** publish job fails due missing `NPM_TOKEN`/permissions.
**Why it happens:** no explicit token or trusted publisher setup.
**How to avoid:** decide one path now: OIDC trusted publishing or token secret fallback.
**Warning signs:** release job has publish step but no credential strategy.

## Code Examples

Verified patterns from official sources:

### Matrix Strategy
```yaml
# Source: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations
strategy:
  matrix:
    node-version: ['20.x', '22.x', '24.x']
```

### Trusted Publishing Skeleton
```yaml
# Source: https://docs.npmjs.com/trusted-publishers
permissions:
  id-token: write
  contents: read
steps:
  - uses: actions/checkout@v6
  - uses: actions/setup-node@v6
    with:
      node-version: '24'
      registry-url: 'https://registry.npmjs.org'
  - run: npm ci
  - run: npm run build --if-present
  - run: npm test
  - run: npm publish
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Long-lived npm publish token only | OIDC trusted publishing | Current npm docs (2026) | Better security and reduced secret management |
| Single-version CI checks | Node version matrix (`strategy.matrix`) | Established GitHub Actions guidance | Higher confidence for external users |
| "Publish and hope" | `npm pack --dry-run` + smoke install/import gate | Current npm publish guidance | Catches packaging/runtime regressions pre-release |

**Deprecated/outdated:**
- Token-only publish path as the only option for CI release.
- Release readiness based only on unit tests without tarball-level validation.

## Open Questions

1. **Should `@agent-badge/core` and `@agent-badge/testkit` be published or kept internal?**
   - What we know: public packages currently depend on workspace `file:` references.
   - What's unclear: intended external package graph for v1.
   - Recommendation: lock this decision before implementing 07-02 smoke gates.

2. **Should Vitest be upgraded in Phase 7?**
   - What we know: repo uses `^3.2.0`; latest is `4.1.2`.
   - What's unclear: acceptable risk of test-runner upgrade during release-hardening phase.
   - Recommendation: keep current major for Phase 7 unless upgrade is explicitly scoped.

3. **How strict should docs CI be?**
   - What we know: REL-03 needs five docs surfaces.
   - What's unclear: markdown lint only vs link-check + example command verification.
   - Recommendation: at minimum enforce file presence + link check in CI.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build/test/pack scripts | ✓ | v22.14.0 | use installed runtime |
| npm | install/pack/publish flow | ✓ | 11.6.0 | none |
| git | repo fixture + workflow expectations | ✓ | 2.49.0 | none |
| Docker | optional local isolation checks | ✓ | 25.0.3 | skip containerized smoke if not needed |
| GitHub CLI (`gh`) | optional release/debug operations | ✗ | — | use GitHub web UI/API |
| `NPM_TOKEN` env | token-based publish path | ✗ | — | prefer trusted publishing (OIDC) |
| `GH_TOKEN` / `GITHUB_TOKEN` env (local shell) | local authenticated publish tests | ✗ | — | use mocked gist client tests |

**Missing dependencies with no fallback:**
- None for planning and CI implementation work.

**Missing dependencies with fallback:**
- `gh` CLI missing; workflow work can proceed without it.
- publish token missing locally; release can use OIDC or staged manual publish.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (repo currently `^3.2.0`) |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- --run` |
| Full suite command | `npm run typecheck && npm run build && npm test -- --run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REL-01 | Supported scenario matrix is verifiable (fresh/existing repo, provider combinations, no README, no origin, no auth, idempotent re-init) | fixture integration | `npm test -- --run packages/agent-badge/src/commands/init.test.ts packages/core/src/init/preflight.test.ts packages/core/src/repo/repo-fingerprint.test.ts packages/core/src/init/default-config.test.ts` | ✅ (needs one new umbrella matrix test) |
| REL-02 | CI validates build/tests/docs without live provider dirs | CI pipeline | `npm ci && npm run typecheck && npm run build && npm test -- --run` | ❌ (`.github/workflows/ci.yml` missing) |
| REL-03 | Public docs are present and coherent | docs verification + manual read check | `test -f docs/QUICKSTART.md && test -f docs/ATTRIBUTION.md && test -f docs/PRIVACY.md && test -f docs/TROUBLESHOOTING.md && test -f docs/MANUAL-GIST.md` | ❌ (docs set missing) |

### Sampling Rate
- **Per task commit:** `npm test -- --run`
- **Per wave merge:** `npm run typecheck && npm run build && npm test -- --run`
- **Phase gate:** CI green + pack/smoke gate green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `.github/workflows/ci.yml` - matrix build/typecheck/test/docs/pack smoke gate
- [ ] `.github/workflows/release.yml` - changesets release PR/publish automation
- [ ] `scripts/smoke/verify-packed-install.sh` (or equivalent) - tarball install/import smoke test
- [ ] docs set for REL-03 (`docs/QUICKSTART.md`, `docs/ATTRIBUTION.md`, `docs/PRIVACY.md`, `docs/TROUBLESHOOTING.md`, `docs/MANUAL-GIST.md`)
- [ ] package dependency strategy fix to remove runtime-breaking `file:` deps from published artifacts

## Sources

### Primary (HIGH confidence)
- Local repo audit:
  - `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, `AGENTS.md`
  - `package.json`, `packages/*/package.json`, `vitest.config.ts`
  - `packages/testkit/src/{repo-fixtures.ts,provider-fixtures.ts,codex-fixtures.ts,claude-fixtures.ts}`
  - `packages/agent-badge/src/commands/init.test.ts`
  - `packages/core/src/init/preflight.test.ts`
  - `packages/core/src/repo/repo-fingerprint.test.ts`
- npm docs:
  - https://docs.npmjs.com/cli/v11/commands/npm-ci/
  - https://docs.npmjs.com/cli/v11/commands/npm-pack/
  - https://docs.npmjs.com/cli/v11/commands/npm-publish/
  - https://docs.npmjs.com/cli/v11/commands/npm-init/
  - https://docs.npmjs.com/trusted-publishers/
- GitHub docs:
  - https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs
  - https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations
  - https://docs.github.com/en/actions/tutorials/publish-packages/publish-nodejs-packages
- Action READMEs:
  - https://github.com/actions/setup-node
  - https://github.com/actions/checkout
  - https://github.com/changesets/action
  - https://github.com/changesets/changesets
- Node release status:
  - https://nodejs.org/en/about/previous-releases

### Secondary (MEDIUM confidence)
- npm registry version checks run locally on 2026-03-31 (`npm view ... version time.modified --json`) for: `@changesets/cli`, `vitest`, `tsx`, `typescript`, `commander`, `octokit`, `zod`, `simple-git-hooks`.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - validated with official npm/GitHub/npm docs and registry data.
- Architecture: HIGH - derived from existing repo patterns plus official CI/release mechanics.
- Pitfalls: HIGH - directly reproduced in local pack/smoke commands.

**Research date:** 2026-03-31
**Valid until:** 2026-04-30
