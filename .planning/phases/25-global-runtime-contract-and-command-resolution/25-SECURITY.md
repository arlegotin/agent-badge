---
phase: 25
slug: global-runtime-contract-and-command-resolution
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-08
---

# Phase 25 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| config/state -> hook writer | Persisted repo settings shape generated shell hook content. | Pre-push mode, repo-local config values, generated hook text |
| machine PATH -> runtime probe | Local environment determines whether the shared `agent-badge` executable resolves. | PATH visibility, CLI availability, version output |
| existing hook content -> diagnostics | Doctor reads potentially stale or manually edited hook content. | Shell script text, hook markers, guard/refresh command strings |
| core runtime probe -> command output | Low-level runtime availability is surfaced to operators. | Remediation text, runtime status, CLI-ready/not-ready messaging |
| legacy repo artifacts -> compatibility tests | Existing repos may still carry old managed hook bodies or package-script wiring. | Legacy hook markers, direct hook contract assertions, cleanup semantics |
| smoke assertions -> persisted evidence | Smoke scripts encode the contract that later release verification relies on. | Hook file contents, failure messages, compatibility expectations |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-25-01-01 | Tampering | `packages/core/src/init/runtime-wiring.ts` | mitigate | Closed by [runtime-wiring.ts](/Volumes/git/legotin/agent-badge/packages/core/src/init/runtime-wiring.ts), which builds hook content from fixed templates, derives the exit code only from typed `refresh.prePush.mode`, and emits the direct shared command via `getPrePushRefreshCommand()` rather than interpolating arbitrary runner strings or absolute executable paths. | closed |
| T-25-01-02 | Information disclosure | `packages/core/src/runtime/shared-cli.ts` | mitigate | Closed by [shared-cli.ts](/Volumes/git/legotin/agent-badge/packages/core/src/runtime/shared-cli.ts), which limits remediation to generic install commands and PATH guidance (`npm install -g`, `pnpm add -g`, `bun add -g`) and does not emit resolved home-directory or `node_modules/.bin` paths. | closed |
| T-25-01-03 | Denial of service / incorrect health classification | `packages/core/src/diagnostics/doctor.ts` | mitigate | Closed by [doctor.ts](/Volumes/git/legotin/agent-badge/packages/core/src/diagnostics/doctor.ts) and [doctor.test.ts](/Volumes/git/legotin/agent-badge/packages/core/src/diagnostics/doctor.test.ts), which fail malformed marker counts, accept only known direct or legacy refresh wiring, and warn when the shared-runtime guard is missing or its exit semantics do not match configuration. | closed |
| T-25-02-01 | Information disclosure | `packages/agent-badge/src/commands/init.ts`, `config.ts`, `status.ts` | mitigate | Closed by [init.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/init.ts), [config.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/config.ts), and [status.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/status.ts), all of which reuse `buildSharedRuntimeRemediation()` and keep operator messaging generic. Init also no longer overstates readiness when the shared runtime is missing or broken. | closed |
| T-25-02-02 | Tampering / regression drift | `packages/agent-badge/src/commands/uninstall.test.ts`, `packages/agent-badge/src/commands/release-readiness-matrix.test.ts` | mitigate | Closed by [release-readiness-matrix.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/release-readiness-matrix.test.ts), which asserts the shared hook guard and direct refresh command across npm/pnpm/Yarn/Bun while rejecting legacy runner strings, and by [uninstall.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/uninstall.test.ts), which verifies both direct and legacy managed hooks are removable without harming custom lines. | closed |
| T-25-02-03 | Denial of service / artifact-contract drift | `scripts/smoke/verify-registry-install.sh` | mitigate | Closed by [verify-registry-install.sh](/Volumes/git/legotin/agent-badge/scripts/smoke/verify-registry-install.sh), which asserts the generated hook contains the shared PATH guard and direct refresh command, rejects the legacy npm wrapper in both runtime and initializer flows, and still preserves the Phase 25 repo-local compatibility boundary checked by [index.test.ts](/Volumes/git/legotin/agent-badge/packages/create-agent-badge/src/index.test.ts). | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

No accepted risks.

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-08 | 6 | 6 | 0 | Codex / `gsd-secure-phase` |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-08
