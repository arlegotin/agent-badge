#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)

WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/agent-badge-clean-checkout.XXXXXX")
NPM_CACHE_DIR="${WORK_DIR}/npm-cache"

cleanup() {
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

mkdir -p "${NPM_CACHE_DIR}"

pushd "${REPO_ROOT}" >/dev/null

while IFS= read -r -d '' dist_dir; do
  rm -rf "${dist_dir}"
done < <(find "${REPO_ROOT}/packages" -type d -name dist -prune -print0)

while IFS= read -r -d '' build_info; do
  rm -f "${build_info}"
done < <(find "${REPO_ROOT}/packages" -type f -name '*.tsbuildinfo' -print0)

npm run build
npm test -- --run
# Tarball integrity gate: only runtime artifacts may ship in the publishable packages.
npm_config_cache="${NPM_CACHE_DIR}" npm run pack:check
# Smoke-install gate: install the verified tarballs in a fresh project.
# This certifies the explicit direct-runtime package path, not the published
# npm initializer's minimal-artifact contract. That proof lives in
# scripts/smoke/verify-registry-install.sh --check-initializer.
npm_config_cache="${NPM_CACHE_DIR}" npm run smoke:pack

popd >/dev/null
