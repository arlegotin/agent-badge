# Stable 2.0.0 preparation review

Reviewed on 2026-10-23 using the Superpowers code-reviewer guidance.

## Scope and evidence

- Base: `35a2f51dfe40d624ee22b201ec0d693d54ce2abf`.
- Head: `0d688bedebaf1716ec7bdc2fb82d0a05c4ee4802`.
- Read the supplied `review-35a2f51..0d688be.diff` in full, rather than regenerating it. Its 19-file change is restricted to release metadata, lockfile, changelogs and documentation.
- Requirements: Task 1 and global constraints in `docs/superpowers/plans/2026-10-23-stable-release.md`; publication contract in `docs/maintainers/RELEASE.md`.
- Inspected the public package manifests, private testkit manifest, root package manifest, Changesets configuration and relevant documentation alongside the diff.
- Read retained `prepare24-typecheck.log`, `prepare24-build.log`, `prepare24-docs.log`, `prepare24-pack.log` and `prepare24-release-entrypoints.log`. The supplied execution record reports exit 0 for the first four. Logs show successful documentation verification, all three package-content checks passing, and 62 tests across five release/artifact/workflow/launcher/initializer files passing in 10.35 seconds. Exact Node 24 and tracked isolation-runner execution are provided by the retained execution record; these logs alone do not independently prove process isolation.
- No tests, product probes, provider discovery, network requests, credential inspection or publication were performed by this reviewer. Only this requested report was written; reviewed source and Git state were not modified.

## Strengths

- All three public manifests and corresponding lockfile entries consistently use stable `2.0.0`. CLI-to-core and initializer-to-CLI dependencies are exact `2.0.0` pins, with no remaining prerelease reference in the active package metadata.
- Prerelease state and the consumed major changeset are removed. Changesets remains pinned to 2.30.0; its fixed public group and ignored private testkit are intact. Testkit remains private at `0.0.0`.
- The lockfile change contains only the five expected public version/internal-dependency updates. Production dependency selection, exports, package entry points, Apache-2.0 licensing and Node `^24.0.0 || ^26.0.0` engines are unchanged.
- Stable changelog entries preserve the breaking architecture change and limitations, including partial accounting, unverified private rendering, Windows automation scope and the unmet 250 ms optimization target. Historical prerelease changelogs and review evidence are retained.
- `RELEASE-STATUS.md` distinguishes local preparation evidence from pending hosted CI, exact artifact binding, npm authorization and publication. Minor N1 remains explicitly disclosed rather than claimed fixed. The plan preserves exact-byte publication and matching-only recovery.
- Existing focused tests and package checks are appropriate local evidence for this mechanical preparation change. No new behavior-mirroring tests were added.

## Issues

### Critical — 0

None.

### Important — 1

**I1: Setup instructions invoke the still-v1 `latest` release before v2 publication is confirmed.**

- Locations: `README.md:9`, `docs/INSTALL.md:7`, `docs/QUICKSTART.md:5`; related availability wording in `docs/FAQ.md:5`.
- The changed guides unconditionally tell the reader to run `npm init agent-badge@latest` and then describe v2 repository-owned setup. The removed wording explicitly conditioned this command on replacement publication. The new introductory requirement for “2.0.0 or newer” and a link to release status do not tell readers that the displayed installation command currently resolves to an older implementation.
- The plan's initial registry evidence records `latest` at `1.1.20`, and the new release-status document explicitly leaves npm publication pending. The root confirmed during review that `latest` remains `1.1.20`. A reader following the primary instructions before publication therefore invokes the old Gist initializer instead of obtaining the documented v2 behavior. This violates Task 1's requirement to avoid premature availability claims; it is an actionable installation mismatch, not a complaint that future publication gates are unfinished.
- Fix: retain the required `npm init agent-badge@latest` entry point, but immediately condition its use on release status confirming v2 publication and the `latest` tag. Explicitly state that it must not be used to activate v2 while `latest` still points to v1. Apply consistent wording to README, installation, quickstart and FAQ. No product-code change or broad test rerun is needed for that documentation correction.

### Minor — 0 new

No new minor findings in this preparation diff. Previously accepted Minor N1 remains deferred and is not counted as a newly discovered issue.

## Recommendations

Correct I1 before integrating the preparation commit, then perform focused documentation validation. Continue the already planned hosted gates independently; retain actual source/run/artifact identities and publication evidence before changing release-status entries to success. Do not rerun version preparation or repack as a response to a partial publication.

## Declined to judge

- The wider repository-native implementation and provider accounting behavior: already independently reviewed; this assignment is limited to release preparation with no product-code diff.
- Minor N1 cleanup after forcibly terminated remote diagnostics: explicitly accepted as deferred by the release plan, and accurately disclosed here.
- Actual hosted platform/runtime results, including the Windows 24 failure the root reported as under investigation: CI is still active and investigation belongs to the root's hosted validation task; no success or preparation-source cause is inferred here.
- Actual npm trusted-publisher authorization, environment-policy enforcement, current-main/tag binding, registry publication, provenance and public initializer installation: future external gates, not evidence available from this local preparation review. The report does not independently certify the documented environment-creation observation.
- Historical prerelease candidate verification and private-image support: retained historical evidence and explicitly unverified external scope, respectively; neither is upgraded to stable-release proof by this review.

## Assessment

**Ready to merge? With fixes.**

The stable metadata transition and local retained evidence are internally consistent, with no package-version, dependency-pin, license or engine regression found. Fix the one misleading installation instruction before integration; after that, preparation is suitable to proceed through the separate hosted validation and publication gates. This is not a declaration that 2.0.0 is published or that the release is complete.

Severity counts: **0 Critical, 1 Important, 0 new Minor**.

## Scoped follow-up: I1 and hosted validation fixes

Reviewed on 2026-10-23, base `0d688bedebaf1716ec7bdc2fb82d0a05c4ee4802` through head `f014542596c37bb10e099deb604d1f78b749794f`, using the supplied `review-0d688be..f014542.diff` in full. Scope is limited to I1 resolution and regressions or weakened coverage introduced by these CI corrections. The metadata and wider product implementation were not re-audited.

### Findings and strengths

- **I1 is addressed.** README, INSTALL and QUICKSTART place an explicit publication/`latest` condition directly before the initializer command. FAQ gives the same condition. All four state that publication is pending and `@latest` currently selects v1, and tell readers not to use it for v2 activation until confirmation. The required initializer entry point remains unchanged.
- `.gitattributes` applies `text eol=lf` only to the root LICENSE and workspace LICENSE paths. It corrects checkout representation rather than relaxing the retained-tarball comparison. The existing exact license-content check in `scripts/smoke/verify-packed-install.mjs` remains intact. The first Windows 24 and 26 retained logs show that check encountering LF artifact content versus CRLF checkout content after earlier checks passed.
- The new license regression uses a temporary synthetic Git repository and the actual repository attributes. It commits LF files, removes them, performs a real `core.autocrlf=true` checkout, and compares exact bytes for the root and all three public-package license paths. Its cleanup is in `finally`; hooks are disabled. This exercises Git's conversion behavior rather than merely asserting the attribute text. The retained RED log shows inserted CR bytes without the correction; both retained GREEN logs pass.
- The operational fixture resolves Git from its existing PATH before inserting the spy directory, shell-quotes that executable, and delegates to it. This preserves the remote-command marker, cancellation check and pending-work assertion while avoiding the hardcoded macOS system Git. The fixture remains in the existing POSIX test scope; the Windows validation branch does not run it.
- The three 30-second caps apply only to Vitest's overall test lifetime. No assertions were removed or weakened. The oversized-input subprocess retains its 4-second timeout, and the worker fixture still constructs the unchanged automatic operation budget. Repository creation and multiple operations can therefore finish without extending the production automatic deadline.
- Release-status changes correctly retain a pending corrected matrix and pending publication. A local npm settings 401 is not presented as proof of hosted OIDC failure or as a requirement to obtain user confirmation before trying the authorized release workflow.

### Evidence inspected

- `windows24-first/matrix-evidence.log` and `windows26-first/matrix-evidence.log`: inspected the failing retained-artifact license comparison and preceding successful checks.
- `macos24-first/matrix-evidence.log` and `macos26-first/matrix-evidence.log`: inspected failure summaries showing repository resolution failure in the Git-spy fixture and the three affected 5-second framework timeouts across the two runs. Each run reports 3 failed, 796 passed and 1 skipped test. These observations support the corrections without being presented as successful hosted validation.
- `license-red24.log`: 1 expected regression failure, with extra CR bytes in the checked-out LICENSE.
- `license-green24.log` and `license-green26.log`: 1 regression test passed on each runtime.
- `hosted-fix-cover24.log` and `hosted-fix-cover26.log`: all 5 selected correction cases passed, with 82 pattern-skipped tests, in 13.22 seconds and 12.76 seconds respectively. These are focused checks, not full-suite results.
- `docs-corrected24.log`: documentation verification passed for 14 documents, 68 local links, 35 CLI examples, 14 commands and 7 capabilities.

No tests or probes were rerun. No source, Git state or external service was changed by this reviewer; only this report was appended.

### Issues

**0 Critical, 0 Important, 0 new Minor.** No new material concern was found within this scoped correction. The original I1 is closed; accepted Minor N1 remains deferred.

### Declined to judge

- The corrected full hosted matrix: running independently; focused local results do not establish its success.
- The root cause details of the hosted Git binary beyond the supplied runner investigation: the read-only diff and failure logs establish the test's hardcoded selection and observed failure, but this reviewer did not probe the hosted machine. Selecting the pre-spy PATH executable is independently appropriate for the fixture.
- Hosted OIDC authorization, exact main/tag/artifact publication and public installation: separate pending release gates; neither local 401 nor local success decides them.
- Stable metadata, broad core behavior and previously deferred N1: unchanged by this fix package and outside this follow-up scope.

### Updated assessment

**Ready to merge? Yes, subject to the separately required successful hosted checks.**

The preparation review's documentation blocker is resolved, and the CI corrections preserve production limits and validation assertions. There is no remaining source-review blocker from this scope; integration and publication must still follow the existing exact-source hosted gates. This follow-up supersedes the earlier “With fixes” preparation verdict without claiming a green hosted matrix or completed publication.
