#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/../.." && pwd)

WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/agent-badge-pack-smoke.XXXXXX")
PACK_DIR="${WORK_DIR}/packs"
INSTALL_DIR="${WORK_DIR}/install"
NPM_CACHE_DIR="${WORK_DIR}/npm-cache"

cleanup() {
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

mkdir -p "${PACK_DIR}" "${INSTALL_DIR}" "${NPM_CACHE_DIR}"

pushd "${REPO_ROOT}" >/dev/null
npm_config_cache="${NPM_CACHE_DIR}" npm pack --workspace packages/core --pack-destination "${PACK_DIR}" >/dev/null
npm_config_cache="${NPM_CACHE_DIR}" npm pack --workspace packages/agent-badge --pack-destination "${PACK_DIR}" >/dev/null
npm_config_cache="${NPM_CACHE_DIR}" npm pack --workspace packages/create-agent-badge --pack-destination "${PACK_DIR}" >/dev/null
popd >/dev/null

pushd "${INSTALL_DIR}" >/dev/null
npm_config_cache="${NPM_CACHE_DIR}" npm init -y >/dev/null
npm_config_cache="${NPM_CACHE_DIR}" npm install \
  "${PACK_DIR}"/agent-badge-core-*.tgz \
  "${PACK_DIR}"/agent-badge-*.tgz \
  "${PACK_DIR}"/create-agent-badge-*.tgz >/dev/null

node --input-type=module -e "import('agent-badge').then(() => console.log('agent-badge import ok')).catch((error) => { console.error(error); process.exit(1); });"
node --input-type=module -e "import('create-agent-badge').then(() => console.log('create-agent-badge import ok')).catch((error) => { console.error(error); process.exit(1); });"

./node_modules/.bin/agent-badge --help >/dev/null
./node_modules/.bin/create-agent-badge --help >/dev/null
popd >/dev/null

echo "Packed install smoke check passed."
