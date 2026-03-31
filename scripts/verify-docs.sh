#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "${ROOT_DIR}"

required_files=(
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

rg -n "npm init agent-badge@latest" docs/QUICKSTART.md
rg -n "exact repo root -> exact remote -> normalized cwd -> transcript correlation -> persisted override" docs/ATTRIBUTION.md
rg -n "Aggregate-only publishing" docs/PRIVACY.md
rg -n "agent-badge init --gist-id <id>" docs/MANUAL-GIST.md

echo "Documentation verification passed."
