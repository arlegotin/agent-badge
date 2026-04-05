# Milestones

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
