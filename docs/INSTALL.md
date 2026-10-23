# Installation

Supported execution requires Linux or macOS. Native Windows actions return `unsupported-platform` (exit 3) before setup or usage writes. WSL2 requires both the coding agent and Badge to run inside Linux; it does not imply discovery of native Windows histories.

These commands require Agent Badge **2.0.0 or newer**. Version 1 uses the previous Gist architecture and has no automatic migration. See [release status](maintainers/RELEASE-STATUS.md) for publication and verification evidence.

Use Node.js **24 or 26** (`^24.0.0 || ^26.0.0`), npm and Git. A globally installed Badge runtime is unnecessary. Each repository owns its declaration and exact nested runtime lock; each Git common directory owns private activation. Linked worktrees share that private state, while provider configuration can still require worktree-specific review.

Initialize the repository with the npm entry point; no global install is required:

Version **2.0.0** is published on `latest`; the
[release record](maintainers/releases/2.0.0/README.md) contains package and platform verification.

```sh
npm init agent-badge@latest
```

An explicitly installed runtime can preview or apply setup with an exact version:

```sh
agent-badge init --runtime-version 2.0.0 --dry-run
agent-badge init --runtime-version 2.0.0
```

Review the printed tracked changes, runtime pin and hook action items. Setup does not stage or commit files. Reviewed native hook definitions (`.codex/hooks.json`, `.claude/settings.json`, `.gemini/settings.json`) and their matching `.agent-badge/agent-hooks.json` ownership record travel together, or both remain local/untracked. A fresh clone can create local native hooks during explicit setup. Committing ownership while omitting its definitions produces an action item to reconcile missing owned hooks; it is not a successful activation. Never force-add ignored/private settings or unrelated provider files. Installation uses an exact approved npm lock and integrity with package lifecycle scripts disabled. Retry explicit setup after installation failure. No successful-setup claim is made when a required runtime/hook path is unusable; queued initial history can require a later manual run.

For another clone of an already configured repository:

```sh
node .agent-badge/run.cjs setup
node .agent-badge/run.cjs doctor --json
```

Fresh clones do not inherit runtime approval. Review `.codex/hooks.json`, `.claude/settings.json` and `.gemini/settings.json` in the native provider, grant project trust deliberately, and restart the provider as required. Setup does not grant native trust or mutate global settings. On the inspected Codex source generation, linked worktrees load project hooks from the primary checkout; setup and review that checkout explicitly.

Supported existing pre-push hooks run immediately with streamed complete input and keep control of push failure. Shared/global hooks paths, edited ownership, unsupported hook managers or legacy marker blocks produce action items. Badge only retains a bounded 1 MiB copy until EOF; incomplete, oversized or expired input can skip its own wakeup. Native Windows is unsupported; use Linux/WSL2 or macOS.

Codex and Claude native handler timeout `10` is seconds. Gemini `10000` is milliseconds. These host cleanup windows do not increase Badge's two-second internal automatic budget.

Optional trusted CI import workflow generation is explicit and performs a bounded remote read to verify the actual GitHub identity and default branch:

```sh
node .agent-badge/run.cjs setup --import-workflow
```

It embeds the exact approved runtime manifest/lock and uses the trusted installed importer. Only credential-free `github.com` destinations with supported canonical HTTPS/SSH identity are accepted. GitHub Enterprise and arbitrary hosts are unsupported for this generator. Review and commit the generated workflow normally; this command does not deploy it or prove hosted permission policy.

[CLI](CLI.md) · [Git authentication](AUTH.md) · [Source coverage](ATTRIBUTION.md) · [Recovery](RECOVERY.md).
