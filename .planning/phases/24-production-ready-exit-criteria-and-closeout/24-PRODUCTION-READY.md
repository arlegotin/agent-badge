## Standard

A production-ready claim for this repo requires all four of these conditions for the shipped surface being claimed:

1. One successful canonical trusted-publish run.
2. One passed exact-version post-publish registry smoke.
3. One passed `npm init agent-badge@latest` resolution record.
4. Root operator docs aligned to the shipped version.

This standard applies to the shipped `1.1.3` release surface proven by the v1.5 milestone evidence, not to an earlier blocked maintainer-machine snapshot.

## Required evidence

- `22-PUBLISH-EVIDENCE.json` proves the canonical GitHub Actions trusted-publishing path released `1.1.3` successfully for all three publishable packages.
- `23-REGISTRY-SMOKE.json` proves the exact released `1.1.3` registry artifacts passed the saved post-publish smoke check.
- `23-LATEST-RESOLUTION.md` proves `npm init agent-badge@latest` resolved to and passed against the released `1.1.3` initializer surface.
- `23-VERSION-ALIGNMENT.md` proves the repo manifests, lockfile, and public registry state all align to the shipped `1.1.3` version.
- `23-VERIFICATION.md` proves the post-publish registry verification phase closed with passed requirement coverage for the released surface.
- `docs/RELEASE.md` proves the maintained root operator runbook is aligned to the shipped version and Phase 23 verification contract.

## Go/No-Go rule

The verdict is `go` only when all required evidence exists and none of the required artifacts records a blocked or failed outcome.

## Current decision boundary

Historical machine-specific publish blockers do not override later shipped-release proof unless they still apply to the exact released `1.1.3` surface. That means Phase 21 findings such as the stale `1.1.2` version-drift snapshot remain part of the history, but they do not control the current production-ready verdict once later Phase 22 and Phase 23 evidence proves the shipped `1.1.3` publish and registry surface.

## Verdict

Verdict pending evidence map.
