# Phase 21: User Setup Required

**Generated:** 2026-04-05
**Phase:** 21-external-release-blocker-audit-and-gate-repair
**Status:** Incomplete

Complete these items to finish the external release-readiness audit and prove the remaining manual confirmations.

## Environment Variables

None. This phase does not require adding new repo-local environment variables.

## Account Setup

- [ ] **Use a maintainer npm account with publish visibility**
  - URL: https://www.npmjs.com/
  - Skip if: `npm ping` and `npm whoami` already succeed from the intended maintainer environment

## Dashboard Configuration

- [ ] **Confirm npm package ownership**
  - Location: npm package pages for `@legotin/agent-badge-core`, `@legotin/agent-badge`, and `create-agent-badge`
  - Verify: the intended publisher account has owner/publisher access to all three packages
  - Notes: record the confirmation outcome in the phase artifacts before treating the repo as externally ready

- [ ] **Confirm trusted publisher wiring**
  - Location: npm package settings for each published package
  - Verify: the trusted publisher points at the `arlegotin/agent-badge` repository and the production workflow file `release.yml`
  - Notes: local preflight validates only the checked-in workflow markers; it cannot auto-prove the remote trusted-publisher mapping

## Verification

After completing the manual setup and confirmations, verify with:

```bash
npm ping
npm whoami
npm --silent run release:preflight -- --json
```

Expected results:

- `npm ping` succeeds.
- `npm whoami` returns the intended maintainer identity.
- The preflight output is explicit about remaining blocker categories and no longer hides ownership or trusted-publisher state behind generic warnings.

---

**Once all items complete:** Mark status as "Complete" at top of file.
