# Documentation Drift Checklist

This checklist was built from the live command contracts in:

- `packages/agent-badge/src/cli/main.ts`
- `packages/agent-badge/src/commands/*.ts`
- `packages/core/src/init/runtime-wiring.ts`
- `scripts/release/capture-publish-evidence.ts`

## Mismatches Found Before Edits

1. `init` publish-target outcomes were under-documented.
   - Docs only called out `created public gist` and `deferred`.
   - Runtime also emits `connected existing gist` and `reused existing gist`.

2. Deferred `init` snippets missed the explicit deferred guidance line.
   - Runtime emits `- Badge setup deferred: ...` whenever publish target setup is deferred.
   - Some docs showed only `- Publish target: deferred` and `- Setup: ...`.

3. `init` setup outcomes were missing shared-runtime degraded success states.
   - Runtime can publish successfully but still report setup as incomplete for push-time refresh when shared runtime is missing or broken.
   - Docs mostly showed only fully-ready success wording.

4. Managed fail-soft hook contract wording was incomplete in command docs.
   - Managed hook block runs `agent-badge refresh --hook pre-push --hook-policy fail-soft || true`.
   - Docs referenced the command without the `|| true` behavior in at least one place.

5. Install docs implied package-manager-specific hook commands.
   - Runtime wiring now writes a direct shared command (`agent-badge ...`) regardless of package manager.
   - Existing wording implied the hook command changes per package manager.

6. Maintainer release doc listed a non-existent evidence-script argument.
   - `docs/maintainers/RELEASE.md` referenced `--version <release-version>` in the `release:evidence` placeholder contract.
   - `scripts/release/capture-publish-evidence.ts` does not accept `--version`.
