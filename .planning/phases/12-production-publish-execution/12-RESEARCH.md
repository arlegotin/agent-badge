# Phase 12: Production Publish Execution - Research

**Researched:** 2026-03-31
**Domain:** production npm publish execution, GitHub Actions release orchestration, and durable release-evidence capture for a TypeScript npm workspace CLI
**Confidence:** HIGH

<user_constraints>
## User Constraints

- No phase `12-CONTEXT.md` exists for this phase.
- Scope this phase to `REL-08` only.
- Use the roadmap, requirements, prior release phases, and current repo files as the project-specific source of truth.
- Separate automatable repo changes from human/credential/external verification; do not pretend the live production publish can be fully simulated offline.
- Keep the release path anchored to the current repo-owned workflow unless the phase makes one explicit operator-path choice and documents it.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REL-08 | Maintainer can execute the intended production publish path with real release credentials and observe a successful release run for the current source | Phase 12 should make one release trigger canonical, capture publish outputs from the checked-in workflow, and record durable evidence of the exact packages and versions shipped from current source |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- Keep the product local-first and serverless; Phase 12 must not introduce hosted release infrastructure beyond the existing GitHub Actions and npm path.
- Preserve aggregate-only privacy guarantees; release evidence must not include raw transcripts, prompt text, filenames, or local paths.
- Preserve the initializer-first npm UX; published artifacts must remain the same deliberate packages prepared in prior phases.
- Preserve failure-soft runtime behavior and idempotent init semantics; release work is maintainer workflow hardening, not product-surface redesign.
- Follow existing workspace, script, and workflow patterns rather than inventing a second release system.
- Stay inside the GSD workflow; repo edits for this phase should be limited to repo-owned release workflow/evidence mechanics and documentation.

## Summary

Phase 12 is not a generic "run publish" task. The repo already has the important release prerequisites:

- `npm run verify:clean-checkout` is the canonical clean-tree rehearsal.
- `npm run release:preflight` already checks registry state, npm auth, release inputs, and workflow markers.
- `.github/workflows/release.yml` already defines a production release job with `changesets/action@v1`.
- the publishable manifests are already locked to `1.1.0` for `agent-badge`, `create-agent-badge`, and `@agent-badge/core`.

The planning gap is operational, not architectural: the repo does not yet distinguish clearly between the canonical production path and the local fallback path, and the workflow does not yet capture durable publish evidence. The checked-in release checklist still tells maintainers to run `npm run release` locally, but the repo also has a GitHub Actions workflow with `workflow_dispatch`. For the first real ship, the plan should make the GitHub Actions workflow the canonical operator path and keep local `npm run release` as documented recovery only.

One more repo-specific fact matters: there are no pending changeset markdown files in `.changeset/`, but the installed Changesets CLI still publishes public packages whose local version is not already on npm. In other words, the first release can still publish the current `1.1.0` manifests if those versions remain unpublished. That makes Phase 12 feasible without adding a synthetic version bump, but it also means the phase must record the exact `publishedPackages` result from the real run so partial/no-op reruns are not misreported.

**Primary recommendation:** keep the roadmap split exactly as written, but make `workflow_dispatch` on the checked-in `Release` workflow the canonical first-release trigger, and add explicit workflow summary/artifact evidence before executing the live publish.

## Current Repo State

### The checked-in workflow is close, but not evidence-ready

[`release.yml`](../../../.github/workflows/release.yml) already:

- runs on both `workflow_dispatch` and `push` to `main`
- uses `actions/checkout@v6` and `actions/setup-node@v6`
- runs `npm ci`, `npm run typecheck`, and `npm run verify:clean-checkout`
- uses `changesets/action@v1` with `publish: npm run release`
- passes `NPM_TOKEN`

Current gaps:

- the `changesets/action` step has no `id`, so the workflow cannot read `published` or `publishedPackages`
- there is no `$GITHUB_STEP_SUMMARY` write
- there is no uploaded release-evidence artifact
- there is no `concurrency` guard even though the workflow has both `push` and `workflow_dispatch`

### The current checklist still points at the wrong primary operator action

[`docs/RELEASE.md`](../../../docs/RELEASE.md) correctly requires:

- `npm run docs:check`
- `npm run typecheck`
- `npm run verify:clean-checkout`
- `npm run release:preflight`

But Step 4 still tells the maintainer to run:

```bash
npm run release
```

That bypasses the intended workflow evidence path. Phase 12 should fix this before the real publish.

### The repo is ready to derive exact publish targets

The publishable workspace manifests are explicit and aligned:

- [`packages/core/package.json`](../../../packages/core/package.json) -> `@agent-badge/core@1.1.0`
- [`packages/agent-badge/package.json`](../../../packages/agent-badge/package.json) -> `agent-badge@1.1.0`
- [`packages/create-agent-badge/package.json`](../../../packages/create-agent-badge/package.json) -> `create-agent-badge@1.1.0`

`scripts/release/preflight.ts` already derives the inventory from those manifests instead of a duplicated list, so Phase 12 should reuse that pattern for evidence capture and verification.

### There are no release tags yet

`git tag --sort=-creatordate | head` returned no tags. The first production publish should therefore record:

- the first release tag created
- the exact workflow run that created it
- the exact package/version set published in that run

### There are no pending changeset files

`.changeset/` currently contains only `README.md` and `config.json`. The installed Changesets CLI source shows that `changeset publish` publishes any public package whose local version is not already present on npm, and skips packages whose local version is already published. That behavior makes the first `1.1.0` publish viable without new changesets, but it also means reruns can be partial or no-op depending on what already succeeded.

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| GitHub Actions `Release` workflow | checked-in workflow | Canonical production publish path | It is already the repo-owned release job and already runs the same rehearsal gates validated in Phases 10 and 11 |
| `changesets/action` | `v1` | Orchestrate release PR vs publish and expose publish outputs | Official Changesets integration for CI publishing; supports `published` and `publishedPackages` outputs for evidence capture |
| `@changesets/cli` | repo range `^2.29.0`, lockfile resolves `2.30.0` | Actual `changeset publish` execution and git tagging | Current repo-owned release command already depends on it; local installed source confirms unpublished-version publish behavior |
| npm CLI | local `11.6.0`, workflow uses Node 24 runtime | Registry auth, publish, and preflight commands | It is the system of record for the target registry and is already used in all repo-owned release commands |

### Supporting

| Library / Tool | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `$GITHUB_STEP_SUMMARY` | GitHub Actions built-in | Human-readable workflow-run evidence | Use in the release job to make publish outcome visible on the run summary page |
| `actions/upload-artifact` | `v6` current in official repo docs | Persist machine-readable release evidence from the workflow run | Use to upload JSON or markdown evidence generated during the real publish run |
| `workflow_dispatch` | GitHub Actions built-in | Intentional first-release trigger on default branch | Use as the canonical operator action for Phase 12 because it produces one explicit audited publish run without requiring a new commit |
| `npm run release:preflight -- --json` | repo-owned | Final machine-readable preflight record before live publish | Capture immediately before triggering the real release workflow |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Canonical `workflow_dispatch` release | Local `npm run release` from maintainer machine | Rejected as the primary path because it bypasses workflow-run evidence and requires manual tag push semantics |
| One canonical workflow trigger for the first ship | Keeping both `push` and `workflow_dispatch` equally acceptable | Rejected for planning because it makes duplicate-run behavior and evidence ownership ambiguous |
| Step outputs plus summary/artifact evidence | Reconstructing publish results from raw logs later | Rejected because it is brittle and artifacts/logs are retained only for a limited period |
| Existing `NPM_TOKEN` contract for Phase 12 | Migrating to npm trusted publishing mid-phase | Rejected for this phase because earlier release work already validated the token-based contract; OIDC migration is better handled after the first ship |

**Version verification notes:**

- Local environment: `node v22.14.0`, `npm 11.6.0`, `git 2.49.0`
- `gh` CLI is not installed locally
- Direct `npm view` version queries from this sandbox did not return usable results, so tool versions above are taken from the checked-in workflow, the lockfile-resolved dependency tree, and official docs

## Architecture Patterns

### Recommended Project Structure

```text
.github/workflows/
└── release.yml          # Canonical production publish path

scripts/release/
├── preflight.ts         # Existing live readiness gate
└── evidence.*           # Small repo-owned helper only if JSON evidence generation needs logic

docs/
└── RELEASE.md           # Operator runbook for local gates + workflow trigger

.planning/phases/12-production-publish-execution/
├── 12-RESEARCH.md
├── 12-VERIFICATION.md   # Durable checked-in evidence after the live run
└── 12-0x-SUMMARY.md
```

### Pattern 1: Workflow-First Production Publish

**What:** Treat the checked-in GitHub Actions workflow as the canonical production publish path, with local scripts limited to rehearsal and preflight.

**When to use:** For the first real production publish and any later release that needs auditable CI evidence.

**Why it fits this repo:** The workflow already runs `typecheck` and `verify:clean-checkout`, and it already invokes `npm run release` through `changesets/action@v1`.

**Example:**

```yaml
# Source: https://github.com/changesets/action
concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
  release:
    steps:
      - name: Version or publish
        id: changesets
        uses: changesets/action@v1
        with:
          version: npm run changeset version
          publish: npm run release
```

### Pattern 2: Dual-Layer Evidence Capture

**What:** Capture publish evidence in two places:

- workflow-native evidence for the live run: `$GITHUB_STEP_SUMMARY` and uploaded artifact
- durable repo evidence: checked-in Phase 12 verification/summary doc referencing the run URL, run number, commit SHA, packages, versions, and tag

**When to use:** For the first release where later phases and maintainers need durable proof of exactly what shipped.

**Example:**

```yaml
# Source: https://docs.github.com/actions/.../workflow-commands-for-github-actions
- name: Write release summary
  if: always()
  run: |
    echo "## Release Result" >> "$GITHUB_STEP_SUMMARY"
    echo "- Published: ${{ steps.changesets.outputs.published }}" >> "$GITHUB_STEP_SUMMARY"
    echo "- Packages: ${{ steps.changesets.outputs.publishedPackages }}" >> "$GITHUB_STEP_SUMMARY"
```

### Pattern 3: Manifest-Derived Release Truth

**What:** Use the existing manifest-derived package inventory from `scripts/release/preflight.ts` as the source of truth for expected packages and versions.

**When to use:** For workflow evidence validation and post-run documentation.

**Why it fits this repo:** Phase 11 already established this pattern and avoids a second publish-target list.

### Anti-Patterns to Avoid

- **Local publish as the primary documented path:** It weakens evidence capture and creates extra manual tag-push obligations.
- **Log-scraping after the fact:** `changesets/action` already exposes publish outputs; use them directly.
- **Treating `push` and `workflow_dispatch` as equally canonical for the first ship:** It muddies operator intent and duplicate-run handling.
- **Adding a synthetic version bump just to force a first release:** Current manifests already hold the deliberate `1.1.0` release versions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Publish orchestration | Custom npm publish loop | `changesets/action@v1` + `changeset publish` | The repo already uses Changesets, and its installed CLI already handles unpublished-version detection and tagging |
| Workflow-run evidence | Ad hoc log parsing | `steps.changesets.outputs.*`, `$GITHUB_STEP_SUMMARY`, and `actions/upload-artifact` | These are the native structured outputs and persistence mechanisms |
| Publish target inventory | Hardcoded package/version arrays in another script | Existing manifest-derived inventory from `scripts/release/preflight.ts` | Avoids drift between manifests, preflight, and evidence |
| Offline publish simulation | More dry-run scaffolding | Existing `verify:clean-checkout` + `release:preflight` plus one real workflow run | REL-08 requires a real publish with credentials, not a stronger fake |

**Key insight:** Phase 12 should not try to "test around" the real publish. It should harden the repo-owned path just enough that one intentional live run yields trustworthy evidence and no undocumented operator improvisation.

## Common Pitfalls

### Pitfall 1: Documenting the local CLI publish as the main release path

**What goes wrong:** Maintainers run `npm run release` locally because the checklist says to, but the intended workflow path and its evidence never run.

**Why it happens:** `docs/RELEASE.md` still points at the local command even though `.github/workflows/release.yml` is the better audited path.

**How to avoid:** Make `workflow_dispatch` on the checked-in `Release` workflow the canonical first-release step and demote local `npm run release` to recovery-only documentation.

**Warning signs:** A successful npm publish exists, but there is no GitHub Actions run showing the publish result.

### Pitfall 2: Failing to capture `publishedPackages`

**What goes wrong:** The team knows "the workflow passed" but cannot prove exactly which packages published in that run.

**Why it happens:** The current workflow does not assign an `id` to the `changesets/action` step, so its outputs are inaccessible.

**How to avoid:** Add `id: changesets`, then persist `published` and `publishedPackages` to both the step summary and an artifact.

**Warning signs:** Operators must reconstruct package/version results from logs by hand.

### Pitfall 3: Duplicate or racing release runs

**What goes wrong:** The release workflow can be triggered both by `push` and manually, risking overlapping runs around the same source state.

**Why it happens:** The workflow currently has both triggers and no `concurrency` guard.

**How to avoid:** Add `concurrency: ${{ github.workflow }}-${{ github.ref }}` and document one canonical first-release trigger.

**Warning signs:** Two release runs appear for the same commit or branch head.

### Pitfall 4: Treating workflow logs/artifacts as permanent proof

**What goes wrong:** Evidence disappears later because GitHub Actions artifacts and logs are retained for a limited period.

**Why it happens:** Workflow artifacts are convenient, so teams stop there.

**How to avoid:** Use workflow-native evidence for the live run, then commit a durable Phase 12 verification record with run metadata and published outputs.

**Warning signs:** The only release proof is an Actions URL or artifact that can expire.

### Pitfall 5: Misunderstanding Changesets first-release behavior

**What goes wrong:** The planner assumes missing changeset markdown files mean the first publish cannot happen.

**Why it happens:** Changesets docs emphasize the normal `version` then `publish` flow, but the installed CLI also publishes any public package whose local version is not already on npm.

**How to avoid:** Use the current `1.1.0` manifests plus live preflight results as the release truth for this phase, and record the exact packages the real run published.

**Warning signs:** The plan introduces an unnecessary version-bump detour even though registry preflight still reports the current versions as safe to publish.

### Pitfall 6: Forgetting that local publish creates git tags

**What goes wrong:** A fallback local publish succeeds on npm but leaves tags unpushed or inconsistently recorded in GitHub.

**Why it happens:** `changeset publish` creates git tags, and local usage expects a later `git push --follow-tags`.

**How to avoid:** Keep local publish as recovery only, and if it is ever used, document the tag push step explicitly as part of the recovery path.

**Warning signs:** npm shows published packages but the repository has no corresponding release tag.

## Code Examples

Verified patterns from official and installed sources:

### Capture Changesets publish outputs in the workflow

```yaml
# Source: https://github.com/changesets/action
- name: Version or publish
  id: changesets
  uses: changesets/action@v1
  with:
    version: npm run changeset version
    publish: npm run release
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Write a job summary for the run page

```yaml
# Source: https://docs.github.com/actions/.../workflow-commands-for-github-actions
- name: Summarize release result
  if: always()
  run: |
    echo "## Release Result" >> "$GITHUB_STEP_SUMMARY"
    echo "- Published: ${{ steps.changesets.outputs.published }}" >> "$GITHUB_STEP_SUMMARY"
    echo "- Published packages: ${{ steps.changesets.outputs.publishedPackages }}" >> "$GITHUB_STEP_SUMMARY"
    echo "- Commit: $GITHUB_SHA" >> "$GITHUB_STEP_SUMMARY"
```

### Upload machine-readable release evidence

```yaml
# Source: https://github.com/actions/upload-artifact
- name: Upload release evidence
  if: always()
  uses: actions/upload-artifact@v6
  with:
    name: release-evidence-${{ github.run_id }}
    path: ./.release-evidence/
    if-no-files-found: error
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Long-lived `NPM_TOKEN` as the standard CI publish auth path | npm now recommends trusted publishing via OIDC for GitHub Actions | npm docs updated by March 2026 | Better security and automatic provenance, but this repo has already validated the token-based contract; Phase 12 should ship on the current path and defer auth migration |
| Raw workflow logs as ad hoc release evidence | Structured step outputs, job summaries, and uploaded artifacts | Current GitHub Actions patterns | Makes the exact publish result machine-readable and human-visible |
| Manual release command from a maintainer shell as the obvious publish path | Intentional `workflow_dispatch` on a checked-in release workflow | Current GitHub Actions operator pattern | Better auditability, one canonical run, easier post-run evidence capture |

**Deprecated/outdated:**

- Token-first CI publishing as a best practice: npm now prefers trusted publishers for GitHub-hosted Actions, but changing auth models is a post-release hardening task here, not Phase 12 scope.

## Open Questions

1. **Should the repo keep automatic `push` releases after the first production ship, or only use manual dispatch for releases?**
   - What we know: the checked-in workflow has both `push` and `workflow_dispatch`, and the first release needs one deliberate canonical operator path.
   - What's unclear: whether the team wants future merges to `main` to remain publish-capable automatically.
   - Recommendation: for Phase 12 planning, treat `workflow_dispatch` as canonical for the first real ship and leave broader trigger policy for a later release-ops hardening decision.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Local gates and repo-owned scripts | ✓ | `v22.14.0` | Workflow runner uses Node 24.x |
| npm CLI | Preflight, pack verification, publish command | ✓ | `11.6.0` | — |
| git | Clean-tree checks and tag validation | ✓ | `2.49.0` | — |
| GitHub CLI (`gh`) | Optional workflow dispatch/watch convenience | ✗ | — | Use the GitHub Actions web UI; `workflow_dispatch` is supported there |
| GitHub-hosted Actions | Canonical production publish and workflow evidence | Manual / external | runner-managed | Local `npm run release` only as recovery, not canonical |
| GitHub repository secret `NPM_TOKEN` | Current workflow publish auth | Not locally observable | — | None for the current token-based path |

**Missing dependencies with no fallback:**

- A working repo-side publish credential for the checked-in workflow. Phase 11 explicitly notes this cannot be proven locally; the first live run will fail without it.

**Missing dependencies with fallback:**

- `gh` CLI. The plan can rely on the GitHub web UI instead of CLI-based run/watch commands.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest` via `package.json` `test` script |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- --run scripts/release/preflight.test.ts` |
| Full suite command | `npm run verify:clean-checkout` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REL-08 | Local rehearsal and live preflight remain green immediately before release | integration | `npm run verify:clean-checkout && npm run release:preflight` | ✅ |
| REL-08 | Workflow exposes structured publish evidence for the real run | workflow contract / unit if helper added | `npm test -- --run scripts/release/*.test.ts` or equivalent targeted evidence test | ❌ Wave 0 |
| REL-08 | Maintainer can complete the real production publish path and observe success for current source | manual external | GitHub Actions `Release` workflow via `workflow_dispatch` on `main` | N/A manual |

### Sampling Rate

- **Per task commit:** `npm test -- --run scripts/release/preflight.test.ts`
- **Per wave merge:** `npm run verify:clean-checkout`
- **Phase gate:** successful `workflow_dispatch` publish run plus a checked-in verification record before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] Add deterministic verification for the workflow evidence contract if Phase 12-01 introduces a helper script or enforced workflow markers for `id: changesets`, `concurrency`, summary writing, or artifact upload.
- [ ] Add or extend a repo-owned contract check so release evidence wiring cannot drift silently in `.github/workflows/release.yml`.
- [ ] Manual-only by design: no offline automated test can satisfy the actual publish-success portion of `REL-08`; the real workflow run is required.

## Sources

### Primary (HIGH confidence)

- Local repo: [`package.json`](../../../package.json) - confirmed `release`, `release:preflight`, and verification scripts
- Local repo: [`docs/RELEASE.md`](../../../docs/RELEASE.md) - confirmed current operator checklist still points at local `npm run release`
- Local repo: [`.github/workflows/release.yml`](../../../.github/workflows/release.yml) - confirmed triggers, permissions, current gaps, and `changesets/action@v1`
- Local repo: [`scripts/release/preflight.ts`](../../../scripts/release/preflight.ts) - confirmed manifest-derived inventory and workflow-contract checks
- Local repo: [`vitest.config.ts`](../../../vitest.config.ts) - confirmed current test discovery and framework
- Installed Changesets CLI: `node_modules/@changesets/cli/README.md` - confirmed publish semantics and tag behavior
- Installed Changesets CLI source: `node_modules/@changesets/cli/dist/changesets-cli.esm.js` - confirmed unpublished-version detection and per-package publish behavior
- Official Changesets Action README: https://github.com/changesets/action - confirmed `published` / `publishedPackages` outputs, `id: changesets`, and recommended `concurrency`
- Official GitHub Docs, manually running a workflow: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow - confirmed `workflow_dispatch` can be run from the Actions UI or CLI when the workflow is on the default branch
- Official GitHub Docs, workflow commands: https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/workflow-commands-for-github-actions - confirmed `$GITHUB_STEP_SUMMARY`
- Official `actions/upload-artifact` README: https://github.com/actions/upload-artifact - confirmed artifact upload behavior, outputs, and retention-related usage details
- Official GitHub Docs, artifact/log retention: https://docs.github.com/en/organizations/managing-organization-settings/configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-organization - confirmed default 90-day retention

### Secondary (MEDIUM confidence)

- Official npm docs, trusted publishing: https://docs.npmjs.com/trusted-publishers/ - used for state-of-the-art auth guidance and the note that npm now prefers OIDC-based trusted publishers for GitHub-hosted Actions

### Tertiary (LOW confidence)

- None

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - based on checked-in workflow/scripts, installed Changesets behavior, and official docs
- Architecture: HIGH - the release path already exists; Phase 12 mostly needs path selection and evidence capture hardening
- Pitfalls: HIGH - all major pitfalls are directly visible in current repo files or official workflow/publish behavior

**Research date:** 2026-03-31
**Valid until:** 2026-04-07
