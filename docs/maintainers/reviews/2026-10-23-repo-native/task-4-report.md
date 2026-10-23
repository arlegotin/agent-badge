# Task 4 implementation report

Status: DONE. No pushes, publishing, live credential queries, network remote
operations, or real provider-history reads. All Git repositories and subprocess
programs used for verification are synthetic temporary fixtures.

## Implemented

- `git/context.ts` discovers the nearest enclosing repository through Git, resolves
  physical worktree/Git/common directories, effective hooks path, private store
  location, superproject boundary, known worktrees including prunable registrations,
  HEAD state and shallow state. It does not assume `.git` is a directory, prune
  worktrees, or modify checkout/index/HEAD/refs/stash. One shared two-second deadline
  bounds its Git discovery commands. Failures expose a path-free diagnostic.
- `git/remote-binding.ts` records private local routing consent independently of
  accounting identity and remote ledger validation. Default `origin` binds only
  when its canonical push destination matches the declaration. A fork origin never
  inherits upstream write consent; selecting a remote explicitly permits binding.
  Multiple push/fetch destinations leave activation unbound and suspend previously
  stored consent. Changed canonical fetch or push routing suspends stored consent.
  Supplied verified UUID or destination evidence mismatches reject activation.
- Canonical URL keys strip HTTPS credentials and preserve full host paths. Only
  documented `github.com` HTTPS and `git` SSH/scp aliases share an identity. Generic
  protocols, SSH accounts, nondefault ports, path case, `.git` suffixes and absolute
  versus home-relative SSH paths remain distinct. Ambiguous percent/dot-segment
  routing, custom helpers and remote file authorities are rejected. Explicit native
  local/file remotes become private absolute file URLs, including spaces/Unicode.
- `git/process.ts` executes argv without shell interpolation, supplies stdin,
  AbortSignal, deadline, combined output-byte cap, explicit environment and isolated
  index overrides. POSIX commands own a detached process group so deadline/abort
  cleanup kills descendants even when the initial process exits. Diagnostic stderr
  redacts URL authorities, local paths including spaces and caller-supplied secrets.
  Output-limit diagnostics are static to prevent partial-secret leakage after a cap.
- `testkit/git-fixtures.ts` now returns physical temporary paths, matching Git's
  canonical paths on macOS symlinked temporary directories. Existing fixture API
  remains intact; no dependency installation or manifest change was needed.
- Public core exports expose the new APIs and types. Retained v1 callers are
  unchanged pending their owning migration tasks.

## Public APIs and integration contracts

`resolveRepository(cwd): Promise<RepositoryContext>` exposes `worktreeRoot`,
`gitDir`, `commonDir`, `privateDir`, `hooksPath`, `superprojectRoot`, `worktrees`,
`head`, and `shallow`. Context and worktree mappings are private discovery inputs,
never public usage artifacts. A prunable worktree registration is discovery evidence;
later attribution must apply its own verified saved-mapping rules.

`bindRemote(ctx, BindingRequest): Promise<RemoteBinding>` accepts `repositoryId`,
`declaredUrl`, optional explicit `target`, and optional `ledgerEvidence`.
The returned discriminated union is bound, unbound, or rejected. Bound values are
private local.json persistence inputs with selected remote name, canonical fetch
and push keys, repository UUID, standard data ref, and nullable supplied evidence.
This function deliberately does not write local.json; its persistence/locking
owner must store the value privately. `dataRef` is fixed to
`refs/heads/agent-badge/data`.

`verifyBinding(ctx, storedBinding): Promise<BindingCheck>` returns valid or
suspended, with finite redacted reason codes. It reads current local Git routing
and supplied stored evidence; it never consults a newly checked-out branch's
declaration. A valid result means routing consent remains valid, not that unseen
remote metadata or push access was verified.

Controller ruling: routing consent must not require existing ledger evidence;
doing so creates a circular init/transport dependency and contradicts matching-origin
activation. Task 9 MUST fetch and validate existing remote `meta.json` UUID before
any outbound data. Task 11 init alone may create missing metadata; deletion of a
previously seen data ref is recovery. This task does not invent verification or an
absence-for-init authorization token.

`runGit(args, GitRunOptions): Promise<GitRunResult>` returns status, exitCode,
private raw stdout and bounded/redacted stderr. Statuses distinguish ok/error,
timeout, aborted, output-limit and spawn-error. Callers must never log or publish
raw stdout, which intentionally carries private Git protocol output. Default
timeout is two seconds and combined stdout/stderr cap is 1 MiB; explicit longer
manual budgets are supported. Larger transactions must pass their own remaining
deadline/AbortSignal rather than repeatedly resetting a per-command budget.

Inherited `GIT_DIR`, `GIT_COMMON_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_PREFIX`,
`GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_NAMESPACE`,
`GIT_SHALLOW_FILE`, `GIT_IMPLICIT_WORK_TREE`, `GIT_GRAFT_FILE`, and
`GIT_REPLACE_REF_BASE` are removed. User Git configuration and authentication
transport policy remain intact. Explicit `options.env` deliberately overrides the
clean baseline and `indexFile` wins over that environment. Terminal prompts are
disabled and optional Git locks are disabled.

## Controller-approved platform boundary

`gitProcessCapabilities` exposes `treeCleanup` and
`automaticDeadlineEnforced`. POSIX uses process-group cleanup. Windows manual
operations use best-effort `taskkill /T`; it cannot guarantee orphan cleanup after
the initial process exits. No Windows guarantee was claimed from a macOS test.

Controller ruling: Task 10 automatic supervision must fail soft BEFORE spawning on
Windows, leaving data queued with doctor guidance. Task 18 Windows CI must test
that boundary plus pack/manual behavior. A future tested Job Object implementation
may enable automatic Windows operations. The POSIX descendant-cleanup test is
explicitly skipped on Windows; the rest of the suite remains eligible there.

## TDD evidence

Commands below use the existing isolated HOME/config helper:
`python3 .superpowers/sdd/2026-10-22-repo-native-refactor/run-isolated.py`.
`<node24>` and `<node26>` denote the existing checksum-verified absolute Node
24.0.0 and 26.0.0 executables supplied by Task 1; no binaries were installed here.

1. Initial RED: helper + `<node24> node_modules/vitest/vitest.mjs run
   packages/core/src/git/context.test.ts packages/core/src/git/process.test.ts
   packages/core/src/git/remote-binding.test.ts`.
   The first import-only run reported three missing modules. Minimal throwing
   entry-point stubs then allowed the meaningful RED run: **32 tests failed**,
   each `Not implemented`, exit 1. Assertions exercised real synthetic Git behavior,
   not mocks. Implementing the three owners produced **32/32 passed**, exit 0.
2. Credential-cap regression RED: helper + `<node24> node_modules/vitest/vitest.mjs
   run packages/core/src/git/process.test.ts packages/core/src/git/remote-binding.test.ts`.
   **1 failed/28 passed**: capped diagnostic incorrectly contained
   `https://alice:passw`. Redacting complete or partial URL authorities and replacing
   output-limit diagnostics with a static bounded message closed the leak.
3. Controller-directed routing refinement RED: helper + `<node24>
   node_modules/vitest/vitest.mjs run packages/core/src/git/remote-binding.test.ts`.
   **15 failed/17 passed**: generic SSH identities had been conflated and explicit
   local remotes rejected. Implemented restricted hosted aliases plus separate
   generic/local routing identities; subsequent full focused scope passed.
4. Spaced-path diagnostic RED: helper + `<node24> node_modules/vitest/vitest.mjs run
   packages/core/src/git/process.test.ts`.
   **1 failed/7 passed**: a local absolute path's tail still exposed `secret.ts`
   after a space. Redacting the line tail after an absolute path fixed both POSIX
   and Windows spellings. Subsequent focused scope passed.
5. Effective-policy RED: helper + `<node24> node_modules/vitest/vitest.mjs run
   packages/core/src/git/context.test.ts`.
   **1 failed/7 passed**: stripping all inherited GIT variables ignored the
   synthetic effective global hooksPath. Narrowing removal to repository-local
   overrides preserved user policy; subsequent focused scope passed.
6. Trailing-space local routing RED: helper + `<node24> node_modules/vitest/vitest.mjs
   run packages/core/src/git/remote-binding.test.ts`.
   **1 failed/32 passed**: trimEnd changed a native path and left matching consent
   unbound. Removing only the Git record terminator preserves significant spaces.

Early GREEN runs revealed temporary fixture symlink spellings differing from Git's
physical paths, and a 300ms synthetic timeout firing before the Node runner wrote
its PID. The fixture now uses realpath and the descendant test uses a 1500ms deadline,
which still verifies the actual child process is gone via kill(pid, 0). These were
fixture setup issues; no production timeout was increased.

## Final verification

- Full retained suite, installed Node 22.14.0: helper + `npm test -- --run`:
  **60 files / 478 tests passed**, exit 0, 5.67 seconds. This is the required full
  suite run; retained CLI tests emit their existing mocked lifecycle output.
- Final focused Node 24.0.0: helper + `<node24> node_modules/vitest/vitest.mjs run
  packages/core/src/git/context.test.ts packages/core/src/git/remote-binding.test.ts
  packages/core/src/git/process.test.ts`: **3 files / 49 tests passed**, exit 0,
  5.05 seconds, no warnings. Final test improvements specifically exercise staged,
  unstaged and untracked state preservation and changed branch declarations.
- Node 26.0.0: same three-file scope through the isolated helper:
  **3 files / 49 tests passed**, exit 0, 4.92 seconds. The last subsequent changes
  strengthened two existing test setups without modifying production code.
- Helper + `npm run typecheck`: exit 0 after final changes.
- Helper + `npm run build`: exit 0 after final production changes.
- Helper + `npm run docs:check`: exit 0, Documentation verification passed.
- `git diff --check`: exit 0 before report/commit preparation.

Package/release files were not changed, so package release checks were not triggered.
No publish command was run. Full retained tests use Node 22 because the existing
retained-v1 better-sqlite3 addon is built for that ABI; new code was separately
verified on both target Node majors.

## Self-review and remaining limits

- Reviewed all new modules and tests, scoped exports and fixture changes. Modules
  remain focused; no unrelated caller or old Git helper was migrated.
- Fixed cap-boundary credential leaks, spaced-path leaks, global-policy stripping,
  generic SSH conflation and trailing-space routing during self-review, with RED
  regressions before fixes.
- Local routing canonicalization normalizes paths but does not prove the target is
  an existing/valid ledger. Task 9 owns fetched metadata, actual access failures,
  remote disappearance, and revalidation immediately before transport.
- Native/file URL canonical keys contain local paths and remain private only.
- No Windows/Linux host was available; macOS POSIX cleanup was exercised with real
  subprocesses. Windows automatic support is intentionally disabled through the
  published capability boundary, pending Task 10/18 enforcement and gates.
- Binding values are typed private persistence inputs, not a local.json schema or
  writer. Runtime validation of arbitrary untrusted local.json bytes belongs to
  the state-loading owner before calling these typed APIs.

## Files changed

- `packages/core/src/git/{context,remote-binding,process}.ts`
- `packages/core/src/git/{context,remote-binding,process}.test.ts`
- `packages/core/src/index.ts`
- `packages/testkit/src/git-fixtures.ts`
- This report.

## Review fix round 1: suppress free-form Git diagnostics

The reviewer identified an important path leak: replacing the cwd first changed
an absolute filename into `[redacted]/src/secret.ts`, so the absolute-path matcher
missed its suffix. Relative paths and bare filenames were also emitted unchanged.
Reproduced both cases with real synthetic Git subprocesses before changing code.

Free-form stderr cannot safely distinguish a bare filename such as `Makefile`
from ordinary text. With controller approval, replaced heuristic substitutions
with finite static diagnostics. Empty stderr remains empty; nonempty stderr returns
`Git diagnostic details suppressed`, optionally prefixed by one whitelisted
severity (`fatal`, `error`, `warning`, or `hint`). Output is ASCII and capped to the
caller limit. No original message fragment is forwarded. This supersedes the
earlier report's description of retaining heuristically redacted message text.

Status, exitCode, private raw stdout, process limits and cleanup remain unchanged.
The optional caller redaction-token input remains accepted; all free-form stderr,
including those tokens, is suppressed. Raw stderr is intentionally unavailable.
Task 9 must determine remote acceptance and ref conflicts from Git state, rather
than string-matching stderr. No classification framework was introduced.

Added seven regressions for cwd-prefixed paths, plain relative paths, dot-relative
and parent-relative paths, Windows separators, a bare extension filename and a
bare extensionless filename. Existing credential-cap, spaced-absolute-path,
bounded-output, abort, descendant cleanup and isolated-index cases still pass.

Verification evidence (isolated synthetic HOME/config):

- RED: `python3 .superpowers/sdd/2026-10-22-repo-native-refactor/run-isolated.py
  <node24> node_modules/vitest/vitest.mjs run packages/core/src/git/process.test.ts`
  — **7 failed / 8 passed**, exit 1. The cwd case exposed
  `[redacted]/src/secret.ts`; all six relative/bare path cases exposed their input.
- GREEN: identical command after the fix — **15/15 passed**, exit 0,
  8.71 seconds, no warnings.
- `python3 .superpowers/sdd/2026-10-22-repo-native-refactor/run-isolated.py
  npm run typecheck` — exit 0.
- `git diff --check` — exit 0 before committing.

Only `git/process.ts`, `git/process.test.ts`, and this report changed. The full
suite was not rerun, following the controller's focused review-fix instruction.
