#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "${ROOT_DIR}"

required_files=(
  "README.md"
  "CHANGELOG.md"
  "CONTRIBUTING.md"
  "SECURITY.md"
  "CODE_OF_CONDUCT.md"
  "docs/INSTALL.md"
  "docs/AUTH.md"
  "docs/QUICKSTART.md"
  "docs/CLI.md"
  "docs/CONFIGURATION.md"
  "docs/ATTRIBUTION.md"
  "docs/HOW-IT-WORKS.md"
  "docs/PRIVACY.md"
  "docs/TROUBLESHOOTING.md"
  "docs/RECOVERY.md"
  "docs/MANUAL-GIST.md"
  "docs/UNINSTALL.md"
  "docs/FAQ.md"
  "docs/RELEASE.md"
  "docs/maintainers/RELEASE.md"
)

public_docs=(
  "README.md"
  "docs/INSTALL.md"
  "docs/AUTH.md"
  "docs/QUICKSTART.md"
  "docs/CLI.md"
  "docs/CONFIGURATION.md"
  "docs/ATTRIBUTION.md"
  "docs/HOW-IT-WORKS.md"
  "docs/PRIVACY.md"
  "docs/TROUBLESHOOTING.md"
  "docs/RECOVERY.md"
  "docs/MANUAL-GIST.md"
  "docs/UNINSTALL.md"
  "docs/FAQ.md"
)

require_fixed() {
  local pattern="$1"
  local file="$2"

  if command -v rg >/dev/null 2>&1; then
    rg -n -F -- "${pattern}" "${file}" >/dev/null
    return
  fi

  grep -nF -- "${pattern}" "${file}" >/dev/null
}

has_fixed() {
  local pattern="$1"
  local file="$2"

  if command -v rg >/dev/null 2>&1; then
    rg -n -F -- "${pattern}" "${file}" >/dev/null
    return $?
  fi

  grep -nF -- "${pattern}" "${file}" >/dev/null
}

require_ere() {
  local pattern="$1"
  local file="$2"

  if command -v rg >/dev/null 2>&1; then
    rg -n -- "${pattern}" "${file}" >/dev/null
    return
  fi

  grep -nE -- "${pattern}" "${file}" >/dev/null
}

forbid_ere() {
  local pattern="$1"
  shift

  if command -v rg >/dev/null 2>&1; then
    if rg -n -- "${pattern}" "$@" >/dev/null; then
      echo "Forbidden pattern '${pattern}' found in: $*" >&2
      exit 1
    fi
    return
  fi

  if grep -nE -- "${pattern}" "$@" >/dev/null; then
    echo "Forbidden pattern '${pattern}' found in: $*" >&2
    exit 1
  fi
}

for file in "${required_files[@]}"; do
  if [[ ! -f "${file}" ]]; then
    echo "Missing required documentation file: ${file}" >&2
    exit 1
  fi
done

runtime_version=$(node -e 'const fs=require("node:fs"); const pkg=JSON.parse(fs.readFileSync("packages/agent-badge/package.json","utf8")); process.stdout.write(pkg.version);')
create_version=$(node -e 'const fs=require("node:fs"); const pkg=JSON.parse(fs.readFileSync("packages/create-agent-badge/package.json","utf8")); process.stdout.write(pkg.version);')
core_version=$(node -e 'const fs=require("node:fs"); const pkg=JSON.parse(fs.readFileSync("packages/core/package.json","utf8")); process.stdout.write(pkg.version);')

if [[ "${runtime_version}" != "${create_version}" || "${runtime_version}" != "${core_version}" ]]; then
  echo "Publishable package versions are not aligned: @legotin/agent-badge=${runtime_version}, create-agent-badge=${create_version}, @legotin/agent-badge-core=${core_version}" >&2
  exit 1
fi

if ! has_fixed "## ${runtime_version} -" CHANGELOG.md; then
  IFS='.' read -r major minor patch <<< "${runtime_version}"

  if [[ "${patch}" =~ ^[0-9]+$ && "${patch}" -gt 0 ]]; then
    previous_version="${major}.${minor}.$((patch - 1))"

    if ! has_fixed "## ${previous_version} -" CHANGELOG.md; then
      echo "CHANGELOG.md must include release heading for ${runtime_version} (or ${previous_version} immediately after auto-bump publish)." >&2
      exit 1
    fi
  else
    echo "CHANGELOG.md must include release heading for ${runtime_version}." >&2
    exit 1
  fi
fi

require_fixed "## 60-Second Path" README.md
require_fixed "npm init agent-badge@latest" README.md
require_fixed "shared runtime" README.md
require_fixed "no-debug path" README.md
require_fixed "## What Gets Published" README.md
require_fixed "Badge setup deferred" README.md
require_fixed "connected existing gist" README.md
require_fixed "reused existing gist" README.md
require_fixed "## Documentation" README.md
require_fixed "### User Docs" README.md
require_fixed "### Maintainer Docs" README.md
require_fixed "docs/INSTALL.md" README.md
require_fixed "docs/AUTH.md" README.md
require_fixed "docs/CLI.md" README.md
require_fixed "docs/UNINSTALL.md" README.md
require_fixed "docs/FAQ.md" README.md
require_fixed "docs/maintainers/RELEASE.md" README.md

require_fixed "Node.js" docs/INSTALL.md
require_fixed "## First-Shot Recommended Path" docs/INSTALL.md
require_fixed "agent-badge --version" docs/INSTALL.md
require_fixed "gh auth token >/dev/null" docs/INSTALL.md
require_fixed "agent-badge doctor" docs/INSTALL.md
require_fixed "agent-badge status" docs/INSTALL.md
require_fixed "~/.codex" docs/INSTALL.md
require_fixed "~/.claude" docs/INSTALL.md
require_fixed "shared runtime" docs/INSTALL.md
require_fixed "pnpm exec agent-badge" docs/INSTALL.md
require_fixed "bunx --bun agent-badge" docs/INSTALL.md
require_fixed "Package Names" docs/INSTALL.md

require_fixed "GH_TOKEN" docs/AUTH.md
require_fixed "GITHUB_TOKEN" docs/AUTH.md
require_fixed "GITHUB_PAT" docs/AUTH.md
require_fixed '`gist` scope' docs/AUTH.md
require_fixed "Gists" docs/AUTH.md
require_fixed "write" docs/AUTH.md
require_fixed "public" docs/AUTH.md
require_fixed "Badge setup deferred" docs/AUTH.md

require_fixed "agent-badge init [--gist-id <id>]" docs/CLI.md
require_fixed "agent-badge --version" docs/CLI.md
require_fixed "global or user-scoped" docs/CLI.md
require_fixed "agent-badge scan [--include-session <provider:sessionId>] [--exclude-session <provider:sessionId>]" docs/CLI.md
require_fixed "agent-badge refresh [--hook pre-push] [--hook-policy <fail-soft|strict>] [--fail-soft] [--force-full]" docs/CLI.md
require_fixed "agent-badge doctor [--json] [--probe-write]" docs/CLI.md
require_fixed "agent-badge uninstall [--purge-remote] [--purge-config] [--purge-state] [--purge-logs] [--purge-cache] [--force]" docs/CLI.md
require_fixed "Badge setup deferred" docs/CLI.md
require_fixed "connected existing gist" docs/CLI.md
require_fixed "reused existing gist" docs/CLI.md
require_fixed "fail-soft || true" docs/CLI.md
require_fixed "shared runtime" docs/QUICKSTART.md
require_fixed "## No-Debug First Shot" docs/QUICKSTART.md
require_fixed "agent-badge --version" docs/QUICKSTART.md
require_fixed "connected existing gist" docs/QUICKSTART.md
require_fixed "reused existing gist" docs/QUICKSTART.md
require_fixed "shared runtime is not on PATH yet" docs/QUICKSTART.md
require_fixed "shared runtime could not be validated" docs/QUICKSTART.md
require_fixed "shared runtime" docs/HOW-IT-WORKS.md
require_fixed "preserves data unless you explicitly ask it to purge more" docs/UNINSTALL.md
require_fixed "thin initializer entrypoint" docs/FAQ.md
require_fixed "## shared runtime could not be validated" docs/TROUBLESHOOTING.md
require_fixed "agent-badge --version" docs/TROUBLESHOOTING.md

require_fixed "docs/maintainers/RELEASE.md" docs/RELEASE.md
require_fixed "<release-version>" docs/maintainers/RELEASE.md
require_fixed "PUBLISH-EVIDENCE" docs/maintainers/RELEASE.md
require_fixed "REGISTRY-SMOKE" docs/maintainers/RELEASE.md
require_fixed "gh release" docs/maintainers/RELEASE.md
require_fixed "artifacts/releases/<release-version>" docs/maintainers/RELEASE.md
require_fixed "agent-badge refresh --hook pre-push --hook-policy fail-soft || true" docs/INSTALL.md

require_fixed "## Unreleased" CHANGELOG.md
require_fixed "## Issues and Support" CONTRIBUTING.md
require_fixed "private vulnerability reporting" SECURITY.md
require_fixed "Expected Behavior" CODE_OF_CONDUCT.md

for file in "${public_docs[@]}"; do
  forbid_ere "\\.planning/" "${file}"
  forbid_ere "Phase [0-9]+" "${file}"
done

forbid_ere "repo-local runtime|local runtime" README.md docs/INSTALL.md docs/QUICKSTART.md docs/CLI.md docs/HOW-IT-WORKS.md
forbid_ere "Use the repo-local wrapper that matches your package manager" docs/CLI.md
forbid_ere "which then installs the actual runtime package" docs/FAQ.md
forbid_ere "npx --no-install agent-badge init" docs/AUTH.md docs/UNINSTALL.md docs/TROUBLESHOOTING.md docs/RECOVERY.md
forbid_ere '^- `--version <release-version>`$' docs/maintainers/RELEASE.md
forbid_ere 'runtime detects the repo package manager and writes the managed `pre-push` hook accordingly' docs/INSTALL.md

forbid_ere "1\\.1\\.3" README.md docs docs/maintainers/RELEASE.md scripts/verify-docs.sh

echo "Documentation verification passed."
