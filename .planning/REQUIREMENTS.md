# Requirements: agent-badge

**Defined:** 2026-03-29
**Core Value:** Any repository can display an accurate, privacy-preserving AI usage badge with one setup command and near-zero ongoing maintenance.

## v1 Requirements

### Bootstrap

- [x] **BOOT-01**: Developer can initialize an existing repository through `npm init agent-badge@latest` without requiring a global install.
- [x] **BOOT-02**: Developer can initialize a non-git directory by letting the tool create git or by receiving a precise blocking message with the next action.
- [x] **BOOT-03**: Init installs or wires a repo-local runtime so package scripts and git hooks can invoke `agent-badge` after normal dependency install.
- [x] **BOOT-04**: Init creates `.agent-badge/config.json`, `.agent-badge/state.json`, `.agent-badge/cache/`, and `.agent-badge/logs/`.
- [ ] **BOOT-05**: Init inserts one stable badge URL into the repository README or prints a pasteable snippet when no README exists.

### Attribution

- [ ] **ATTR-01**: Tool derives a canonical repo fingerprint from git root, normalized origin URL, repo owner/name when available, and local aliases.
- [x] **ATTR-02**: First run performs a full historical backfill across enabled providers before the first badge publish.
- [x] **ATTR-03**: Session attribution applies evidence in priority order: exact repo root, exact remote, normalized cwd, transcript correlation, then persisted override.
- [x] **ATTR-04**: Ambiguous sessions are excluded from totals until the developer explicitly approves or rejects them.
- [x] **ATTR-05**: Attribution overrides are persisted and reused on later scans.

### Scanning

- [ ] **SCAN-01**: Tool detects which provider directories exist and enables only those providers by default.
- [ ] **SCAN-02**: Tool can scan Codex local session data under `~/.codex` and compute deduped per-session token totals for the repo.
- [ ] **SCAN-03**: Tool can scan Claude local data under `~/.claude` and map session metadata into the same normalized session model.
- [ ] **SCAN-04**: `refresh` performs incremental scanning using persisted checkpoints instead of a full historical rescan.
- [x] **SCAN-05**: `scan` reports included totals, ambiguous sessions, and excluded sessions in a human-readable attribution report.

### Publishing

- [x] **PUBL-01**: Init can create a public Gist automatically when GitHub auth is available.
- [x] **PUBL-02**: If automatic Gist creation fails, developer can retry, connect an existing Gist, or continue in explicit unpublished mode.
- [x] **PUBL-03**: `publish` writes aggregate-only Shields endpoint JSON with `schemaVersion`, `label`, `message`, `color`, and cache behavior fields.
- [ ] **PUBL-04**: The README badge URL stays stable after init; later updates modify only the remote JSON.
- [ ] **PUBL-05**: Publish skips remote updates when the visible badge value has not changed.

### Operations

- [ ] **OPER-01**: Default `pre-push` integration runs a fast failure-soft refresh and respects normal git bypass behavior.
- [ ] **OPER-02**: `refresh` can recover local badge state end to end without manual file edits.
- [ ] **OPER-03**: `status` shows current totals, enabled providers, publish state, and last scan/publish checkpoints.
- [ ] **OPER-04**: `config` lets the developer change enabled providers, badge mode, label, privacy, and refresh behavior after init.
- [ ] **OPER-05**: `uninstall` removes local integration cleanly without deleting published badge data unless the developer explicitly requests it.

### Safety

- [ ] **SAFE-01**: Published data never contains raw transcripts, prompt text, filenames, or local absolute paths.
- [ ] **SAFE-02**: Logs contain scan/publish summaries only and rotate under `.agent-badge/logs/`.
- [ ] **SAFE-03**: `doctor` verifies git root, provider paths, scan access, Gist auth/write, Shields endpoint, README badge, and hook installation, then prints actionable fixes.
- [ ] **SAFE-04**: Re-running `init` does not duplicate README badges, hooks, or Gists and does not overwrite user settings silently.

### Release Readiness

- [ ] **REL-01**: Maintainer can verify the supported scenario matrix: fresh repo, existing repo, one or both providers, no README, no origin, no auth, and idempotent re-init.
- [ ] **REL-02**: Repository CI can validate package build, tests, and docs without depending on access to live provider directories.
- [ ] **REL-03**: Public docs ship a quickstart, attribution model, privacy model, troubleshooting guide, and manual Gist connection guide.

## v2 Requirements

### Live Freshness

- **LIVE-01**: Tool can optionally use Codex hooks for faster local freshness after the core scanner is stable.
- **LIVE-02**: Tool can optionally ingest Claude live session metrics for more immediate refreshes.

### Collaboration and History

- **TEAM-01**: Multiple maintainers can share a badge publishing target safely.
- **HIST-01**: Tool can render richer history views such as charts or timeline summaries.
- **BACK-01**: Tool can publish badge data to backends other than public Gists.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Hosted backend for v1 collection | Conflicts with the local-first, serverless product definition |
| Uploading raw transcripts or prompts | Violates the privacy model and trust story |
| GitHub Actions-based collection from local agent directories | CI cannot reliably access the required local data sources |
| Strict push-blocking refresh by default | Creates developer friction and will encourage bypasses |
| Shared team dashboards in v1 | Valuable later, but not required for a credible first release |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| BOOT-01 | Phase 1 | Complete |
| BOOT-02 | Phase 1 | Complete |
| BOOT-03 | Phase 1 | Complete |
| BOOT-04 | Phase 1 | Complete |
| ATTR-01 | Phase 2 | Pending |
| SCAN-01 | Phase 2 | Pending |
| SCAN-02 | Phase 2 | Pending |
| SCAN-03 | Phase 2 | Pending |
| ATTR-02 | Phase 3 | Complete |
| ATTR-03 | Phase 3 | Complete |
| ATTR-04 | Phase 3 | Complete |
| ATTR-05 | Phase 3 | Complete |
| SCAN-05 | Phase 3 | Complete |
| BOOT-05 | Phase 4 | Pending |
| PUBL-01 | Phase 4 | Complete |
| PUBL-02 | Phase 4 | Complete |
| PUBL-03 | Phase 4 | Complete |
| PUBL-04 | Phase 4 | Pending |
| SCAN-04 | Phase 5 | Pending |
| PUBL-05 | Phase 5 | Pending |
| OPER-01 | Phase 5 | Pending |
| OPER-02 | Phase 5 | Pending |
| OPER-03 | Phase 5 | Pending |
| OPER-04 | Phase 5 | Pending |
| OPER-05 | Phase 6 | Pending |
| SAFE-01 | Phase 6 | Pending |
| SAFE-02 | Phase 6 | Pending |
| SAFE-03 | Phase 6 | Pending |
| SAFE-04 | Phase 6 | Pending |
| REL-01 | Phase 7 | Pending |
| REL-02 | Phase 7 | Pending |
| REL-03 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0

---
*Requirements defined: 2026-03-29*
*Last updated: 2026-03-30 after completing Phase 3*
