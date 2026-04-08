#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/../.." && pwd)
DEFAULT_PHASE_DIR="${REPO_ROOT}/artifacts/releases/registry-smoke"

VERSION=""
CHECK_INITIALIZER=false
WRITE_EVIDENCE=false
PHASE_DIR="${DEFAULT_PHASE_DIR}"
ARTIFACT_PREFIX="REGISTRY-SMOKE"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/smoke/verify-registry-install.sh --version <semver> [--check-initializer] [--write-evidence] [--phase-dir <path>] [--artifact-prefix <name>]

Example:
  bash scripts/smoke/verify-registry-install.sh --version 1.1.6 --check-initializer --write-evidence
EOF
}

fail() {
  echo "ERROR: $*" >&2
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      [[ $# -ge 2 ]] || fail "--version requires a value"
      VERSION=$2
      shift 2
      ;;
    --check-initializer)
      CHECK_INITIALIZER=true
      shift
      ;;
    --write-evidence)
      WRITE_EVIDENCE=true
      shift
      ;;
    --phase-dir)
      [[ $# -ge 2 ]] || fail "--phase-dir requires a value"
      PHASE_DIR=$2
      shift 2
      ;;
    --artifact-prefix)
      [[ $# -ge 2 ]] || fail "--artifact-prefix requires a value"
      ARTIFACT_PREFIX=$2
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      fail "unknown option: $1"
      ;;
  esac
done

[[ -n "${VERSION}" ]] || fail "--version is required"

if [[ "${PHASE_DIR}" != /* ]]; then
  PHASE_DIR="${REPO_ROOT}/${PHASE_DIR}"
fi

WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/agent-badge-registry-smoke.XXXXXX")
RUNTIME_DIR="${WORK_DIR}/runtime"
INITIALIZER_DIR="${WORK_DIR}/initializer"
NPM_CACHE_DIR="${npm_config_cache:-${WORK_DIR}/npm-cache}"
RUNTIME_LOG="${WORK_DIR}/runtime-init.log"
INITIALIZER_LOG="${WORK_DIR}/initializer-init.log"
RUNTIME_INSTALL_LOG="${WORK_DIR}/runtime-install.log"
INITIALIZER_CMD_LOG="${WORK_DIR}/initializer-command.log"
IMPORT_AGENT_BADGE_LOG="${WORK_DIR}/import-agent-badge.log"
IMPORT_AGENT_BADGE_CORE_LOG="${WORK_DIR}/import-agent-badge-core.log"
IMPORT_CREATE_AGENT_BADGE_LOG="${WORK_DIR}/import-create-agent-badge.log"

cleanup() {
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

mkdir -p "${RUNTIME_DIR}" "${INITIALIZER_DIR}" "${NPM_CACHE_DIR}"

PACKAGES=(
  "@legotin/agent-badge@${VERSION}"
  "@legotin/agent-badge-core@${VERSION}"
  "create-agent-badge@${VERSION}"
)

STATUS="passed"
RUNTIME_STATUS="pending"
INITIALIZER_STATUS="skipped"
BLOCKING_ISSUE=""

mark_blocked() {
  local issue=$1

  if [[ "${STATUS}" != "blocked" ]]; then
    STATUS="blocked"
    BLOCKING_ISSUE="${issue}"
  fi

  echo "BLOCKED: ${issue}" >&2
}

record_command_failure() {
  local issue=$1
  local log_path=$2

  if [[ -f "${log_path}" ]]; then
    cat "${log_path}" >&2
  fi

  mark_blocked "${issue}"
}

assert_file() {
  local file_path=$1
  local issue=$2
  local scope=$3

  if [[ ! -f "${file_path}" ]]; then
    if [[ "${scope}" == "runtime" ]]; then
      RUNTIME_STATUS="blocked"
    else
      INITIALIZER_STATUS="blocked"
    fi

    mark_blocked "${issue}"
  fi
}

assert_log_contains() {
  local log_path=$1
  local needle=$2
  local issue=$3

  if ! grep -Fq -- "${needle}" "${log_path}"; then
    RUNTIME_STATUS="blocked"
    mark_blocked "${issue}"
  fi
}

check_import() {
  local package_name=$1
  local log_path=$2

  if ! node --input-type=module -e "import('${package_name}')" > /dev/null 2> "${log_path}"; then
    RUNTIME_STATUS="blocked"
    record_command_failure "failed to import ${package_name}" "${log_path}"
  fi
}

write_evidence() {
  local json_path="${PHASE_DIR}/${ARTIFACT_PREFIX}.json"
  local markdown_path="${PHASE_DIR}/${ARTIFACT_PREFIX}.md"
  local package_lines

  mkdir -p "${PHASE_DIR}"
  package_lines=$(printf '%s\n' "${PACKAGES[@]}")

  SMOKE_STATUS="${STATUS}" \
  SMOKE_VERSION="${VERSION}" \
  SMOKE_PACKAGES="${package_lines}" \
  SMOKE_RUNTIME_STATUS="${RUNTIME_STATUS}" \
  SMOKE_INITIALIZER_STATUS="${INITIALIZER_STATUS}" \
  SMOKE_BLOCKING_ISSUE="${BLOCKING_ISSUE}" \
  SMOKE_JSON_PATH="${json_path}" \
  SMOKE_MARKDOWN_PATH="${markdown_path}" \
  node --input-type=module <<'EOF'
import { writeFileSync } from "node:fs";

const packages = process.env.SMOKE_PACKAGES?.split("\n").filter(Boolean) ?? [];
const blockingIssue = process.env.SMOKE_BLOCKING_ISSUE || null;
const report = {
  status: process.env.SMOKE_STATUS,
  version: process.env.SMOKE_VERSION,
  packages,
  runtime: {
    status: process.env.SMOKE_RUNTIME_STATUS
  },
  initializer: {
    status: process.env.SMOKE_INITIALIZER_STATUS
  },
  blockingIssue
};

writeFileSync(
  process.env.SMOKE_JSON_PATH,
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8"
);

const markdown = [
  `Status: ${report.status}`,
  `Version: ${report.version}`,
  "Packages:",
  ...packages.map((pkg) => `- ${pkg}`),
  `Runtime: ${report.runtime.status}`,
  `Initializer: ${report.initializer.status}`,
  `Blocking issue: ${blockingIssue ?? "none"}`
].join("\n");

writeFileSync(process.env.SMOKE_MARKDOWN_PATH, `${markdown}\n`, "utf8");
EOF

  printf 'Evidence JSON: %s\n' "$(basename "${json_path}")"
  printf 'Evidence Markdown: %s\n' "$(basename "${markdown_path}")"
}

printf 'WORK_DIR=%s\n' "${WORK_DIR}"
printf 'RUNTIME_DIR=%s\n' "${RUNTIME_DIR}"
printf 'INITIALIZER_DIR=%s\n' "${INITIALIZER_DIR}"
printf 'NPM_CACHE_DIR=%s\n' "${NPM_CACHE_DIR}"
printf 'PACKAGE_COORDINATES=%s\n' "${PACKAGES[*]}"

pushd "${RUNTIME_DIR}" >/dev/null
npm_config_cache="${NPM_CACHE_DIR}" npm init -y >/dev/null
git init --quiet

if ! npm_config_cache="${NPM_CACHE_DIR}" npm install \
  "@legotin/agent-badge@${VERSION}" \
  "@legotin/agent-badge-core@${VERSION}" \
  "create-agent-badge@${VERSION}" >"${RUNTIME_INSTALL_LOG}" 2>&1; then
  RUNTIME_STATUS="blocked"
  record_command_failure \
    "failed to install published registry packages for runtime smoke" \
    "${RUNTIME_INSTALL_LOG}"
else
  RUNTIME_STATUS="passed"

  if ! env -u GH_TOKEN -u GITHUB_TOKEN -u GITHUB_PAT \
    npm_config_cache="${NPM_CACHE_DIR}" \
    ./node_modules/.bin/agent-badge init >"${RUNTIME_LOG}" 2>&1; then
    RUNTIME_STATUS="blocked"
    record_command_failure "agent-badge init failed during runtime smoke" "${RUNTIME_LOG}"
  fi

  assert_file ".agent-badge/config.json" "runtime missing .agent-badge/config.json" "runtime"
  assert_file ".agent-badge/state.json" "runtime missing .agent-badge/state.json" "runtime"
  assert_file ".git/hooks/pre-push" "runtime missing .git/hooks/pre-push" "runtime"
  assert_log_contains \
    "${RUNTIME_LOG}" \
    "Badge setup deferred" \
    "runtime init log missing Badge setup deferred"

  check_import "@legotin/agent-badge" "${IMPORT_AGENT_BADGE_LOG}"
  check_import "@legotin/agent-badge-core" "${IMPORT_AGENT_BADGE_CORE_LOG}"
  check_import "create-agent-badge" "${IMPORT_CREATE_AGENT_BADGE_LOG}"
fi
popd >/dev/null

if [[ "${CHECK_INITIALIZER}" == "true" ]]; then
  INITIALIZER_STATUS="passed"

  pushd "${INITIALIZER_DIR}" >/dev/null
  if ! env -u GH_TOKEN -u GITHUB_TOKEN -u GITHUB_PAT \
    npm_config_cache="${NPM_CACHE_DIR}" \
    npm_config_yes=true \
    npm init "agent-badge@${VERSION}" >"${INITIALIZER_CMD_LOG}" 2>&1; then
    INITIALIZER_STATUS="blocked"
    record_command_failure \
      "npm init agent-badge@${VERSION} failed during initializer smoke" \
      "${INITIALIZER_CMD_LOG}"
  fi

  assert_file \
    ".agent-badge/config.json" \
    "initializer missing .agent-badge/config.json after npm init agent-badge@${VERSION}" \
    "initializer"
  assert_file \
    ".agent-badge/state.json" \
    "initializer missing .agent-badge/state.json after npm init agent-badge@${VERSION}" \
    "initializer"
  assert_file \
    ".git/hooks/pre-push" \
    "initializer missing .git/hooks/pre-push after npm init agent-badge@${VERSION}" \
    "initializer"
  popd >/dev/null
fi

if [[ "${WRITE_EVIDENCE}" == "true" ]]; then
  write_evidence
fi

if [[ "${STATUS}" == "passed" ]]; then
  echo "Registry install smoke check passed."
  exit 0
fi

echo "Registry install smoke check blocked." >&2
exit 1
