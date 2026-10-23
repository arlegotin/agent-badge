# Combined badge-presentation review

**Spec compliance: ✅ Compliant for Task 1.**
**Task quality: Approved.**
**Ready to merge? Yes.**
**Findings: Critical 0 / Important 0 / Minor 1.**

Reviewed the single supplied package for `54ff306e64942f6d6622e6673ad8a15e413308d2..d821dd4bb529e0e8f02cacc0b44fd31e19c058a5`. This is both the task compliance/quality gate and the whole-patch review of that same range. No release or live migration approval is implied by the merge verdict.

## Strengths and compliance evidence

- `packages/core/src/domain/ledger.ts:24` and `packages/core/src/domain/policy.ts:16`: presentation version is optional and restricted to literal 2; color requires that version, accepts six hex digits, and introduces no parsed default. Existing strict schemas remain strict.
- `packages/core/src/render/summary.ts:51` and `packages/core/src/render/legacy-svg.ts:6`: unmarked trees retain the original value strings and frozen SVG format. Version 2 changes presentation only; numeric summary fields, valuation, report generation and record serialization are unchanged.
- `packages/core/src/render/artifacts.test.ts:85`: static synthetic token and cost trees provide an independent compatibility oracle, with explicit SVG/summary/report tamper rejection. Version promotion checks preserved observation bytes and totals. These expectations do not regenerate the legacy expected bytes through the new renderer.
- `packages/core/src/render/summary.ts:56` and `packages/core/src/render/artifacts.test.ts:96`: generated values omit qualifiers, distinguish wholly unavailable amounts from observed zero, and retain accounting coverage fields. `packages/core/src/render/svg.test.ts:27` deliberately preserves arbitrary user labels containing `known` and `~`.
- `packages/core/src/render/svg.ts:35`: default gold is exactly `#E8A515`; colors pass the strict policy parser before interpolation, and foreground selection handles the gold panel. Tests cover case-insensitive colors, injection attempts, white and black backgrounds.
- `packages/agent-badge/src/integration/setup.ts:157` and `:239`: canonical GitHub setup derives the target from the repository homepage, retains the raw data-branch image source, omits the extra data link, and initializes new ledgers with presentation version 2. Existing accepted metadata is not silently promoted. `setup.test.ts:264` and `:280` cover multiple repository identities and repeated setup.
- `README.md:10` and `:39`, and all six `docs/assets/badges/*.svg:1` additions/updates: the managed target is the homepage, and the gallery is the requested Badge/Color/Metric table with gold, red, blue, purple, pink and teal. Illustrative values remain 12.4M tokens/$38.42 with original labels. The removed partial/unknown assets are replaced by pink/teal assets.
- `docs/CONFIGURATION.md:15`, `docs/HOW-IT-WORKS.md:15` and `docs/INSTALL.md:27`: current documentation explains explicit promotion, exact legacy presentation retention, plain values and repository links without changing historical release evidence.
- `packages/core/package.json:3`, `packages/agent-badge/package.json:3`, `packages/create-agent-badge/package.json:3` and `package-lock.json:2999`: the three public packages and internal pins are exact 2.0.1. Changelogs preserve earlier entries. Testkit is untouched by this diff; retained self-review evidence reports private version 0.0.0.
- `.github/workflows/release.yml:15`, `:60` and `scripts/release/preflight.ts:19`: only explicit exact-2.0.1 `stable-patch` is added. Existing major/prerelease cases and current-main/tag binding remain. No artifact, OIDC, polling or publication implementation is replaced. Focused preflight and executable inline-guard tests cover successful authorization and invalid versions/intents/source identity.

## Issues

### Critical: 0

None.

### Important: 0

None.

### Minor: 1

1. **Passing validation output contains known runtime warning noise.** `.superpowers/sdd/2026-10-23-badge-presentation/full-node24-loopback.log:8`, `green-node24.log:8`, and `docs-node24.log:5` emit Node's SQLite `ExperimentalWarning`. Passing counts remain valid, but the output is not pristine and the report's failure inventory does not mention these warnings. Record them explicitly as known runtime diagnostics in the final validation/release evidence; do not describe these logs as warning-free. This is not a newly introduced presentation defect and does not warrant changing storage or suppressing unrelated warnings in this patch.

## Concrete unchanged-code checks

- **Risk: the new marker could be lost during normal or incremental synchronization.** Checked `packages/core/src/operations/sync.ts:178-194` and `:247-258`, plus `packages/core/src/storage/accepted-index.ts:360-425`. Accepted metadata is retained whole; explicit configuration replaces it whole; both full and indexed rendering receive that metadata. No field-by-field reconstruction drops `presentationVersion`.
- **Risk: presentation promotion could bypass metadata CAS or rewrite usage records.** Checked `packages/core/src/operations/configure.ts:11` and `:32-39`, and the synchronization block above. Revision hashes include parsed metadata; configure uses the existing transaction and accepted records. The changed render tests directly assert immutable observation bytes survive promotion.
- **Risk: a legacy format branch could weaken strict public-tree validation.** Checked `packages/core/src/ledger/validate-tree.ts:15-39` and `packages/core/src/storage/accepted-stage.ts:869-882`. Both full and staged validation still compare regenerated artifact bytes, while full validation retains canonical record/hash/path checks. Versioning selects the expected format; it does not skip comparison.
- **Risk: unchanged release workspace validation might reject 2.0.1 or weaken exact pins.** Read the cut-off `validateWorkspace` context in `scripts/release/preflight.ts:61-80`. It checks common versions, exact internal dependencies, matching lock metadata, fixed package inventory and stable prerelease state without a stale 2.0.0-only restriction. Unchanged artifact validation immediately above still checks package inventory, file sizes and SRI.
- Diff output was initially truncated; only the missing segment was recovered. Changed-file reads were limited to cut-off function context in `render/summary.ts` and `release/preflight.ts`. No new Git diff was derived, no suite was rerun, and no private activation, histories, settings or credentials were read. Two attempted narrow release call-site lookups named nonexistent files; they yielded no evidence and are not relied upon.

## Verification evidence assessed

Read the retained logs rather than rerunning tests:

- RED: 15 failed/78 passed, followed by GREEN: 93 passed across five files (`red-node24.log:306`, `green-node24.log:44`).
- Node 24 full sandbox run: 8 failed/853 passed/1 skipped (`full-node24.log:589-623`). Seven failures report loopback `listen EPERM`; the listener-readiness test times out under that restriction. The loopback-enabled rerun passes 861 tests, with one skip, across 76 files (`full-node24-loopback.log:569`). No timing assertion change appears in this patch.
- Node 26 covering run: 102 tests across six files pass (`covering-node26.log:51`).
- Typecheck/build logs contain no error; docs reports 14 documents/71 local links/36 CLI examples/14 commands/7 capabilities (`docs-node24.log:7`). Pack checks pass for all public packages (`pack-node24.log:5-8`). Retained smoke verifies all three 2.0.1 tarballs (`smoke-pack-node24.log:5`).
- The local tarballs identify synthetic commit `4757e48a1dc62e5970180c647c736024655e1f08`; they are validation evidence, not publishable exact-main candidate evidence.
- The pre-patch hosted macOS/Node 26 failure is retained in `baseline-macos26/matrix-evidence.log:494-505`: stalled activation supervision took 2416.044709ms against a `<2300` assertion. Local passing runs do not erase that failure. Fresh exact-main hosted CI remains required.

## Cannot verify here

- A fresh six-cell exact-main hosted CI result, retained hosted candidate identity, OIDC publication/provenance and public registry propagation are Task 2 gates, not established by this diff or local tarballs.
- Published-runtime upgrade and revision-checked promotion of this repository's actual accepted metadata, preservation of its actual record identities, and its live SVG require root's authorized post-publication operations. They were deliberately not performed by Task 1 or this review.
- The absence of private filesystem access during earlier execution cannot be independently proven from a source diff. The isolation report and retained self-review record support the stated procedure; this review did not inspect private state. The diff contains no actual root setup or node_modules changes.
- The existing opt-in OS namespace test remained skipped. Cross-platform execution is still the hosted matrix's responsibility.

## Declined to judge

- Changes to historical refactor architecture and pre-existing accounting/storage behavior: outside this presentation patch; only the named integration risks above were checked.
- Remediation of the pre-patch hosted supervision timing failure: no timing implementation or assertion is changed here; its resolution is an explicit fresh-hosted-CI gate for root.
- Live publication, registry propagation and actual root activation/migration: deferred to root's separately authorized Task 2; no live readiness claim is made.

## Assessment

**Task quality: Approved. Ready to merge? Yes.** The implementation satisfies the presentation, compatibility, setup and exact patch-authorization contracts with focused behavioral tests and retained local validation. No blocking defect was found; root must still obtain the specified exact-main hosted result before publication and perform runtime upgrade before explicit metadata promotion.
