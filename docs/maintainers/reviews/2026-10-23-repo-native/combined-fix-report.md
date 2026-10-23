# Final combined fix wave — completed local evidence

FIX_BASE: `2f784de63844ead663200e4b0eb535a2d45d295c`. Branch:
`refactor/repo-native-agent-badge`. Sole implementer; no subagents or self-dispatched
reviewer. Source commit `2c37a3cf164bb3d4314f1ed69d9008b2ac9c0727` implements
I1/I2/I3/M1/M2/M3/M4. Local validation and exact artifacts are complete; root owns
the pending single scoped re-review. No publication/push/tag/merge/hosted mutation
is authorized.

## Changes by finding

- I1/M1: one shared setup option descriptor feeds Commander and the generated
  bootstrap parser. Persistent setup accepts JSON/import-workflow/new-repository.
  Invalid Commander subcommands explicitly use exitOverride so executable errors
  reach the shared exit64 boundary. Fresh standalone acquisition uses an owned
  temporary runtime outside repository private authority; shared planSetup retains
  its strict existing-private-state refusal. Dry-run returns a truthful bootstrap
  plan, distinguishing requested and bootstrap versions, without acquisition,
  replacement, deletion, activation or persistent private state. Post-setup docs
  use the repository launcher. Docs verification executes generated setup parsing
  with --help in a synthetic directory/empty PATH; only the documented version
  placeholder is substituted with the current package version.
- I2: initializer operational failures pass through handleRunError, retaining the
  early unsupported-Node gate, import safety/help/version and static diagnostics.
  Actual initializer tests cover malformed/permission/ordinary synthetic failures
  and ensure canary/path suppression; invalid arguments return64. Ruling72 adds a static fallback if the shared formatter itself cannot load; a copied actual initializer with a missing synthetic CLI package proves no loader stack/path escapes.
- I3/Ruling71: read-only StoreIndex v4 complete-generation transaction, with existing
  authority inventory/database fingerprints and manifests proven before/after.
  Existing writer locks and incomplete/corrupt/stale generations refuse without
  repair or replay. Accepted v2 generation requires exact durable transport commit,
  accepted Git commit anchor, repository binding and stable database/manifest.
  Exact accepted membership selects the local overlay, then existing affected-unit
  reducer/valuation logic computes totals. No historical cap/localUnits truncation.
  Missing/untrusted generations return reporting-index-unavailable, null unproved
  queue/totals and nonzero status. Independently proven wrong-target conflict keeps
  exit2. Static capability maxima/limits remain; provider detection is not-inspected.
  Status does not discover providers. Parent-owned subprocess termination covers
  reporting and concrete CLI inspection/capability/remote doctor work. One original
  deadline is carried through repository resolution and stages. No uncancellable
  full-history fallback or repeated remote snapshot replay remains.
- M2: structured publish-result.json is written directly; npm console goes to
  stderr. Evidence records source/tag/tarball identities, candidate CI run and
  artifact identity, confirmed progress and static partial-failure state. Synthetic
  first/partial/repeat and real fake-npm subprocess tests cover the boundary; no
  publication/registry credentials were used.
- M3: healthy queued batches state that automatic retry/catch-up continue. Explicit
  oversized/unsupported/conflict/reconciliation cases retain manual-action wording.
  The hard automatic two-second budget is unchanged.
- M4: status headers, CLI/install/uninstall/quickstart, operational contract and
  ordered Ruling71 updated. Tasks1–18/task reviews complete; final scoped re-review
  remains pending. Historical f81 artifacts, Task17 timings, all70 earlier decisions,
  failed runs, warning/platform/hosted/private-image and Task16 isolation limits
  remain retained.

## Isolation and commands

Every executable test or product probe uses the original `run-isolated.py`, followed by tracked
`scripts/validation/run-isolated.mjs`, under an allowlisted environment with exact
Node24.0.0 or26.0.0 PATH/executable, canonical `/private/tmp`, fresh HOME/cache/npm/Git
configuration and empty/synthetic provider roots. No root setup/hooks, actual
provider history/credentials or `.claude/settings.local.json` were read. Existing
node_modules symlink preserved. Sequential heavy tests/maxWorkers1. Only exact four
loopback files and exact candidate registry smoke may use reviewed escalation.

Prefix `P24` / `P26` means:

```
/usr/bin/env -i PATH=/private/tmp/agent-badge-node-feasibility/node-vNN.0.0-darwin-arm64/bin:/usr/bin:/bin:/usr/sbin:/sbin TMPDIR=/private/tmp AGENT_BADGE_TEST_NODE=/private/tmp/agent-badge-node-feasibility/node-vNN.0.0-darwin-arm64/bin/node /usr/bin/python3 .superpowers/sdd/2026-10-22-repo-native-refactor/run-isolated.py node scripts/validation/run-isolated.mjs
```

`final-run-gates.py` is a scratch command recorder for standard/focused/default
partitions; its child environment is exactly that prefix, with no inherited auth.
All gate logs use `/private/tmp/agent-badge-final-*.log`.

## Retained RED, failed intermediate and focused GREEN evidence

- `red-entrypoints`: P24 vitest launcher.test.ts + initializer index.test.ts,
  maxWorkers1:16failed/16passed(32),2files. Launcher flag/exit/dry-run and initializer
  privacy failures reproduced. First green attempt:2failed/30passed; explicit
  Commander child exitOverride fixed invalid-argument process.exit1 bypass.
- `red-status`: P24 status.test.ts:4failed/4passed(8),1file. Complete-cache absence,
  corruption/staging and null unknown queue regressions reproduced.
- `red-publish`: P24 preflight.test.ts:3failed/15passed(18), missing structured evidence
  boundary. `red-wording`: P24 budget.test.ts selected productive automatic case:
  1failed/13skipped, expected automatic-retry wording missing.
- First build failed because the new initializer test imported testkit across a
  project without that reference. The test now creates its own synthetic Git
  repository. Generated untracked testkit source .js/.d.ts from that failed compiler
  emission were removed; no user source was removed. Subsequent clean builds pass.
- `focused1`:6failed/61passed(67),5files. Four doctor fixtures had never created a
  complete empty index; they now use the normal owning pendingCount operation.
  Two old replay-derived schema classifications now explicitly assert unavailable
  with null counts per Ruling71, retaining all no-rewrite/privacy assertions.
- `focused2`:71passed,6files. Includes actual subprocess read/CPU deadlines.
- `red-deadline`: removing only the parent's deadline kill produced2failed/2.
  Owned synthetic child PIDs were cleaned in test finally. Restoring the production
  kill and clean build returned passing actual-command termination checks.
- `focused24`:80passed/2failed(82),8files. Wrong-target conflict on unavailable index
  was fixed without relaxing its assertion; static capability explanations were
  restored via shared pure descriptors without provider discovery.
- `focused24-corrected`:83passed,8files,50.31s, preserving original conflict and
  capability assertions.
- Prefreeze docs check found3 generated-launcher rejections because documented
  `<candidate-version>` was passed literally. Fixed only that placeholder using the
  real declared package version; executable seam validation retained.
- `red-dryplan`: selected real launcher dry-run failed requested-vs-bootstrap version
  assertion; final launcher suite23tests passed after recording both versions.
- `last-cover24`:25passed/2failed(27),2files: synthetic inspection/capability stall
  preloads had not synchronized named builtin ESM exports, so PID markers were
  absent. Corrected test preload via syncBuiltinESMExports, no production change.
  `last-cover24-corrected`:4passed actual read/CPU/inspection/capability command
  termination tests. Each uses700ms diagnostic budget and asserts command elapsed
  <1800ms with recorded owned PID dead after return (fixture construction excluded
  from that timing assertion). Test-file total4.67s is not a command latency claim.

## Final gates and artifacts

Node24 frozen standard typecheck/build/docs/pack checks passed. Broad default run
before Ruling72:69files,744passed+1skipped(745),407.94s, log
`/private/tmp/agent-badge-final-frozen24-default.log`. Post-correction exact loopback
partition:4files50passed,44.24s,`/private/tmp/agent-badge-final-frozen24-network.log`.
Broad24+network covers73files/795tests(794passed+1skip), with the one added Ruling72
case covered in the post-fix entrypoint run, not by claiming a second broad24 run.

Ruling72 RED:`/private/tmp/agent-badge-final-red-missing-cli.log`:1failed+11skipped,
actual copied initializer emitted the synthetic module path/stack. GREEN logs:
`/private/tmp/agent-badge-final-post72-24-typecheck.log`,
`/private/tmp/agent-badge-final-post72-24-build.log`,
`/private/tmp/agent-badge-final-post72-24-entrypoints.log`:2files35passed,6.74s.
Ordered decision72 records the generic exit1 fallback cost and coverage boundary.
The registry-smoke extension retains existing Windows manual action-required
validation for setup JSON; healthy-doctor checks are POSIX-only, explicitly omitted
from Windows result checks. No actual Windows run is claimed.

Node26 standard typecheck/build/docs/pack checks passed in
`/private/tmp/agent-badge-final-frozen26-{typecheck,build,docs,pack-check}.log`.
Full26 default completed:68passed/1failed files;744passed+1failed+1skipped(746),
407.03s,`/private/tmp/agent-badge-final-frozen26-default.log`. Sole failure was the
existing normalized-import privacy regex matching the short cost canary999 inside
valid randomized coverageKey `17cf4cb833317fef607ac4b80cb6110e50f812ff888f53b35999c6ece928438c`.
The actual emitted public meters remained140/100/60/40/0, without a reported-cost
field. Ruling73 preserves raw ID/filename checks and recursively rejects actual
numeric/string999 and any providerReportedCostUsd key. Production code unchanged.
First scoped correction passed both floors (`final-import-cover24/26.log`), then
explicit structural field checking passed both floors in
`/private/tmp/agent-badge-final-import-structural24.log` (1test,1.23s) and
`/private/tmp/agent-badge-final-import-structural26.log` (1test,1.21s).
No full rerun is represented; full26 failure remains retained, closed by scoped
assertion evidence. No additional separate broad24 run is planned.
Exact loopback26:4files50passed,44.38s,
`/private/tmp/agent-badge-final-frozen26-network.log`.
Final nonduplicated scope73files/796tests with795passing cases+1opt-in skip on
each floor across the specifically disclosed broad and narrow runs. This is not
a claim that either broad suite was repeated or that broad26 had no failure.

Source was committed with hooks disabled as
`2c37a3cf164bb3d4314f1ed69d9008b2ac9c0727`; tracked tree was clean at packing.
P24 `npm run release:evidence -- /private/tmp/agent-badge-final-candidate-2c37a3c`
packed once. P24/P26 `npm run smoke:pack --` that exact directory passed; logs
`agent-badge-final-retained-pack24.log`, `agent-badge-final-retained-pack26.log`.
P24/P26 `node scripts/smoke/verify-initializer-install.mjs` with that directory and
`/private/tmp/agent-badge-task18-dependency-closure` each passed under narrowly
reviewed loopback escalation; logs `agent-badge-final-registry24.log` and
`agent-badge-final-registry26.log`. Both include actual installed core-worker proof:
v24.0.0/v26.0.0 respectively and exact matching intended executable. Fresh activation
on each floor, no inference from PATH or reused Node24 approval. Same candidate
hashes, no repack. No project uplink, external route, real publish or credential.
The old f81 directory and old candidate JSON remain untouched.

Exact install checks cover npm-init-only/transitive dependencies, installed core
workflow resource, persistent JSON setup, partial-runtime repair, both coherent
native-hook commit sets, fresh nonmutating dry-run, new standalone-fork UUID,
indexed status, owned doctor and manual sync-worker runtime. Windows manual guard
remains explicit; healthy-doctor assertion is POSIX-only and actual Windows was
not run.

Durable verification: `docs/maintainers/RELEASE-VERIFICATION.md`; exact new manifest
`docs/maintainers/evidence/2026-10-23-final-fix/candidate.json`; full failed/final logs
and SHA256 index in that evidence directory. Shared product intros now distinguish
completed local artifacts from pending scoped re-review and external gates.
P24 final `npm run docs:check` passed after evidence/docs edits, retained in
`agent-badge-final-evidence-docs.log`. Documentation/evidence commit `695fbc9a2c66f35ad09d2e5ef8e50ba96c4bd917`
preserves the candidate source binding.
No repeated100k cold benchmark or new pre-push latency claim.

## Exact new artifact identity

Prepared version2.0.0-next.0, Node24.0.0 packing, darwin/arm64; source SHA above.
Retained directory `/private/tmp/agent-badge-final-candidate-2c37a3c/`.

| Package | Bytes | SHA-512 SRI |
| --- | --- | --- |
| @legotin/agent-badge-core | 137687 | `sha512-cBf9LQ6gzQO3HUqdN9UjX5Yzkhz1+598G5sAEtpVtbhgPsvDCJH0n4N9rlpKOSXU1xjM/xLnwJcJ5M3XkCb9bg==` |
| @legotin/agent-badge | 49987 | `sha512-9c3eSy6GebF5vOqyZe79mFryzQaLWNg7s2MutKf2gSFdbNzCkgGhNM/apKnkXIQwW49nSEC3czPoLs095pjA8g==` |
| create-agent-badge | 7057 | `sha512-HJWQGP299KrX0oJJIYLV2bql3G6Fe+LXeN6+Ord9sQtGjLSJNrOBZHv2AWaOOYx5ck16kHNjvG/f1KIK2ZNnkA==` |

## Final state

Source commit `2c37a3cf164bb3d4314f1ed69d9008b2ac9c0727` and exact artifacts
complete. Final evidence-only HEAD is `695fbc9a2c66f35ad09d2e5ef8e50ba96c4bd917`.
`git status --short` returned empty after that commit. The node_modules symlink
remains intact; protected local settings remained unread. All53retained logs were
byte-length/SHA256 verified, and the historical f81 candidate manifest matches
FIX_BASE byte-for-byte. Both scoped local commits disabled hooks.

Source/docs whitespace checks passed. The unrestricted evidence diff check reports
only original test-output trailing whitespace/blank EOF lines in retained raw .txt
logs; those bytes are deliberately preserved and their digests verified, not
silently reformatted. Excluding only those raw log files, the final staged diff
check passed. No automatic approval rejection or unauthorized action occurred. Root alone dispatches the scoped review
and retains original review, this report and verdict under docs/maintainers/reviews.
No scratch or historical evidence was deleted.

## Limitations retained

Node24 SQLite ExperimentalWarning and Node26 tsx/module.register deprecation are
not globally suppressed. POSIX process groups enforce owned worker termination;
Windows manual taskkill remains best effort and Windows automatic is unsupported.
Arbitrary caller-supplied in-process IntegrationPort functions must cooperate with
cancellation; concrete CLI ports execute in the owned subprocess. Unavailable
indexes require existing owning collect/sync rebuild and can reveal underlying raw
schema/corruption later. No historical size ceiling or fabricated zero counts.

Task17 historical installed pre-push p95 382.28/443.23ms remains separate from new
artifacts;250ms goal remains UNMET under Ruling68, hard2s unchanged. Automatic
local/file publication unsupported. Actual Linux/Windows, hosted CI/OIDC/main/tag/
publisher settings, private authenticated images and live native-provider versions
remain unexecuted/unproven. Task16's two initial reviewer probes omitted isolation;
actual inventory reach is unknown, no payload/path/credential/raw provider ID was
retained, and later isolated checks do not retroactively isolate those probes.
