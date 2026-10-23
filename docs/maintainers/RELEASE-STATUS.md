# Agent Badge 2.0.0 release status

The user authorized stable publication on 2026-10-23. Release preparation is in
progress; this document does not yet claim npm publication or hosted CI success.

- Intended public versions: `@legotin/agent-badge-core@2.0.0`,
  `@legotin/agent-badge@2.0.0`, and `create-agent-badge@2.0.0`, all on `latest`.
- Stable source preparation: Changesets 2.30.0 prerelease exit/version, exact
  internal dependency pins, unchanged production dependency graph.
- Local Node 24 preparation checks passed: typecheck, clean build, documentation,
  package content and 62 release/launcher/initializer tests.
- GitHub `npm-release` environment exists with a custom main-branch-only policy.
- GitHub Actions platform matrix, current-main candidate/run/tag binding and
  exact-byte OIDC publication remain required before completion.
- [Release PR1](https://github.com/arlegotin/agent-badge/pull/1) is in validation.
  Its first matrix passed both Linux cells; Windows found license checkout line
  endings, while hosted macOS found a hardcoded test Git binary and test-framework
  timeouts. Corrections preserve production deadlines and exact artifact checks;
  a clean full matrix on the corrected source remains required.
- Hosted OIDC authorization will be checked by the release workflow. Local npm
  settings access returned 401, which does not establish a hosted failure. Owner
  configuration is needed only if that operation rejects the existing publisher;
  no npm credential is requested in chat.
- Existing local refactor review/evidence remains in
  [verification](RELEASE-VERIFICATION.md) and the
  [review record](reviews/2026-10-23-repo-native/README.md).

Known scope remains: Windows automatic execution is unsupported; unverified native
amounts are omitted; private badge rendering is unverified. Minor N1 can leave
private transport resources after forcibly terminated remote diagnostics. The
historical 250 ms optimization goal is unmet; the two-second automatic limit stays.

Actual CI, tag, artifact, publication and public-install results will replace the
pending entries after their execution. The [release plan](../superpowers/plans/2026-10-23-stable-release.md)
records the procedure and authorization.
