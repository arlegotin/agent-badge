## Local release gates

The current source tree already has strong local release proof from the maintained repo entrypoints:

- `npm run typecheck` passed during milestone kickoff.
- `npm test -- --run` passed during milestone kickoff.
- `npm run docs:check` passed during milestone kickoff.
- `npm run verify:clean-checkout` passed during milestone kickoff, including rebuild, pack validation, and packed-install smoke.
- `npm --silent run release:preflight -- --json` preserved a current machine-readable live preflight artifact at `.planning/phases/21-external-release-blocker-audit-and-gate-repair/21-preflight.json`.

These local gates mean the checkout is locally green. They do not prove that the repo is externally ready to publish.

## Live external blockers

The captured preflight artifact reports `overallStatus: "blocked"` for the current source tree.

- `npm auth`: blocked. `npm whoami` failed, so the current maintainer environment cannot prove an authenticated npm publisher identity.
- `version drift`: visible on all three publishable packages. The checked-in manifests are still `1.1.2`, while npm currently shows `1.1.3` for `@legotin/agent-badge-core`, `@legotin/agent-badge`, and `create-agent-badge`.
- `package ownership`: not auto-proved by the current preflight contract. Because the packages already exist remotely and the current maintainer environment cannot confirm publish readiness, ownership remains an explicit follow-up confirmation.
- `trusted publisher`: the local workflow contract check is green, but that only proves `.github/workflows/release.yml` still carries the expected OIDC markers. It does not prove the npm packages currently trust the `arlegotin/agent-badge` repository and `release.yml` workflow.

This means the repo is locally green but externally blocked for a production-readiness claim.

## Manual confirmations still required

- `package ownership`: still manual. Confirm that the intended npm publisher owns `@legotin/agent-badge-core`, `@legotin/agent-badge`, and `create-agent-badge`.
- `trusted publisher`: still manual. Confirm that each package trusts the `arlegotin/agent-badge` GitHub repository and the production workflow file `release.yml`.
- `npm auth`: currently blocked in this maintainer environment until `npm whoami` succeeds again.
- `version drift`: confirmed blocker, not manual. The registry is ahead of the checked-in manifests and must be treated as explicit release-state drift.

No remote confirmation was recorded in this phase artifact beyond what the local preflight could prove safely.

## Repo-owned follow-up work

Plan `21-02` is the required repair step for this gap. It must make the blocker categories first-class in the repo-owned release contract by:

- extending `scripts/release/preflight.ts` with explicit blocker taxonomy for npm auth, version drift, same-version conflicts, package ownership, and trusted-publisher state
- locking that behavior in `scripts/release/preflight.test.ts`
- updating `docs/RELEASE.md` so maintainers can distinguish a locally green checkout from an externally blocked release state
- aligning `.planning/STATE.md` with the same blocker vocabulary
