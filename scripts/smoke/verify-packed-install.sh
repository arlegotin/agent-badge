#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/../.." && pwd)

WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/agent-badge-pack-smoke.XXXXXX")
PACK_DIR="${WORK_DIR}/packs"
INSTALL_DIR="${WORK_DIR}/install"
NPM_CACHE_DIR="${npm_config_cache:-${WORK_DIR}/npm-cache}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

resolve_tarball() {
  local label=$1
  local pattern=$2
  local matches=()

  while IFS= read -r match; do
    matches+=("${match}")
  done < <(find "${PACK_DIR}" -maxdepth 1 -type f -name "${pattern}" | sort)

  if [[ ${#matches[@]} -eq 0 ]]; then
    fail "missing ${label} tarball (${pattern}) in ${PACK_DIR}"
  fi

  if [[ ${#matches[@]} -ne 1 ]]; then
    printf 'ERROR: ambiguous %s tarball (%s)\n' "${label}" "${pattern}" >&2
    printf 'Matches:\n' >&2
    printf '  %s\n' "${matches[@]}" >&2
    exit 1
  fi

  printf '%s\n' "${matches[0]}"
}

cleanup() {
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

mkdir -p "${PACK_DIR}" "${INSTALL_DIR}" "${NPM_CACHE_DIR}"

pushd "${REPO_ROOT}" >/dev/null
npm run build
npm_config_cache="${NPM_CACHE_DIR}" npm pack --workspace packages/core --pack-destination "${PACK_DIR}" >/dev/null
npm_config_cache="${NPM_CACHE_DIR}" npm pack --workspace packages/agent-badge --pack-destination "${PACK_DIR}" >/dev/null
npm_config_cache="${NPM_CACHE_DIR}" npm pack --workspace packages/create-agent-badge --pack-destination "${PACK_DIR}" >/dev/null
popd >/dev/null

CORE_TARBALL=$(resolve_tarball "@legotin/agent-badge-core" 'legotin-agent-badge-core-*.tgz')
AGENT_BADGE_TARBALL=$(resolve_tarball "@legotin/agent-badge" 'legotin-agent-badge-[0-9]*.tgz')
CREATE_AGENT_BADGE_TARBALL=$(resolve_tarball "create-agent-badge" 'create-agent-badge-*.tgz')

pushd "${INSTALL_DIR}" >/dev/null
npm_config_cache="${NPM_CACHE_DIR}" npm init -y >/dev/null

printf 'PACK_DIR=%s\n' "${PACK_DIR}"
printf 'INSTALL_DIR=%s\n' "${INSTALL_DIR}"
printf 'NPM_CACHE_DIR=%s\n' "${NPM_CACHE_DIR}"
printf 'CORE_TARBALL=%s\n' "$(basename "${CORE_TARBALL}")"
printf 'AGENT_BADGE_TARBALL=%s\n' "$(basename "${AGENT_BADGE_TARBALL}")"
printf 'CREATE_AGENT_BADGE_TARBALL=%s\n' "$(basename "${CREATE_AGENT_BADGE_TARBALL}")"

npm_config_cache="${NPM_CACHE_DIR}" npm install \
  "${CORE_TARBALL}" \
  "${AGENT_BADGE_TARBALL}" \
  "${CREATE_AGENT_BADGE_TARBALL}" >/dev/null

node --input-type=module -e "import('@legotin/agent-badge').then(() => console.log('@legotin/agent-badge import ok')).catch((error) => { console.error(error); process.exit(1); });"
node --input-type=module -e "import('create-agent-badge').then(() => console.log('create-agent-badge import ok')).catch((error) => { console.error(error); process.exit(1); });"

./node_modules/.bin/agent-badge --help >/dev/null
./node_modules/.bin/create-agent-badge --help >/dev/null
popd >/dev/null

echo "Packed install smoke check passed."
