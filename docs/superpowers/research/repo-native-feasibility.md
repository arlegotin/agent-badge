# Repository-native feasibility evidence

Date: 2026-10-22. Scope: Task 1 of the approved repository-native refactor.

## Decisions and gates

Use the built-in `node:sqlite` port with the exact supported runtime range
`^24.0.0 || ^26.0.0`. The common tested API is `DatabaseSync(path, { readOnly:
true })`, `exec`, `prepare`, statement `all`/`get`, `close`, and `PRAGMA
busy_timeout`. No external SQLite driver, experimental CLI flag, or newer minor
API is required. Node 24.0.0 emits its expected SQLite ExperimentalWarning;
accepting that stability level is explicit. Do not depend on APIs added in later
24.x minors. See the [Node 24.0.0 SQLite documentation](https://nodejs.org/download/release/v24.0.0/docs/api/sqlite.html).

The task controller deferred updating old package/CI/template ranges to Task 18,
because the remaining legacy source and native addon still use the current Node
22 development environment. Before release, apply the exact range above to all
packages/runtime templates and test both floors in CI. This evidence does not
claim that the legacy application has already migrated to the new runtimes.

| Gate | Result | Limit |
| --- | --- | --- |
| Sibling data commits, rejection, rebuild and normal push | Passed | Local bare remote, macOS Git 2.49.0 |
| Internal data push inside real pre-push | Passed | Command-scoped hook bypass; dirty checkout and existing stash preserved |
| SQLite read-only, WAL, absent tables, permissions, lock timeout | Passed on 24.0.0 and 26.0.0 | macOS arm64; synthetic databases only |
| Public GitHub README SVG delivery and cache observation | Pending | No authorized external repository supplied |
| Private GitHub README SVG for readers/nonreaders | Pending | Private-image support must not be claimed |
| Linux/Windows runtime and Git matrix | Pending | Required in supported-platform CI before release |

The transport mechanics and local read-only privacy boundary are proven enough
to implement the dependent local transport and adapter tasks. These are narrow
feasibility tests, not proof that the future implementation already enforces
all outbound schemas, two-second automatic budgets, or hook installation rules.
Those gates remain with their implementation tasks. Stop a dependent task if
it cannot retain these properties. Do not publish or claim private-image support
while the hosted gate remains pending.

## Reproduction and observed environment

Host: macOS 26.7.1, arm64. Git: 2.49.0. Official Node Darwin arm64 release archives
were downloaded into temporary storage and SHA-256 matched against each release's
official `SHASUMS256.txt`:

| Node | Bundled SQLite | Archive SHA-256 | Feasibility suite |
| --- | --- | --- | --- |
| 24.0.0 | 3.49.1 | `194e2f3dd3ec8c2adcaa713ed40f44c5ca38467880e160974ceac1659be60121` | 8 passed, no skips |
| 26.0.0 | 3.51.3 | `dcee8564c1a9342f9594dd5e52d533894dfef6b85aa771bbbb870baa3c403235` | 8 passed, no skips |

Download archives and checksums from `https://nodejs.org/dist/v24.0.0/` and
`https://nodejs.org/dist/v26.0.0/`, choosing the current host architecture. Set
`NODE24` and `NODE26` to the extracted executables, then run from the checkout:

```sh
"$NODE24" node_modules/vitest/vitest.mjs run scripts/feasibility/git-data-ref.test.ts scripts/feasibility/sqlite-readonly.test.ts
"$NODE26" node_modules/vitest/vitest.mjs run scripts/feasibility/git-data-ref.test.ts scripts/feasibility/sqlite-readonly.test.ts
npm test -- --run scripts/feasibility/git-data-ref.test.ts
```

The current full-suite run uses Node 22.14.0 because the pre-existing
`better-sqlite3` development addon is built for that ABI. The new feasibility
files import only `node:sqlite` and run on both exact target floors without
rebuilding that addon. Full application validation on the new range remains
required after legacy SQLite removal. Permission failure uses actual mode-000
files under a nonroot POSIX user; Windows/root skips this POSIX-only test and
must supply appropriate platform-specific permission evidence before making
equivalent claims.

## What the executable tests establish

`createBareRemoteFixture()` creates a disposable local bare remote, two real
clones, synthetic commits and a pre-existing stash. Its Git calls ignore global
and system configuration and inherited Git overrides; every author/committer
identity and timestamp is synthetic. No user credentials or agent homes are
read. All fixture data is temporary and removed after the test.

`snapshotUserCheckout(cwd)` captures the resolved HEAD, symbolic branch, raw
index bytes, code refs, stash ref, and tracked/untracked worktree bytes and file
modes, including symlink targets without following them. It resolves the index
through Git so later linked-worktree tests can reuse it. Private file bytes stay
inside the test process; this helper is never an outbound artifact format.

Data objects use `hash-object`, `mktree`, and `commit-tree`, with no checkout or
user index writes. Two independent children of the same data tip are built
before either is pushed. The first normal push succeeds; the sibling push
rejects. Fetching the new parent, retaining its record, adding the second record,
and making a new commit allows a normal fast-forward push. The remote contains
both records and the rebuilt commit's parent is the first winner. No force push
is used. Both dirty checkouts, stashes and local code refs match their snapshots.
The data commit metadata is checked against a fixed synthetic identity/message.

A real executable pre-push hook receives the code push's stdin, invokes
`git -c core.hooksPath=/dev/null push origin <oid>:refs/heads/agent-badge/data`,
then allows the selected code commit to push. The bypass applies only to the
internal Git command. A second hook invocation explicitly fails, making the
test detect recursion without an unbounded loop. The test verifies exactly one
hook invocation, both remote refs, and the entire user checkout snapshot.

SQLite coverage keeps a writer connection open with WAL auto-checkpoint disabled.
A committed row appears to a read-only second connection while a main-file-only
copy contains no row, proving WAL awareness. Writes through the read-only
connection fail, and main database/WAL hashes do not change. Schema discovery
distinguishes an absent optional table from a query error. A missing database
fails without creating a file. Mode-000 fails at both filesystem read and SQLite
open. A separate exclusive rollback-journal lock causes a read to fail after a
50 ms busy timeout; the observed assertion window is 35–1000 ms, and the read
works after rollback. This does not claim WAL readers normally block writers.

Negative controls were also run and restored: disabling read-only causes the
write-rejection assertion to fail; removing the internal hook bypass causes the
nested hook guard to reject the outer push. The fixture's initial missing
implementation and missing symbolic-HEAD snapshot field were observed red
before their implementations were added. Detailed commands/output are in the
Task 1 execution report.

## Authorized hosted-image smoke procedure — not yet executed

Live status: **PENDING**. No hosted result, cache lifetime, public image guarantee,
or private image support is asserted by this task. Local SVG serialization tests
cannot establish any of these hosted behaviors.

1. Obtain explicit authorization for disposable public and private GitHub test
   repositories and for the test accounts. Use only synthetic aggregate values
   and neutral Git identities. Never put a token, signed access URL, local path,
   provider identifier, or private history into Markdown, commits, or evidence.
2. Create the exact branch `agent-badge/data` with a safe `badge.svg` displaying
   an obvious synthetic generation marker such as `synthetic-v1`. Put a Markdown
   image on the default code branch using the fixed branch URL
   `https://raw.githubusercontent.com/OWNER/REPO/refs/heads/agent-badge/data/badge.svg`.
   Keep the URL unchanged during later updates; record the sanitized URL pattern
   and whether GitHub's renderer uses a proxy. Never substitute a commit-pinned
   URL for the stable-branch test.
3. For the public repository, observe the rendered GitHub README and direct image
   in both an authorized account and a fresh logged-out browser. Record success,
   failures, content type, observation times and visible generation marker.
   Reproduce using a fork/default-branch page if it is part of the claimed UX.
4. For the private repository, test the fixed raw URL and a candidate same-origin
   authenticated route such as `/OWNER/REPO/raw/refs/heads/agent-badge/data/badge.svg`
   in GitHub-rendered Markdown. Do not assume either route works. Observe an
   owner, a separate authorized read-only collaborator, an authenticated account
   with no repository access, and a logged-out fresh browser. Test the rendered
   README separately from the direct URL. A working owner browser alone is not
   proof of private-image support. Record only pass/fail and sanitized headers;
   do not retain cookies, bearer tokens, signed proxy URLs or account identifiers.
5. Push `synthetic-v2` to the same data branch by a normal fast-forward push.
   Observe the unchanged README/image URL at 0, 30, 60, 120, 300 and 600 seconds.
   Record the first visible new marker for each browser/account case. Inspect
   sanitized `Cache-Control`, `Age`, `ETag` and HTTP status if available. Compare
   ordinary reload and a fresh browser; a cache-busting query may diagnose a cache
   but does not count as a stable-URL update result. Report observed delays and
   the bounded observation period rather than promising universal cache timing.
6. Confirm unauthorized readers/nonreaders receive no private marker or aggregate
   through either candidate route or the rendered image. Any leak blocks that
   route. If private README delivery does not work consistently for authorized
   readers with denied access for nonreaders, keep private images unsupported
   and document the aggregate-data-only fallback. Keep public support pending
   independently until its actual test passes.
7. Retain sanitized screenshots/status/timing evidence with the research decision,
   remove the disposable repositories only with the same authorization, and
   update the gate table with actual observations. Do not infer a hosted pass
   from a local SVG render or successful Git push.
