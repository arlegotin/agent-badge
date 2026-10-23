# Agent Badge 2.0.0 stable release

> Execution: native release preparation and hosted validation, using the existing reviewed release design and Superpowers verification. The user authorized doing what is necessary to release on 2026-10-23. This authorization supersedes earlier implementation-only restrictions on release actions.

**Goal:** Publish all three public packages as 2.0.0 on `latest`, with one exact validated main-source candidate and a GitHub release.

**Architecture:** Keep the existing manual GitHub Actions/OIDC publisher, exact source/tag/current-main guards, one candidate artifact shared across the platform matrix, and matching-only partial-publication recovery.

**Spec:** [Repository-native design](../specs/2026-10-22-repo-native-design.md), [release contract](../../maintainers/RELEASE.md), [completed local review](../../maintainers/reviews/2026-10-23-repo-native/README.md).

## Global constraints

- Preserve normal user Git state and all earlier source/candidate evidence. Disable legacy local hooks for commits and pushes.
- No provider-history discovery or collection, credentials in output, raw transcripts, or production badge usage generated from synthetic fixtures.
- Keep the public packages fixed at the same exact version and exact internal dependencies, Apache-2.0 and Node `^24.0.0 || ^26.0.0`.
- Publish only retained bytes from successful same-repository main-push CI at the tagged current-main SHA. No local token publication or unpublish/force-push fallback.
- Test synthetic sources with the tracked isolation wrapper and exact target Node. Run Windows only within its documented manual scope; private images and unsupported accounting remain unsupported/unverified.
- Existing Minor N1 (temporary private transport resources after a killed remote doctor) stays explicitly deferred; no unrelated transport-ownership redesign.

## Review focus

1. Stable preparation must exit prerelease mode and retain exact internal dependency pins.
2. Hosted CI must execute the platform matrix, not merely have configured jobs.
3. The npm publisher must match owner/repository/workflow/environment and permit direct publishing.
4. A failed/partial publish must retain exact evidence and resume only matching bytes; never bump or repack as recovery.
5. `latest` must resolve to 2.0.0 for every package, and the initializer alone must resolve the public dependency graph.

### Task 1: Prepare stable metadata and release documentation

- [x] Run pinned Changesets 2.30.0 prerelease exit/version under Node 24 with isolated configuration.
- [x] Set exact CLI→core and initializer→CLI dependencies to 2.0.0; regenerate the lockfile without install scripts.
- [x] Update current product documentation to require v2 without prematurely claiming registry publication; preserve historical review/candidate records.
- [x] Run typecheck, clean build, docs, pack checks and focused release-contract tests. Review the preparation diff and commit it on the refactor branch.

### Task 2: Validate and integrate the exact release source

- [x] Create `npm-release` environment restricted to the main branch. Verify hosted publisher authorization during release; request owner configuration only if that operation rejects the existing publisher.
- [ ] Push the reviewed refactor branch, open a PR and observe all platform/runtime CI results. Fix concrete failures with focused reproductions and appropriate verification.
- [ ] Merge the green exact PR head, keeping the working branch. Wait for successful main-push CI and retain its candidate/run/artifact identities.

### Task 3: Publish and verify

- [ ] Create exact `v2.0.0` tag at current validated main, then dispatch `release.yml` with `stable-major`, SHA, tag and successful main CI run ID.
- [ ] Observe publication and retain structured result/provenance evidence. Resume the same bytes only if needed.
- [ ] Independently check all three public exact versions, tarball hashes and `latest` tags. Smoke the public initializer with synthetic roots and no real provider collection.
- [ ] Publish GitHub release notes/assets describing the breaking change and supported scope. Record actual hosted/public results and remaining limitations in Git.

## Initial access evidence

GitHub account `arlegotin` has repository admin/push access; Actions is enabled. Remote main is `d209a47a128eb1451002cacfa4030466c9833e92`, matching the refactor base. No remote refactor branch or v2.0.0 tag exists. Public npm metadata has all three packages owned by `legotin` at latest1.1.20; 2.0.0 is absent. `npm-release` environment is absent. Local `npm trust list` returned401; the user has been asked to confirm/add exact trusted publishers while independent release preparation continues. This is not a test of hosted OIDC authorization.
