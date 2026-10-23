# Executable repository-resolution deadline closure

BASE `695fbc9a2c66f35ad09d2e5ef8e50ba96c4bd917`; branch
`refactor/repo-native-agent-badge`. Narrow I3 continuation under Ruling74,
sole implementer, no subagents. No broad suite/audit/100k benchmark repeat.
Root alone reviews this correction. N1 is explicitly deferred under Ruling75.

## Boundary and API

Core `getStatus(RepositoryContext, options?)` and
`diagnose(RepositoryContext, options)` remain unchanged for callers.
New `getStatusFromDirectory(cwd, options?)` and
`diagnoseFromDirectory(cwd, Omit<DoctorOptions,'integrations'>)` dispatch directory
strings to the same existing reporting workers. Their runReport resolves the
repository inside the supervised group before integration/index/remote work.
No nested worker or refreshed deadline. Directory doctor accepts the existing
trusted integration-module identity, not arbitrary serialized callbacks. Existing
in-process IntegrationPort cooperation limits remain explicit.

CLI commands start the original deadline before dispatch. Repository Git
resolution, realpath filesystem calls and synchronous worktree parsing are now
owned by that worker. The trusted source/compiled integration module and supervisor
host/worker sibling URLs derive from import.meta.url format, without pre-worker
existsSync filesystem probes. Core getStatus remains usable without an owner.
No status network/discovery/write/lease/repair or new historical cap/schema.
The process-group owner still kills/reaps before returning unavailable.

## RED and GREEN

All executable tests use original scratch run-isolated.py plus tracked
scripts/validation/run-isolated.mjs, allowlisted exact Node24.0.0/26.0.0 PATH,
matching AGENT_BADGE_TEST_NODE, canonical TMPDIR=/private/tmp, fresh homes/config,
empty/synthetic provider roots, sequential maxWorkers1. Fixtures/canaries only;
no real history/credentials/private settings/root setup/hooks. Only exact finite
candidate registry checks may use reviewed escalation; no external operations.

Commands use prefix:
`env -i PATH=/private/tmp/agent-badge-node-feasibility/node-vNN.0.0-darwin-arm64/bin:/usr/bin:/bin:/usr/sbin:/sbin TMPDIR=/private/tmp AGENT_BADGE_TEST_NODE=/private/tmp/agent-badge-node-feasibility/node-vNN.0.0-darwin-arm64/bin/node /usr/bin/python3 .superpowers/sdd/2026-10-22-repo-native-refactor/run-isolated.py node scripts/validation/run-isolated.mjs`.

RED command: `node node_modules/vitest/vitest.mjs run
packages/agent-badge/src/commands/report-deadline.test.ts -t repository-resolution
--maxWorkers=1`. `/private/tmp/agent-badge-deadline-red-resolution24.log`:
4failed/4skipped,19.32s. Actual compiled status/doctor command subprocesses were
intercepted at the synthetic repository's realpath, with read-promise or CPU stall.
Every recorded stalled PID equaled its command parent, proving pre-worker work;
external test timeout killed that owned command after6500/2500ms. This is the
expected failure, not a passing timeout or missing instrumentation marker.

First implementation Node24 typecheck/build passed. Prescribed four-file cover
(report-deadline, core status, core doctor, command operational) passed35tests,
58.23s: `/private/tmp/agent-badge-deadline-focused24.log`.

Before freezing, root identified the supervisor's module existsSync probes.
The same actual resolution tests gained a separate synthetic lookup PID marker;
`agent-badge-deadline-red-startup24.log` failed4/4selected,1.51s, proving these
probes ran before owned work. Removing them uses source/compiled module format
instead. Subsequent Node24 typecheck/build passed; source and compiled deadline+status
cover passed17/17,24.64s (`agent-badge-deadline-startup-cover24.log`). No production timeout was enlarged.

Each successful new test requires a recorded resolution PID distinct from the
command parent, no module-lookup marker, a conservative unavailable/exit1 report,
and the owned PID dead at return. Doctor budget700ms asserts command elapsed<1800ms;
status retains its actual5000ms budget and asserts<6000ms. Fixtures are constructed
before timing. Existing four index-read/CPU/inspection/capability deadline tests
remain. This is synthetic command termination evidence, not native hook latency.

## Final gates and candidate

Final prescribed Node26 four-file cover passed35/35,58.43s:
`/private/tmp/agent-badge-deadline-focused26.log`. Node24 coverage is the original
four-file35pass plus final startup correction17pass, not a repeated full35 run.
Node26 runs all35 on final source. Both floors passed typecheck, clean build,
docs:check and pack:check; Node24 typecheck/build repeated only after startup
probe correction. Exact logs are `agent-badge-deadline-{typecheck,build,docs,pack-check}NN.log`
and `agent-badge-deadline-startup-{typecheck,build,cover}24.log` where applicable.
All logs remain retained; no broad suite was repeated.

Source commit `62e9a27c23e459740a3690b24f8b211e87e6c55a` used disabled hooks and
had a clean tracked tree at packing. P24 `npm run release:evidence --
/private/tmp/agent-badge-deadline-candidate-62e9a27` packed once, unchanged prepared
version2.0.0-next.0. P24/P26 `npm run smoke:pack --` that directory both passed
(`agent-badge-deadline-retained-pack24/26.log`). P24/P26
`node scripts/smoke/verify-initializer-install.mjs` with that directory and
`/private/tmp/agent-badge-task18-dependency-closure` both passed
(`agent-badge-deadline-registry24/26.log`) under exact reviewed loopback escalation.
These commands used the same prefix above. Each fresh installation proved actual
manual core worker v24.0.0/v26.0.0 and exact matching executable, plus installed
status/doctor, setup JSON, dry-run, standalone fork, runtime repair, workflow
resource and coherent native-hook policies. No credentials/uplinks/live route or
publication. No candidate repack; initializer bytes remain unchanged from2c37a3c.
Historical f81 and2c37a3c source/tarball identities remain frozen and separate.

Durable evidence is `docs/maintainers/evidence/2026-10-23-deadline-closure/`, with
candidate.json and all raw logs/digests. Verification docs and ordered decisions74/75
record scoped completion/review pending and deferred N1. Final evidence-docs check
passed on24 (`agent-badge-deadline-evidence-docs24.log`).

## Exact candidate identity

Source62e9a27 above; Node24.0.0 packing; darwin/arm64.

| Package | Bytes | SHA-512 SRI |
| --- | --- | --- |
| @legotin/agent-badge-core | 138109 | `sha512-x9kxS8Jy9OwPwR+WvwGL3LyamX3ij9zcHL0fJUi7VYRU9Nhrh4UI+rYz+fTT220E5o8ayCRwPKSoiDXQiQenhQ==` |
| @legotin/agent-badge | 49958 | `sha512-GmQDSJy0cjONqlEAnMzBTWxZF13BZRlewNBEhFg4RqsZX4SscCGDGOsvRLibY27qoUrPpHQuzCtOg+zUyMLL3w==` |
| create-agent-badge | 7057 | `sha512-HJWQGP299KrX0oJJIYLV2bql3G6Fe+LXeN6+Ord9sQtGjLSJNrOBZHv2AWaOOYx5ck16kHNjvG/f1KIK2ZNnkA==` |

## Final state

Source commit: `62e9a27c23e459740a3690b24f8b211e87e6c55a`.
Evidence-only final HEAD: `95594f926f28acf201469145a80a9c295184c83a`.
Both commits disabled hooks. `git status --short` returned empty after the evidence
commit. All21 retained log byte lengths/SHA256 verified; both historical candidate
manifests match BASE byte-for-byte. Exact new source binding remains62e9a27.
Source/code/docs diff whitespace passes; original raw test logs intentionally retain
terminal blank lines/whitespace with byte hashes rather than silently reformatting
failed evidence. No approval rejection or unauthorized action occurred. Protected
local settings stayed unread; node_modules symlink preserved. No scratch deleted.
Root alone dispatches the narrow closure review and records acceptance.

## Limits and deferred N1

Ruling75 defers remote doctor private-resource cleanup: forced termination can
prevent transport.close() from removing invocation-private transport-* directories
and transaction refs. Repeated timed-out remote diagnosis may accumulate them.
Worker termination does not imply resource cleanup. Parent-owned exact-resource
cleanup is future work; this correction does not change transport ownership,
accepted ledger anchors or user checkout refs.

Node24 SQLite and Node26 tooling warnings remain. POSIX process groups are the
verified path; Windows manual taskkill remains best effort, Windows automatic
unsupported. Actual Linux/Windows/hosted CI/main/tag/OIDC/publisher/private-image
and live native-provider history gates remain unexecuted. Task17 historical
382.28/443.23ms pre-push p95 and unmet250ms goal remain separately attributed;
hard2s automatic bound unchanged. Task16 isolation reach remains unknown, with no
retrospective private inspection. Arbitrary caller IntegrationPort cancellation
is cooperative, not a hard process termination claim.
