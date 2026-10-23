# Release preparation and exact artifact publication

Stable **2.0.0** is published on `latest`; the
[release record](releases/2.0.0/README.md) contains actual hosted and public evidence.
The original `2.0.0-next.0` preparation remains historical and was not published.
Future planning, local commits and fixture registries do not authorize publication,
tagging, pushing, hosted configuration changes or deployment. Publication requires
explicit authorization and the checks below. See the historical local
[verification scope](RELEASE-VERIFICATION.md) and current release record before making support claims.

The three public packages form one Changesets fixed group. Testkit stays private.
Apache-2.0 is the retained root license; each public tarball includes its identical
LICENSE. Every workspace uses Node `^24.0.0 || ^26.0.0`. The initializer entry point
remains `npm init agent-badge@latest`; the exact published stable version can be
selected with `npm init agent-badge@2.0.0`. An unpublished prerelease cannot be
installed from the public registry.

## Prepare once, then validate the same files

Use the lockfile-pinned Changesets **2.30.0**, not a fetched v3 CLI. Start from an
explicit major changeset. For the original prerelease preparation, run
`npm run changeset -- pre enter next`, then
`npm run changeset -- version`. Inspect actual manifests, package changelogs and
`.changeset/pre.json`: this preparation produced `2.0.0-next.0` in every public
workspace. Changesets 2.30.0 emits caret internal dependencies; deliberately tighten
CLI→core and initializer→CLI to the exact candidate version, then regenerate the
lockfile with `npm install --package-lock-only --ignore-scripts`. Review and commit.
Do not invoke either version command during a retry. Stable `2.0.0` requires separate
explicit intent, prerelease exit/version preparation and a new reviewed commit.

Use a supported Node executable on PATH for npm and every shebang/subprocess. The
portable runner supplies fresh HOME/cache/config and empty provider roots, with no
native-agent/auth/proxy/Node-injection variables. It does not alter production setup.
For example, from a clean committed checkout with dependencies installed:

```sh
node scripts/validation/run-isolated.mjs npm run typecheck
node scripts/validation/run-isolated.mjs npm run build
node scripts/validation/run-isolated.mjs npm run release:evidence -- artifacts/candidate
node scripts/validation/run-isolated.mjs node scripts/smoke/seed-dependencies.mjs artifacts/dependency-closure
node scripts/validation/run-isolated.mjs node scripts/validation/verify-clean-checkout.mjs artifacts/candidate artifacts/dependency-closure
```

Acquisition is a separate read-only step restricted to exact production dependency
URLs/SRI from the lockfile at registry.npmjs.org. The actual loopback smoke serves
only retained candidate files plus that closure; it has no uplinks, live fallback,
credentials or project-package acquisition. It executes the initializer alone via
`npm init`, with default install scripts enabled, so dependency declarations and
native/install requirements are visible. It checks repository-owned setup, runtime
repair, fresh-clone activation with both coherent native-hook commit sets, actual
manual CLI core-worker Node and workflow generation from
installed core resources. Production dependencies are JS-only (`zod`, Commander,
`@iarna/toml`); SQLite comes from the chosen Node runtime. No external native build
step is needed by this graph. Git is required. POSIX automatic-supervision/receiver
tests stay off Windows. Linux/macOS are supported; native Windows actions must
return the exact `unsupported-platform`/exit 3 result before writes. The Windows
matrix runs platform/API/launcher and isolation tests, exact package loading, and
an installed npm-init-only smoke which proves no public setup or private
activation was created. It reports no worker execution. Keep full positive setup,
runtime, worker and contributor checks on POSIX. See the
[platform amendment](../superpowers/specs/2026-10-23-release-platform-scope.md).
Actual fresh hosted results remain required before publication.

Retain the candidate directory: `candidate.json` records the exact source commit,
tag, versions, sizes and SHA-512 SRI for all three files. Pack once; `smoke:pack`
checks those bytes without rebuilding/repacking. `smoke:registry` consumes them
with the separate closure. Standard gates are typecheck, build, full tests with
`--maxWorkers=1`, docs, pack content, retained-pack checks and initializer registry
smoke on Node 24.0.0/26.0.0. The CI matrix consumes **one uploaded candidate** in
every platform/runtime cell; configuring Linux/Windows is not execution evidence.

## Publication, only after explicit authorization

`.github/workflows/release.yml` is manual-only. Supply exact SHA, existing exact
`v<version>` tag, explicit `major-prerelease` or `stable-major` intent, and successful
main CI run ID retaining that candidate. The protected `npm-release` environment
must restrict publishing to main. Every request shares one fixed noncanceling
`npm-release` queue with `queue: max`; stale queued requests fail closed.

A trusted inline workflow guard checks dispatch/main, syntax, current remote main
and the exact peeled tag **before checking out or executing the requested source**.
The publisher accepts artifacts only from the same repository's successful
`.github/workflows/ci.yml` main push at the exact SHA. ZIP membership/type/size and
manifest binding are validated before extraction; filenames and actual hashes are
validated again before use. No tag, commit, release or push is created by this job.

Before the first publish it fetches and rechecks HEAD/tag/current-main and tracked
inputs, then checks **every exact registry version**, not `latest`. An exact-version
404 means absent. Auth, HTTP, malformed responses and unknown errors stop the run.
Existing packages must match registry SHA-512, downloaded bytes, size and retained
SRI, with the intended dist-tag. A mismatch stops the entire run before any upload.
Matching packages are resumable successes; missing ones publish core→CLI→initializer
from the **retained tarballs**, then exact bytes/tags are checked again. Ambiguous
upload errors are reconciled by requery; repeat publication makes no npm writes.
Freshness is checked again after registry preflight immediately before first write.

npm can accept an upload and print a processing notice before its exact public
version is readable. The workflow then records incomplete publication rather than
claiming success. After an accepted upload, wait until that package's exact public
bytes and intended tag match before resuming the same candidate. A temporary 404
while processing does not justify blindly repeating that upload. Preserve each
attempt's evidence; do not bump, repack, overwrite, unpublish or retag as recovery.
Once every package matches, a confirmation run records all three as resumed and
makes no npm writes. The [2.0.0 record](releases/2.0.0/README.md) documents the actual
propagation and recovery, including a premature retry rejected by npm.

No workflow can prevent main advancing after that last check; serialization prevents
this workflow from racing another publisher, not unrelated main updates.

Retries select the same retained CI run ID and candidate hashes. Never bump, repack,
unpublish or retag to repair a partial publication. Artifacts expire (configured
90 days, subject to hosted policy); archive the exact files and evidence externally
through an authorized maintainer process before that. If the retained bytes are lost
or source freshness no longer holds, this workflow refuses to resume: recover the
original files and seek a separately reviewed recovery action. Rebuilding matching
versions is not an automatic recovery path. A wrong/missing dist-tag needs separately
authorized repair and cannot be called a completed release.

## Hosted prerequisites that local tests do not prove

Configure npm trusted publishing separately for **each** package: exact GitHub
owner/repository, workflow filename `release.yml` and environment `npm-release`;
repository metadata must match. Use GitHub-hosted runners, `id-token: write`, and
explicitly allow **direct** publishing (new publishers may default to staged).
The workflow pins npm **11.6.0** for direct `npm publish <tarball> --tag next`
with provenance. Do not pass legacy npm tokens or use `npm whoami` as OIDC evidence.
This npm version does **not** support standalone OIDC dist-tag repair; that requires
npm >=11.21.0 or >=12.2.0 plus separate publisher permission, deliberately reviewed
before use. Provenance availability also depends on public source-repository status.
A pack/dry-run is not proof of OIDC authorization, package ownership, main/tag
freshness on GitHub, branch protection or private authenticated image rendering.
No such hosted claims were verified during local candidate preparation.

Primary research: [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/),
[npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/),
[npm lifecycle](https://docs.npmjs.com/cli/v11/using-npm/scripts/),
[Changesets fixed groups](https://changesets.dev/guide/fixed-packages),
[Changesets prereleases](https://changesets.dev/guide/prereleases),
[GitHub concurrency/queues](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
The retained release-contract research informed these implementation decisions;
its v2 CLI output was verified locally rather than inferred from current v3 docs.

## Dependency and fixture maintenance

The weekly/manual dependency-fixtures workflow runs only synthetic fixtures,
explicit empty-root capability version reporting and a read-only production audit.
It retains redacted test/advisory/capability evidence; it does not commit upgrades,
replace fixtures from user histories, publish packages or update users' approved
runtime code. Review advisories and official adapter schema/version evidence,
propose a changeset, validate the matrix and explicitly upgrade repository pins.

Checkout/setup-node retain independently verified v6 commit pins. Artifact upload
uses Node24 [v6.0.0](https://github.com/actions/upload-artifact/releases/tag/v6.0.0),
verified at [b7c566a772e6b6bfb58ed0dc250532a479d7789f](https://github.com/actions/upload-artifact/commit/b7c566a772e6b6bfb58ed0dc250532a479d7789f)
and [its action manifest](https://raw.githubusercontent.com/actions/upload-artifact/v6.0.0/action.yml).
Pin updates are deliberate review work, including runner/runtime requirements.
