---
phase: 26-minimal-repo-scaffold-and-init-rewire
reviewed: 2026-04-08T22:20:25Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - packages/agent-badge/src/commands/config.test.ts
  - packages/agent-badge/src/commands/config.ts
  - packages/agent-badge/src/commands/init.test.ts
  - packages/agent-badge/src/commands/init.ts
  - packages/agent-badge/src/commands/release-readiness-matrix.test.ts
  - packages/agent-badge/src/commands/uninstall.test.ts
  - packages/core/src/init/runtime-wiring.test.ts
  - packages/core/src/init/runtime-wiring.ts
  - packages/create-agent-badge/src/index.test.ts
  - packages/create-agent-badge/src/index.ts
findings:
  critical: 0
  warning: 2
  info: 0
  total: 2
status: issues_found
---
# Phase 26: Code Review Report

**Reviewed:** 2026-04-08T22:20:25Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Reviewed the init/config/runtime-wiring refactor that removes repo-local runtime ownership. The main risks are an onboarding regression in the `npm init agent-badge@latest` flow and overly broad manifest cleanup that can delete user-owned dependencies.

## Warnings

### WR-01: `npm init agent-badge@latest` no longer leaves a runnable CLI behind

**File:** `packages/create-agent-badge/src/index.ts:16-23`, `packages/agent-badge/src/commands/init.ts:559-568`, `packages/core/src/init/runtime-wiring.ts:172-203`
**Issue:** `runCreateAgentBadge()` now only delegates to `runInitCommand()`, while the generated pre-push hook still shells out to `agent-badge` from `PATH`. On a clean machine, `npm init agent-badge@latest` does not install a repo-local runtime or any repo-owned launcher, so the repo is initialized with a hook and follow-up instructions that require a command the initializer never leaves behind. That violates the project constraint that setup must work from `npm init agent-badge@latest` without requiring a global install.
**Fix:**
```ts
const result = await runInitCommand({
  ...options,
  cwd: process.cwd(),
  ghCliTokenResolver: resolveGitHubCliToken
});

await installRepoLocalRuntime({
  cwd: process.cwd(),
  env: options.env,
  packageManager: result.preflight.packageManager.name
});

return result;
```
If repo-local ownership is no longer acceptable, replace this with a repo-owned launcher/shim and point the hook at that shim instead of a globally installed `agent-badge`.

### WR-02: Minimal scaffold removes user-owned `@legotin/agent-badge` dependencies

**File:** `packages/core/src/init/runtime-wiring.ts:305-312`, `packages/core/src/init/runtime-wiring.ts:499-514`
**Issue:** `applyMinimalRepoScaffold()` treats any semver-or-`latest` `@legotin/agent-badge` dependency as managed legacy wiring and deletes it unconditionally. That means a repo that intentionally keeps `@legotin/agent-badge` in `devDependencies` for custom scripts or local tooling will lose that dependency just by rerunning `agent-badge init` or changing `refresh.prePush.*`, even though the dependency may be user-owned rather than tool-owned.
**Fix:**
```ts
const hasLegacyManagedScripts =
  isManagedInitScript(scripts?.[agentBadgeInitScriptName]) ||
  isManagedRefreshScript(scripts?.[agentBadgeRefreshScriptName]);

if (devDependencies !== undefined && hasLegacyManagedScripts) {
  removeManagedStringValue({
    container: devDependencies,
    key: runtimePackageName,
    label: `package.json#devDependencies.${runtimePackageName}`,
    condition: isPotentialRuntimeDependency,
    result
  });
}
```
Prefer an explicit ownership marker if possible; at minimum, only prune the dependency when other managed legacy markers prove that the tool added it.

---

_Reviewed: 2026-04-08T22:20:25Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
