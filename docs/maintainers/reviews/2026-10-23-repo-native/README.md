# Repository-native refactor: final local acceptance

Current platform scope is amended by the [stable release platform decision](../../../superpowers/specs/2026-10-23-release-platform-scope.md): Linux/macOS execution; safe rejection on native Windows. Prior reports and hashes below retain their historical scope and do not certify native Windows support.

Implementation and independent review are complete on
`refactor/repo-native-agent-badge`. All 18 tasks and the final corrections are
accepted locally. No Critical or Important review finding remains open. Minor N1
is explicitly deferred: a forcibly terminated remote diagnosis can leave its
invocation-private transport directory and transaction ref. Repeated timeouts can
accumulate private resources; accepted history and user code state are separate.

The final packaged source is `62e9a27c23e459740a3690b24f8b211e87e6c55a`.
Its evidence commit is `95594f926f28acf201469145a80a9c295184c83a`; this acceptance
record changes documentation only. The prepared version is `2.0.0-next.0`, still
unreleased. No merge, push, tag, npm publication, deployment or hosted settings
change occurred.

## Verification

The final nonduplicated coverage is **73 files / 800 tests**, with **799 passing
cases and one existing opt-in skip per Node 24/26 floor**, combining the disclosed
broad runs and subsequent focused corrections. This is not a claim that a final
broad suite was rerun: the original Node 26 assertion failure and all RED runs
remain retained with their focused closure. The latest correction adds four
actual-command repository-resolution tests to the earlier 796-case scope.

Typecheck, clean builds, documentation and package checks passed on both runtimes.
The final three tarballs were packed once from clean source and passed retained
package and initializer-only installation checks on both runtimes. Those checks
cover fresh activation, runtime repair, standalone forks, status/doctor and the
actual installed manual worker's Node executable. Reviewers independently checked
the retained log digests and artifact sizes/hashes. Full commands, counts,
source identities, failed runs and exact manifests are in
[release verification](../../RELEASE-VERIFICATION.md).

## Review record

| Record | Reviewed source | Result |
| --- | --- | --- |
| [Whole-branch review](whole-branch-review.md) | `d209a47..2f784de` | Three Important and four Minor findings |
| [Combined implementation report](combined-fix-report.md) | `2c37a3c`, evidence `695fbc9` | Seven findings implemented and locally validated |
| [Combined scoped review](combined-fix-review.md) | `2f784de..695fbc9` | Six addressed; I3 retained one executable deadline gap; new Minor N1 |
| [Deadline correction report](deadline-closure-report.md) | `62e9a27`, evidence `95594f9` | Resolution moved into the existing supervised worker |
| [Deadline scoped review](deadline-closure-review.md) | `695fbc9..95594f9` | I3 addressed; no new findings; N1 remains deferred |

Reports preserve their original review-time wording, including pending statements
and references to the temporary plan workspace. This page records their final
disposition. Ruling 74 documents the narrow continuation beyond the workflow's
normal final-wave cap; the whole-branch audit was not repeated.

Earlier tracked reports for [Task 3](task-3-report.md), [Task 4](task-4-report.md)
and [Task 5](task-5-report.md) were relocated here unchanged when their temporary
plan workspace was removed.

All 75 decisions and their costs survive in the
[ordered decision record](../../../superpowers/research/2026-10-22-repo-native-decisions.md)
and the [full ruling text](rulings-full.md). Original plan checkboxes remain as
historical instructions; this acceptance record is the completion record.

## Limits retained

- Actual Linux/Windows and hosted CI/OIDC/publisher/main/tag gates remain
  unexecuted. Windows automatic operation is unsupported; manual taskkill is
  best effort. Authenticated private-image delivery is unverified.
- Provider accounting stays conservative. Native Claude unverified amounts are
  omitted; unsupported or unpriced sources do not become zero or complete coverage.
- Historical installed pre-push p95 was 382.28/443.23 ms on Node 24/26. The 250 ms
  optimization goal remains unmet; these are not measurements of the final
  tarballs. The two-second automatic operation limit is unchanged.
- Arbitrary in-process integration callbacks require cooperative cancellation.
  Verified executable diagnostics use an owned process; N1 resource cleanup is
  still deferred as described above.
- Two early Task 16 synthetic diagnostic probes omitted the isolation wrapper.
  Their actual inventory reach is unknown. Retained output contained no source
  payload, path, credential or raw provider ID; subsequent isolated checks cannot
  establish that the earlier probes were isolated. No retrospective private
  history inspection was performed.
- Known Node 24 SQLite and Node 26 tooling warnings, and all earlier failed
  verification attempts, remain documented rather than suppressed.

The requested branch and checkout are retained for further work. Final acceptance
does not authorize a release or imply that `npm init agent-badge@latest` installs
this unreleased replacement.
