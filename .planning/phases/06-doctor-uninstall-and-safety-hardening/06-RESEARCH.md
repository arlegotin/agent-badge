# Phase 6: Doctor, Uninstall, and Safety Hardening - Research

**Researched:** 2026-03-30
**Domain:** CLI diagnostics, de-install safety, and privacy-preserving observability hardening
**Confidence:** HIGH for code-level facts, MEDIUM for external runtime assumptions

## Summary

Phase 6 is primarily an operational hardening layer on top of existing infrastructure: introduce `doctor` and `uninstall`, then add aggregate-only logging with rotation. The current architecture already provides strong building blocks: schema-validated config/state, idempotent scaffolding, marker-based runtime mutation, and fail-soft refresh behavior. The current gap is not foundational; it is surface coverage and cleanup/re-entry safety.

**Primary recommendation:** keep all phase-6 behaviors compositional with current core services (`runInitPreflight`, `runIncrementalRefresh`, runtime wiring helpers, publish target logic), and implement `doctor`/`uninstall` as additive commands with strict, side-effect-safe defaults.

<user_constraints>

## User Constraints (from CONTEXT)

### Locked Decisions
- No `.planning/*-CONTEXT.md` is present for this phase.

### Claude's Discretion
- Standard domain-level decisions may follow repo stack, architecture, and tests.

### Deferred Ideas (OUT OF SCOPE)
- None identified for this phase.

### AGENTS.md Constraints (authoritative project instructions)
- Local-first and serverless: scanning/publish source data remains local.
- Privacy by default: aggregate-only publishing and no raw prompt/path/file leakage.
- Initializer-first npm flow and fast re-entry setup.
- Public Gist + Shields endpoint for badge publishing.
- Failure-soft default for refresh automation.
- Init must be idempotent (no badge/hook/gist duplication).

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OPER-05 | `uninstall` removes local integration cleanly without deleting remote/published badge data unless explicitly requested. | Existing marker-based install/update logic in runtime wiring supports safe inverse operations for script/hook/gitignore/reinit boundaries. |
| SAFE-01 | Published data and logs must never contain raw transcripts, prompt text, filenames, or local paths. | Config/state schemas contain aggregate-only fields; publish payload builder has only schemaVersion/label/message/color; privacy.aggregateOnly is constant `true` enforced by schema and CLI. |
| SAFE-02 | Logs must contain scan/publish summaries only and rotate under `.agent-badge/logs/`. | `.agent-badge/logs/` is already scaffolded/ignored and log schema exists, but there is no writer/rotator yet. |
| SAFE-03 | `doctor` verifies git root, provider paths, scan access, Gist auth/write, Shields endpoint, README badge, and hook installation with actionable fixes. | `runInitPreflight` already collects git/readme/pkg-manager/provider auth/availability. Remaining checks can use existing publish-target and readme/badge APIs plus managed-block inspection for hooks. |
| SAFE-04 | Re-running `init` must be safe and non-duplicating. | Existing idempotent scaffolding and managed-marker behavior in runtime-wiring and scaffold are already proven in tests. |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 24.x (project target), runtime currently Node 22.14.0 | CLI execution, filesystem, process, child-process integration | Consistent across package scripts and module model |
| TypeScript | 5.x | Static contracts for commands and core contracts | Prevents schema/config drift in CLI orchestration |
| npm workspaces | npm 10+/workspaces | Manage `agent-badge`, `create-agent-badge`, `core`, `testkit` | Current repository and init path assume workspace model |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|------------|
| `commander` | 14.x | Multi-command CLI entrypoint and subcommands | Add `doctor` and `uninstall` commands |
| `octokit` | 5.x | GitHub API for auth, gist read/update/write checks | Existing client/wrapper usage pattern |
| `zod` | 4.x | Parse/validate config, state, and log entries | Keep all boundary inputs explicit |
| `better-sqlite3` | 12.8.x | Provider adapters currently used for Codex data scan | Keep parity with provider backfill implementation |
| `vitest` | 3.2.x | Unit/integration test runner | Existing testing pattern across core + agent-badge command surface |
| `tsx` | 4.20.x | TypeScript execution in dev scripts | Existing dev entrypoints |

### Alternatives Considered
| Instead of | Use | Tradeoff |
|-----------|-----|----------|
| New bespoke command shell wrapper | `doctor` command + typed check model | wrappers become untestable and drift from init logic |
| Manual teardown scripts | marker-aware cleanup API | marker approach preserves user content and avoids duplicate blocks |
| Unbounded append logs | schema-validated rotation | deterministic retention and requirement coverage |

### Installation

```bash
npm install
```

### Version verification

```bash
node --version
npm --version
node -p "JSON.parse(require('fs').readFileSync('package.json','utf8')).devDependencies.vitest"
```

## Architecture Patterns

### Recommended Project Structure

```text
packages/
├── agent-badge/src/
│  ├── cli/main.ts
│  ├── commands/
│  │   ├── doctor.ts        # new
│  │   ├── doctor.test.ts   # health checks and output assertions
│  │   ├── uninstall.ts     # new
│  │   ├── uninstall.test.ts
│  │   ├── init.ts
│  │   ├── scan.ts
│  │   ├── refresh.ts
│  │   ├── config.ts
│  │   ├── publish.ts
│  │   └── status.ts
├── core/src/
│  ├── init/
│  │   ├── preflight.ts
│  │   ├── scaffold.ts
│  │   └── runtime-wiring.ts
│  ├── logging/
│  │   ├── log-entry.ts
│  │   └── log.ts            # new service (writer + rotation)
│  ├── publish/
│  │   ├── publish-target.ts
│  │   ├── publish-state.ts
│  │   └── readme-badge.ts
│  └── index.ts
```

### Pattern 1: Structured command results + report output

**What:** Existing commands return typed result objects and write concise, parseable report lines; phase 6 should follow this.

**Where:** `runInitCommand`, `runRefreshCommand`, `runConfigCommand`.

**Code evidence:**
- `packages/agent-badge/src/cli/main.ts` registers command surface.
- `packages/agent-badge/src/commands/init.ts` and `refresh.ts` return typed result unions with report output.
- `packages/agent-badge/src/commands/config.ts` validates allowed keys and emits report lines.

**Use:** add `runDoctorCommand` and `runUninstallCommand` with typed success/failure models and machine-readable summaries.

### Pattern 2: Marker-managed idempotent file mutation

**What:** Keep managed edits to files in dedicated marker blocks only.

**Code evidence:**
- `packages/core/src/init/runtime-wiring.ts` defines hook and gitignore marker ranges and strips/rebuilds only managed segments.
- tests assert one managed pre-push block after repeated runs (`packages/core/src/init/runtime-wiring.test.ts`).

**Use:** apply same strip/rebuild strategy in uninstall for safe inverse operations.

### Pattern 3: Fail-soft first on non-critical failures

**What:** Refresh writes local state/cache before publish and handles failures without losing checkpoints.

**Code evidence:**
- `packages/agent-badge/src/commands/refresh.ts` persists local artifacts before publish decision and returns `failed-soft` in fail-soft mode.

**Use:** doctor should avoid hard failures for non-critical warnings and provide clear recovery hints.

### Anti-Patterns to Avoid
- **Full scan in doctor default mode:** increases runtime and creates side effects.
- **Deleting user-managed hook lines during uninstall:** only managed markers should be removed.
- **Logging raw session or path data:** must never be serialized.
- **Default destructive uninstall:** keep defaults reversible/predictable.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Readiness diagnostics | shell+grep ad-hoc checks | dedicated `doctor` command with typed check graph | Reproducible, tested, and consistent with preflight/publish behavior |
| Integration cleanup | direct regex deletes across files | marker-aware uninstall flow using existing managed block semantics | Preserves unrelated user config/hooks |
| Log retention | manual ad-hoc append file writes | shared log service using `agentBadgeLogEntrySchema` | Enforces safe schema + rotation policy |
| Remote capability check | blind network writes in diagnostics | explicit opt-in probe mode (`--probe-write`) with docs | preserves zero-side-effect default |

## Decision Matrix

### 06-01 (doctor)

| Decision | Recommendation | Risk | Mitigation |
|----------|----------------|------|------------|
| Check model | Build check categories: git/provider/auth/shields/readme/hook/publish-target | Missed edge cases if too shallow | add explicit fixtures per check in unit tests |
| Execution mode | default read-only + no mutations | Under-validates write path | add optional `--probe-write` with clear warnings |
| Output | `line report + exit code + optional JSON` | brittle parsing from line-only output | preserve machine-consumable JSON mode |

### 06-02 (uninstall)

| Decision | Recommendation | Risk | Mitigation |
|----------|----------------|------|------------|
| Scope | local cleanup only by default | stale remote config remains | explicit `--purge-remote`/`--purge-config` flags |
| Reverse strategy | marker-stripping for hook/readme and config-script reconciliation | partial stale state on unusual files | tests on fixtures with user-managed hook + scripts |
| Re-init behavior | preserve config by default | accidental reliance on stale cache | document explicit purge flags, add doctor warning |

### 06-03 (logs + privacy)

| Decision | Recommendation | Risk | Mitigation |
|----------|----------------|------|------------|
| Schema | enforce `AgentBadgeLogEntry` only | incomplete observability | keep operation + aggregate counts + duration per row |
| Rotation | line-count/file-size cap in `.agent-badge/logs/` | data loss if too strict | configurable defaults + retention test |
| Call sites | log scan/refresh/publish + doctor failures only | overlogging from low-level internals | keep explicit allowlist of logged operations |

## Current Evidence: phase-6-relevant code behavior

- **Command surface today (missing doctor/uninstall):** `init`, `scan`, `publish`, `refresh`, `status`, `config` in `packages/agent-badge/src/cli/main.ts` and test coverage in `packages/agent-badge/src/cli/main.test.ts`.
- **Doctor primitives:** `runInitPreflight` in `packages/core/src/init/preflight.ts` already exposes git/readme/package-manager/provider/auth/scaffold state.
- **Install idempotency:** managed hook and marker reconciliation in `packages/core/src/init/runtime-wiring.ts` with strict single-block behavior in tests.
- **README idempotency:** `buildReadmeBadgeMarkdown` and `upsertReadmeBadge` in `packages/core/src/publish/readme-badge.ts`.
- **Privacy boundary in data model:**
  - `privacy.aggregateOnly` is literal `true` in `packages/core/src/config/config-schema.ts`.
  - `config` allowlist in `packages/agent-badge/src/commands/config.ts` rejects attempts to disable aggregate-only.
  - publish payload is aggregate values only in `packages/core/src/publish/badge-payload.ts`.
- **Fail-soft/restore behavior:** `runRefreshCommand` returns `failed-soft` when `--fail-soft`, persists local state before publish attempts, and marks publish state error locally.
- **Logging gaps:** `packages/core/src/logging/log-entry.ts` schema exists; no corresponding writer exists, and no command uses it yet.

## Common Pitfalls

1. **Doctor accidentally mutating state in default mode**
   - Why: tests may call publish helpers directly.
   - Prevent: split checks into pure/read-only and explicit `--probe-write` path.
2. **Uninstall clobbering custom hooks**
   - Why: naïve full file rewrite.
   - Prevent: strip only managed marker block ranges.
3. **Deleting remote artifacts by default**
   - Why: over-aggressive cleanup.
   - Prevent: explicit purge flags; default safe local cleanup.
4. **Forcing `doctor` to run scans**
   - Why: slow and can mutate cache/state.
   - Prevent: avoid full scan; check access/capabilities only.
5. **Allowing path/prompt fields in logs**
   - Why: violates SAFE-01 directly.
   - Prevent: enforce schema checks and explicit field whitelist.

## Code Examples

### Marker strip/rebuild pattern (existing)

```typescript
const managedBlockPattern = new RegExp(
  `${escapeForRegExp(agentBadgeHookStartMarker)}[\\s\\S]*?${escapeForRegExp(agentBadgeHookEndMarker)}\\n?`,
  "g"
);
const baseContent = hadManagedBlock
  ? normalizedContent.replace(managedBlockPattern, "").replace(/\n{3,}/g, "\n\n")
  : normalizedContent;
```

Source: `packages/core/src/init/runtime-wiring.ts`.

### Fail-soft result pattern

```typescript
export type RefreshCommandResult =
  | RefreshCommandSuccessResult
  | RefreshCommandSoftFailureResult;
```

Source: `packages/agent-badge/src/commands/refresh.ts`.

### Aggregate payload contract

```typescript
export interface EndpointBadgePayload {
  readonly schemaVersion: 1;
  readonly label: string;
  readonly message: string;
  readonly color: "brightgreen" | "lightgrey";
}
```

Source: `packages/core/src/publish/badge-payload.ts`.

## State of the Art

| Old approach | Current approach | Why changed |
|--------------|-----------------|------------|
| No `doctor` command | explicit diagnostics command | operator recovery currently ad hoc |
| No local summary logs | schema-based log summary entries + rotation | better troubleshooting and SAFE-02 compliance |
| No cleanup command | explicit uninstall with safe defaults | safe re-entry without destructive behavior |

**Deprecated/outdated:** ad-hoc cleanup assumptions and side-effectful diagnostics.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|-----------|------------|-----------|---------|----------|
| Node.js | core runtime + tests | ✓ | v22.14.0 | Use installed runtime |
| npm | workspace dependencies/scripts | ✓ | 11.6.0 | fallback package manager |
| git | pre-push checks + repo context | ✓ | 2.49.0 | cannot fully verify repo context |
| docker | optional toolchain | ✓ | 25.0.3 | optional |
| Network/API | GitHub checks, gist auth/write probes | ⚠️ | not validated now | fail-soft with actionable remediation |

## Validation Architecture (nyquist validation enabled)

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 3.2.x |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| OPER-05 | `uninstall` default cleanup + explicit purge behavior | unit/integration | `npm test -- packages/agent-badge/src/commands/uninstall.test.ts packages/agent-badge/src/cli/main.test.ts` | ❌ (new) |
| SAFE-01 | aggregate-only publish/log outputs and privacy guards | unit/schema | `npm test -- packages/core/src/publish/badge-payload.ts packages/core/src/logging/log-entry.ts` | ❌ partially (schema exists) |
| SAFE-02 | summary logging + rotation in `.agent-badge/logs/` | unit/integration | `npm test -- packages/core/src/logging packages/agent-badge/src/commands/refresh.test.ts` | ❌ (new) |
| SAFE-03 | doctor checks + actionable fix hints | unit/CLI | `npm test -- packages/agent-badge/src/commands/doctor.test.ts` | ❌ (new) |
| SAFE-04 | init idempotency unchanged after uninstall/re-init | integration | `npm test -- packages/core/src/init/runtime-wiring.test.ts packages/core/src/init/scaffold.test.ts packages/agent-badge/src/commands/init.test.ts` | ✓ |

### Wave 0 Gaps
- New tests required for `doctor`, `uninstall`, and logging/rotation modules.
- Add command output tests for actionable guidance and warning/error severities.

## Open Questions

1. Should `doctor` support `--json` by default in v1 or only in debug mode?
2. Should local cleanup default retain `.agent-badge/cache/`? (Current evidence suggests preserving by default is safer for re-init stability.)
3. Should install/uninstall include optional removal of `.agent-badge/readme` snippet without deleting README lines when absent?

## Sources

### Primary
- `.planning/ROADMAP.md` (Phase 6 success criteria and plan items)
- `.planning/REQUIREMENTS.md` (OPER-05/SAFE-01..04 traceability)
- `.planning/STATE.md` (completed behavior and assumptions)
- `packages/agent-badge/src/cli/main.ts`
- `packages/agent-badge/src/commands/{init,refresh,scan,status,config,publish}.ts`
- `packages/core/src/init/{preflight,scaffold,runtime-wiring}.ts`
- `packages/core/src/config/config-schema.ts`
- `packages/core/src/state/state-schema.ts`
- `packages/core/src/publish/{publish-target,badge-payload,readme-badge,publish-state}.ts`
- `packages/core/src/logging/log-entry.ts`
- `packages/core/src/init/runtime-wiring.test.ts`
- `packages/core/src/init/scaffold.test.ts`
- `packages/agent-badge/src/commands/init.test.ts`

## Metadata

**Confidence breakdown:**
- Standard stack: High — concrete package/script evidence and runtime checks.
- Architecture: High — command, runtime, and schema patterns already validated by tests.
- Pitfalls: High — failure/cleanup scenarios directly observable in existing code paths.

**Research date:** 2026-03-30
**Valid until:** 2026-04-30
