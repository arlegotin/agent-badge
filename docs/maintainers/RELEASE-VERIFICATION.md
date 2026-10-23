# Repository-native candidate verification

Task 18 prepares `2.0.0-next.0` for local review; no npm publication, push, tag,
merge, deployment, hosted settings mutation or credential probe is authorized.
Final exact artifact hashes/source and fresh target-runtime gate results are
recorded below after validation. Local macOS evidence cannot certify hosted
GitHub/OIDC, Linux/Windows execution or private authenticated image rendering.

The target range is `^24.0.0 || ^26.0.0`, tested at both floors on macOS arm64.
CI is configured for Linux/macOS source/packaged gates and Windows manual
installation plus unsupported-automation checks. Those hosted jobs remain
unexecuted here. Windows setup uses the selected Node distribution's bundled
npm JS CLI, bypassing `.cmd` shell dispatch; a custom Windows Node installation
must provide that standard npm layout. Windows automatic supervision stays off.

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
