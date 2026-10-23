# Agent Badge 2.0.1 release record

Published on 2026-10-23 under explicit user authorization. All three public
packages are **2.0.1** on `latest`. This patch restores the original gold
`#E8A515`, uses plain token/dollar values, adds six colorful examples, and makes
generated badges link to their repository homepage.

## Source and validation

- Source/tag: `d821dd4bb529e0e8f02cacc0b44fd31e19c058a5` / `v2.0.1`.
- Required [main-push CI39952632318](https://github.com/arlegotin/agent-badge/actions/runs/39952632318)
  passed all six cells using one retained candidate, artifact `12501400939`.
  Original ZIP SHA-256:
  `2a6d120832fec675a594d6c074533f4ae607fa0c6f719e021b32f229d0b8bf15`.
- [Candidate manifest](candidate.json) records exact filenames, sizes and SHA-512
  SRI. [Validation summary](validation-summary.json) binds all six retained logs.
- Linux/macOS on Node 24/26 each passed 76 files, 861 tests and one existing opt-in
  namespace skip, plus retained-pack and installed npm-init/setup/repair/fork/worker
  checks. Windows on both runtimes passed 41 platform tests and actual initializer
  exit 3/no-public-or-private-write checks; it does not claim durable native support.
- [Independent combined review](presentation-review.md): compliant, quality
  approved, ready to merge; 0 Critical, 0 Important, 1 Minor. The Minor is existing
  Node SQLite experimental warning noise, retained explicitly in the logs.

Local isolated Node 24 passed the full suite; Node 26 passed 102 covering tests.
The first sandboxed local full run had eight loopback-denial failures. The same
isolated command passed with loopback permitted, without source/deadline changes.
The prior main's macOS/Node 26 supervision timing failure is retained separately;
the fresh exact-main matrix passed without changing that assertion. Source tests
used synthetic histories and an independent temporary Git repository; no real
private activation or provider history was copied into validation evidence.

## Publication and public verification

[Release workflow39953986570](https://github.com/arlegotin/agent-badge/actions/runs/39953986570)
used the same source, tag and exact retained candidate throughout:

1. Attempt 1 accepted core with provenance, then stopped while npm processed it.
2. Only after core's public bytes and `latest` matched, attempt 2 skipped it and
   accepted CLI, then stopped on the same processing delay.
3. Only after both accepted packages matched publicly, attempt 3 skipped them and
   accepted the initializer, then stopped on its processing delay.
4. After all three exact public downloads/tags matched, attempt 4 recorded
   `[resumed, resumed, resumed]` and completed with zero npm writes.

All accepted uploads occurred once. No local npm publication, credential change,
duplicate upload, bump, repack, overwrite, unpublish or retag was used for recovery.
See [publication result](publish-result.json),
[registry verification](public-registry-verification.json),
[provenance identity verification](public-provenance-verification.json) and
[public initializer/signature verification](public-initializer-verification.json).
The initializer check used a fresh project, empty homes/provider roots and actual
public npm acquisition/help. It verified six registry signatures and four
attestations, with no setup writes; full setup behavior is established separately
by the retained-candidate matrix.

The [GitHub release assets](https://github.com/arlegotin/agent-badge/releases/tag/v2.0.1)
retain original tarballs and validation evidence beyond Actions artifact retention.
[Asset inventory](release-evidence.json) and
[upload verification](github-release-verification.json) record all twelve files;
every server-reported size and SHA-256 matches its retained original.

## Actual repository upgrade

The verified published initializer upgraded this repo to 2.0.1 before a normal
revision-checked configure promoted accepted metadata to presentation version 2.
[Live upgrade verification](live-upgrade-verification.json) records:

- All 966 previously accepted record blobs survived the upgrade. Authorized
  collection added current work, bringing the ledger to 1,949 records.
- Presentation promotion preserved all 1,949 records byte-for-byte, the catalog,
  numeric totals and coverage. Metadata binding correctly changed `inputSetHash`.
- The public badge reads `187M tokens` in gold and links to the repository
  homepage. [Public image/README/gallery checks](live-public-verification.json)
  verified the exact accepted SVG blob and all six illustrative assets over HTTP.
- Status reported zero queued records; doctor passed all seven required checks.
  Coverage remains partial with reconciliation pending, and native project trust
  remains user-reviewed. No native trust grants or shell/NVM defaults changed.

The first one-off public checker incorrectly expected `187.4M` above 100M; the
unchanged compact formatter uses `187M`. Correcting that expectation passed against
the exact accepted SVG. No product code or usage data changed for the checker.

Unmarked 2.0.0 trees retain their original exact presentation until explicitly
promoted. Accounting fields and strict validation remain intact. Other support
limits remain in [release status](../../RELEASE-STATUS.md). The
[three patch decisions](rulings.md) retain their rationale and costs.
