# Phase 4 Research: Publish and README Badge Integration

**Phase:** 4
**Goal:** Publish privacy-safe aggregate badge JSON and connect it to a stable README badge URL.
**Requirements:** BOOT-05, PUBL-01, PUBL-02, PUBL-03, PUBL-04
**Researched:** 2026-03-30
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BOOT-05 | Init inserts one stable badge URL into the repository README or prints a pasteable snippet when no README exists. | The repo already detects README presence during preflight, and it has an idempotent marker-based mutation pattern for git hooks; Phase 4 should reuse that style for README badge insertion so init converges instead of duplicating badge lines. |
| PUBL-01 | Init can create a public Gist automatically when GitHub auth is available. | The repo already detects auth availability in preflight, but no networked publish service exists yet. Phase 4 needs a dedicated GitHub Gist client seam plus init orchestration that creates one public gist with a deterministic badge JSON filename. |
| PUBL-02 | If automatic Gist creation fails, developer can retry, connect an existing Gist, or continue in explicit unpublished mode. | Current config/state already have `publish.gistId`, `publish.badgeUrl`, `publish.status`, and `lastPublishedHash` slots, so Phase 4 should formalize those into explicit connect/defer states instead of adding ad hoc flags. |
| PUBL-03 | `publish` writes aggregate-only Shields endpoint JSON with `schemaVersion`, `label`, `message`, `color`, and cache behavior fields. | The scan pipeline already computes attributed totals and the config already stores badge label/mode. Phase 4 needs a serializer that maps those totals to the Shields endpoint schema and guarantees only aggregate values leave the machine. |
| PUBL-04 | The README badge URL stays stable after init; later updates modify only the remote JSON. | GitHub's API response exposes revision-specific raw URLs, so Phase 4 should treat the stable badge URL as a derived repo setting built from a fixed gist target plus a fixed filename, not as the latest `raw_url` returned from each update. |

</phase_requirements>

## Planning Question

What needs to be true for Phase 4 to add public badge publishing on top of the existing scan/init foundation without leaking local evidence, duplicating README edits, or baking in the wrong publish-state contract before incremental refresh arrives in Phase 5?

## Repo Reality

- The repo has the minimum persistence seams Phase 4 needs, but not the behavior:
  - `packages/core/src/config/config-schema.ts` already stores `publish.gistId` and `publish.badgeUrl`
  - `packages/core/src/state/state-schema.ts` already stores `publish.status`, `publish.gistId`, and `lastPublishedHash`
- `packages/agent-badge/src/commands/init.ts` currently stops after preflight, scaffold, and repo-local runtime wiring. It does not yet scan, publish, or touch README content.
- `packages/agent-badge/src/commands/scan.ts` already performs full backfill plus attribution and writes scan state, so Phase 4 can reuse that pipeline as the source of badge totals instead of inventing a second aggregation path.
- There is no `publish` command, no GitHub client, no `octokit` dependency, and no module namespace for publish concerns.
- This repository currently has no README file at all, so the no-README snippet path is a real primary scenario, not a fallback afterthought.
- The config schema exposes `badge.mode: "sessions" | "tokens" | "cost"`, but the current scan/attribution pipeline only computes sessions and tokens. Phase 4 must not invent a cost model from missing data.
- There is no `04-CONTEXT.md`, so planning must derive behavior from roadmap requirements, current code, and privacy constraints directly.

## External Constraints Confirmed

- Shields endpoint badges require JSON with `schemaVersion`, `label`, `message`, and allow badge presentation fields like `color`; cache behavior is configured through the badge URL query string rather than a custom repo API. Source: Shields endpoint badge docs.
- GitHub Gist creation and updates are authenticated write operations. The create/update API accepts a `files` object with file content and a `public` flag. Source: GitHub REST Gists docs.
- Inference from the GitHub Gist API example: the returned `raw_url` includes a revision component, so the implementation should not treat the latest API `raw_url` as the stable README badge URL.

## Phase Boundary

### In Scope

- One publish module stack for Gist target management, Shields JSON serialization, badge URL derivation, and README badge insertion.
- A first `publish` command and shared core services it can call.
- Init-time orchestration that creates or connects the publish target when possible, then inserts a stable README badge or emits a snippet when no README exists.
- Explicit degraded paths for no auth, create failure, or manual gist connection.
- Tests that prove aggregate-only publishing and idempotent README behavior.

### Explicitly Out of Scope

- Incremental scan cursors, diff-based publish skipping, and pre-push refresh optimization. Those belong to Phase 5.
- `status`, `config`, `doctor`, or `uninstall` UX. Those belong to later phases.
- Any attempt to publish transcript text, cwd values, filenames, or raw provider session objects.
- A speculative cost badge implementation without real provider-side cost inputs.
- Secret/private gist support for v1. The product requirement is a public Gist.

## Recommended Delivery Shape

Keep the roadmap's three-plan split and run it in three waves so init target setup, first publish, and README mutation land in one clear dependency order.

### 04-01: Gist create/connect flows and publish-state bookkeeping

Own the publish target and state contract first.

- Add a new core publish namespace under `packages/core/src/publish/`.
- Introduce a GitHub client seam that can:
  - create one public gist
  - update an existing gist file
  - fetch enough gist metadata to validate a manually connected gist
- Use one deterministic filename for the published payload, for example `agent-badge.json`, so badge URL generation and README insertion do not depend on revision-specific API output.
- Define the source-of-truth contract clearly:
  - `config.publish.gistId` and `config.publish.badgeUrl` are the repo's configured connection details
  - `state.publish.status` and `state.publish.lastPublishedHash` are runtime state
  - `state.publish.gistId` should either mirror the configured gist or be removed from the hot path; do not let config and state drift silently
- Extend init so it can choose among three outcomes:
  - auto-created gist
  - connected existing gist
  - explicit unpublished/deferred mode with next-step messaging

**Why first:** every later publish or README behavior depends on one stable gist target and a non-conflicting persistence contract.

### 04-02: Shields endpoint JSON serialization and publish command

Own the remote payload and first publish path.

- Add a serializer that converts attributed totals into a Shields endpoint JSON document with exact aggregate-only fields:
  - `schemaVersion: 1`
  - `label` from `config.badge.label`
  - `message` derived from `badge.mode`
  - `color` from deterministic thresholds or one fixed initial color rule
- Build a `runPublishCommand()` flow in `packages/agent-badge/src/commands/publish.ts` and register `publish` in `packages/agent-badge/src/cli/main.ts`.
- Reuse the existing full scan plus attribution services as the only input to publishing.
- Record a content hash in `state.publish.lastPublishedHash`, but do not implement skip-on-no-change yet. That is Phase 5.
- Handle unsupported `badge.mode === "cost"` explicitly:
  - either fail fast with a clear operator message
  - or publish an explicit unavailable badge state
  - but do not fabricate cost numbers

**Why second:** PUBL-03 needs a real publishable payload and command surface before README integration should point at it.

### 04-03: Stable README badge insertion and degraded init paths

Own the user-visible repo mutation.

- Add a README badge insertion helper under the publish namespace or a small `init/` helper module.
- Reuse the repo's existing idempotency style from managed git hooks:
  - insert one managed marker block or one exactly matched badge line
  - update/reuse it on re-run
  - never append duplicates
- When README exists:
  - insert a markdown badge that points to the stable Shields endpoint URL
- When README does not exist:
  - print one pasteable snippet using the same stable badge URL
  - do not create a new README silently unless product direction changes later
- Update `runInitCommand()` so Phase 4 onboarding becomes:
  - preflight
  - scaffold
  - runtime wiring
  - publish target setup
  - first scan/publish when a gist is available
  - README badge insert or snippet output
- Keep degraded behavior explicit:
  - if gist setup fails or auth is missing, init should finish with clear next steps and without inserting a broken badge URL

**Why third:** BOOT-05 and PUBL-04 are the final user-facing phase outcome and should sit on top of a stable publish target and serializer.

## Design Guidance

### Publish module shape

Recommended modules:

- `packages/core/src/publish/github-gist-client.ts` — tiny transport boundary around create/get/update gist calls
- `packages/core/src/publish/badge-payload.ts` — Shields endpoint payload builder
- `packages/core/src/publish/badge-url.ts` — stable Shields URL and raw-json endpoint derivation
- `packages/core/src/publish/readme-badge.ts` — idempotent README mutation/snippet generation
- `packages/core/src/publish/publish-state.ts` — helpers that reconcile config/state updates after connect or publish
- `packages/core/src/publish/index.ts` — public exports

This keeps Phase 4 concerns out of the scan and init namespaces while still letting init call them.

### Stable badge URL rules

- Treat the stable README badge URL as a derived artifact that must not change after first insertion.
- Do not persist the latest revision-specific `raw_url` from the Gist API as the badge URL.
- Fix both:
  - the gist target
  - the published filename
- Then derive one Shields endpoint URL from those fixed inputs and store it in config.

### Privacy rules

Only these values should leave the machine in Phase 4:

- aggregate session count
- aggregate token count
- selected badge label/mode presentation
- publish metadata needed to update the same gist target

These must stay local:

- transcript contents
- session evidence arrays
- cwd values and realpaths
- filenames from local provider artifacts
- ambiguous-session review details

### Idempotency rules

- Re-running init with an already connected gist must reuse it rather than create a new gist.
- Re-running publish must overwrite the deterministic gist file, not create new filenames.
- Re-running init or publish must reuse the same README badge block if present.
- Missing README is not an error path; it is a valid snippet-output path.

### Open technical risk to plan around

The existing schema duplicates gist identity across config and state. Phase 4 should either:

- keep both fields but define clear precedence and atomic update helpers, or
- reduce one of them to derived/runtime-only use inside the implementation

If this is left ambiguous, the first re-run and reconnect bugs will appear immediately.

## Validation Architecture

Phase 4 should remain heavily automatable with stubbed GitHub client responses and temporary repos. No live network calls should appear in tests.

### Required automated coverage

- Publish target tests:
  - auto-creates a public gist when auth is available
  - reuses an existing configured gist without creating another
  - records deferred/unpublished state when auth is unavailable or creation fails
- Payload tests:
  - serializer emits `schemaVersion`, `label`, `message`, and `color`
  - serialized payload contains aggregate values only
  - `cost` mode fails or degrades explicitly instead of inventing a value
- Publish command tests:
  - `publish` command is registered
  - command reuses scan/attribution results instead of a second aggregation path
  - successful publish stores `lastPublishedHash`
- README/init tests:
  - inserts one badge block into an existing README
  - does not duplicate the badge on re-run
  - prints a pasteable snippet when README is missing
  - does not insert a broken badge when gist connection is unavailable

### Recommended commands

- Quick targeted runs:
  - `npm test -- --run packages/core/src/publish`
  - `npm test -- --run packages/agent-badge/src/commands/publish.test.ts`
  - `npm test -- --run packages/agent-badge/src/commands/init.test.ts`
- Full validation run:
  - `npm test -- --run`

### Suggested validation split by plan

- 04-01:
  - unit/integration tests for gist client seam, connect/defer bookkeeping, and config/state reconciliation
- 04-02:
  - unit tests for Shields payload building plus command tests for publish success/failure flows
- 04-03:
  - integration tests for README mutation, no-README snippet output, and init re-run idempotency

## Sources

- https://shields.io/badges/endpoint-badge
- https://docs.github.com/en/rest/gists/gists
- https://docs.github.com/articles/creating-gists
