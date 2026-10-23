# Agent Badge 2.0.0 release status

Stable **2.0.0** was published on 2026-10-23 under the user's explicit release
authorization. All three public packages are on `latest`:
`@legotin/agent-badge-core`, `@legotin/agent-badge`, and `create-agent-badge`.

```sh
npm init agent-badge@latest
```

The [release record](releases/2.0.0/README.md) contains exact source, candidate,
tarball, review and public verification evidence. Source
`6bab9679b8ccd9341bc67a2c990b0007bd30a559` is tagged `v2.0.0` after
[PR1](https://github.com/arlegotin/agent-badge/pull/1) merged.

- The final [PR matrix](https://github.com/arlegotin/agent-badge/actions/runs/39936187775)
  and required [main-push matrix](https://github.com/arlegotin/agent-badge/actions/runs/39937480625)
  each passed all six platform/runtime cells. Linux/macOS each passed 837 tests
  with one opt-in benchmark skipped, plus exact-package initializer, setup,
  repair, fork, status, doctor and actual worker checks.
- Native Windows is unsupported. Both Windows cells passed 41 platform tests and
  actual installed-initializer exit 3/no-write verification. Required directory
  fsync was preserved. See the [platform amendment](../superpowers/specs/2026-10-23-release-platform-scope.md).
  WSL2 requires both Badge and the coding agent inside Linux; no separate WSL2
  execution result is claimed.
- The [hosted release](https://github.com/arlegotin/agent-badge/actions/runs/39938378112/attempts/4)
  confirmed the same retained main candidate. Existing OIDC authorization worked
  for all three packages; no npm credential or account change was needed.
- Public checks verified downloaded sizes/SHA-512, versions, `latest` tags and
  exact provenance source/workflow identity. A fresh public npm initializer smoke
  resolved the exact v2 graph and displayed help without setup writes. npm
  verified six registry signatures and four attestations.
- npm propagation required matching-byte recovery. The release record discloses
  one premature resume and npm's rejection of its duplicate-version upload.
  Final confirmation made zero npm writes. No package was bumped, repacked,
  overwritten, unpublished or retagged.

Known scope remains: Linux/macOS execution; unverified native amounts omitted;
private badge rendering unverified. Minor N1 can leave private transport resources
after forcibly killed remote diagnostics. The historical 250 ms optimization goal
is unmet; the two-second automatic limit stays. V1 has no automatic migration.

Earlier local evidence remains in [verification](RELEASE-VERIFICATION.md) and the
[refactor review record](reviews/2026-10-23-repo-native/README.md). The
[release plan](../superpowers/plans/2026-10-23-stable-release.md) records execution
and authorization.
