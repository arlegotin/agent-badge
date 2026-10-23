# Final whole-branch review

Reviewed range: `d209a47a128eb1451002cacfa4030466c9833e92..2f784de63844ead663200e4b0eb535a2d45d295c` on `refactor/repo-native-agent-badge` (37 commits). This is one connected final review, not a repeat of Task18's release review. Reviewer: `/root/final_branch_review`. No subagents, executable probes, test reruns, setup, publication, or checkout/index/ref changes were made. This report is the only file written.

## Strengths

- The replacement has a coherent authority model. Immutable private journal/control/acknowledgement records remain separate from disposable SQLite indexes and prepared remote generations. Journal publication now uses a no-replace operation; uncertain authority/index mutations poison the owning lease. The same-lease continuation tests cover BEGIN, INSERT, COMMIT and directory-fsync failures, rather than relying only on reopening the store.
- Remote acceptance is substantive. Current routing is revalidated, immutable history retention and ancestry are checked, prepared candidates are regenerated/validated, and local acknowledgements follow confirmed inclusion. Invocation-private refs/index, fixed commit metadata, explicit single-ref fast-forward pushes and the advertised-parent guard preserve ordinary user Git state. Cache presence is not treated as remote acceptance.
- Accounting is conservative across module boundaries. Strict public schemas, scoped identities, causal closure and deterministic reduction carry through import, collection, controls, pricing and rendering. Native Claude numerical evidence stays private/unknown even at durable replay. Gemini's positive saved-success boundary, OpenCode's unsupported accounting, exact-model pricing and unknown repository completeness are represented honestly.
- Activation and automatic execution have meaningful boundaries: approved private code, exact tracked pin comparison, older-branch fallback, per-clone consent, native trust remaining explicit, supervised process groups, deadline reserves and exact child/nonce lease cleanup. Hook ownership and interrupted edit snapshots protect existing user hooks/settings.
- Contribution import reads validated accepted Git blobs through the same transaction, with trusted installed code rather than proposal executables. Release code verifies source/run/artifact identity before publication and handles missing-only resume with exact retained bytes. Apache metadata/licenses, supported Node floors, installed resources and initializer-only dependency resolution have concrete checks.

## Issues

### Critical

None found.

### Important

**I1 — The repository-owned launcher cannot execute documented setup/fork workflows.**

Locations: `packages/agent-badge/src/integration/templates.ts:25`, `packages/agent-badge/src/integration/templates.ts:77`, `packages/agent-badge/src/integration/setup.ts:109`; `docs/CLI.md:5`, `docs/CLI.md:32`, `docs/CLI.md:49`, `docs/QUICKSTART.md:27`.

The shared CLI accepts `setup --json`, `--import-workflow` and `--new-repository`, but the generated launcher rejects all three before dispatch. The CLI reference explicitly says to replace `agent-badge` with `node .agent-badge/run.cjs`, and includes those setup options. Thus an ordinary activated clone cannot enable the optional import workflow through its persistent entry point; the JSON example fails too. A standalone fork cannot use that entry point either. Merely adding `--new-repository` to the allowlist is insufficient: bootstrap creates `<common>/agent-badge` before calling `planSetup`, whose fresh-clone guard then rejects any existing private directory.

The quickstart also changes from `node .agent-badge/run.cjs ...` to bare `agent-badge contribute`. The normal initializer/private-runtime installation does not put that binary on the user's PATH. That fork instruction therefore fails in the intended installation topology.

Make the supported persistent entry point and documented CLI contract agree, including a safe fresh standalone-fork bootstrap that preserves the no-existing-authority guard. Use the repository launcher consistently in post-setup product examples. Add tests of the generated launcher itself for these valid options and the fresh-fork path. `scripts/verify-docs.mjs:21` currently substitutes the launcher with the shared Commander program, so its passing examples cannot detect this discrepancy.

**I2 — The initializer bypasses the CLI's static error boundary and can print private file contents/paths.**

Locations: `packages/create-agent-badge/src/index.ts:19`, especially line22; compare `packages/agent-badge/src/cli/main.ts:69` and `packages/agent-badge/src/cli/main.ts:77`. Concrete input paths: `packages/agent-badge/src/integration/runtime.ts:13`, `packages/agent-badge/src/integration/runtime.ts:19`, and `packages/agent-badge/src/integration/setup.ts:45`.

Without `--json`, shared `run()` rethrows operational failures. The real CLI routes them through `handleRunError`, but `npm init agent-badge` prints arbitrary `error.message`. Retrying setup with an unreadable private activation file therefore prints the filesystem error's absolute path; malformed private activation JSON can print a parser excerpt containing private roots or attribution data. These are ordinary corrupt/permission-error recovery cases, not an intentionally verbose debug mode. The initializer also maps all Commander errors to exit1 rather than the documented invalid-argument exit64.

Reuse the shared safe error classification/formatter at the executable initializer boundary, while retaining the early unsupported-Node gate and help/version behavior. Exercise the actual initializer executable with synthetic private-path/JSON canaries and a plain-text error, not only shared-CLI JSON tests. No real private file is needed to prove this path.

**I3 — Doctor's total deadline does not cancel its full-history status work; status also misses its planned indexed fast path.**

Locations: `packages/core/src/operations/doctor.ts:10`, `packages/core/src/operations/doctor.ts:30`, `packages/core/src/operations/status.ts:59`, `packages/core/src/operations/status.ts:77`, `packages/core/src/storage/store.ts:90`.

`bounded(getStatus(...), signal)` only races the returned promise. `getStatus` first calls `readStoreSnapshot`, which has no signal/deadline and reads/validates every journal and acknowledgement record, then materializes all local observation IDs and reduces/renders complete history. The snapshot and synchronous reductions do not observe cancellation. On a large or slow store, doctor can report timeout while filesystem work continues and keeps the CLI alive; synchronous work can also delay delivery of the timeout itself. `doctor --remote` repeats the uncancellable snapshot read. The existing stalled-promise tests establish report resolution, not termination of this real work.

This also means ordinary `status` replays the entire private history and accepted ledger despite the spec's fast-local-status contract and the Task16 contract assigning indexed acceleration to Task17. The retained performance documentation explicitly shows that full read-only materialization is expensive; that historical measurement is not a new measurement of this CLI, but the source establishes that this CLI chooses that full path.

Provide a validated read-only indexed reporting path (with explicit unavailable/rebuild-needed results when a complete generation cannot be trusted), and bound/cancel any required fallback work. If synchronous validation/reduction remains, place it behind an owned worker deadline rather than relying on an in-process promise race. Preserve the existing no-network/no-repair/no-lease status contract and never promote an unconfirmed accepted cache. A focused synthetic regression should assert the real command stops work/exits within its diagnostic budget, including journal-read and CPU-work stages. Do not repeat the 100k cold benchmark just to test this.

### Minor

**M1 — Launcher `setup --dry-run` installs or replaces the private runtime.**

Locations: `packages/agent-badge/src/integration/templates.ts:22`, lines77–98; `packages/agent-badge/src/commands/init.ts:8`.

The flag is accepted but only takes effect after bootstrap creates private directories, runs `npm ci`, and possibly removes/replaces an incomplete runtime. A fresh-clone dry run therefore changes repository-private state and can require a successful network install before reporting a plan. It does not approve activation, so this is narrower than an unintended setup, but it violates the normal plan-only expectation and can make the subsequent standalone fresh-clone guard fail. Keep planning/bootstrap acquisition separate from persistent installation, or provide an explicit, truthful non-mutating bootstrap plan. Test before/after private-state contents, including a missing/incomplete runtime.

**M2 — Actual npm publish output corrupts `publish-result.json`.**

Locations: `.github/workflows/release.yml:95`, `scripts/release/preflight.ts:117`, `scripts/release/preflight.ts:119`.

The workflow tees stdout into a JSON-named evidence artifact while npm publish inherits stdout. A first or partial successful upload adds npm's human-readable output before the final JSON object. The repeat/no-write case can appear valid, masking the defect. Route subprocess output to stderr or write the structured result to a dedicated file. Include candidate CI run identity alongside SHA/tag/artifact identities, and retain meaningful partial-failure evidence. This is the deferred Task18 M1; the upload/resume algorithm itself is not invalidated by the formatting bug.

**M3 — Healthy automatic partial draining tells the user manual maintenance is required.**

Location: `packages/core/src/operations/supervisor.ts:28`.

A closure-complete automatic batch can succeed while more ordinary queued units remain, returning `queued`. The default message says `usage queued; run manual sync`, although subsequent automatic invocations can continue draining. Use wording that describes automatic retry/catch-up and reserve mandatory manual action for oversized groups, unsupported local transport, conflicts and explicit reconciliation requirements. This is the final UX handoff note; it does not imply lost data.

**M4 — Tracked final-status documentation still describes completed tasks as pending.**

Locations: `docs/maintainers/DOCS-DRIFT-CHECKLIST.md:3`, `docs/superpowers/plans/2026-10-22-repo-native-refactor.md:3`, `docs/superpowers/specs/2026-10-22-repo-native-design.md:3`, and `docs/superpowers/specs/2026-10-22-operational-cli-contract.md:5`.

The drift checklist still says Tasks17/18 remain, and several tracked headings say Task18 awaits independent review despite the completed task/re-review record. Reconcile these after the final fix/review, retaining historical failed runs and clearly distinguishing completed local gates, the final branch review, retained f81 candidate identity, and unexecuted hosted/platform prerequisites. The old Task17 performance-doc sentence has already been correctly relabeled historical; do not erase it.

## Recommendations and maintainability

Resolve I1–I3 before merging. M1 shares the launcher seam with I1 and should be handled in the same focused change; M2/M3 are small fixes with direct user/evidence value. Finish M4 after the final state is known.

The storage generation/staging complexity is largely justified by bounded recovery and immutable authority, and the final shared cleanup path is preferable to competing ownership rules. The hand-maintained launcher/shared-CLI option split and error split have already produced observable drift; prefer one reviewed contract and executable seam tests over adding another parallel parser. Several orchestration modules contain dense single-line functions, making sequencing and cancellation harder to audit. Improve touched functions' readability without another broad architecture rewrite.

Any packaged-code fixes produce a new source/artifact identity. Do not relabel the existing f81d9a4 tarballs or older hook measurements as evidence for those bytes. Use focused regressions and the package checks appropriate to changed entry points; retain the established supported-runtime/platform limits.

## Deferred-minor disposition

| Prior item | Final disposition |
| --- | --- |
| Task1/Task18 M2 Node24 SQLite ExperimentalWarning; Node26 tsx/module.register warning | Accepted disclosed limitation, not a merge blocker. A deliberate tooling update can address it later; no blanket warning suppression or repeat suite solely for noise. |
| Task5 namespace-probe cancellation | Closed in source: acquisition races caller abort and removes its listener; automatic parent supervision provides the outer bound. |
| Task7 full-directory enumeration | Closed for native rollout discovery: streaming `opendir` with bounds replaced eager enumeration in the provider adapters. |
| Task12 hook/delegate/integration minors carried to17 | Final ownership, delegate preservation, native stdin/exit behavior and recovery code contain the assigned fixes; no new issue found in those seams. |
| Task13 intermittent helper PID marker in the retained Node22 run | Root cause remains unproven. Later supported Node24/26 covering/full evidence passed. Keep the historical failure and uncertainty; no source-supported current blocker found, and no claim that a rerun proved the old root cause. |
| Task14 wrong v2 worktree field and Promise<any> fixtures | Closed: test selects `info.location.directory` for v2 and helpers return typed version-specific exports. |
| Task15 cron validation and intentional fixture stderr | Closed by bounded cron validation/tests and original-hook exit/stderr assertions. Native runtime warning remains separately disclosed. |
| Task17 M1 stale performance-doc progress sentence | Closed: sentence now explicitly labels the historical measurement and links subsequent candidate verification. Remaining general status drift is M4. |
| Task18 M1 publish stdout/JSON evidence | Open M2 above. |
| Final launcher bootstrap-flags observation | Open I1; JSON is only one affected valid setup option. |
| Final automatic-drain wording observation | Open M3. |

## Review coverage and evidence limits

Used the supplied 396-file index and behavior package in bounded component passes, with the binding design, execution plan, ordered decisions, global constraints, final handoff and acceptance map. Production passes covered public/domain schemas; canonicalization, reducer, controls, pricing and artifacts; Git context/routing/process/object/transport; private storage, local indexes, accepted staging/generations and recovery; provider discovery/parsers/provenance/attribution; collection/sync/configure/control/contribution paths; activation/launcher/runtime/hook ownership; CLI/setup/diagnostics/uninstall; package metadata/exports/resources; CI/release and artifact/download/install/isolation harnesses. Benchmark harness inspection distinguished private-bootstrap/direct-driver measurements from actual installed pre-push wrapper measurements and retained-artifact smoke.

Test inspection was risk-directed: complete durable-store fault/recovery tests and launcher/setup/initializer tests, plus critical integration/release/validation assertions and the named test-case inventory across accounting, transport, operations and providers. This is source review, not a claim to have rerun or independently reproduced every test. Pure-deletion metadata was checked for obsolete architecture; no retained dependency concern required opening a deleted raw body. Complete replacement/mixed sections were read for their final behavior rather than treating their large removed legacy implementations as retained code.

Named outside-package/context checks: the unchanged `scripts/release/publish-impact.ts`, because the modified root package still exposes it (read-only impact helper; no legacy publication dependency found); the unchanged middle of `findLatestCodexStateDatabase`, omitted by diff context, to check inventory selection; exact numbered current-file excerpts for the findings; `task-18-report.md`, `task-18-review.md`, `task-18-fix1-review.md`, progress/deferred records and tracked release/performance verification. No raw provider histories, credentials or production setup were inspected.

Retained test evidence is adequate to inform this review, not authority to waive the findings: macOS Node24/26 each have the reported nonduplicated 72-file/769-test scope (768 pass, one opt-in skip) across default plus four exact loopback partitions and the later three-test cover; the later release-version fix has its separate 35-test cover. Candidate tarballs remain bound to `f81d9a457ef0471ffe1c440dcaf5fa266eff0fd4`, not HEAD2f784de. The recorded actual installed pre-push p95 values 382.28/443.23ms are historical supported-runtime measurements. Ruling68's explicit acceptance is reasonable for this prerelease/minimum-maintenance objective; 250ms remains unmet and the hard two-second bound remains unchanged.

## Declined to judge

- Actual Linux/Windows execution, Windows manual install behavior, and hosted CI matrix success: configured source and synthetic tests were reviewed, but those platforms/jobs were not executed in the authorized evidence. Windows automatic supervision is explicitly unsupported rather than an unverified supported feature.
- Actual hosted main/tag/environment rules, npm package ownership/trusted-publisher OIDC/direct-publish settings, provenance and hosted artifact retention: require external state and an authorized release. Local source/artifact checks do not prove those prerequisites.
- Authenticated/private README image delivery and live GitHub caching behavior: no authorized hosted image test was performed; the product correctly excludes a private-image guarantee. No public-service fallback is recommended.
- Runtime behavior of uninspected native-agent versions or complete real-user histories: intentionally outside the certified source/fixture contracts and privacy boundary. The implementation's stated partial/unsupported behavior was judged; broader compatibility was not inferred.
- Simultaneous cold process-tree peak memory and final-candidate hook latency: not measured in the retained evidence. Observer RSS/direct-bootstrap timing/older wrapper artifacts cannot substitute for them.
- The actual inventory reach of the two Task16 reviewer probes that omitted isolation: unknown. Retained output contained no source payload/path/credential/raw provider ID, but later isolated tests cannot retroactively establish that those probes were isolated. No retrospective private-directory inspection was performed.

No additional connected behavior was set aside merely because its task-level review passed or because the spec was silent.

## Assessment

**Ready to merge: With fixes — not ready at this HEAD.**

The repository-owned accounting/authority/transport design is substantially sound and its principal failure paths have serious coverage. The persistent entry-point mismatch, initializer error leak and uncancellable diagnostic history work remain concrete integration defects; resolve I1–I3 and review that scoped fix before declaring whole-branch acceptance. This verdict does not authorize publishing or claim the unexecuted external gates have passed.
