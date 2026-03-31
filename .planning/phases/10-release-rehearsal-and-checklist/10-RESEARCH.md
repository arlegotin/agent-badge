# Phase 10: Release Rehearsal and Checklist - Research

**Researched:** 2026-03-31
**Domain:** packed-install release rehearsal, constrained npm-cache workflows, and release checklist documentation for a TypeScript npm workspace CLI
**Confidence:** HIGH

<user_constraints>
## User Constraints

- No phase `10-CONTEXT.md` exists, so there are no additional locked decisions beyond the roadmap, requirements, and project state files.
- Scope this phase to `PACK-03` and `OPER-06` only.
- Do not reopen Phase 9 tarball-content scope except where the current packed-install proof has a blocker that prevents a trustworthy clean-install rehearsal.
- Ground the plan in the current repository scripts, current GitHub workflows, and the machine constraints already recorded in `.planning/STATE.md`.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PACK-03 | Maintainer can install the locally packed tarballs in a clean temporary project and invoke both exported CLIs successfully | The repo already has `scripts/smoke/verify-packed-install.sh`, but Phase 10 needs to make that proof exact, reproducible, and trustworthy under constrained cache/disk conditions |
| OPER-06 | Maintainer can follow one documented release checklist that covers isolated npm cache usage, workspace disk constraints, and npm package-name verification before publish | Current release steps are split across scripts, workflows, README/docs, and project state; Phase 10 should consolidate them into one maintainer-facing checklist |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- Keep the product local-first and serverless; release rehearsal work must not add hosted coordination or backend infrastructure.
- Preserve aggregate-only privacy guarantees; release docs and smoke flows must not instruct maintainers to publish or inspect raw transcripts, prompt text, filenames, or local paths outside aggregate state.
- Preserve the initializer-first npm UX; packed-install rehearsal must confirm the shipped CLIs still behave correctly from installed tarballs.
- Keep failure-soft refresh behavior and idempotent init semantics intact while release proofing the published artifacts.
- Follow existing workspace/package/script patterns rather than adding a second release toolchain.

## Summary

Phase 10 should treat the repo's existing release path as mostly present but not yet operator-ready. The repository already has the important primitives:

- `npm run pack:check` verifies tarball contents against repo-owned allowlist rules.
- `npm run smoke:pack` creates real tarballs, installs them into a temp project, imports the published packages, and runs both exported CLIs.
- `npm run verify:clean-checkout` already chains build, tests, tarball integrity, and packed-install smoke validation through an isolated npm cache.
- `.github/workflows/ci.yml` and `.github/workflows/release.yml` already exercise the release-readiness path from clean CI environments.

That means Phase 10 is not about designing a release system from scratch. It is about turning the current scattered release proof into a precise local rehearsal plus one maintainable checklist that a human can follow on a constrained machine.

The most important concrete risk is in the current smoke script: the install step uses `"${PACK_DIR}"/agent-badge-*.tgz`, which also matches `agent-badge-core-*.tgz`. That means the core tarball is installed twice during the proof run, so the existing success signal is weaker than it looks. Phase 10 should fix that before treating `smoke:pack` as the canonical proof for `PACK-03`.

The other main gap is documentation shape. The repo currently has end-user docs (`README.md`, `docs/QUICKSTART.md`, `docs/MANUAL-GIST.md`) and machine-facing workflow scripts, but no single release-maintainer checklist that captures:

- isolated npm cache usage
- temporary work directory guidance for low-space machines
- exact packed-install proof commands
- package-name availability verification for `agent-badge`
- final pre-publish gates already encoded in CI/release workflows

**Primary recommendation:** keep the roadmap's two-plan split exactly as written.

## Current Repo State

### Existing release-path commands

Root `package.json` already exposes the key scripts:

- `npm run build`
- `npm test -- --run`
- `npm run pack:check`
- `npm run smoke:pack`
- `npm run verify:clean-checkout`
- `npm run release`

This is a good base for Phase 10 because the checklist can point maintainers to existing repo-owned commands instead of inventing shell one-offs.

### Clean-checkout verification already encodes constrained-cache behavior

[`scripts/verify-clean-checkout.sh`](/Volumes/git/legotin/agent-badge/scripts/verify-clean-checkout.sh) already:

- creates a temp work directory under `${TMPDIR:-/tmp}`
- provisions an isolated npm cache under that temp directory
- clears `dist/` and `*.tsbuildinfo`
- runs `npm run build`
- runs `npm test -- --run`
- runs `npm run pack:check` with `npm_config_cache`
- runs `npm run smoke:pack` with the same isolated cache

This script is already close to the "repeatable sequence" that `OPER-06` needs. The checklist should likely wrap and explain this path rather than duplicate its logic.

### Current packed-install smoke proof is close but not exact

[`scripts/smoke/verify-packed-install.sh`](/Volumes/git/legotin/agent-badge/scripts/smoke/verify-packed-install.sh) already:

- packs `packages/core`, `packages/agent-badge`, and `packages/create-agent-badge` into a temporary pack directory
- creates a clean temp project
- installs the produced tarballs
- verifies ESM imports of `agent-badge` and `create-agent-badge`
- verifies `agent-badge --help` and `create-agent-badge --help`

Current proof gaps:

- The glob `"${PACK_DIR}"/agent-badge-*.tgz` overlaps with `agent-badge-core-*.tgz`, so the core tarball is matched twice.
- The script does not currently print enough explicit artifact identity to make troubleshooting obvious when a packed-install rehearsal fails.
- The script is good as a smoke proof, but it is not yet obviously the maintainer-facing canonical rehearsal contract.

### Release automation already consumes the proof path

[` .github/workflows/ci.yml `](/Volumes/git/legotin/agent-badge/.github/workflows/ci.yml) includes:

- a `validate` job for typecheck/build/test across Node 20, 22, and 24
- a `release-readiness` job that runs `npm run docs:check`
- a `release-readiness` job that runs `npm run verify:clean-checkout`

[` .github/workflows/release.yml `](/Volumes/git/legotin/agent-badge/.github/workflows/release.yml) includes:

- `npm run typecheck`
- `npm run verify:clean-checkout`
- `changesets/action@v1` with `publish: npm run release`

Phase 10 should avoid drifting from these workflow gates. The checklist should mirror them.

### Documentation gap is real

Current docs:

- [`README.md`](/Volumes/git/legotin/agent-badge/README.md) explains install and user-facing docs
- [`docs/QUICKSTART.md`](/Volumes/git/legotin/agent-badge/docs/QUICKSTART.md) covers install/init/refresh/publish for repository users
- [`docs/MANUAL-GIST.md`](/Volumes/git/legotin/agent-badge/docs/MANUAL-GIST.md) covers manual gist binding

There is no maintainer-focused release checklist doc yet. That is the clearest deliverable for `OPER-06`.

### Environment constraint is already documented and should shape the plan

`.planning/STATE.md` records two constraints that matter directly to Phase 10:

- `/Volumes/git` has too little free space for a normal local `npm install`, so verification on this machine depends on temp directories and isolated npm cache usage under `/tmp`.
- npm package-name availability for `agent-badge` must be checked at publish time.

That means the phase should prefer:

- temp work/cache directories that default to `/tmp`
- a checklist that makes constrained-environment flags explicit
- a manual publish preflight that includes `npm view` package-name verification

## Standard Stack

### Core

| Library/Tool | Purpose | Why Standard for Phase 10 |
|--------------|---------|---------------------------|
| Bash scripts | Reproducible release rehearsal and environment setup | Existing release-proof path already lives in repo-owned shell scripts |
| npm CLI workspaces | Packing, installing tarballs, and publish-time checks | It is the same tool that will publish the packages and resolve the install proof |
| GitHub Actions workflows | Source-of-truth CI/release gates | The maintainer checklist should mirror the gates already enforced in CI/release |

### Supporting

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `npm pack --workspace ... --pack-destination ...` | Produce exact tarballs for rehearsal | Use inside the smoke proof and any troubleshooting output |
| `npm_config_cache=<dir>` | Isolate npm cache from broken or root-owned default caches | Use in every release rehearsal command that depends on npm network/cache state |
| `mktemp -d` | Allocate scratch space under `/tmp` | Use for rehearsal work directories and clean install projects on low-space machines |
| `npm view <name>` | Package-name availability or package existence check | Use in the checklist as a publish-time manual preflight |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| One repo-owned checklist doc | Scattered README comments plus workflow-only knowledge | Rejected because `OPER-06` requires one human-followable sequence |
| Reusing the current smoke script exactly as-is | Treat CI success as sufficient evidence | Rejected because the current tarball glob overlap weakens the exactness of the install proof |
| Hardcoding user-home npm cache assumptions | Always rely on `~/.npm` | Rejected because project state already proves that default-cache ownership/disk conditions are unreliable on this machine |

## Recommended Plan Split

### 10-01: Prove clean temporary-project install and CLI smoke flows from packed tarballs

Own:

- exact tarball selection for the three publishable packages
- trustworthy packed-install proof in a clean temporary project
- failure messages and/or script output that make tarball/install issues diagnosable
- any minimal script-level hardening needed so the rehearsal behaves predictably on constrained machines

Likely files:

- [`scripts/smoke/verify-packed-install.sh`](/Volumes/git/legotin/agent-badge/scripts/smoke/verify-packed-install.sh)
- [`scripts/verify-clean-checkout.sh`](/Volumes/git/legotin/agent-badge/scripts/verify-clean-checkout.sh) only if the smoke proof interface changes
- [`package.json`](/Volumes/git/legotin/agent-badge/package.json) only if the root script contract needs to change
- tests or verification fixtures only if a script contract regression needs explicit coverage

Keep this plan tightly focused on `PACK-03`. Do not turn it into general release-doc work.

### 10-02: Finalize the constrained-environment release checklist and publish-time preflight

Own:

- one maintainer-facing release checklist document
- explicit isolated-cache and low-disk guidance
- the exact local rehearsal command(s) maintainers should run before publish
- package-name verification guidance for `agent-badge`
- final pre-publish checks aligned with current CI/release workflow gates
- docs verification updates if a new doc must be included in `npm run docs:check`

Likely files:

- a new doc such as [`docs/RELEASE-CHECKLIST.md`](/Volumes/git/legotin/agent-badge/docs/RELEASE-CHECKLIST.md)
- [`README.md`](/Volumes/git/legotin/agent-badge/README.md) if maintainers need a discoverable link
- [`package.json`](/Volumes/git/legotin/agent-badge/package.json) or [`scripts/verify-docs.sh`](/Volumes/git/legotin/agent-badge/scripts/verify-docs.sh) only if the docs verification contract must expand

Keep this plan focused on `OPER-06` and on documenting the proven path from `10-01`, not on reworking release automation.

## Architecture Patterns

### Pattern 1: Script-As-Source-Of-Truth Rehearsal

**What:** The maintainer checklist should reference repo-owned scripts instead of re-expressing long command sequences inline.

**When to use:** For build/test/pack/smoke/release gates that already exist in `package.json` or `scripts/`.

**Why it fits this repo:** CI and release workflows already rely on `npm run verify:clean-checkout`; Phase 10 should make humans follow the same contract.

### Pattern 2: Constrained-Environment Defaults

**What:** Release rehearsal scripts should create temp workspaces and isolated npm caches automatically, or document those flags explicitly when they must be supplied.

**When to use:** For any local release proof on machines with broken default npm cache ownership or low disk space in the repo volume.

**Why it fits this repo:** `.planning/STATE.md` already documents those exact constraints as active concerns.

### Pattern 3: Exact Artifact Identity Before Install

**What:** Resolve or enumerate the specific tarball filenames before invoking `npm install`, rather than relying on ambiguous globs.

**When to use:** Whenever multiple package names share a prefix or install correctness depends on the exact tarball set.

**Why it fits this repo:** `agent-badge-core-*.tgz` and `agent-badge-*.tgz` currently overlap, weakening the install proof.

## Risks and Pitfalls

### 1. Ambiguous tarball globs produce a false sense of packed-install correctness

The current smoke script may succeed while installing a tarball set different from what the maintainer intended to validate. Fix this before treating the script as the authoritative `PACK-03` proof.

### 2. Documentation can drift from CI/release gates

If the checklist becomes a handwritten variant of the workflow instead of pointing to repo-owned scripts and the same pre-publish gates, it will decay quickly.

### 3. Low-space and broken-cache environments are not edge cases for this repo

The current project state says constrained cache/disk conditions are already present on the maintainer machine. Phase 10 should encode that reality into the release path, not bury it in a note.

### 4. Package-name verification remains partially manual

`npm view agent-badge` depends on network access and registry state. The checklist should include it as a required preflight, but planning should not pretend this is fully automatable inside the repo test suite.

## Validation Architecture

### Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | repo-owned bash scripts + vitest where existing tests already cover adjacent release behavior |
| **Config file** | `vitest.config.ts` plus repo shell scripts |
| **Quick run command** | `npm_config_cache=/tmp/agent-badge-npm-cache bash scripts/smoke/verify-packed-install.sh` |
| **Full suite command** | `npm run docs:check && npm run verify:clean-checkout` |
| **Estimated runtime** | ~45 seconds locally, depending on pack/install speed |

### Validation Guidance

- Use the smoke script as the quick feedback loop for `10-01` work.
- Use docs verification plus the clean-checkout verifier after each completed plan wave.
- Treat package-name verification as a manual-only pre-publish step documented by the checklist rather than a required automated gate.
- If Phase 10 adds a new release checklist doc, wire it into existing docs verification so doc drift becomes detectable.

### Wave 0 Outlook

No new test framework is needed for this phase. Existing infrastructure is sufficient if the plans:

- preserve `npm run verify:clean-checkout` as the end-to-end automated gate
- keep packed-install rehearsal script-driven
- add docs verification coverage for any new release checklist artifact

### Recommended Validation Artifacts

- `10-VALIDATION.md` should track `smoke:pack`, `verify:clean-checkout`, and `docs:check` as the main automated checks.
- Plan tasks should include grep/file assertions for any new release checklist doc and for any exact tarball-selection logic added to the smoke script.

## Plan Implications

- `10-01` should be primarily script hardening and proof exactness, not package metadata work.
- `10-02` should establish one discoverable release checklist and align it with the current CI/release gate sequence.
- The final Phase 10 verification should likely include one automated pass (`npm run docs:check && npm run verify:clean-checkout`) plus one explicitly documented manual package-name check (`npm view agent-badge` or equivalent availability probe).
