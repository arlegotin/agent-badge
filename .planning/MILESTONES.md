# Milestones

## v2.0 Global Runtime and Minimal Repo Footprint (Shipped: 2026-04-09)

**Phases completed:** 3 phases, 7 plans, 14 tasks

**Key accomplishments:**

- Shared PATH-based runtime probing, direct managed hook wiring, and migration-safe doctor checks for the global `agent-badge` contract
- Shared-runtime reporting in operator commands with direct-hook compatibility proof across uninstall, release-readiness, and registry smoke checks
- Pure initializer delegation plus minimal init-time scaffold reconciliation that keeps fresh repos package-json-free while pruning legacy managed runtime entries
- Config-driven hook rewrites, legacy rerun cleanup, and readiness proof now all enforce the package-json-free minimal-artifact contract
- Legacy migration, uninstall, status, doctor, publish, and refresh behavior already satisfied the planned contract, so this plan closed with verification evidence instead of new implementation changes
- Primary and secondary user docs now describe the global-first shared-runtime contract, while the docs verifier blocks the old repo-local install story from slipping back in
- Registry smoke now proves the initializer’s minimal-artifact contract, while packed-install and clean-checkout flows are documented as the explicit direct-runtime proof path

---

## v1.5 Production Readiness Closure (Shipped: 2026-04-05)

**Phases completed:** 4 phases, 8 plans

**Key accomplishments:**

- Preserved the external release blocker inventory as explicit repo-owned requirements and diagnostics instead of tribal knowledge.
- Captured the successful canonical GitHub Actions trusted publish for the shipped `1.1.3` source across all three packages.
- Verified the live registry surface from a clean temp install path, including `npm init agent-badge@latest`.
- Closed the milestone with one explicit production-ready go or no-go standard, evidence map, and aligned planning artifacts.

---

## v1.4 Publish Reliability Hardening (Shipped: 2026-04-05)

**Phases completed:** 7 phases, 18 plans, 35 tasks

**Key accomplishments:**

- Introduced merge-safe shared contributor publishing with repo-level shared overrides and privacy-safe remote state.
- Made shared totals deterministic by deduplicating stable session observations across publish, refresh, and init.
- Shipped migration and shared-health operator flows so legacy repos can move to shared mode with visible diagnostics.
- Made badge trust, publish readiness, and pre-push policy failures explicit across the normal CLI surfaces operators already use.
- Added supported recovery flows and a repo-owned proof harness for returning degraded repos to healthy shared publish mode.
- Closed the remaining verification and validation debt, ending v1.4 with a passed milestone audit and complete closeout artifacts.

---
