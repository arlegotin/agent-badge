# Phase 23: Post-Publish Registry Verification And Version Alignment - Research

**Researched:** 2026-04-05  
**Domain:** post-publish npm registry verification, released-source alignment, and operator runbook reconciliation for the shipped `1.1.3` release [VERIFIED: `.planning/ROADMAP.md`; VERIFIED: user prompt; VERIFIED: `npm view @legotin/agent-badge version dist-tags.latest --json`]  
**Confidence:** HIGH [VERIFIED: live npm registry reads, live exact-version smoke pass, local repo inspection, and official npm/GitHub docs all agree]

## User Constraints

### Locked Decisions

- No `23-CONTEXT.md` exists for this phase, so the active constraints come from the roadmap, requirements, AGENTS instructions, and the user prompt. [VERIFIED: `node "/Users/artemlegotin/.codex/get-shit-done/bin/gsd-tools.cjs" init phase-op "23"`]
- Scope this phase to `REG-01` and `REG-02` only. [VERIFIED: `.planning/REQUIREMENTS.md`; VERIFIED: user prompt]
- Treat Phase 22 as the release source of truth: workflow run `24005943027` succeeded, published commit `db3ff4fa76905fac713a3ee7677d143de25e2b2c` is `chore(release): publish 1.1.3`, and Phase 22 evidence records all three published packages at `1.1.3`. [VERIFIED: `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.json`; VERIFIED: `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-WORKFLOW-RUN.md`]
- The current local working tree is stale for publish alignment: the checked-in publishable manifests are still `1.1.2`, while npm currently exposes `1.1.3` for all three packages. [VERIFIED: `packages/core/package.json`; VERIFIED: `packages/agent-badge/package.json`; VERIFIED: `packages/create-agent-badge/package.json`; VERIFIED: `npm view @legotin/agent-badge version dist-tags.latest --json`; VERIFIED: `npm view @legotin/agent-badge-core version dist-tags.latest --json`; VERIFIED: `npm view create-agent-badge version dist-tags.latest --json`]
- Reuse the existing registry smoke and evidence pattern instead of inventing a new release-proof mechanism. [VERIFIED: user prompt additional context; VERIFIED: `scripts/smoke/verify-registry-install.sh`; VERIFIED: `scripts/release/capture-publish-evidence.ts`]

### Claude's Discretion

- No explicit discretion list was provided in a phase context file; research may recommend the concrete verification and alignment approach as long as it stays within `REG-01` and `REG-02`. [VERIFIED: `node "/Users/artemlegotin/.codex/get-shit-done/bin/gsd-tools.cjs" init phase-op "23"`; VERIFIED: `.planning/REQUIREMENTS.md`]

### Deferred Ideas (OUT OF SCOPE)

- Phase 24 production-ready exit criteria and milestone closeout are out of scope for this phase. [VERIFIED: `.planning/ROADMAP.md`]
- Re-running or replacing the trusted publish path is out of scope unless Phase 23 uncovers a real post-publish defect that truly requires a repair release. [VERIFIED: `.planning/ROADMAP.md`; VERIFIED: `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-WORKFLOW-RUN.md`]

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REG-01 | A clean temp-directory smoke check passes against the live npm registry for the exact released version, including the runtime packages and `npm init agent-badge@latest`. [VERIFIED: `.planning/REQUIREMENTS.md`] | Use the existing repo-owned registry smoke as the base, but add explicit `@latest` initializer coverage and write Phase 23-owned evidence for the released `1.1.3` artifacts. [VERIFIED: `scripts/smoke/verify-registry-install.sh`; VERIFIED: `npm view create-agent-badge version dist-tags.latest --json`; CITED: https://docs.npmjs.com/cli/v11/commands/npm-init/] |
| REG-02 | Published versions, dist-tags, internal dependency references, and operator docs all align with the version visible in npm immediately after release. [VERIFIED: `.planning/REQUIREMENTS.md`] | Align the working tree to the released `1.1.3` source, re-check npm `dist-tags.latest`, and replace the stale Phase 12/13 `1.1.2` runbook strings with Phase 22/23 references. [VERIFIED: `git show db3ff4fa76905fac713a3ee7677d143de25e2b2c:packages/agent-badge/package.json`; VERIFIED: `git show db3ff4fa76905fac713a3ee7677d143de25e2b2c:package-lock.json`; VERIFIED: `docs/RELEASE.md`; VERIFIED: `scripts/verify-docs.sh`; VERIFIED: `npm view @legotin/agent-badge version dist-tags.latest --json`] |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- Keep the product local-first and serverless; Phase 23 should verify published artifacts and align source/docs, not add backend state. [VERIFIED: `AGENTS.md`]
- Preserve aggregate-only privacy; evidence may record package coordinates and pass/blocked status, but must not persist temp paths or local transcript data. [VERIFIED: `AGENTS.md`; VERIFIED: `.planning/STATE.md`; VERIFIED: `scripts/smoke/verify-registry-install.sh`]
- Preserve the initializer-first npm UX; `npm init agent-badge@latest` is a product contract and Phase 23 must verify it directly. [VERIFIED: `AGENTS.md`; VERIFIED: `.planning/REQUIREMENTS.md`]
- Keep `init` idempotent and failure-soft; Phase 23 is verification and alignment work, not a redesign of install behavior. [VERIFIED: `AGENTS.md`]
- Keep work inside the repo’s GSD workflow. [VERIFIED: `AGENTS.md`]

## Summary

Phase 23 should be planned as a proof-and-alignment phase, not as a speculative repair release. The live npm registry already shows `1.1.3` with `dist-tags.latest=1.1.3` for `@legotin/agent-badge`, `@legotin/agent-badge-core`, and `create-agent-badge`, matching Phase 22’s recovered publish evidence and release workflow run `24005943027`. An exact-version clean temp-directory smoke against `1.1.3` already passes with the existing `scripts/smoke/verify-registry-install.sh` script when run with `--check-initializer`. [VERIFIED: `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.json`; VERIFIED: `npm view @legotin/agent-badge version dist-tags.latest time --json`; VERIFIED: `npm view @legotin/agent-badge-core version dist-tags.latest time --json`; VERIFIED: `npm view create-agent-badge version dist-tags.latest time --json`; VERIFIED: `bash scripts/smoke/verify-registry-install.sh --version 1.1.3 --check-initializer`]

The real gap is alignment. The local branch is `ahead 21, behind 1`, and the missing remote commit is the published `db3ff4f` release commit. The checked-in publishable manifests are still `1.1.2`, while the checked-in `package-lock.json` publishable package entries are even older at `1.1.1`. The operator docs and docs verifier still enforce the old Phase 12/13 `1.1.2` release flow, and the smoke script still hardcodes Phase 13 evidence filenames even when a different phase directory is passed. [VERIFIED: `git status --short --branch`; VERIFIED: `git branch -avv`; VERIFIED: `packages/core/package.json`; VERIFIED: `packages/agent-badge/package.json`; VERIFIED: `packages/create-agent-badge/package.json`; VERIFIED: `package-lock.json`; VERIFIED: `docs/RELEASE.md`; VERIFIED: `scripts/verify-docs.sh`; VERIFIED: `scripts/smoke/verify-registry-install.sh`]

The planner should therefore split the work into two precise steps: first, capture Phase 23-owned live registry proof for the shipped `1.1.3` release, including explicit `npm init agent-badge@latest` coverage; second, reconcile the stale local source, lockfile, smoke artifact naming, and operator docs to the already-published `1.1.3` truth, then rerun the Phase 23 verification. [VERIFIED: `.planning/ROADMAP.md`; VERIFIED: `.planning/REQUIREMENTS.md`; CITED: https://docs.npmjs.com/cli/v11/commands/npm-init/]

**Primary recommendation:** use the published release commit `db3ff4f` plus live npm registry reads as the version authority, extend the existing smoke/evidence flow to cover `@latest` and Phase 23 artifact names, and repair all remaining `1.1.2`/Phase 13 runbook drift before closing `REG-01` or `REG-02`. [VERIFIED: `git show --stat --oneline db3ff4fa76905fac713a3ee7677d143de25e2b2c`; VERIFIED: `npm view @legotin/agent-badge version dist-tags.latest --json`; VERIFIED: `scripts/smoke/verify-registry-install.sh`; VERIFIED: `docs/RELEASE.md`; VERIFIED: `scripts/verify-docs.sh`]

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| npm CLI | `11.6.0` locally; npm docs page currently lists CLI `11.11.1` as latest doc line. [VERIFIED: `npm --version`; CITED: https://docs.npmjs.com/cli/v11/commands/npm-init/] | Read live registry metadata, install released artifacts, and drive `npm init` acceptance checks. [VERIFIED: `npm view @legotin/agent-badge version dist-tags.latest --json`; VERIFIED: `bash scripts/smoke/verify-registry-install.sh --version 1.1.3 --check-initializer`] | npm is the system of record for both exact-version and `latest` install behavior. [CITED: https://docs.npmjs.com/cli/v11/commands/npm-init/; CITED: https://docs.npmjs.com/cli/v8/commands/npm-dist-tag] |
| Node.js | `v22.14.0` locally; release workflow uses `24.x`. [VERIFIED: `node --version`; VERIFIED: `.github/workflows/release.yml`] | Runtime for smoke installs, repo scripts, and release evidence tooling. [VERIFIED: `scripts/smoke/verify-registry-install.sh`; VERIFIED: `scripts/release/capture-publish-evidence.ts`] | Phase 23 only needs the same Node-based repo-owned tooling that already proved the release path. [VERIFIED: `.github/workflows/release.yml`; VERIFIED: `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-WORKFLOW-RUN.md`] |
| Repo-owned registry smoke harness | current `scripts/smoke/verify-registry-install.sh`. [VERIFIED: `scripts/smoke/verify-registry-install.sh`] | Clean-room runtime and initializer verification from temp directories. [VERIFIED: `scripts/smoke/verify-registry-install.sh`; VERIFIED: `bash scripts/smoke/verify-registry-install.sh --version 1.1.3 --check-initializer`] | The smoke mechanism already exists and already passes against live `1.1.3`; Phase 23 should extend it, not replace it. [VERIFIED: `bash scripts/smoke/verify-registry-install.sh --version 1.1.3 --check-initializer`; VERIFIED: user prompt additional context] |
| Phase 22 release evidence | `22-PUBLISH-EVIDENCE.json/.md` for version `1.1.3`. [VERIFIED: `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.json`] | Canonical release truth for the version, commit, workflow run, and registry state that Phase 23 must verify and align to. [VERIFIED: `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.json`; VERIFIED: `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-WORKFLOW-RUN.md`] | It already records the exact publish that Phase 23 is supposed to prove post-publish. [VERIFIED: `.planning/ROADMAP.md`; VERIFIED: `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.json`] |

### Supporting

| Library / Tool | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `git` | `2.49.0`. [VERIFIED: `git --version`] | Recover the exact released manifest/lockfile state from `db3ff4f` and reconcile the stale local branch. [VERIFIED: `git show --stat --oneline db3ff4fa76905fac713a3ee7677d143de25e2b2c`; VERIFIED: `git branch -avv`] | Use whenever a source-of-truth mismatch exists between the published release and the current worktree. [VERIFIED: `git status --short --branch`; VERIFIED: `git branch -avv`] |
| `vitest` | repo range `^3.2.0`. [VERIFIED: `package.json`; VERIFIED: `vitest.config.ts`] | Validate helper code changes around evidence naming, release evidence parsing, and version alignment logic. [VERIFIED: `scripts/release/capture-publish-evidence.test.ts`; VERIFIED: `scripts/release/auto-version.test.ts`; VERIFIED: `packages/create-agent-badge/src/index.test.ts`] | Use for any new code added to parameterize smoke artifacts or source/version reconciliation. [VERIFIED: `vitest.config.ts`] |
| Docs verifier | current `scripts/verify-docs.sh`. [VERIFIED: `scripts/verify-docs.sh`] | Prevent operator runbook drift once Phase 23 updates the release instructions. [VERIFIED: `scripts/verify-docs.sh`; VERIFIED: `npm run docs:check`] | Use after updating `docs/RELEASE.md`; today it passes while enforcing stale Phase 12/13 references, so both files must change together. [VERIFIED: `scripts/verify-docs.sh`; VERIFIED: `npm run docs:check`] |
| Release evidence writer pattern | `scripts/release/capture-publish-evidence.ts` with `--artifact-prefix`. [VERIFIED: `scripts/release/capture-publish-evidence.ts`; VERIFIED: `scripts/release/capture-publish-evidence.test.ts`] | Reference implementation for phase-owned artifact naming. [VERIFIED: `scripts/release/capture-publish-evidence.ts`] | Use this as the model for Phase 23 smoke evidence naming instead of keeping hardcoded `13-REGISTRY-SMOKE.*`. [VERIFIED: `scripts/release/capture-publish-evidence.ts`; VERIFIED: `scripts/smoke/verify-registry-install.sh`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Exact-version `1.1.3` smoke plus explicit `@latest` initializer proof. [VERIFIED: `.planning/REQUIREMENTS.md`; VERIFIED: `scripts/smoke/verify-registry-install.sh`] | `@latest`-only smoke. [CITED: https://docs.npmjs.com/cli/v11/commands/npm-init/; CITED: https://docs.npmjs.com/cli/v8/commands/npm-dist-tag] | Rejected because `REG-01` needs proof of both the exact shipped release and the `latest` alias surface. [VERIFIED: `.planning/REQUIREMENTS.md`] |
| Reuse the published `db3ff4f` release commit as the alignment source. [VERIFIED: `git show --stat --oneline db3ff4fa76905fac713a3ee7677d143de25e2b2c`] | Hand-edit versions and dependency ranges in the stale branch. [VERIFIED: `packages/core/package.json`; VERIFIED: `packages/agent-badge/package.json`; VERIFIED: `packages/create-agent-badge/package.json`] | Rejected because the release commit already contains the correct `1.1.3` manifest and lockfile state, and manual reconstruction risks partial drift. [VERIFIED: `git show db3ff4fa76905fac713a3ee7677d143de25e2b2c:package-lock.json`; VERIFIED: `scripts/release/auto-version.ts`] |
| Parameterize smoke evidence naming for Phase 23. [VERIFIED: `scripts/smoke/verify-registry-install.sh`; VERIFIED: `scripts/release/capture-publish-evidence.ts`] | Keep writing new proof into `13-REGISTRY-SMOKE.*`. [VERIFIED: `scripts/smoke/verify-registry-install.sh`; VERIFIED: `docs/RELEASE.md`] | Rejected because phase-owned artifacts are the established pattern, and hardcoded Phase 13 names would make Phase 23 evidence ambiguous. [VERIFIED: `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.json`; VERIFIED: `scripts/release/capture-publish-evidence.ts`; ASSUMED] |

**Installation / verification commands:** [VERIFIED: commands run in this session]

```bash
npm view @legotin/agent-badge version dist-tags.latest time --json
npm view @legotin/agent-badge-core version dist-tags.latest time --json
npm view create-agent-badge version dist-tags.latest time --json
bash scripts/smoke/verify-registry-install.sh --version 1.1.3 --check-initializer
```

## Architecture Patterns

### Recommended Project Structure

```text
.planning/phases/23-post-publish-registry-verification-and-version-alignment/
├── 23-RESEARCH.md                 # this research
├── 23-REGISTRY-SMOKE.json         # phase-owned machine-readable registry proof
├── 23-REGISTRY-SMOKE.md           # phase-owned human-readable registry proof
└── 23-VERIFICATION.md             # final verification summary

scripts/
├── smoke/
│   └── verify-registry-install.sh # existing smoke base; extend for Phase 23
├── release/
│   └── capture-publish-evidence.ts # artifact-prefix model for phase-owned evidence
└── verify-docs.sh                 # release-doc drift gate
```

### Pattern 1: Released Source Is The Alignment Authority

**What:** Start from the already-published release commit and Phase 22 evidence, then align the stale branch to that truth. [VERIFIED: `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.json`; VERIFIED: `git show --stat --oneline db3ff4fa76905fac713a3ee7677d143de25e2b2c`; VERIFIED: `git branch -avv`]

**When to use:** Any time the current worktree versions differ from what npm and the release workflow already shipped. [VERIFIED: `packages/core/package.json`; VERIFIED: `packages/agent-badge/package.json`; VERIFIED: `packages/create-agent-badge/package.json`; VERIFIED: `npm view @legotin/agent-badge version dist-tags.latest --json`]

**Example:** [VERIFIED: commands and repo state in this session]

```bash
git show db3ff4fa76905fac713a3ee7677d143de25e2b2c:packages/agent-badge/package.json
git show db3ff4fa76905fac713a3ee7677d143de25e2b2c:packages/core/package.json
git show db3ff4fa76905fac713a3ee7677d143de25e2b2c:packages/create-agent-badge/package.json
git show db3ff4fa76905fac713a3ee7677d143de25e2b2c:package-lock.json
```

### Pattern 2: Two-Surface Registry Verification

**What:** Verify both the exact released version and the `latest` initializer alias. [VERIFIED: `.planning/REQUIREMENTS.md`; VERIFIED: `scripts/smoke/verify-registry-install.sh`; CITED: https://docs.npmjs.com/cli/v11/commands/npm-init/; CITED: https://docs.npmjs.com/cli/v8/commands/npm-dist-tag]

**When to use:** For `REG-01`, because the requirement explicitly includes runtime packages plus `npm init agent-badge@latest`. [VERIFIED: `.planning/REQUIREMENTS.md`]

**Example:** [VERIFIED: current script + official npm docs]

```bash
# Exact released artifacts
bash scripts/smoke/verify-registry-install.sh --version 1.1.3 --check-initializer

# Separate latest-alias proof or an equivalent new smoke flag
npm view create-agent-badge version dist-tags.latest --json
env -u GH_TOKEN -u GITHUB_TOKEN -u GITHUB_PAT npm_config_yes=true npm init agent-badge@latest
```

### Pattern 3: Phase-Owned Evidence Files

**What:** Keep the smoke logic shared, but write Phase 23-specific artifacts instead of reusing Phase 13 names. [VERIFIED: `scripts/smoke/verify-registry-install.sh`; VERIFIED: `scripts/release/capture-publish-evidence.ts`; ASSUMED]

**When to use:** Whenever the phase is supposed to produce new durable proof rather than rely on legacy historical artifacts. [VERIFIED: `.planning/ROADMAP.md`; VERIFIED: `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.json`; ASSUMED]

**Example:** [VERIFIED: `scripts/release/capture-publish-evidence.ts`; ASSUMED]

```typescript
// Source: scripts/release/capture-publish-evidence.ts
const artifactPrefix = args.artifactPrefix ?? "12-PUBLISH-EVIDENCE";
await writeFile(resolve(phaseDir, `${artifactPrefix}.json`), JSON.stringify(evidence, null, 2));
await writeFile(resolve(phaseDir, `${artifactPrefix}.md`), buildEvidenceMarkdown(evidence));
```

### Pattern 4: One Dynamic Operator Runbook

**What:** Derive the post-publish smoke version and phase artifact paths from the current release evidence instead of hardcoding `1.1.2` and Phase 13 paths. [VERIFIED: `docs/RELEASE.md`; VERIFIED: `scripts/verify-docs.sh`; VERIFIED: `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.json`]

**When to use:** For `REG-02`, because docs must align with what npm currently shows immediately after release. [VERIFIED: `.planning/REQUIREMENTS.md`; VERIFIED: `npm view @legotin/agent-badge version dist-tags.latest --json`]

### Anti-Patterns To Avoid

- **Treating the stale local branch as the version authority:** npm and the release commit are already at `1.1.3`; planning from local `1.1.2` manifests will recreate drift. [VERIFIED: `git branch -avv`; VERIFIED: `packages/core/package.json`; VERIFIED: `npm view @legotin/agent-badge version dist-tags.latest --json`]
- **Assuming exact-version smoke covers `@latest`:** the current script runs `npm init agent-badge@${VERSION}`, not `npm init agent-badge@latest`. [VERIFIED: `scripts/smoke/verify-registry-install.sh`; VERIFIED: `.planning/REQUIREMENTS.md`; CITED: https://docs.npmjs.com/cli/v11/commands/npm-init/]
- **Keeping hardcoded Phase 13 artifact names in a Phase 23 proof flow:** the current script writes `13-REGISTRY-SMOKE.*` even when `--phase-dir` changes. [VERIFIED: `scripts/smoke/verify-registry-install.sh`]
- **Updating docs without updating the docs verifier:** `npm run docs:check` currently passes while enforcing stale `1.1.2`/Phase 13 strings. [VERIFIED: `scripts/verify-docs.sh`; VERIFIED: `npm run docs:check`] 
- **Hand-editing manifests and forgetting `package-lock.json`:** the local repo already demonstrates how partial version updates leave lockfile and manifests out of sync. [VERIFIED: `packages/core/package.json`; VERIFIED: `packages/agent-badge/package.json`; VERIFIED: `packages/create-agent-badge/package.json`; VERIFIED: `package-lock.json`; VERIFIED: `scripts/release/auto-version.ts`]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Released-version reconciliation | Manual multi-file version editing. [VERIFIED: current stale repo state] | Reuse the released `db3ff4f` file contents or the existing `scripts/release/auto-version.ts` helper semantics. [VERIFIED: `git show --stat --oneline db3ff4fa76905fac713a3ee7677d143de25e2b2c`; VERIFIED: `scripts/release/auto-version.ts`] | The existing helper and release commit already update manifests, internal dependency ranges, and `package-lock.json` together. [VERIFIED: `scripts/release/auto-version.ts`; VERIFIED: `git show db3ff4fa76905fac713a3ee7677d143de25e2b2c:package-lock.json`] |
| Registry artifact proof | Ad hoc terminal notes or screenshots. [VERIFIED: project evidence pattern] | Repo-owned Markdown + JSON evidence files. [VERIFIED: `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.json`; VERIFIED: `.planning/phases/13-post-publish-registry-verification-and-final-operations/13-REGISTRY-SMOKE.json`] | The repo already treats machine-readable plus operator-readable evidence as the release-proof standard. [VERIFIED: `.planning/ROADMAP.md`; VERIFIED: `.planning/STATE.md`] |
| Phase-specific artifact naming | New custom file-writing logic unrelated to existing patterns. [VERIFIED: repo code] | Mirror `capture-publish-evidence.ts` and add an artifact-prefix/phase-prefix concept to the smoke flow. [VERIFIED: `scripts/release/capture-publish-evidence.ts`; VERIFIED: `scripts/release/capture-publish-evidence.test.ts`; ASSUMED] | The release evidence writer already solved this problem cleanly. [VERIFIED: `scripts/release/capture-publish-evidence.ts`] |
| Version/tag truth | Manual npm website inspection. [VERIFIED: user-facing alternative only] | `npm view <pkg> version dist-tags.latest time --json`. [VERIFIED: commands run in this session] | This is scriptable, exact, and already used by release evidence code. [VERIFIED: `scripts/release/capture-publish-evidence.ts`] |

**Key insight:** Phase 23 does not need a new verification architecture; it needs one shared source of truth for the already-shipped `1.1.3` release and one missing acceptance case for the `@latest` initializer alias. [VERIFIED: `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.json`; VERIFIED: `scripts/smoke/verify-registry-install.sh`; VERIFIED: `.planning/REQUIREMENTS.md`; CITED: https://docs.npmjs.com/cli/v11/commands/npm-init/]

## Common Pitfalls

### Pitfall 1: `latest` Alias Blindness

**What goes wrong:** A plan proves `npm init agent-badge@1.1.3` but never proves `npm init agent-badge@latest`, even though `REG-01` requires that alias. [VERIFIED: `.planning/REQUIREMENTS.md`; VERIFIED: `scripts/smoke/verify-registry-install.sh`]

**Why it happens:** The current smoke script only interpolates `--version` into `npm init agent-badge@${VERSION}`. [VERIFIED: `scripts/smoke/verify-registry-install.sh`]

**How to avoid:** Add explicit latest-tag verification and keep it separate from exact-version proof. [VERIFIED: `.planning/REQUIREMENTS.md`; CITED: https://docs.npmjs.com/cli/v11/commands/npm-init/; CITED: https://docs.npmjs.com/cli/v8/commands/npm-dist-tag]

**Warning signs:** The evidence proves `1.1.3` installs cleanly, but there is no recorded `@latest` command or dist-tag check. [VERIFIED: current script shape; VERIFIED: `.planning/REQUIREMENTS.md`]

### Pitfall 2: Partial Version Alignment

**What goes wrong:** Manifests, internal dependency ranges, docs, and `package-lock.json` drift independently. [VERIFIED: current repo state]

**Why it happens:** The repo is currently stale in multiple layers at once: manifests are `1.1.2`, lockfile publishable package entries are `1.1.1`, and npm is `1.1.3`. [VERIFIED: `packages/core/package.json`; VERIFIED: `packages/agent-badge/package.json`; VERIFIED: `packages/create-agent-badge/package.json`; VERIFIED: `package-lock.json`; VERIFIED: `npm view @legotin/agent-badge version dist-tags.latest --json`]

**How to avoid:** Reconcile from the published release commit or the existing auto-version logic, not with isolated text edits. [VERIFIED: `git show --stat --oneline db3ff4fa76905fac713a3ee7677d143de25e2b2c`; VERIFIED: `scripts/release/auto-version.ts`]

**Warning signs:** Source files disagree with one another before you even compare them to npm. [VERIFIED: current repo state]

### Pitfall 3: Historical Artifact Name Leakage

**What goes wrong:** A new Phase 23 proof run writes evidence that still looks like Phase 13 evidence. [VERIFIED: `scripts/smoke/verify-registry-install.sh`; VERIFIED: `docs/RELEASE.md`]

**Why it happens:** The smoke script hardcodes `13-REGISTRY-SMOKE.json` and `13-REGISTRY-SMOKE.md`, and the docs/checker still reference Phase 13 paths. [VERIFIED: `scripts/smoke/verify-registry-install.sh`; VERIFIED: `docs/RELEASE.md`; VERIFIED: `scripts/verify-docs.sh`]

**How to avoid:** Add a phase-owned artifact prefix and update the runbook plus docs verifier in the same change. [VERIFIED: `scripts/release/capture-publish-evidence.ts`; VERIFIED: `docs/RELEASE.md`; VERIFIED: `scripts/verify-docs.sh`; ASSUMED]

**Warning signs:** New artifacts appear under the Phase 23 directory but are still named `13-REGISTRY-SMOKE.*`. [VERIFIED: current smoke script logic]

### Pitfall 4: A Passing Docs Check That Proves The Wrong Thing

**What goes wrong:** `npm run docs:check` passes even though the release checklist points at obsolete artifacts and an obsolete version. [VERIFIED: `npm run docs:check`; VERIFIED: `docs/RELEASE.md`; VERIFIED: `scripts/verify-docs.sh`]

**Why it happens:** The verifier is hardcoded to the same stale strings as the docs. [VERIFIED: `scripts/verify-docs.sh`]

**How to avoid:** Make the docs verifier derive or enforce the current release evidence version and phase-owned artifact paths. [VERIFIED: `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.json`; ASSUMED]

**Warning signs:** The checker output still mentions `12-preflight.json`, `13-REGISTRY-SMOKE.*`, and `--version 1.1.2`. [VERIFIED: `npm run docs:check`]

## Code Examples

Verified patterns from current repo code and official docs:

### Exact Released-Version Smoke

```bash
# Source: scripts/smoke/verify-registry-install.sh
bash scripts/smoke/verify-registry-install.sh --version 1.1.3 --check-initializer
```

This exact command passed during research against the live registry. [VERIFIED: `bash scripts/smoke/verify-registry-install.sh --version 1.1.3 --check-initializer`]

### npm Initializer Alias Mapping

```text
# Source: https://docs.npmjs.com/cli/v11/commands/npm-init/
npm init <package-spec> (same as `npx create-<package-spec>`)
npm init foo@latest
```

`npm init agent-badge@latest` is therefore a real contract surface, not just a synonym for the exact-version smoke command. [CITED: https://docs.npmjs.com/cli/v11/commands/npm-init/]

### Existing Phase-Owned Evidence Prefix Pattern

```typescript
// Source: scripts/release/capture-publish-evidence.ts
const artifactPrefix = args.artifactPrefix ?? "12-PUBLISH-EVIDENCE";
await writeFile(resolve(phaseDir, `${artifactPrefix}.json`), JSON.stringify(evidence, null, 2));
await writeFile(resolve(phaseDir, `${artifactPrefix}.md`), buildEvidenceMarkdown(evidence));
```

Use the same pattern for Phase 23 registry smoke evidence instead of hardcoding Phase 13 filenames. [VERIFIED: `scripts/release/capture-publish-evidence.ts`; ASSUMED]

## State Of The Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 13-specific post-publish smoke hardcoded to `1.1.2` and `13-REGISTRY-SMOKE.*`. [VERIFIED: `docs/RELEASE.md`; VERIFIED: `scripts/verify-docs.sh`; VERIFIED: `scripts/smoke/verify-registry-install.sh`] | Phase 23 should verify the already-shipped `1.1.3` release and write Phase 23-owned evidence. [VERIFIED: `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.json`; ASSUMED] | Changed by the live Phase 22 publish on 2026-04-05. [VERIFIED: `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.json`] | Without this update, the runbook proves the wrong release. [VERIFIED: current repo/docs state] |
| Treat local manifests as the preflight/release truth. [VERIFIED: older phase artifacts] | Treat the recovered release commit and live npm metadata as truth when local source is stale. [VERIFIED: `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-WORKFLOW-RUN.md`; VERIFIED: `git branch -avv`; VERIFIED: `npm view @legotin/agent-badge version dist-tags.latest --json`] | Changed by the discovered `ahead 21, behind 1` branch state after the trusted publish. [VERIFIED: `git branch -avv`] | Phase 23 can repair alignment without guessing what actually shipped. [VERIFIED: `git show --stat --oneline db3ff4fa76905fac713a3ee7677d143de25e2b2c`] |
| Exact-version initializer proof only. [VERIFIED: `scripts/smoke/verify-registry-install.sh`] | Exact-version proof plus explicit `latest` alias proof. [VERIFIED: `.planning/REQUIREMENTS.md`; CITED: https://docs.npmjs.com/cli/v11/commands/npm-init/; CITED: https://docs.npmjs.com/cli/v8/commands/npm-dist-tag] | Required by the current Phase 23 requirement wording. [VERIFIED: `.planning/REQUIREMENTS.md`] | This closes the last registry-surface gap that the existing smoke script does not yet cover. [VERIFIED: `scripts/smoke/verify-registry-install.sh`; VERIFIED: `.planning/REQUIREMENTS.md`] |

**Deprecated / outdated:**  
- Hardcoded `verify-registry-install.sh --version 1.1.2 --check-initializer --write-evidence` in `docs/RELEASE.md` and `scripts/verify-docs.sh`. [VERIFIED: `docs/RELEASE.md`; VERIFIED: `scripts/verify-docs.sh`]  
- Treating `13-REGISTRY-SMOKE.*` as the active post-publish proof surface for the current release. [VERIFIED: `docs/RELEASE.md`; VERIFIED: `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.json`]  

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 23 should create new `23-REGISTRY-SMOKE.*` artifacts instead of continuing to write fresh proof under `13-REGISTRY-SMOKE.*`. [ASSUMED] | Architecture Patterns; State Of The Art | Low to medium; if historical compatibility is required, the planner may need a dual-write or wrapper approach instead of a rename-only approach. |
| A2 | Extending the existing smoke script with an artifact-prefix flag and an explicit `@latest` check is the smallest safe implementation path. [ASSUMED] | Architecture Patterns; Open Questions | Low; if the script becomes awkward to extend, a thin Phase 23 wrapper may be cleaner. |

## Open Questions

1. **How should Phase 23 ingest the published `db3ff4f` release state into a local branch that is `ahead 21, behind 1` and already dirty?** [VERIFIED: `git status --short --branch`; VERIFIED: `git branch -avv`]
   - What we know: the released commit touches only `package-lock.json` and the three publishable manifests. [VERIFIED: `git show --stat --oneline db3ff4fa76905fac713a3ee7677d143de25e2b2c`]
   - What's unclear: whether execution should cherry-pick, merge, or apply equivalent file edits while preserving unrelated local planning changes. [VERIFIED: current branch/worktree state]
   - Recommendation: treat the released file contents as canonical and choose the least disruptive application method during execution; do not hand-recreate the version bump. [VERIFIED: `git show db3ff4fa76905fac713a3ee7677d143de25e2b2c:packages/agent-badge/package.json`; VERIFIED: `scripts/release/auto-version.ts`] 

2. **Should Phase 23 extend `verify-registry-install.sh` directly or wrap it?** [VERIFIED: `scripts/smoke/verify-registry-install.sh`]
   - What we know: the current script already passes exact-version `1.1.3` smoke, but it hardcodes Phase 13 filenames and does not verify `npm init agent-badge@latest`. [VERIFIED: `bash scripts/smoke/verify-registry-install.sh --version 1.1.3 --check-initializer`; VERIFIED: `scripts/smoke/verify-registry-install.sh`; VERIFIED: `.planning/REQUIREMENTS.md`]
   - What's unclear: whether adding more flags keeps the script maintainable enough. [ASSUMED]
   - Recommendation: prefer a direct extension first because the current mechanism already matches the required behavior envelope. [VERIFIED: user prompt additional context; ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | smoke script, release tooling, tests | ✓ [VERIFIED: `node --version`] | `v22.14.0` [VERIFIED: `node --version`] | None needed locally; workflow still uses `24.x`. [VERIFIED: `.github/workflows/release.yml`] |
| npm CLI | registry reads, `npm init`, package installs | ✓ [VERIFIED: `npm --version`; VERIFIED: `npm view @legotin/agent-badge version dist-tags.latest --json`] | `11.6.0` [VERIFIED: `npm --version`] | None; this phase depends on live npm access. [VERIFIED: `.planning/REQUIREMENTS.md`] |
| git | release commit recovery and branch-state reconciliation | ✓ [VERIFIED: `git --version`] | `2.49.0` [VERIFIED: `git --version`] | None for source reconciliation. |
| bash | smoke scripts and docs checks | ✓ [VERIFIED: `bash --version | head -1`] | `3.2.57` [VERIFIED: `bash --version | head -1`] | None; repo scripts are bash-based. [VERIFIED: `scripts/smoke/verify-registry-install.sh`; VERIFIED: `scripts/verify-docs.sh`] |
| npm registry connectivity | live version/tag verification and clean temp install smoke | ✓ [VERIFIED: `npm view @legotin/agent-badge version dist-tags.latest time --json`; VERIFIED: `bash scripts/smoke/verify-registry-install.sh --version 1.1.3 --check-initializer`] | `1.1.3` visible for all three published packages. [VERIFIED: npm view commands in this session] | No real fallback; without registry access, `REG-01` cannot be proven honestly. [VERIFIED: `.planning/REQUIREMENTS.md`] |
| GitHub CLI | optional workflow inspection only | not required [VERIFIED: `docs/RELEASE.md`; CITED: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow] | — | GitHub web UI `workflow_dispatch` and Actions pages. [VERIFIED: `.github/workflows/release.yml`; CITED: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow] |

**Missing dependencies with no fallback:**  
- None for research. [VERIFIED: commands run in this session]

**Missing dependencies with fallback:**  
- `gh` is optional because the release workflow can be run and inspected through the GitHub web UI when `workflow_dispatch` is present on the default branch. [VERIFIED: `.github/workflows/release.yml`; CITED: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `^3.2.0`. [VERIFIED: `package.json`; VERIFIED: `vitest.config.ts`] |
| Config file | `vitest.config.ts`. [VERIFIED: `vitest.config.ts`] |
| Quick run command | `npm run docs:check && npm test -- --run packages/create-agent-badge/src/index.test.ts scripts/release/auto-version.test.ts scripts/release/capture-publish-evidence.test.ts scripts/release/preflight.test.ts` [VERIFIED: `package.json`; VERIFIED: test files listed by `rg --files`] |
| Full suite command | `npm run verify:clean-checkout` [VERIFIED: `package.json`; VERIFIED: `scripts/verify-clean-checkout.sh`] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REG-01 | Exact released artifacts install from the registry, runtime init passes, and `npm init agent-badge@latest` is proven. [VERIFIED: `.planning/REQUIREMENTS.md`] | smoke | `bash scripts/smoke/verify-registry-install.sh --version 1.1.3 --check-initializer` plus a new explicit latest-alias probe or smoke flag. [VERIFIED: current script; ASSUMED for the added latest coverage] | `❌ Wave 0` because current automation does not yet capture `@latest` as a durable acceptance check. [VERIFIED: `scripts/smoke/verify-registry-install.sh`; VERIFIED: `.planning/REQUIREMENTS.md`] |
| REG-02 | Source versions, internal dependency ranges, dist-tags, and operator docs align to the published release. [VERIFIED: `.planning/REQUIREMENTS.md`] | integration + docs | `npm run docs:check` plus a new alignment checker that compares Phase 22 evidence, local manifests, lockfile, and npm registry state. [VERIFIED: `npm run docs:check`; ASSUMED for the new checker] | `❌ Wave 0` because the existing docs check enforces stale `1.1.2`/Phase 13 references and there is no dedicated alignment checker yet. [VERIFIED: `scripts/verify-docs.sh`; VERIFIED: `npm run docs:check`; VERIFIED: current repo state] |

### Sampling Rate

- **Per task commit:** `npm run docs:check` for runbook/verifier edits, plus targeted Vitest for any helper-code change. [VERIFIED: `package.json`; VERIFIED: `vitest.config.ts`]
- **Per wave merge:** `npm run verify:clean-checkout` before considering Phase 23 code edits done. [VERIFIED: `package.json`; VERIFIED: `scripts/verify-clean-checkout.sh`]
- **Phase gate:** live registry smoke for `1.1.3`, explicit `npm init agent-badge@latest` proof, and alignment checks all green before `/gsd-verify-work`. [VERIFIED: `.planning/REQUIREMENTS.md`; VERIFIED: `.planning/ROADMAP.md`; ASSUMED for the exact combined gate command]

### Wave 0 Gaps

- [ ] Add explicit `@latest` initializer verification to the registry smoke flow or a Phase 23 wrapper. [VERIFIED: `.planning/REQUIREMENTS.md`; VERIFIED: `scripts/smoke/verify-registry-install.sh`]
- [ ] Parameterize registry smoke evidence naming so Phase 23 can write phase-owned artifacts. [VERIFIED: `scripts/smoke/verify-registry-install.sh`; VERIFIED: `scripts/release/capture-publish-evidence.ts`; ASSUMED]
- [ ] Add an automated alignment check that compares Phase 22 evidence version `1.1.3`, local manifests, local lockfile, and npm `dist-tags.latest`. [VERIFIED: `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.json`; VERIFIED: current repo state; ASSUMED]
- [ ] Update `docs/RELEASE.md` and `scripts/verify-docs.sh` together so the docs check proves the current release, not the historical Phase 13 flow. [VERIFIED: `docs/RELEASE.md`; VERIFIED: `scripts/verify-docs.sh`; VERIFIED: `npm run docs:check`] 

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no [VERIFIED: phase scope] | Phase 23 is post-publish verification, not user auth. [VERIFIED: `.planning/ROADMAP.md`] |
| V3 Session Management | no [VERIFIED: phase scope] | Not applicable. |
| V4 Access Control | no [VERIFIED: phase scope] | Not a product access-control phase. |
| V5 Input Validation | yes [VERIFIED: script and helper code] | Keep strict CLI argument parsing in the smoke script and semver validation in existing release helpers; do not accept loosely parsed version input. [VERIFIED: `scripts/smoke/verify-registry-install.sh`; VERIFIED: `scripts/release/auto-version.ts`] |
| V6 Cryptography | no [VERIFIED: phase scope] | No crypto changes required here. |

### Known Threat Patterns For This Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Temp-path leakage into checked-in evidence. [VERIFIED: `.planning/STATE.md`; VERIFIED: `scripts/smoke/verify-registry-install.sh`] | Information Disclosure | Keep evidence schema limited to version, package coordinates, runtime/initializer status, and blocking issue; never persist `WORK_DIR` or cache paths. [VERIFIED: `.planning/STATE.md`; VERIFIED: `.planning/phases/13-post-publish-registry-verification-and-final-operations/13-REGISTRY-SMOKE.json`; VERIFIED: `scripts/smoke/verify-registry-install.sh`] |
| Accidental credentialed side effects during smoke runs. [VERIFIED: script behavior] | Tampering | Continue unsetting `GH_TOKEN`, `GITHUB_TOKEN`, and `GITHUB_PAT` during init smoke so registry verification cannot create a real gist. [VERIFIED: `scripts/smoke/verify-registry-install.sh`] |
| Dist-tag confusion or alias drift. [VERIFIED: `.planning/REQUIREMENTS.md`; CITED: https://docs.npmjs.com/cli/v8/commands/npm-dist-tag] | Spoofing / Integrity | Verify both exact version and `dist-tags.latest`, then prove `npm init agent-badge@latest` explicitly. [VERIFIED: `.planning/REQUIREMENTS.md`; VERIFIED: npm view commands run in this session; CITED: https://docs.npmjs.com/cli/v11/commands/npm-init/] |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.json` - verified published version `1.1.3`, workflow run `24005943027`, and registry results. [VERIFIED: local file]
- `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-WORKFLOW-RUN.md` - verified the recovered release commit and trusted-publish reconciliation. [VERIFIED: local file]
- `scripts/smoke/verify-registry-install.sh` - verified current smoke behavior, exact-version install checks, current evidence schema, and hardcoded Phase 13 artifact naming. [VERIFIED: local file]
- `scripts/release/capture-publish-evidence.ts` and `scripts/release/capture-publish-evidence.test.ts` - verified the existing artifact-prefix pattern Phase 23 should mirror. [VERIFIED: local files]
- `scripts/release/auto-version.ts` - verified the existing manifest plus lockfile update logic. [VERIFIED: local file]
- `docs/RELEASE.md` and `scripts/verify-docs.sh` - verified the current stale `1.1.2`/Phase 13 operator flow and docs-check coupling. [VERIFIED: local files]
- `npm view @legotin/agent-badge version dist-tags.latest time --json` - verified live registry version `1.1.3`, `latest` tag, and publish timestamp. [VERIFIED: npm registry]
- `npm view @legotin/agent-badge-core version dist-tags.latest time --json` - verified live registry version `1.1.3`, `latest` tag, and publish timestamp. [VERIFIED: npm registry]
- `npm view create-agent-badge version dist-tags.latest time --json` - verified live registry version `1.1.3`, `latest` tag, and publish timestamp. [VERIFIED: npm registry]
- `bash scripts/smoke/verify-registry-install.sh --version 1.1.3 --check-initializer` - verified the current exact-version live smoke passes from a clean temp directory. [VERIFIED: command run in this session]
- `git show db3ff4fa76905fac713a3ee7677d143de25e2b2c:*` and `git branch -avv` - verified the release commit contents and the local branch divergence. [VERIFIED: git commands run in this session]
- https://docs.npmjs.com/cli/v11/commands/npm-init/ - verified `npm init <package-spec>` behavior and the explicit `foo@latest` mapping. [CITED: https://docs.npmjs.com/cli/v11/commands/npm-init/]
- https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow - verified the `workflow_dispatch` manual-run requirements and web UI fallback. [CITED: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow]

### Secondary (MEDIUM confidence)

- https://docs.npmjs.com/cli/v8/commands/npm-dist-tag - verified the meaning of `latest` as the default install tag; official but not the v11 page variant surfaced by search. [CITED: https://docs.npmjs.com/cli/v8/commands/npm-dist-tag]

### Tertiary (LOW confidence)

- None. [VERIFIED: all research claims are backed by repo inspection, commands, or official docs]

## Metadata

**Confidence breakdown:**  
- Standard stack: HIGH - all recommended tools and patterns were verified from the repo, live npm registry, or official docs. [VERIFIED: sources above]  
- Architecture: HIGH - the needed implementation path follows existing repo patterns and a verified live `1.1.3` smoke pass. [VERIFIED: `scripts/smoke/verify-registry-install.sh`; VERIFIED: `bash scripts/smoke/verify-registry-install.sh --version 1.1.3 --check-initializer`]  
- Pitfalls: HIGH - every listed pitfall is already visible in current code, docs, or requirements. [VERIFIED: current repo state; VERIFIED: `.planning/REQUIREMENTS.md`]  

**Research date:** 2026-04-05 [VERIFIED: system date]  
**Valid until:** 2026-04-12 because npm registry state, dist-tags, and branch divergence are fast-moving release facts. [VERIFIED: topic volatility]
