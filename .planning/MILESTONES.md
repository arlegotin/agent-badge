# Milestones

## v1.4 Publish Reliability Hardening (Shipped: 2026-04-05)

**Phases completed:** 7 phases, 18 plans, 35 tasks

**Key accomplishments:**

- Per-publisher shared gist records, opaque shared override digests, and pure merge helpers for deterministic Phase 14 remote state
- Shared contributor-file publishing now drives badge regeneration, persisted publisher identity, and CLI state output
- Phase 14 now proves shared aggregation behavior directly and locks the public privacy contract into docs verification
- Schema-version-2 shared observation records, canonical duplicate-session reducers, and cache-backed publish observations for shared publish
- Shared publish-service, publish, refresh, and init now converge on one observation-map contract with deterministic duplicate-session outcomes
- Typed shared-health inspection with explicit legacy-to-shared migration results surfaced through init, publish, and refresh
- Shared-health-aware status and doctor output with migration-safe operator docs and enforced shared observation terminology
- Core publish-trust derivation plus refresh and status trust lines that expose stale failed publishes, unchanged badge writes, and not-attempted badge state
- Additive publish-attempt state fields, candidate-hash publish metadata, and failure-safe command persistence for changed, unchanged, failed, and not-attempted badge outcomes
- Canonical live-badge trust derivation plus doctor diagnostics that distinguish stale failed publishes from failed-but-unchanged badge state
- Canonical publish readiness, additive failure-code expansion, and post-write gist verification across init, doctor, publish, and refresh
- Explicit pre-push policy wiring with loud fail-soft versus strict hook behavior across refresh, status, config, and doctor
- Sequence-aware shared publish assertions now lock the badge, contributor, and overrides write order and keep the 50/100/30 token regressions green
- Auth-related publish failures now surface canonical `auth missing` readiness output, and normal refresh failures print the same degraded readiness/trust summary as hook mode
- Canonical recovery routing for publish failures plus healthy-after confirmation in `status`, `doctor`, `refresh`, and `init`
- Canonical recovery documentation plus a repo-owned proof harness that captured the current supported live recovery path back to healthy shared mode
- Backfilled formal Phase 15 and Phase 19 verification reports, refreshed the stale Phase 19 recovery proof, and reattached CTRL-02 plus CTRL-03 to milestone verification
- Closed the stale Phase 15 and 17 Nyquist artifacts with fresh green reruns, then regenerated a passed v1.4 milestone audit from the repaired verification set

---
