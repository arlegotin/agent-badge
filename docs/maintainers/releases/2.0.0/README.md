# Agent Badge 2.0.0 release record

Published on 2026-10-23 under explicit user authorization. All three public
packages resolve to **2.0.0** on `latest`. Install with `npm init agent-badge@latest`
on Linux/macOS with Node 24 or 26, npm and Git. This is a breaking replacement for
v1's Gist/global-runtime architecture, with no automatic migration.

## Source and retained files

- Source/tag: `6bab9679b8ccd9341bc67a2c990b0007bd30a559` / `v2.0.0`.
- [PR1](https://github.com/arlegotin/agent-badge/pull/1) reviewed head
  `c3a61bbadf0d50077d5f7731b676e4ff804543a3`; merge did not change its tree.
- Required main-push [CI39937480625](https://github.com/arlegotin/agent-badge/actions/runs/39937480625),
  candidate artifact `12493868772`, ZIP SHA-256
  `25490839c441391597df7aca7a3e916a2b8ca105cd1b455e7ed831e04e8cc0ab`.
- [Candidate manifest](candidate.json): exact filenames, sizes and SHA-512 SRI.
  Its publication/OIDC checks describe packing time; subsequent evidence below
  records actual publication. No post-validation repacking occurred.
- [Release assets](https://github.com/arlegotin/agent-badge/releases/tag/v2.0.0)
  retain the original tarballs, verification JSON and synthetic validation archive
  beyond CI's 90-day artifact retention.

[Asset inventory](release-evidence.json) and [GitHub verification](github-release-verification.json)
record uploaded names, sizes and SHA-256 values. Documentation can advance after
publication; the release and provenance remain bound to the tagged source above.

## Hosted validation and review

The final [PR matrix](https://github.com/arlegotin/agent-badge/actions/runs/39936187775)
and main-push matrix each passed all six cells. The
[main summary](validation-summary.json) binds retained log SHA-256 values and
installed-package checks to the release source.

| Platform | Node 24.0.0 | Node 26.0.0 |
| --- | --- | --- |
| Linux | 76 files; 837 passed, 1 opt-in benchmark skipped; exact-install smoke passed | Same checks passed |
| macOS | 76 files; 837 passed, 1 opt-in benchmark skipped; exact-install smoke passed | Same checks passed |
| Native Windows | 41 platform tests; installed initializer exit 3, no public/private setup writes | Same checks passed |

Checks include typecheck, build, docs and package contents. POSIX installed checks
cover npm-init-only acquisition, setup, runtime repair, coherent fresh-clone hooks,
standalone forks, indexed status, doctor and actual manual core-worker execution.
Fixture registries had no uplinks; homes and provider roots were synthetic and
empty. Windows proves rejection, not durable operation or worker execution.
No separate WSL2 test or real provider-history collection is claimed.

The original whole-branch review remains in the
[refactor record](../../reviews/2026-10-23-repo-native/README.md).
[Preparation review](preparation-review.md), including its scoped follow-up,
closed the pending-install documentation finding and accepted the LF license and
hosted test-fixture corrections. [Platform review](platform-gate-review.md)
approved compliance and quality with 0 Critical, 0 Important and 0 new Minor
findings. Scratch paths in these unchanged reports refer to corresponding paths
inside the release evidence archive.

## Publication and propagation

Existing trusted publishers authorized every package through `release.yml` and
the main-only `npm-release` environment. No npm credential or account change was
needed. Local npm settings 401 was not treated as a hosted OIDC failure.

[Workflow39938378112](https://github.com/arlegotin/agent-badge/actions/runs/39938378112)
kept the same source, tag and candidate throughout:

1. Attempt 1 accepted core with provenance, then recorded incomplete publication
   because public metadata was not immediately readable. Exact public bytes and
   `latest` were confirmed before resuming.
2. Attempt 2 skipped matching core, accepted CLI with provenance, then stopped
   on the same processing delay.
3. A coordination error started attempt 3 after a local registry check failed.
   Cancellation was requested and the mistake disclosed. The run still reached
   publication: npm rejected the duplicate CLI upload with immutable-version
   E403; an exact lookup reconciled matching bytes, then initializer was accepted
   with provenance. No version was overwritten. Its structured CLI `published`
   result means reconciled matching bytes, not a successful overwrite. The run's
   final status is cancelled.
4. Only after all three public versions, bytes and `latest` matched,
   [attempt 4](https://github.com/arlegotin/agent-badge/actions/runs/39938378112/attempts/4)
   completed with `[resumed, resumed, resumed]` and zero npm writes. See
   [publication result](publish-result.json).

No version bump, repack, unpublish, overwrite or retag was used for recovery.
Initial failures and deliberately cancelled duplicate branch/tag or diagnostic CI
runs remain historical evidence, not substitutes for the final green matrices.

## Public verification

- [Registry](public-registry-verification.json), `2026-10-23T10:29:36.979Z`:
  downloaded all three public files; exact versions, sizes, SHA-512, tags and
  provenance metadata match the candidate.
- [Initializer](public-initializer-verification.json), `2026-10-23T10:32:07.093Z`:
  fresh project/home/cache, empty provider roots, actual public npm-init help;
  all three exact 2.0.0 packages resolved, with no repository setup writes.
  `npm audit signatures` verified six registry signatures and four attestations.
  This proves public acquisition/help; full setup and worker behavior are covered
  separately by the retained-candidate matrix.
- [Provenance](public-provenance-verification.json): each subject digest matches
  its candidate, with exact source SHA, main ref, repository, GitHub-hosted builder,
  release workflow and actual attempt identity.

The first smoke checker incorrectly expected init-specific help. Diagnostic output
and unchanged initializer source confirmed root help is intentional. Correcting
the checker produced the passing public result; published code did not change.

## Limitations and decisions

Linux/macOS are supported. Native Windows requires both agent and Badge inside
Linux/WSL2 or use of macOS; no discovery of arbitrary native Windows histories is
claimed. Unverified Claude amounts are omitted; partial/unsupported sources remain
explicit, and estimated costs are not billing records. Private authenticated badge
rendering is unverified. Existing Minor N1 can strand private transport resources
after forcibly killed remote diagnostics. Historical hook p95 was 382.28/443.23 ms
on Node 24/26: the 250 ms goal remains unmet and the two-second automatic limit
stays. No final-artifact latency benchmark was claimed.

[Release rulings](rulings.md) preserve every decision and its cost if wrong.
Earlier refactor decisions remain in their original Git records.
