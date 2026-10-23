# Repository-native candidate verification

Final whole-branch review at `2f784de63844ead663200e4b0eb535a2d45d295c`
found three Important and four Minor issues. The single combined fix wave is
implemented and locally validated. The scoped review accepted six findings and
the indexed/owned-reporting portions of I3, but identified its executable
repository-resolution deadline residual. Its focused correction passed narrow review.
No Critical or Important finding remains open; Minor N1 private remote-doctor
resource cleanup is explicitly deferred. The [final review record](reviews/2026-10-23-repo-native/README.md)
retains every review and the final disposition. Tasks1–18 and all
task-scoped reviews are complete. The source-f81d9a4 artifacts below remain
historical, frozen evidence and will not be overwritten or relabeled. Packaged
fixes are bound to the distinct source commit and exact candidate recorded below.

Task 18 prepares `2.0.0-next.0` for local review; no npm publication, push, tag,
merge, deployment, hosted settings mutation or credential probe is authorized.
Final exact artifact hashes/source and fresh target-runtime gate results are
recorded below. Local macOS evidence cannot certify hosted
GitHub/OIDC, Linux/Windows execution or private authenticated image rendering.

The target range is `^24.0.0 || ^26.0.0`, tested at both floors on macOS arm64.
CI is configured for Linux/macOS source/packaged gates and Windows manual
installation plus unsupported-automation checks. Those hosted jobs remain
unexecuted here. Windows setup uses the selected Node distribution's bundled
npm JS CLI, bypassing `.cmd` shell dispatch; a custom Windows Node installation
must provide that standard npm layout. Windows automatic supervision stays off.

## Focused executable deadline closure (2026-10-23)

Ruling74 authorizes this narrow I3 continuation after the scoped review found that
repository resolution still ran before the reporting worker. Source commit
`62e9a27c23e459740a3690b24f8b211e87e6c55a` moves command repository discovery,
realpath and synchronous parsing into the same owned worker, under the original
parent deadline. Core resolved-context APIs remain; directory entrypoints carry
only cwd and trusted integration-module identity. Source/compiled sibling module
paths derive from import.meta.url rather than parent-side filesystem probes.
No nested worker, authority/cache change or historical cap was added.

| Gate | Node 24.0.0 | Node 26.0.0 |
| --- | --- | --- |
| Typecheck, clean build, docs, pack content | Pass; typecheck/build repeated only for startup-probe correction | Pass on final source |
| Prescribed four-file cover | 35 pass; 58.23s before final startup-probe correction | 35 pass; 58.43s on final source |
| Final source/compiled startup cover | Deadline + core status:17 pass; 24.64s | Included in four-file cover |
| Exact retained pack and initializer-only install | Pass; actual worker v24.0.0 | Pass; actual worker v26.0.0 |

No full suite, broad branch audit or100k benchmark was repeated. Earlier broad
results remain attributed to the earlier changes below. The four new actual
status/doctor read/CPU regressions first failed because each stalled PID equaled
the command parent (19.32s RED). The separate module-probe RED failed all four
selected cases (1.51s). Final checks require a different owned worker PID, no
startup filesystem-probe marker, unavailable/exit1, command termination below the
specified allowance and a dead worker at return. Doctor uses700ms with<1800ms
assertion; status retains5000ms with<6000ms assertion. Fixture construction is
outside that timing assertion. Existing index/CPU/inspection/capability tests stay.

New `2.0.0-next.0` artifacts were packed once from clean source62e9a27 under Node24
and retained at `/private/tmp/agent-badge-deadline-candidate-62e9a27/`.
[The closure candidate manifest](evidence/2026-10-23-deadline-closure/candidate.json)
records exact lengths and SHA-512 SRI; both runtime pack/install logs identify these
same bytes. Fresh independent activation proves actual installed worker selection.
The finite registry has no uplinks and reuses the existing public dependency
closure. Both historical candidates f81d9a4 and2c37a3c remain untouched.
[Closure logs and SHA-256 digests](evidence/2026-10-23-deadline-closure/validation-log-digests.json)
retain both RED failures, covering/standard checks and exact package/install results.

**Deferred N1 (Ruling75):** a forcibly terminated remote doctor may strand its
invocation-private transport directory and transaction ref because the worker's
finally cannot finish. Repeated timeouts may accumulate private resources.
Process termination is verified; transport-resource cleanup is not guaranteed.
Parent-owned exact-resource cleanup is deferred, with no accepted-ledger or user
checkout/ref mutation implied. Arbitrary in-process IntegrationPort callbacks
still require cooperative cancellation. Windows taskkill remains best effort.

The focused closure passed independent narrow review with no new findings.
Final nonduplicated coverage is 73 files / 800 tests: 799 passing cases and one
existing opt-in skip per runtime across the disclosed broad and focused runs.
The four new resolution cases extend the earlier 796-case scope; no repeated
broad run is implied. All external/platform/privacy and historical latency
limitations below remain; no publication is authorized.

## Earlier combined fixes: local evidence (2026-10-23)

Source commit: `2c37a3cf164bb3d4314f1ed69d9008b2ac9c0727`. The three
`2.0.0-next.0` tarballs were packed once from its clean tracked tree under Node24;
[the new candidate manifest](evidence/2026-10-23-final-fix/candidate.json) records
exact filenames, sizes and SHA-512 SRI. Retained bytes are in
`/private/tmp/agent-badge-final-candidate-2c37a3c/`. Later documentation/evidence
commits preserve this source binding. The older f81d9a4 candidate below is unchanged.

| Gate | Node 24.0.0 | Node 26.0.0 |
| --- | --- | --- |
| Typecheck, clean build, docs, pack content | Pass; typecheck/build also after initializer fallback | Pass after initializer fallback |
| Broad default partition | 69 files; 744 pass, 1 skip; 407.94s, before the isolated initializer fallback | 69 files; 744 pass, 1 failed assertion, 1 skip; 407.03s |
| Exact four-file loopback partition | 50 pass; 44.24s | 50 pass; 44.38s |
| Later initializer/launcher cover | 2 files; 35 pass; 6.74s after fallback | Included in broad run: 35 pass |
| Final structural import-privacy assertion | 1 pass; 1.23s | 1 pass; 1.21s; closes broad assertion failure |
| Exact retained pack and initializer-only registry smoke | Pass, actual worker v24.0.0 | Pass, actual worker v26.0.0 |

The nonduplicated final scope is **73 files / 796 tests**, with **795 cases passing
and one opt-in skip** across broad and scoped evidence on each floor. This does
not claim either broad run was repeated. Ruling72's extra initializer case was
added after broad24, then covered with both entrypoint files and typecheck/build.
The sole broad26 failure was the old privacy regex matching `999` within a valid
random public hash. Ruling73 keeps raw identifier/filename suppression and
structurally rejects the actual numeric/string cost canary and forbidden cost
field. Both corrected-file checks pass; no production change was needed.

The new initializer-only finite-registry smoke uses the retained public dependency
closure with no uplinks or credentials. It verifies real npm init, transitive
installation, packaged workflow generation, persistent JSON setup, partial-runtime
repair, both coherent native-hook commit policies, nonmutating fresh dry-run,
standalone fork identity, indexed status, owned doctor work and actual manual core
worker runtime. Each floor gets its own fresh activation; Node26 is not inferred
from Node24 activation or top-level PATH. Windows keeps its explicit manual
setup/action-required guard; healthy-doctor smoke is POSIX-only. Actual Windows
execution remains unverified.

All failed intermediate regressions and final command logs are retained with
[SHA-256 digests](evidence/2026-10-23-final-fix/validation-log-digests.json).
The default26 log intentionally retains its failure, and the structural-cover
logs retain its closure. The same evidence directory includes launcher/initializer,
status, publication, automatic wording and deadline RED/GREEN logs, including the
700ms actual-command deadline checks (read/CPU/inspection/capability, asserted
under1800ms with owned child dead at return). This is small synthetic termination
evidence, not a new 100k benchmark or installed pre-push latency measurement.

Read-only status uses existing complete indexes and authority/anchor proofs;
untrusted generations report unavailable with null unproved counts. Existing
owning collect/sync performs rebuild. No new cache schema, historical cap or
truncated output was added. Concrete CLI work runs under one owned subprocess
deadline; arbitrary caller-supplied in-process IntegrationPort functions still
must cooperate. Decisions71–73 record these costs and validation boundaries.

The subsequent scoped review found the executable I3 residual and Minor N1,
recorded in the focused closure above. No publication, push, tag, merge, hosted
settings change, live provider-history probe or external acceptance is claimed.
The warning, Task16 isolation, Task17 latency and platform limitations below apply.

## Reproduce the local safety boundary

Use `scripts/validation/run-isolated.mjs` with the target Node executable on PATH
and `AGENT_BADGE_TEST_NODE` set to it. Its allowlisted child environment has fresh
HOME/USERPROFILE/APPDATA/LOCALAPPDATA/XDG config/data/cache, empty npm config,
empty Git credential helpers, no system Git config and no inherited agent/auth,
proxy, Node injection or Git overrides. Default provider inventory therefore stays
inside synthetic roots; explicit capability probes supply `{codex:[],claude:[],gemini:[],opencode:[]}`.
Do not run setup or hooks in the real repository, inspect private user directories,
or copy real provider histories into tests. Local commits use
`git -c core.hooksPath=/dev/null commit` because an obsolete root hook can publish.
The node_modules symlink remains intact. Owned fixtures use canonical OS temporary roots and their own mkdtemp directories; deliberately retained benchmark fixtures survive runner HOME/cache cleanup.

Default sandbox tests exclude exactly these owned-loopback receiver files:

- `packages/testkit/src/git-daemon.test.ts`
- `packages/core/src/git/data-transport.test.ts`
- `packages/core/src/operations/budget.test.ts`
- `packages/core/src/operations/runner.test.ts`

Run full discovery with four `--exclude <file>` arguments and `--maxWorkers=1`.
Run those four files separately, sequentially per runtime, under reviewed
`env -i` escalation with fixed target PATH, fresh isolated HOME/cache/config and
synthetic provider roots. Do not unsandbox the full suite. Candidate registry
smoke is another exact loopback-only command using the same boundary; public
locked dependency acquisition/audit is a separate read-only command restricted
to registry.npmjs.org. The default sandbox denies loopback bind/connect; escalated
fixtures lose that OS sandbox boundary and rely on the disclosed narrow command,
owned resources, no credentials and no live/project-uplink routes.

## Retained historical scope and limits

Task 17 implementation `82ea1b33079cd90e343963a0845445362475fb7c` and reviewed
storage fix `b7862539d427ee4c51c7a90bfeecbc8de58bfa09` preceded this candidate.
Its original broad scope was 67 files / 742 tests (741 passing, one opt-in
OS-namespace skip) on each floor. Node24's initial eight failures were retained
and closed by scoped covering reruns; Node26's two partitions passed directly.
Review fix round 1 then passed 134 tests in five covering files on each floor,
plus typecheck/build. That was focused fix evidence, not a second broad run or
repeat 100k cold seed. Task 18's fresh broad gate is recorded separately below.

The retained storage/performance report preserves failed/intermediate measurements
and original cold/recovery evidence. Final-build actual installed pre-push p95
at 10,000 native sources was **382.28ms / 443.23ms** (Node24/26), all unqueued.
The **250ms optimization goal remains unmet**, accepted for this prerelease under
Ruling68 to minimize maintenance/trust risk; two seconds remains the hard bound.
There is no universal 500ms guarantee. Release metadata work does not justify
repeating the full cold seed or attributing old measurements to a new artifact.

Task16 review isolation limitation: two review-only synthetic doctor probes omitted
isolated HOME/empty provider roots and could reach default provider inventory
metadata; actual reach is unknown. No source payload, path, credential or raw
provider ID appeared in retained output. They do not count as privacy-isolated
gates. The controller stopped further probes; subsequent isolated regression
evidence is separate and does not retroactively isolate those probes.

Automatic local/file publication is unsupported: a killed child receive-pack can
leave a user remote ref lock. Collection and explicit manual local sync remain;
supported automatic publication needs an independent Git server. The fixture
daemon exports only its exact canonical temporary bare remote and owns its
process group. No production remote lock is deleted. Manual cancellation can
still leave transport state requiring normal operator diagnosis/retry.

Node24 SQLite experimental warnings and Node26 docs-tooling `module.register`
deprecation warnings remain disclosed. Engine metadata now includes Node26;
no warning suppression is used. One opt-in OS-namespace integration skip is
preserved. Source-specific uncertainty is unchanged: unverified native Claude
numeric receipts stay omitted, unknown costs remain unknown, and CI cannot
collect usage that exists only on a developer machine.

See [release procedure](RELEASE.md), [storage/performance](STORAGE-AND-PERFORMANCE.md)
and [ordered decisions with costs](../superpowers/research/2026-10-22-repo-native-decisions.md).

Historical benchmark attribution: the original retained synthetic cold/recovery
fixture is `/private/tmp/agent-badge-git-NAStPO`, with every call in
`cold-samples.jsonl` and original output `/private/tmp/task17-full-native24-daemon.log`.
Its 1,814-call cold seed and strict final 100,002-unit recovery verification were
completed before the later native-Git canonical-identity correction and Task17
storage review fix. The old raw output and failed warm sample set remain intact.
The corrected frozen wrapper set is `/private/tmp/task17-full-native24-wrapper60.log`;
the final-build owning-runtime sets are `/private/tmp/task17-finalwarm24.log` and
`/private/tmp/task17-finalwarm26.log`, with separate `task17-final{24,26}-memory.log`.
Those final warm artifacts had these identical SHA-256 values on both runtimes:

| Component | SHA-256 |
| --- | --- |
| core `git/remote-binding.js` | `9995f385e3f8f4a3b5c8a86b43843804f768c4efd59da34a6aad26fc055af773` |
| core `operations/worker-sync.js` | `0899965217834a8e1a158666f1e06faf6b2380e0a588b14e5c22f328361dc0a8` |
| CLI `integration/runtime-worker.js` | `516def4ec64cbabd9685e3643980957448fa3b26bf03bf0790a58f4151fadee6` |

They identify the historical measurements, not new candidate tarballs. No repeated
cold seed or final-candidate latency measurement is claimed for release metadata
and Windows npm-dispatch changes. The later storage fix has the separate focused
coverage described above; Task18 supplies new broad/package gates below.

## Historical Task18 candidate identity

The retained candidate was packed once from clean source commit
`f81d9a457ef0471ffe1c440dcaf5fa266eff0fd4`, Node24.0.0, darwin/arm64.
Exact versions, filenames, byte lengths and SHA-512 SRI survive scratch cleanup in
[the candidate manifest](evidence/2.0.0-next.0-local-candidate.json). Tarballs remain
at `/private/tmp/agent-badge-task18-candidate-f81d9a4/`; keep these exact bytes for
local review/retry. Later evidence-only commits do not change that source binding.
This local refactor candidate has not met live current-main/tag or successful
hosted-CI-run prerequisites; a future authorized release needs those real gates.

The separate read-only [production audit](evidence/2.0.0-next.0-production-audit.json)
reported zero advisories for the locked graph on 2026-10-23. Exact external runtime
dependencies were `zod@4.3.6`, `@iarna/toml@2.2.5`, `commander@14.0.3`; public
package tarballs were never obtained through uplinks. The audit does not certify
future registry advisories or the complete development dependency graph.

## Historical Task18 local gates (2026-10-23)

| Gate | Node 24.0.0 / npm 11.3.0 | Node 26.0.0 / npm 11.12.1 |
| --- | --- | --- |
| Typecheck, build, docs, pack content | Pass | Pass |
| Complete default partition | 67 files; 716 pass, 1 skip; 389.86s | 67 files; 716 pass, 1 skip; 391.84s |
| Exact four-file loopback partition | 49 pass; 44.23s | 49 pass; 44.59s |
| Later Windows-result fixture cover | 1 file; 3 pass | 1 file; 3 pass |
| Retained candidate pack check | Pass, same three hashes | Pass, same three hashes |
| Initializer-only registry smoke | Pass | Pass |
| Actual manual CLI core worker | v24.0.0, matching target executable | v26.0.0, matching target executable |

Each runtime's nonduplicated scope is **72 files / 769 tests: 768 pass, one skip**.
The frozen-source broad discovery and four-file partition total 71 files / 766
tests; the later three Windows-result fixture tests are separate covering
evidence, not a repeated broad run. Every run was sequential with maxWorkers=1,
darwin/arm64, canonical TMPDIR `/private/tmp`. The original node_modules symlink
remained intact. No EBADENGINE suppression was used.

The Node24 first broad attempt is retained: 20 failures, 696 pass, one skip.
Its runner/fixtures crossed macOS's `/var` symlink while Git used physical paths;
canonical temp roots fixed isolation fixtures without relaxing production path
checks. A 73-test affected cover and the complete default partition above passed.

Four registry harness failures are also retained: obsolete plaintext wording,
unsupported launcher `setup --json`, an incomplete native-hook commit set, and
instrumenting the integration worker instead of the actual manual CLI core
worker. The incomplete commit correctly failed ownership protection. Final smoke
tests both coherent commit sets documented in [installation](../INSTALL.md),
requires successful manual sync, and restores instrumented installed worker
bytes. This proves manual CLI worker selection, not new automatic-hook timings.

Windows CI accepts only the exact documented automatic-hook limitation, with
configured native definitions, zero queued records, no pending reconciliation,
the exact known action items, installed runtime and successful manual sync.
Unrelated setup/provider actions or generic exit1 fail. Literal result fixtures
passed on macOS; actual Windows execution remains unverified.

Local logs are `/private/tmp/agent-badge-task18-final{24,26}-default.log`,
`agent-badge-task18-loop{24,26}.log`, `agent-badge-task18-pack{24,26}.log`,
`agent-badge-task18-registry24-final-harness.log` and
`agent-badge-task18-registry26.log`; the same directory contains the named failed
attempts and standard-gate logs. These are local retained artifacts, not hosted
CI evidence. The candidate manifest and audit above survive scratch deletion.

Portable reproduction uses the tracked runner, without the plan scratch wrapper:

```sh
node scripts/validation/run-isolated.mjs npm run typecheck
node scripts/validation/run-isolated.mjs npm run build
node scripts/validation/run-isolated.mjs npm run docs:check
node scripts/validation/run-isolated.mjs npm run pack:check
node scripts/validation/run-isolated.mjs npm test -- --run --maxWorkers=1 --exclude packages/testkit/src/git-daemon.test.ts --exclude packages/core/src/git/data-transport.test.ts --exclude packages/core/src/operations/budget.test.ts --exclude packages/core/src/operations/runner.test.ts
node scripts/validation/run-isolated.mjs node node_modules/vitest/vitest.mjs run packages/testkit/src/git-daemon.test.ts packages/core/src/git/data-transport.test.ts packages/core/src/operations/budget.test.ts packages/core/src/operations/runner.test.ts --maxWorkers=1
node scripts/validation/run-isolated.mjs npm run smoke:pack -- /path/to/retained-candidate
node scripts/validation/run-isolated.mjs node scripts/smoke/verify-initializer-install.mjs /path/to/retained-candidate /path/to/retained-dependency-closure
```

Choose the intended Node floor on PATH and matching AGENT_BADGE_TEST_NODE before
each command. Apply the narrow loopback escalation boundary above where the OS
sandbox requires it. Independent reviews are complete, as recorded above;
publication and all external prerequisites remain outside this completed local scope.
