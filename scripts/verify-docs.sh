#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "${ROOT_DIR}"

required_files=(
  "docs/RELEASE.md"
  "docs/QUICKSTART.md"
  "docs/ATTRIBUTION.md"
  "docs/PRIVACY.md"
  "docs/TROUBLESHOOTING.md"
  "docs/MANUAL-GIST.md"
)

for file in "${required_files[@]}"; do
  if [[ ! -f "${file}" ]]; then
    echo "Missing required documentation file: ${file}" >&2
    exit 1
  fi
done

rg -n "docs/RELEASE.md" README.md
rg -n "npm run verify:clean-checkout" docs/RELEASE.md
rg -n "12-preflight.json" docs/RELEASE.md
rg -n "12-PUBLISH-EVIDENCE.md" docs/RELEASE.md
rg -n "npm run release:evidence" docs/RELEASE.md
rg -n "npm run release:preflight" docs/RELEASE.md
rg -n "13-REGISTRY-SMOKE.json" docs/RELEASE.md
rg -n "13-REGISTRY-SMOKE.md" docs/RELEASE.md
rg -n -- "verify-registry-install.sh --version 1.1.2 --check-initializer --write-evidence" docs/RELEASE.md
rg -n '"status": "passed"' docs/RELEASE.md
rg -n -- "workflow_dispatch" docs/RELEASE.md
rg -n -- ".github/workflows/release.yml" docs/RELEASE.md
rg -n "trusted publishing|trusted-publisher|trusted publisher" docs/RELEASE.md
rg -n "npm whoami" docs/RELEASE.md
rg -n "npm ping" docs/RELEASE.md
rg -n "npm view @legotin/agent-badge" docs/RELEASE.md
rg -n "npm view create-agent-badge" docs/RELEASE.md
rg -n "npm view @legotin/agent-badge-core" docs/RELEASE.md
rg -n "npm_config_cache" docs/RELEASE.md
rg -n "/tmp" docs/RELEASE.md
rg -n "npm init agent-badge@latest" docs/QUICKSTART.md
rg -n "exact repo root -> exact remote -> normalized cwd -> transcript correlation -> persisted override" docs/ATTRIBUTION.md
rg -n "Aggregate-only publishing" docs/PRIVACY.md
rg -n "agent-badge init --gist-id <id>" docs/MANUAL-GIST.md

echo "Documentation verification passed."
