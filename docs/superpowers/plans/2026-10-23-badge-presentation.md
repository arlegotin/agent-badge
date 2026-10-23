# Badge presentation implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the
> implementation and independent review; root executes the authorized release.

**Goal:** Deploy the user's gold, colorful, plain-number badge presentation and
repository-homepage badge links without losing accepted usage.

**Architecture:** Version derived SVG presentation in accepted metadata, preserve
exact unmarked v2.0.0 trees, and ship a fixed-group 2.0.1 patch. Reuse the existing
exact-main candidate/OIDC publisher and metadata revision checks.

**Tech Stack:** ESM TypeScript, npm workspaces, Vitest, existing SVG renderer.

**Spec:** [Badge presentation](../specs/2026-10-23-badge-presentation.md).

## Global constraints

- Gold is `#E8A515`; new values contain neither `known` nor `~`.
- Keep immutable records, numeric data, coverage and strict validation unchanged.
- Never read/copy real histories, credentials or private activation for tests.
- All source validation uses run-isolated.mjs, exact Node 24/26 and empty roots.
- Preserve node_modules symlink, private files, existing native trust and Git state.
- Agent commits disable hooks. Agent never pushes, publishes or activates setup.

## Review focus

1. Existing accepted v2.0.0 trees stay readable and tampering still fails closed.
2. Partial and unavailable amounts are distinct from measured zero without badge qualifiers.
3. Color text cannot introduce XML content; light gold remains readable.
4. Setup in any GitHub repo links its own homepage and remains idempotent.
5. Stable-patch authorization accepts only exact2.0.1 and retains all source/byte guards.

### Task 1: Implement and prepare the complete presentation patch

**Files:** core domain policy/ledger metadata, render SVG/summary and focused legacy
presentation helper if needed; corresponding rendering/tree tests and synthetic
legacy fixture; CLI integration setup/templates tests; root README, six SVG assets,
current configuration/how-it-works/install docs; public manifests/changelogs/lock;
release preflight/workflow and tests. Do not change historical release records or
the actual root .agent-badge/.codex/.claude/.gemini setup files.

**Interfaces:** optional LedgerMeta.presentationVersion2; optional badge.color hex;
current renderSvg defaults gold; old unmarked ledger trees select frozen rendering;
release request stable-patch maps exact2.0.1 to latest. Task2 consumes its commit and
retained test evidence. Default image target is the repository homepage, not /tree/data.

- [ ] Freeze synthetic v2.0.0 output and add failing behavior tests: default gold,
  custom colors/injection rejection, plain tokens/costs for complete/partial/zero,
  unavailable dash placeholders, old-tree readability/tamper rejection, generic
  generated README homepage/no data link, exact patch publishing authorization.
- [ ] Run RED through isolation, then implement minimal versioned rendering and
  setup defaults. Add color contrast handling only as needed for readable output.
- [ ] Update illustrative gallery to six requested colors; no real counts in assets.
  Remove known/approximately/~ from its badge labels and repo-data links from README.
- [ ] Prepare exact2.0.1 fixed-group metadata/internal pins with pinned Changesets;
  restore private testkit if Changesets bumps it. Add exact stable-patch workflow
  authorization, preserving initial2.0.0/prerelease behavior and strict artifact checks.
- [ ] Run relevant covering tests on Node24 and26; full isolated suite on24;
  typecheck/build/docs/pack on24. Record commands/results without hiding failures.
  No redundant full suite26: hosted matrix will exercise both platforms/runtimes.
- [ ] Self-review, commit with hooks disabled, and write task-1-report.md in this
  plan's scratch workspace. Return status, commit(s), test summary and concerns.

### Task 2: Review, deploy and refresh the actual badge (root)

- [ ] Independent combined task/whole-patch review on exact Task1 diff; fix findings.
- [ ] Push reviewed source, require successful exact-main six-cell CI, retain candidate.
- [ ] Tag v2.0.1 and dispatch stable-patch publisher with that exact candidate run.
  Preserve progress; wait for accepted versions to become publicly matching before
  any resume. Verify all three public versions, hashes, tags and provenance.
- [ ] Explicitly upgrade this repo's runtime/pin through the published initializer.
  Configure accepted presentationVersion2 and gold via current metadata revision;
  verify all prior record identities remain, totals are not reset, and live SVG is
  plain/gold. Source amounts remain actual approved local usage, never fixture data.
- [ ] Commit/push generated setup and final release record; verify README/gallery,
  live image target, clean Git state, preserved branch and required diagnostics.
