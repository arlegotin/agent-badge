# Installation

This documents the unreleased repository-native replacement. Published npm `1.1.20` uses the previous architecture and does not provide these commands. Candidate artifacts and external release gates remain pending.

Use Node.js **24 or 26** (`^24.0.0 || ^26.0.0`), npm and Git. A globally installed Badge runtime is unnecessary. Each repository owns its declaration and exact nested runtime lock; each Git common directory owns private activation. Linked worktrees share that private state, while provider configuration can still require worktree-specific review.

After a replacement release, the initializer remains `npm init agent-badge@latest`. Until then use only verified candidate artifacts prepared by maintainers; public `1.1.20` cannot bootstrap this runtime. The source workspace can build and display help without installing or activating this checkout:

```sh
npm run build
npm run dev:agent-badge -- --help
```

For a verified installed candidate, initial setup is explicit:

```sh
agent-badge init --runtime-version <candidate-version> --dry-run
agent-badge init --runtime-version <candidate-version>
```

Review the printed tracked changes, runtime pin and hook action items. Setup does not stage or commit files. Reviewed native hook definitions (`.codex/hooks.json`, `.claude/settings.json`, `.gemini/settings.json`) and their matching `.agent-badge/agent-hooks.json` ownership record travel together, or both remain local/untracked. A fresh clone can create local native hooks during explicit setup. Committing ownership while omitting its definitions produces an action item to reconcile missing owned hooks; it is not a successful activation. Never force-add ignored/private settings or unrelated provider files. Installation uses an exact approved npm lock and integrity with package lifecycle scripts disabled. Retry explicit setup after installation failure. No successful-setup claim is made when a required runtime/hook path is unusable; queued initial history can require a later manual run.

For another clone of an already configured repository:

```sh
node .agent-badge/run.cjs setup
node .agent-badge/run.cjs doctor --json
```

Fresh clones do not inherit runtime approval. Review `.codex/hooks.json`, `.claude/settings.json` and `.gemini/settings.json` in the native provider, grant project trust deliberately, and restart the provider as required. Setup does not grant native trust or mutate global settings. On the inspected Codex source generation, linked worktrees load project hooks from the primary checkout; setup and review that checkout explicitly.

Supported existing pre-push hooks run immediately with streamed complete input and keep control of push failure. Shared/global hooks paths, edited ownership, unsupported hook managers or legacy marker blocks produce action items. Badge only retains a bounded 1 MiB copy until EOF; incomplete, oversized or expired input can skip its own wakeup. Windows automatic hooks are unsupported; use manual collection/sync.

Codex and Claude native handler timeout `10` is seconds. Gemini `10000` is milliseconds. These host cleanup windows do not increase Badge's two-second internal automatic budget.

Optional trusted CI import workflow generation is explicit and performs a bounded remote read to verify the actual GitHub identity and default branch:

```sh
node .agent-badge/run.cjs setup --import-workflow
```

It embeds the exact approved runtime manifest/lock and uses the trusted installed importer. Only credential-free `github.com` destinations with supported canonical HTTPS/SSH identity are accepted. GitHub Enterprise and arbitrary hosts are unsupported for this generator. Review and commit the generated workflow normally; this command does not deploy it or prove hosted permission policy.

[CLI](CLI.md) · [Git authentication](AUTH.md) · [Source coverage](ATTRIBUTION.md) · [Recovery](RECOVERY.md).
