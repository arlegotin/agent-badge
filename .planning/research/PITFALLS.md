# Pitfalls Research

**Domain:** Local-first AI usage badge CLI
**Researched:** 2026-03-29
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Double-counting session usage

**What goes wrong:**
Totals inflate because the scanner sums low-level events or repeated transcript snapshots instead of deduped session summaries.

**Why it happens:**
Provider data can contain multiple artifacts per session, and event streams look easier to sum than they actually are.

**How to avoid:**
Normalize one session record per provider session, prefer cumulative totals, and dedupe by provider/session identity before repo aggregation.

**Warning signs:**
Totals jump unexpectedly after re-scan, or the same historical data changes without user action.

**Phase to address:**
Phase 2 and Phase 3

---

### Pitfall 2: Crediting the wrong repository

**What goes wrong:**
Sessions from neighboring repos, moved directories, or cloned checkouts are attributed to the current repo.

**Why it happens:**
Loose cwd matching ignores remote identity, path normalization, and repo aliases.

**How to avoid:**
Build a canonical fingerprint and rank evidence: exact repo root, normalized remote, normalized cwd, transcript correlation, then user override.

**Warning signs:**
Ambiguous sessions appear to belong to multiple repositories, or totals change after a local path move.

**Phase to address:**
Phase 2 and Phase 3

---

### Pitfall 3: Making `pre-push` feel punitive

**What goes wrong:**
Pushes become slow or fail frequently, so users bypass the hook and stop trusting the automation.

**Why it happens:**
The refresh path performs full rescans, always republishes, or exits nonzero on recoverable network issues.

**How to avoid:**
Use incremental checkpoints, skip publish when the visible badge value is unchanged, and default to success with clear logs on publish failure.

**Warning signs:**
Push latency grows with repo age, or users repeatedly need `--no-verify`.

**Phase to address:**
Phase 5

---

### Pitfall 4: Leaking sensitive local data

**What goes wrong:**
Prompt content, transcript paths, filenames, or local absolute paths end up in published JSON, logs, or debug output.

**Why it happens:**
Developers serialize convenient internal objects directly into state, logs, or publish payloads.

**How to avoid:**
Define explicit outbound schemas for Gist payloads and logs, and audit every field at the publish/log boundary.

**Warning signs:**
State or logs contain raw provider records, or Gist diffs show anything beyond aggregate badge fields.

**Phase to address:**
Phase 4 and Phase 6

---

### Pitfall 5: Non-idempotent setup

**What goes wrong:**
Re-running `init` duplicates README badges, stacks hooks, creates multiple Gists, or overwrites user settings silently.

**Why it happens:**
The setup path is built as a one-shot installer instead of a state-aware reconciler.

**How to avoid:**
Detect existing integration state before mutating anything and treat setup as "converge toward desired state" rather than "create from scratch".

**Warning signs:**
Running `init` twice changes files that were already correct, or the repo accumulates multiple publish targets.

**Phase to address:**
Phase 1, Phase 4, and Phase 6

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Ad hoc provider parsing with inline regexes | Fast initial progress | Breaks when formats evolve and becomes hard to test | Only during throwaway spike work, not in shipped code |
| Using a second usage ledger as truth | Simple queries later | Data drift and trust problems | Never |
| Writing hooks by string concatenation without reconciliation | Quick install path | Hard to update, remove, or detect duplicates | Only if wrapped in deterministic marker blocks |
| Logging full raw session objects | Easy debugging | Privacy leaks and noisy logs | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| GitHub Gists | Assuming auth always exists during init | Support degraded local-only setup and "connect existing Gist" fallback |
| Shields endpoint badge | Expecting immediate badge refresh after publish | Respect cache behavior and surface cache expectations to users |
| Git hooks | Treating hooks as guaranteed and universal | Install them lightly, validate them in `doctor`, and keep `refresh` usable standalone |
| Local provider directories | Assuming both providers exist and use one stable file layout forever | Detect providers dynamically and keep adapters isolated behind tests |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full historical scan on every refresh | Pushes become slower over time | Persist checkpoints and only revisit new or changed session files | Medium to large local histories |
| Recomputing publish payload every time even when badge value is unchanged | Unnecessary API traffic and user confusion | Diff visible badge state before publish | Any normal daily use |
| Reading entire transcript bodies when metadata is enough | High I/O and memory churn | Extract only fields needed for attribution and cumulative totals | Large transcript directories |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Persisting GitHub tokens in repo config | Credential exposure | Use environment variables or trusted auth sources only |
| Publishing local paths or transcript details | Privacy breach | Publish only aggregate badge fields |
| Logging ambiguous-session raw content | Sensitive local data exposure | Log summary counts and stable identifiers only |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent degraded mode after auth failure | Users think the badge is live when it is not | Mark unpublished state clearly and show the next recovery action |
| Auto-counting weak matches | Badge looks inaccurate and untrustworthy | Show ambiguity review and require approval |
| README rewrite on every refresh | Noisy diffs and repo churn | Insert one stable badge URL once |

## "Looks Done But Isn't" Checklist

- [ ] **Init:** historical backfill actually ran before first publish
- [ ] **Publish:** Gist payload contains badge fields only
- [ ] **README integration:** badge URL is stable and not rewritten on refresh
- [ ] **Refresh hook:** failure-soft behavior is covered by tests, not assumed
- [ ] **Doctor:** verifies auth, badge URL, provider paths, and hook presence, not just config parsing
- [ ] **Uninstall:** removes local integration cleanly and leaves explicit recovery instructions

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Double-counting session usage | MEDIUM | Rebuild normalized scan cache, recompute totals from deduped session summaries, compare to previous publish hash |
| Wrong repo attribution | MEDIUM | Surface ambiguous sessions, apply overrides, rescan incrementally, republish only after confirmation |
| Failed publish | LOW | Keep local state, mark unpublished status, rerun `agent-badge publish` after auth/connectivity fix |
| Duplicate setup artifacts | MEDIUM | Reconcile hook, badge, and publish target state through `doctor` or `uninstall` + `init` |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Double-counting session usage | Phase 2 and 3 | Fixture tests prove one total per session and stable re-scan results |
| Crediting the wrong repository | Phase 3 | Ambiguous cases are surfaced instead of auto-counted |
| Punitive `pre-push` behavior | Phase 5 | Hook path stays incremental and succeeds on recoverable publish failures |
| Sensitive data leakage | Phase 4 and 6 | Published JSON and logs contain aggregate-only fields |
| Non-idempotent setup | Phase 1, 4, and 6 | Re-running `init` produces no duplicate badge, hook, or Gist |

## Sources

- https://docs.github.com/en/rest/gists - publish and auth constraints
- https://shields.io/badges/endpoint-badge - badge payload contract
- https://developers.openai.com/codex/hooks - future hook limitations
- https://code.claude.com/docs/en/statusline - provider metadata fields and cumulative totals
- Product brief and acceptance criteria supplied in project initialization prompt

---
*Pitfalls research for: local-first AI usage badge CLI*
*Researched: 2026-03-29*
