# Feature Research

**Domain:** Local-first AI usage badge CLI for GitHub repositories
**Researched:** 2026-03-29
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| One-command initialization | The product promise is "install and badge my repo now", not a manual checklist. | MEDIUM | Must detect git, README, provider paths, auth, and package environment automatically. |
| Historical backfill on first run | Existing repos need immediate credit for prior AI usage or the badge feels untrustworthy. | HIGH | Requires full scan plus conservative attribution. |
| Cross-provider scanning | The product explicitly targets Codex and Claude sources. | HIGH | Provider adapters can differ internally but must emit one normalized session model. |
| Stable README badge URL | Dynamic badges are expected to update remotely without repeated README edits. | MEDIUM | Insert once, then update Gist JSON only. |
| Manual recovery path | Users need `refresh`, `status`, and `doctor` when local state drifts. | MEDIUM | Recovery UX matters as much as the happy path. |
| Failure-soft automatic refresh | Developers will reject a badge tool that slows or blocks normal pushes. | MEDIUM | `pre-push` should be fast, incremental, and non-blocking by default. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Conservative repo attribution | Makes totals believable instead of inflated by loose heuristics. | HIGH | Prefer false negatives over false positives. |
| Ambiguity review with persisted overrides | Gives users control over edge cases without turning setup into manual bookkeeping. | MEDIUM | State should record only the decisions, not raw session copies. |
| Repo-local runtime install | Keeps hooks and scripts reproducible across machines and collaborators. | MEDIUM | Avoids global install drift. |
| Aggregate-only publishing | Strong privacy story is part of the product, not just implementation detail. | LOW | The publish payload should contain badge fields only. |
| Idempotent re-init and uninstall | Makes the tool safe to adopt in active repositories. | MEDIUM | Avoid duplicate hooks, badges, or Gists. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Upload raw transcripts for perfect attribution | Feels like the easiest way to improve accuracy | Violates the privacy model and creates an unnecessary trust cliff | Keep raw data local and let users approve ambiguous sessions explicitly |
| Server-side collector or dashboard backend | Feels more scalable and shareable | Adds infra, auth, and privacy burden that v1 does not need | Publish aggregate badge JSON to Gist and keep everything else local |
| Blocking pushes when refresh fails | Feels like it guarantees freshness | Turns the badge into a workflow tax and will be bypassed immediately | Make the hook failure-soft by default and surface health via `doctor` |
| Rewriting README on every refresh | Feels like a simple update strategy | Causes noisy diffs and breaks the dynamic badge model | Insert one stable badge URL once and update remote JSON only |

## Feature Dependencies

```text
Repo fingerprinting
    -> historical attribution
        -> aggregate totals
            -> Gist publish
                -> stable README badge

Provider adapters
    -> normalized session model
        -> incremental checkpoints
            -> fast refresh

Ambiguity review
    -> override persistence
        -> trustworthy totals on re-scan
```

### Dependency Notes

- **Historical attribution requires repo fingerprinting:** backfill is only credible if sessions can be matched to a stable repo identity.
- **Publishing requires aggregate totals:** Gist JSON should never know about raw transcripts or session internals.
- **Fast refresh requires checkpoints:** without incremental boundaries, the hook path becomes too slow for normal pushes.
- **Ambiguity review requires override persistence:** once a user resolves an edge case, future scans must stay consistent.

## MVP Definition

### Launch With (v1)

- [ ] One-command initializer for existing and new repositories - core onboarding promise
- [ ] Full historical backfill for detected providers - badge must be useful immediately
- [ ] Conservative repo attribution with ambiguity review - credibility is the product
- [ ] Public Gist publish plus stable Shields endpoint badge - enables remote rendering without a backend
- [ ] Manual `scan`, `publish`, `refresh`, `status`, and `doctor` flows - required recovery surface
- [ ] Lightweight failure-soft `pre-push` refresh - keeps the badge current with low friction
- [ ] Aggregate-only privacy model - required for trust

### Add After Validation (v1.x)

- [ ] Provider-specific badge modes - add once core combined mode is solid
- [ ] Time-windowed views such as last 30 days - add once incremental history and caching are proven
- [ ] More guided "connect existing Gist" recovery UX - add after the base degraded path works well

### Future Consideration (v2+)

- [ ] Optional Codex hook-based freshness path - useful once the core scanner is stable
- [ ] Optional Claude live metrics ingestion - useful once historical parsing is reliable
- [ ] Shared multi-maintainer badge ownership - defer until the single-maintainer workflow is strong
- [ ] Rich history charts or dashboards - not needed to validate the core badge value

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| One-command init | HIGH | MEDIUM | P1 |
| Historical backfill | HIGH | HIGH | P1 |
| Conservative attribution | HIGH | HIGH | P1 |
| Public Gist publish | HIGH | MEDIUM | P1 |
| Stable README badge | HIGH | MEDIUM | P1 |
| Fast failure-soft refresh | HIGH | MEDIUM | P1 |
| Ambiguity review | MEDIUM | MEDIUM | P1 |
| Provider-specific badge modes | MEDIUM | MEDIUM | P2 |
| Time-windowed badge modes | MEDIUM | MEDIUM | P2 |
| Shared badge ownership | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have after launch validation
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Static badges | Hosted dashboards | Our Approach |
|---------|---------------|-------------------|--------------|
| Dynamic README badge | Manual updates or committed artifacts | Usually supported through hosted APIs | Stable Shields endpoint backed by public Gist JSON |
| Historical usage backfill | Usually absent | Sometimes available only after signup and server ingestion | Local machine scan on first install |
| Privacy model | Depends on repo commits | Usually requires sending raw or detailed telemetry off-machine | Keep raw data local, publish aggregates only |
| Git integration | Rarely first-class | Often decoupled from local git workflows | Built around git root, repo fingerprint, and `pre-push` refresh |

## Sources

- https://docs.npmjs.com/creating-a-package-json-file/ - initializer expectations
- https://docs.github.com/en/rest/gists - public Gist create/update capabilities
- https://shields.io/badges/endpoint-badge - endpoint badge JSON model
- https://developers.openai.com/codex/cli/features/ - Codex local transcript/session storage direction
- https://developers.openai.com/codex/hooks - hook constraints and optional future path
- https://code.claude.com/docs/en/statusline - Claude session metadata and cumulative totals shape

---
*Feature research for: local-first AI usage badge CLI*
*Researched: 2026-03-29*
