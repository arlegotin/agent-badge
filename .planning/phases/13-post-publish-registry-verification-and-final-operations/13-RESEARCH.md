# Phase 13: Post-Publish Registry Verification and Final Operations - Research

**Researched:** 2026-04-01
**Domain:** post-publish npm registry verification, initializer/runtime smoke validation, and final release runbook operations for a TypeScript npm workspace CLI
**Confidence:** HIGH

## User Constraints

- No phase `13-CONTEXT.md` exists for this phase.
- Scope this phase to `REL-09` and `OPER-07`.
- Use the roadmap, requirements, Phase 12 evidence, the checked-in release docs/scripts, and the live npm registry as the source of truth.
- Treat the actual published registry artifacts as the authority for this phase, not local tarballs alone.
- Keep repo-owned automation separate from human/external verification, and do not claim offline proof for behavior that only the live registry can prove.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REL-09 | Maintainer can install the published `agent-badge`, `create-agent-badge`, and `@agent-badge/core` artifacts from the npm registry in a clean environment and confirm the shipped CLI and initializer behavior | Phase 13 needs an exact-version registry smoke script plus durable evidence artifacts. The smoke must assert real scaffold effects, not only successful process exit. |
| OPER-07 | Maintainer can follow one production release checklist that covers registry preflight, publish execution, GitHub Actions confirmation, and post-publish smoke verification | `docs/RELEASE.md` should become the single operator runbook, updated to include the Phase 13 registry smoke step and its evidence outputs. |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- Preserve the local-first, serverless architecture. Phase 13 should verify published npm artifacts and documentation, not add backend services.
- Preserve aggregate-only privacy. Post-publish evidence must not include raw transcripts, prompt text, filenames, or local paths beyond temp-workspace diagnostics already used in repo-owned smoke scripts.
- Preserve the initializer-first npm UX. `npm init agent-badge@latest` remains a product contract and must be treated as a first-class acceptance surface.
- Keep `init` idempotent and failure-soft behavior intact. This phase is verification/operations work, not an excuse to redesign product flows.
- Follow existing repo-owned script and documentation patterns instead of inventing a second release/runbook system.

## Summary

Phase 13 should not be planned as a simple documentation closeout. The live registry state is healthy at the metadata level: `@legotin/agent-badge`, `@legotin/agent-badge-core`, and `create-agent-badge` all currently resolve to `1.1.1` on npm, matching the Phase 12 publish evidence. A fresh exact-version install from the registry in `/tmp` succeeded for all three packages, and direct ESM imports of the runtime, core package, and initializer package all worked.

The blocker is behavioral, not packaging metadata. The published runtime package works from the registry: `@legotin/agent-badge@1.1.1` can be installed in a clean directory and `agent-badge init` succeeds, including a safe no-auth path that scaffolds local files and defers gist setup. But the published initializer path appears broken as shipped: `npm init agent-badge@1.1.1` exited `0` and left the target directory empty, and running the installed `create-agent-badge` bin directly also exited `0` with no output and no scaffold changes. The current tarball smoke and current registry-help-style smoke would miss this because they only assert `create-agent-badge --help` exits successfully.

That means the planner should assume Phase 13 may uncover a release-blocking defect rather than just adding evidence. The safest plan is to add a repo-owned registry smoke workflow that proves exact-version runtime install behavior without hitting GitHub side effects, records durable evidence, and explicitly checks the initializer-first contract. If the initializer remains broken, REL-09 cannot honestly be marked complete without a follow-up repair release.

**Primary recommendation:** plan Phase 13 around a new no-auth exact-version registry smoke script plus evidence artifacts, and treat `npm init agent-badge@1.1.1` as a current blocker that must be detected and either fixed in a follow-up release or explicitly escalated before closing `REL-09`.

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| npm CLI | local `11.6.0`; current docs line `11.11.x` | Live registry install, `npm init`, and `npm view` verification | npm is the system of record for the published artifacts and the official `npm init <package-spec>` contract |
| Node.js | local `22.14.0`; workflow target `24.x` | Runtime for fresh install smoke and published CLI execution | The published packages are Node CLIs/libraries and Phase 13 must verify them under a real Node runtime, not only via tarball packing |
| Repo-owned registry smoke script | new Phase 13 script | Exact-version clean-room validation of published packages | The repo already uses repo-owned shell entrypoints for pack smoke and clean-checkout verification; Phase 13 should extend that pattern |
| `docs/RELEASE.md` | checked-in runbook | Single operator checklist across preflight, publish, workflow confirmation, and post-publish smoke | `OPER-07` requires one maintained place, and the repo already treats this file as the release runbook |

### Supporting

| Library / Tool | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | repo range `^3.2.0` | Unit coverage for bin/direct-execution edge cases | Use for create-package direct-execution tests and other no-network validation around registry-smoke helpers |
| `bash` | local `3.2.57` | Temp-dir orchestration, file assertions, and exact shell smoke flow | Use because the repo already ships `verify-clean-checkout.sh` and `verify-packed-install.sh` |
| GitHub Actions `workflow_dispatch` | current repo workflow | Manual confirmation of the production publish path when `gh` is unavailable locally | Use as the canonical workflow confirmation path from the runbook |
| `scripts/verify-docs.sh` | current repo script | Prevent release-runbook drift | Extend it so Phase 13 checklist content becomes enforced, not aspirational |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Exact-version registry smoke from Phase 12 evidence | `@latest` only | `@latest` is useful as a secondary check, but exact versions are the only reproducible proof of what Phase 12 actually shipped |
| Repo-owned registry smoke script | Ad hoc terminal commands in docs only | Rejected because REL-09 needs repeatable evidence, not a human-only ritual |
| `agent-badge init` with GitHub auth masked | Running init with live `GH_TOKEN`/`GITHUB_TOKEN` present | Rejected for smoke because it can create real gists and introduce nondeterministic side effects |
| File and behavior assertions for initializer proof | Exit-code-only `create-agent-badge --help` | Rejected because the published initializer currently appears to no-op while still exiting successfully |
| GitHub web UI workflow confirmation | GitHub CLI | `gh` is missing locally, but GitHub docs confirm `workflow_dispatch` can be run and confirmed from the Actions web UI |

**Installation / verification commands:**

```bash
npm view @legotin/agent-badge version time --json
npm view @legotin/agent-badge-core version time --json
npm view create-agent-badge version time --json
```

**Published versions verified on 2026-04-01:**

- `@legotin/agent-badge` -> `1.1.1` (`publishedAt` 2026-03-31T17:56:18.251Z)
- `@legotin/agent-badge-core` -> `1.1.1` (`publishedAt` 2026-03-31T17:56:17.952Z)
- `create-agent-badge` -> `1.1.1` (`publishedAt` 2026-03-31T17:56:17.271Z)

## Architecture Patterns

### Recommended Project Structure

```text
scripts/
├── smoke/
│   ├── verify-packed-install.sh      # existing tarball smoke
│   └── verify-registry-install.sh    # new exact-version registry smoke
├── release/
│   └── capture-publish-evidence.ts   # existing Phase 12 evidence helper
└── verify-docs.sh                    # existing docs drift gate

packages/
├── agent-badge/src/cli/main.test.ts  # existing direct-execution pattern
└── create-agent-badge/src/index.test.ts  # new direct-execution coverage

.planning/phases/13-post-publish-registry-verification-and-final-operations/
├── 13-RESEARCH.md
├── 13-REGISTRY-SMOKE.json
├── 13-REGISTRY-SMOKE.md
└── 13-VERIFICATION.md
```

### Pattern 1: No-Auth Exact-Version Registry Smoke

**What:** Install the exact published versions from npm into a fresh `/tmp` project, mask GitHub auth env vars, and verify actual runtime effects.

**When to use:** For the REL-09 proof artifact and as the post-publish smoke step in `docs/RELEASE.md`.

**Why it fits this repo:** The repo already uses `mktemp`, isolated npm cache dirs, and repo-owned smoke scripts. Masking `GH_TOKEN`, `GITHUB_TOKEN`, and `GITHUB_PAT` keeps the smoke deterministic and avoids accidental live gist creation.

**Example:**

```bash
# Source: verified against the published 1.1.1 registry artifacts and modeled on scripts/smoke/verify-packed-install.sh
WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/agent-badge-registry-smoke.XXXXXX")
PROJECT_DIR="${WORK_DIR}/project"
NPM_CACHE_DIR="${npm_config_cache:-${WORK_DIR}/npm-cache}"
mkdir -p "${PROJECT_DIR}" "${NPM_CACHE_DIR}"

cd "${PROJECT_DIR}"
npm_config_cache="${NPM_CACHE_DIR}" npm init -y >/dev/null
npm_config_cache="${NPM_CACHE_DIR}" npm install \
  @legotin/agent-badge@1.1.1 \
  @legotin/agent-badge-core@1.1.1 >/dev/null

env -u GH_TOKEN -u GITHUB_TOKEN -u GITHUB_PAT \
  ./node_modules/.bin/agent-badge init >/tmp/agent-badge-registry-smoke.log

test -f .agent-badge/config.json
test -f .agent-badge/state.json
test -f .git/hooks/pre-push
rg -n '"@legotin/agent-badge"' package.json
rg -n 'Badge setup deferred' /tmp/agent-badge-registry-smoke.log
```

### Pattern 2: Initializer-First Proof Must Assert Files, Not Process Exit

**What:** Treat `npm init agent-badge@<version>` as a separate acceptance surface and assert that it actually scaffolds files.

**When to use:** For the explicit initializer half of `REL-09`.

**Current finding:** The live registry probe on 2026-04-01 showed `npm init agent-badge@1.1.1` exiting successfully but leaving the target directory empty. Running the installed `create-agent-badge` bin directly also exited `0` without output or filesystem changes.

**Implication:** The current published initializer-first UX is not proven by the existing smoke contract and likely fails it.

### Pattern 3: One Runbook, Separate Evidence Files

**What:** Keep `docs/RELEASE.md` as the only operator checklist, but persist post-publish registry smoke evidence in Phase 13 artifacts.

**When to use:** For `OPER-07` so the runbook stays readable while verification remains auditable.

**Why it fits this repo:** Phase 12 already established the Markdown+JSON evidence pattern with `12-PUBLISH-EVIDENCE.*`. Phase 13 should reuse that approach rather than burying smoke output in terminal history.

### Anti-Patterns to Avoid

- **Exit-code-only initializer smoke:** `create-agent-badge --help` is too weak and already masks a likely shipped defect.
- **Auth-on smoke runs:** leaving GitHub auth env vars set during smoke can create real public gists and make the test nondeterministic.
- **Workspace-local verification:** installing from the monorepo or from tarballs alone is not enough for `REL-09`; the registry artifact itself must be installed in a clean temp project.
- **Latest-only evidence:** checking `latest` without also pinning the exact published version weakens reproducibility.
- **Treating `npm view` as sufficient REL-09 proof:** registry metadata visibility proves publish success, not runtime or initializer behavior.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Temp workspace management | ad hoc manual cleanup steps | `mktemp` + `trap cleanup EXIT` pattern from the existing smoke scripts | The repo already solved scratch-space hygiene and `/tmp` usage for constrained machines |
| Registry metadata proof | manual copy/paste from npm web pages | `npm view <pkg> version dist-tags.latest time --json` | Machine-readable, scriptable, and already used in earlier release phases |
| Release runbook drift detection | manual checklist review | `scripts/verify-docs.sh` | Existing repo pattern for enforcing docs strings at build time |
| Direct bin-path behavior checks | hoping `#!/usr/bin/env node` is enough | explicit direct-execution tests modeled on `packages/agent-badge/src/cli/main.test.ts` | Symlinked bin execution is a real failure mode and already matters here |
| Publish artifact evidence format | screenshots or copied console output | checked-in Markdown + JSON phase artifacts | The repo already established this pattern in Phase 12 |

**Key insight:** Phase 13 does not need new infrastructure; it needs stronger assertions on top of the repo’s existing smoke-script, docs-check, and evidence-file patterns.

## Common Pitfalls

### Pitfall 1: Silent Initializer No-Op

**What goes wrong:** `npm init agent-badge@1.1.1` or the installed `create-agent-badge` bin exits successfully but scaffolds nothing.

**Why it happens:** The published initializer package has no direct-execution test coverage and uses a simpler `import.meta.url === pathToFileURL(process.argv[1]).href` guard than the runtime CLI, which already uses a `realpathSync`-aware helper.

**How to avoid:** Add create-package direct-execution tests and require filesystem assertions in the registry smoke.

**Warning signs:** Empty project directory after `npm init agent-badge@<version>`; successful exit with no stdout.

### Pitfall 2: Smoke Test Creates Real Gists

**What goes wrong:** A registry smoke run mutates live GitHub state and becomes dependent on the maintainer’s auth setup.

**Why it happens:** `agent-badge init` auto-detects `GH_TOKEN`, `GITHUB_TOKEN`, or `GITHUB_PAT` and will create a real public gist when auth is available.

**How to avoid:** Mask GitHub auth env vars during the smoke and assert the documented deferred publish guidance instead.

**Warning signs:** Output contains `Publish target: created public gist`; a new gist appears during a supposed smoke-only run.

### Pitfall 3: Cold-Cache Network/Sandbox False Negatives

**What goes wrong:** `npm init` or `npm install` appears broken because the sandbox hits DNS/network issues or a cold cache stalls.

**Why it happens:** This repo already documents constrained-machine npm behavior, and sandboxed network calls can fail differently from the maintainer environment.

**How to avoid:** Keep `/tmp` scratch space and isolated npm cache guidance in the runbook; treat sandbox DNS errors as environment issues unless reproduced outside the sandbox.

**Warning signs:** `ENOTFOUND registry.npmjs.org` in sandbox, followed by success outside the sandbox with the same command.

### Pitfall 4: Warning-Free Install Assumptions

**What goes wrong:** Smoke validation treats stderr warnings as hard failure even when the install is functionally correct.

**Why it happens:** Installing the published packages currently emits a `prebuild-install@7.1.3` deprecation warning from a transitive native dependency path.

**How to avoid:** Fail on command exit code or missing assertions, not on the presence of deprecation warnings alone.

**Warning signs:** Successful install followed by warning text but working imports and CLIs.

## Code Examples

Verified patterns from local repo code, live registry checks, and official docs:

### Direct-Execution Test Pattern for Published Bins

```typescript
// Source: packages/agent-badge/src/cli/main.test.ts
const tempRoot = await mkdtemp(join(tmpdir(), "agent-badge-cli-"));
const symlinkPath = join(tempRoot, "agent-badge");
const mainPath = new URL("./main.ts", import.meta.url);

await symlink(mainPath, symlinkPath);
expect(isDirectExecution([process.execPath, symlinkPath])).toBe(true);
```

Use the same pattern for `create-agent-badge` so the published bin path is tested explicitly instead of assumed.

### Official npm Initializer Mapping

```text
# Source: https://docs.npmjs.com/cli/v11/commands/npm-init/
npm init foo@latest  =>  npm exec create-foo@latest
```

That mapping is why Phase 13 must validate `npm init agent-badge@<version>` directly, not only `npm install create-agent-badge`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tarball-only smoke plus `create-agent-badge --help` | Exact-version registry smoke with file assertions and no-auth runtime init | Required after the first real publish on 2026-03-31 / 2026-04-01 | Catches shipped bin execution bugs that tarball/import-only proof misses |
| Separate preflight/publish proof without registry runtime evidence | Preflight + publish evidence + post-publish registry smoke | Phase 11 + Phase 12 completed; Phase 13 is the missing final proof | Closes the gap between “published successfully” and “works when users install it” |
| Manual recollection of workflow runs | One maintained release checklist plus phase evidence files | Phase 12 established the checklist/evidence pattern | Makes the production runbook repeatable for later maintainers |

**Deprecated/outdated:**

- `create-agent-badge --help` as a smoke assertion: insufficient for REL-09.
- Treating the tarball smoke as equivalent to registry proof: not acceptable after public publish.

## Open Questions

1. **Can Phase 13 close `REL-09` if the live initializer remains broken at `1.1.1`?**
   - What we know: `npm init agent-badge@1.1.1` exited `0` on 2026-04-01 and left the target directory empty; the installed `create-agent-badge` bin also exited `0` without scaffolding.
   - What's unclear: whether the phase is allowed to end in a documented blocker and spawn a repair release, or whether it is expected to include that repair work.
   - Recommendation: treat this as a blocker to requirement completion; if reproduced during implementation, insert a repair/re-release phase rather than papering over it.

2. **Should the post-publish smoke prove `@latest` or the exact published version?**
   - What we know: official npm docs say unqualified install resolves the `latest` tag, and current registry state shows `latest=1.1.1` for all three packages.
   - What's unclear: whether the requirement values reproducibility over human-typical install syntax.
   - Recommendation: do both, but make exact-version proof the authoritative evidence and `@latest` a small secondary sanity check.

3. **How much live GitHub behavior should Phase 13 exercise?**
   - What we know: `agent-badge init` can create a real gist when auth is present, which is inappropriate for routine smoke tests.
   - What's unclear: whether maintainers want a side-effecting end-to-end smoke as part of the normal release checklist.
   - Recommendation: no side effects in Phase 13 smoke. Mask auth and verify the deferred publish guidance instead.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Registry install smoke and published CLI execution | ✓ | `v22.14.0` | — |
| npm CLI | `npm view`, `npm install`, `npm init` | ✓ | `11.6.0` | — |
| git | `agent-badge init` bootstraps repo state in a clean temp directory | ✓ | `2.49.0` | — |
| bash | Repo-owned smoke scripts | ✓ | `3.2.57` | — |
| npm registry connectivity | Live registry verification | ✓ | observed via `npm view` on 2026-04-01 | none |
| GitHub CLI (`gh`) | Optional workflow confirmation from terminal | ✗ | — | Use GitHub Actions web UI per official docs |
| `/tmp` scratch space | Clean-room smoke environment | ✓ | writable | none |

**Missing dependencies with no fallback:**

- None identified for the repo-owned smoke work itself.

**Missing dependencies with fallback:**

- `gh` is missing locally; confirm `workflow_dispatch` and run status via the GitHub web UI instead.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest` `^3.2.0` |
| Config file | none |
| Quick run command | `npm test -- --run packages/agent-badge/src/cli/main.test.ts` |
| Full suite command | `npm run docs:check && npm test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REL-09 | Exact published runtime/core packages install from npm in a fresh temp project and `agent-badge init` scaffolds expected files with auth masked | smoke | `bash scripts/smoke/verify-registry-install.sh --version 1.1.1` | ❌ Wave 0 |
| REL-09 | Published initializer-first path actually scaffolds files when invoked as `npm init agent-badge@<version>` | smoke | `bash scripts/smoke/verify-registry-install.sh --version 1.1.1 --check-initializer` | ❌ Wave 0 |
| REL-09 | `create-agent-badge` direct-execution guard works for the published/symlinked bin path | unit | `npm test -- --run packages/create-agent-badge/src/index.test.ts` | ❌ Wave 0 |
| OPER-07 | Release checklist documents preflight, publish execution, workflow confirmation, and post-publish smoke in one maintained place | docs/assertion | `npm run docs:check` | ✅ |

### Sampling Rate

- **Per task commit:** `npm run docs:check` plus targeted Vitest file for any new direct-execution helper/tests
- **Per wave merge:** `npm test -- --run && npm run docs:check`
- **Phase gate:** Run the new registry smoke in a fresh temp environment and persist `13-REGISTRY-SMOKE.*` before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `scripts/smoke/verify-registry-install.sh` — exact-version registry smoke for runtime, core, and initializer behavior
- [ ] `packages/create-agent-badge/src/index.test.ts` — direct-execution coverage for the initializer bin path
- [ ] `scripts/verify-docs.sh` updates — enforce the Phase 13 checklist strings and evidence artifact references
- [ ] `13-REGISTRY-SMOKE.json` + `13-REGISTRY-SMOKE.md` generation path — durable post-publish evidence parallel to Phase 12 artifacts

## Sources

### Primary (HIGH confidence)

- Live npm registry via `npm view @legotin/agent-badge version dist-tags.latest time --json` on 2026-04-01
- Live npm registry via `npm view @legotin/agent-badge-core version dist-tags.latest time --json` on 2026-04-01
- Live npm registry via `npm view create-agent-badge version dist-tags.latest time --json` on 2026-04-01
- Official npm init docs: https://docs.npmjs.com/cli/v11/commands/npm-init/
- Official npm install docs: https://docs.npmjs.com/cli/v11/commands/npm-install/
- Official npm package.json/bin docs: https://docs.npmjs.com/cli/v11/configuring-npm/package-json
- Official GitHub Actions manual workflow docs: https://docs.github.com/en/actions/how-tos/managing-workflow-runs-and-deployments/managing-workflow-runs/manually-running-a-workflow?tool=webui
- Local repo sources: `docs/RELEASE.md`, `package.json`, `.github/workflows/release.yml`, `scripts/smoke/verify-packed-install.sh`, `scripts/verify-clean-checkout.sh`, `scripts/verify-docs.sh`, `packages/agent-badge/src/cli/main.ts`, `packages/agent-badge/src/cli/main.test.ts`, `packages/create-agent-badge/src/index.ts`

### Secondary (MEDIUM confidence)

- Empirical fresh-install probe on 2026-04-01: exact-version install of `@legotin/agent-badge@1.1.1`, `@legotin/agent-badge-core@1.1.1`, and `create-agent-badge@1.1.1` in `/tmp` succeeded; imports and `agent-badge init` worked
- Empirical no-auth runtime-init probe on 2026-04-01: published `agent-badge init` scaffolded `.agent-badge/*`, updated `package.json`, created `.git/hooks/pre-push`, and deferred gist setup as expected

### Tertiary (LOW confidence)

- Empirical initializer probe on 2026-04-01: `npm init agent-badge@1.1.1` and the installed `create-agent-badge` bin both exited successfully but produced no scaffold output. This is highly suggestive of a shipped defect, but it should be re-run in the implementation phase and treated as a blocker if reproduced.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - based on official npm/GitHub docs, local tool availability, and live registry queries
- Architecture: HIGH - anchored in existing repo-owned script/documentation patterns and verified live smoke experiments
- Pitfalls: HIGH - driven by direct empirical failures and gaps in current smoke coverage

**Research date:** 2026-04-01
**Valid until:** 2026-04-08
