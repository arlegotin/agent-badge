# Phase 19 Recovery Evidence

- Status: passed
- Source: scripts/smoke/verify-recovery-flow.sh
- Captured at: 2026-04-05T13:46:52Z
- Recovery command: agent-badge init --gist-id <id>

## Pre-recovery status

```text
agent-badge status
- Totals: 202 sessions, 752536892 tokens, ~$382.78 estimated
- Providers: codex=enabled, claude=enabled
- Publish: pending | gist configured=yes | last published=2026-04-02T11:44:53.548Z | gistId=f9f1989fe5ddd0f04e25df81c6dd051e | lastPublishedHash=4b964af0721df3149a1f048500989dde4fff350ff8fe7cee9c35477ab46d73d4
- Pre-push policy: strict
- Blocking: push stopped because pre-push policy is strict.
- Live badge trust: unknown
- Last successful badge update: 2026-04-02T11:44:53.548Z
- Shared mode: shared | health=healthy | contributors=1
- Recovery: Run `agent-badge init --gist-id <id>` to reconnect a valid public gist target.
- Last refresh: 2026-04-05T13:42:01.734Z (incremental)
- Checkpoints: codex=2026-04-05T13:42:01.734Z, claude=2026-04-05T13:42:01.734Z
```

## Pre-recovery doctor

```text
agent-badge doctor
- git: pass
- Git repository detected
- Origin was detected and can be used for repo attribution.
- providers: pass
- Provider directories detected
- Detected homes: codex=yes, claude=yes
- scan-access: pass
- Scan-ready provider directories available
- Provider access check passed for codex=yes, claude=yes
- publish-auth: warn
- GitHub auth was not detected
- Publish checks cannot verify write access without an auth token.
- Fix: Set GH_TOKEN, GITHUB_TOKEN, or GITHUB_PAT in the environment and rerun the command.
- publish-write: pass
- Publish target is reachable
- Configured gist can be read and validated.
- publish-shields: pass
- Shields URL is reachable
- Checked https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Farlegotin%2Ff9f1989fe5ddd0f04e25df81c6dd051e%2Fraw%2Fagent-badge.json&cacheSeconds=300.
- publish-trust: warn
- Live badge trust: unknown
- Last refresh=2026-04-05T13:42:01.734Z | last published=2026-04-02T11:44:53.548Z | Recovery path: Run `agent-badge init --gist-id <id>` to reconnect a valid public gist target.
- Fix: Run `agent-badge init --gist-id <id>` to reconnect a valid public gist target.
- shared-mode: pass
- Repo is using shared publish mode
- Shared mode: shared | health=healthy | contributors=1.
- shared-health: pass
- Shared contributor state is healthy
- Shared mode: shared | health=healthy | contributors=1.
- readme-badge: pass
- README badge marker is present exactly once
- README.md contains one managed badge block.
- pre-push-hook: pass
- pre-push hook is wired
- Pre-push policy: strict | push stopped because pre-push policy is strict. | Managed hook block is present and invokes refresh.
- Overall: warn
```

## Recovery command output

```text
agent-badge init preflight
- Git: existing repository, origin configured
- README: README.md
- Package manager: npm
- Providers: codex=yes (~/.codex), claude=yes (~/.claude)
- GitHub auth: not detected
- Existing scaffold: config.json, state.json, cache/, logs/
- Git bootstrap: not needed
agent-badge init scaffold
- Created: none
- Reused: .agent-badge, .agent-badge/cache, .agent-badge/logs, .agent-badge/config.json, .agent-badge/state.json
agent-badge init runtime wiring
- Created: none
- Updated: none
- Reused: package.json#devDependencies.@legotin/agent-badge, package.json#scripts.agent-badge:init, package.json#scripts.agent-badge:refresh, package.json, .gitignore, .git/hooks/pre-push
- Warning: Preserved existing package.json#devDependencies.@legotin/agent-badge instead of overwriting it with managed runtime wiring.
- Publish target: connected existing gist
- Badge setup deferred: first publish failed (GitHub authentication missing or invalid.). Set GH_TOKEN, GITHUB_TOKEN, or GITHUB_PAT so init can publish the live badge JSON, then rerun `agent-badge init`.
```

## Post-recovery status

```text
agent-badge status
- Totals: 202 sessions, 752536892 tokens, ~$382.78 estimated
- Providers: codex=enabled, claude=enabled
- Publish: pending | gist configured=yes | last published=2026-04-02T11:44:53.548Z | gistId=f9f1989fe5ddd0f04e25df81c6dd051e | lastPublishedHash=4b964af0721df3149a1f048500989dde4fff350ff8fe7cee9c35477ab46d73d4
- Pre-push policy: strict
- Blocking: push stopped because pre-push policy is strict.
- Live badge trust: unknown
- Last successful badge update: 2026-04-02T11:44:53.548Z
- Shared mode: shared | health=healthy | contributors=1
- Recovery: Run `agent-badge init --gist-id <id>` to reconnect a valid public gist target.
- Last refresh: 2026-04-05T13:42:01.734Z (incremental)
- Checkpoints: codex=2026-04-05T13:42:01.734Z, claude=2026-04-05T13:42:01.734Z
```

## Post-recovery doctor

```text
agent-badge doctor
- git: pass
- Git repository detected
- Origin was detected and can be used for repo attribution.
- providers: pass
- Provider directories detected
- Detected homes: codex=yes, claude=yes
- scan-access: pass
- Scan-ready provider directories available
- Provider access check passed for codex=yes, claude=yes
- publish-auth: warn
- GitHub auth was not detected
- Publish checks cannot verify write access without an auth token.
- Fix: Set GH_TOKEN, GITHUB_TOKEN, or GITHUB_PAT in the environment and rerun the command.
- publish-write: pass
- Publish target is reachable
- Configured gist can be read and validated.
- publish-shields: pass
- Shields URL is reachable
- Checked https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Farlegotin%2Ff9f1989fe5ddd0f04e25df81c6dd051e%2Fraw%2Fagent-badge.json&cacheSeconds=300.
- publish-trust: warn
- Live badge trust: unknown
- Last refresh=2026-04-05T13:42:01.734Z | last published=2026-04-02T11:44:53.548Z | Recovery path: Run `agent-badge init --gist-id <id>` to reconnect a valid public gist target.
- Fix: Run `agent-badge init --gist-id <id>` to reconnect a valid public gist target.
- shared-mode: pass
- Repo is using shared publish mode
- Shared mode: shared | health=healthy | contributors=1.
- shared-health: pass
- Shared contributor state is healthy
- Shared mode: shared | health=healthy | contributors=1.
- readme-badge: pass
- README badge marker is present exactly once
- README.md contains one managed badge block.
- pre-push-hook: pass
- pre-push hook is wired
- Pre-push policy: strict | push stopped because pre-push policy is strict. | Managed hook block is present and invokes refresh.
- Overall: warn
```
