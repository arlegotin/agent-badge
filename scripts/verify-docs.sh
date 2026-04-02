#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "${ROOT_DIR}"

required_files=(
  "docs/RELEASE.md"
  "docs/QUICKSTART.md"
  "docs/ATTRIBUTION.md"
  "docs/HOW-IT-WORKS.md"
  "docs/PRIVACY.md"
  "docs/TROUBLESHOOTING.md"
  "docs/MANUAL-GIST.md"
)

require_fixed() {
  local pattern="$1"
  local file="$2"

  if command -v rg >/dev/null 2>&1; then
    rg -n -F -- "${pattern}" "${file}"
    return
  fi

  grep -nF -- "${pattern}" "${file}"
}

require_ere() {
  local pattern="$1"
  local file="$2"

  if command -v rg >/dev/null 2>&1; then
    rg -n -- "${pattern}" "${file}"
    return
  fi

  grep -nE -- "${pattern}" "${file}"
}

for file in "${required_files[@]}"; do
  if [[ ! -f "${file}" ]]; then
    echo "Missing required documentation file: ${file}" >&2
    exit 1
  fi
done

require_fixed "docs/RELEASE.md" README.md
require_fixed "npm run verify:clean-checkout" docs/RELEASE.md
require_fixed "12-preflight.json" docs/RELEASE.md
require_fixed "12-PUBLISH-EVIDENCE.md" docs/RELEASE.md
require_fixed "npm run release:evidence" docs/RELEASE.md
require_fixed "npm run release:preflight" docs/RELEASE.md
require_fixed "13-REGISTRY-SMOKE.json" docs/RELEASE.md
require_fixed "13-REGISTRY-SMOKE.md" docs/RELEASE.md
require_fixed "verify-registry-install.sh --version 1.1.2 --check-initializer --write-evidence" docs/RELEASE.md
require_fixed '"status": "passed"' docs/RELEASE.md
require_fixed "workflow_dispatch" docs/RELEASE.md
require_fixed ".github/workflows/release.yml" docs/RELEASE.md
require_ere "trusted publishing|trusted-publisher|trusted publisher" docs/RELEASE.md
require_fixed "npm whoami" docs/RELEASE.md
require_fixed "npm ping" docs/RELEASE.md
require_fixed "npm view @legotin/agent-badge" docs/RELEASE.md
require_fixed "npm view create-agent-badge" docs/RELEASE.md
require_fixed "npm view @legotin/agent-badge-core" docs/RELEASE.md
require_fixed "npm_config_cache" docs/RELEASE.md
require_fixed "/tmp" docs/RELEASE.md
require_fixed "npm init agent-badge@latest" docs/QUICKSTART.md
require_fixed "exact repo root -> exact remote -> normalized cwd -> transcript correlation -> persisted override" docs/ATTRIBUTION.md
require_fixed "migrate existing single-writer repos" README.md
require_fixed "original publisher machine" README.md
require_fixed "agent-badge-contrib-<publisher>.json" docs/HOW-IT-WORKS.md
require_fixed "agent-badge-overrides.json" docs/HOW-IT-WORKS.md
require_fixed "opaque publisher ids" docs/HOW-IT-WORKS.md
require_fixed "opaque digest" docs/HOW-IT-WORKS.md
require_fixed "per-session observations" docs/HOW-IT-WORKS.md
require_fixed "opaque digests" docs/HOW-IT-WORKS.md
require_fixed "Aggregate-only publishing" docs/PRIVACY.md
require_fixed "Diagnostics stay aggregate-only" docs/PRIVACY.md
require_fixed "agent-badge-overrides.json" docs/PRIVACY.md
require_fixed "provider:providerSessionId" docs/PRIVACY.md
require_fixed "opaque digest" docs/PRIVACY.md
require_fixed "agent-badge init --gist-id <id>" docs/MANUAL-GIST.md
require_fixed "original publisher machine" docs/MANUAL-GIST.md
require_fixed "orphaned local publisher" docs/TROUBLESHOOTING.md

echo "Documentation verification passed."
