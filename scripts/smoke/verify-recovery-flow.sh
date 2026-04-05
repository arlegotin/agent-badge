#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/../.." && pwd)
DEFAULT_PHASE_DIR="${REPO_ROOT}/.planning/phases/19-recovery-paths-and-production-reliability-verification"
PHASE_DIR="${PHASE19_DRY_RUN_DIR:-${DEFAULT_PHASE_DIR}}"
DRY_RUN=false

CLI_MAIN="${REPO_ROOT}/packages/agent-badge/dist/cli/main.js"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

usage() {
  cat <<'EOF'
Usage:
  bash scripts/smoke/verify-recovery-flow.sh [--dry-run] [--phase-dir <path>]

Examples:
  bash scripts/smoke/verify-recovery-flow.sh --dry-run --phase-dir /tmp/agent-badge-phase19-dry-run
  bash scripts/smoke/verify-recovery-flow.sh --phase-dir .planning/phases/19-recovery-paths-and-production-reliability-verification
EOF
}

fail() {
  echo "ERROR: $*" >&2
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --phase-dir)
      [[ $# -ge 2 ]] || fail "--phase-dir requires a value"
      PHASE_DIR=$2
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

if [[ "${PHASE_DIR}" != /* ]]; then
  PHASE_DIR="${REPO_ROOT}/${PHASE_DIR}"
fi

(
  cd "${REPO_ROOT}"
  npm run build >/dev/null
)

[[ -f "${CLI_MAIN}" ]] || fail "missing built CLI entrypoint at ${CLI_MAIN}"

mkdir -p "${PHASE_DIR}"

PRE_STATUS_FILE="${PHASE_DIR}/19-pre-status.txt"
PRE_DOCTOR_FILE="${PHASE_DIR}/19-pre-doctor.txt"
RECOVERY_OUTPUT_FILE="${PHASE_DIR}/19-recovery-command.txt"
POST_STATUS_FILE="${PHASE_DIR}/19-post-status.txt"
POST_DOCTOR_FILE="${PHASE_DIR}/19-post-doctor.txt"
HUMAN_UAT_FILE="${PHASE_DIR}/19-HUMAN-UAT.md"
EVIDENCE_MD_FILE="${PHASE_DIR}/19-RECOVERY-EVIDENCE.md"
EVIDENCE_JSON_FILE="${PHASE_DIR}/19-RECOVERY-EVIDENCE.json"

run_agent_badge_capture() {
  local output_file=$1
  shift
  local timeout_seconds=${AGENT_BADGE_CAPTURE_TIMEOUT_SECONDS:-20}
  local args_json
  local command_label="agent-badge $*"

  args_json=$(printf '%s\n' "$@" | node --input-type=module -e 'import { readFileSync } from "node:fs"; const args = readFileSync(0, "utf8").split("\n").filter((value) => value.length > 0); process.stdout.write(JSON.stringify(args));')

  set +e
  REPO_ROOT="${REPO_ROOT}" \
    CLI_MAIN="${CLI_MAIN}" \
    OUTPUT_FILE="${output_file}" \
    COMMAND_LABEL="${command_label}" \
    TIMEOUT_MS="$((timeout_seconds * 1000))" \
    ARGS_JSON="${args_json}" \
    node --input-type=module <<'EOF'
import { spawnSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";

const timeoutMs = Number(process.env.TIMEOUT_MS ?? "20000");
const commandLabel = process.env.COMMAND_LABEL ?? "agent-badge";
const outputFile = process.env.OUTPUT_FILE;
const args = JSON.parse(process.env.ARGS_JSON ?? "[]");

const result = spawnSync(process.execPath, [process.env.CLI_MAIN, ...args], {
  cwd: process.env.REPO_ROOT,
  encoding: "utf8",
  timeout: timeoutMs,
  killSignal: "SIGKILL",
  maxBuffer: 10 * 1024 * 1024
});

writeFileSync(outputFile, `${result.stdout ?? ""}${result.stderr ?? ""}`);

if (result.error?.code === "ETIMEDOUT") {
  appendFileSync(
    outputFile,
    `Timed out after ${Math.floor(timeoutMs / 1000)}s while running: ${commandLabel}\n`
  );
  process.exit(124);
}

if (result.error) {
  appendFileSync(outputFile, `Failed to run ${commandLabel}: ${result.error.message}\n`);
  process.exit(typeof result.status === "number" ? result.status : 1);
}

process.exit(result.status ?? 0);
EOF
  local exit_code=$?
  set -e

  return "${exit_code}"
}

read_file() {
  local file_path=$1
  if [[ -f "${file_path}" ]]; then
    cat "${file_path}"
  fi
}

to_json_string() {
  node --input-type=module -e 'import { readFileSync } from "node:fs"; process.stdout.write(JSON.stringify(readFileSync(0, "utf8")));'
}

resolve_gist_id() {
  node --input-type=module <<'EOF'
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(".agent-badge/config.json", "utf8"));
const gistId = config?.publish?.gistId;

if (typeof gistId === "string" && gistId.length > 0) {
  process.stdout.write(gistId);
}
EOF
}

determine_supported_recovery_command() {
  local status_output=$1

  if grep -Fq -- "agent-badge init --gist-id <id>" <<<"${status_output}"; then
    printf '%s' "agent-badge init --gist-id <id>"
    return
  fi

  if grep -Fq -- "agent-badge init" <<<"${status_output}"; then
    printf '%s' "agent-badge init"
    return
  fi

  if grep -Fq -- "agent-badge refresh" <<<"${status_output}"; then
    printf '%s' "agent-badge refresh"
    return
  fi

  printf '%s' ""
}

build_actual_recovery_command() {
  local supported_command=$1

  case "${supported_command}" in
    "agent-badge refresh")
      printf '%s\n' "refresh"
      ;;
    "agent-badge init")
      printf '%s\n' "init"
      ;;
    "agent-badge init --gist-id <id>")
      local gist_id
      gist_id=$(cd "${REPO_ROOT}" && resolve_gist_id)
      [[ -n "${gist_id}" ]] || fail "supported recovery requires a gist id, but .agent-badge/config.json does not contain one"
      printf 'init\n--gist-id\n%s\n' "${gist_id}"
      ;;
    *)
      fail "unsupported recovery command: ${supported_command}"
      ;;
  esac
}

printf 'Sequence:\n'
printf -- '- agent-badge status\n'
printf -- '- agent-badge doctor\n'

run_agent_badge_capture "${PRE_STATUS_FILE}" status || true
run_agent_badge_capture "${PRE_DOCTOR_FILE}" doctor || true

PRE_STATUS_OUTPUT=$(read_file "${PRE_STATUS_FILE}")
PRE_DOCTOR_OUTPUT=$(read_file "${PRE_DOCTOR_FILE}")
SUPPORTED_RECOVERY_COMMAND=$(determine_supported_recovery_command "${PRE_STATUS_OUTPUT}")
[[ -n "${SUPPORTED_RECOVERY_COMMAND}" ]] || fail "unable to determine supported recovery command from current status output"

printf -- '- %s\n' "${SUPPORTED_RECOVERY_COMMAND}"
printf -- '- agent-badge status\n'
printf -- '- agent-badge doctor\n'

RECOVERY_EXIT_CODE=0
RECOVERY_STATUS="dry-run"
POST_STATUS_OUTPUT="dry-run: recovery command not executed"
POST_DOCTOR_OUTPUT="dry-run: recovery command not executed"

if [[ "${DRY_RUN}" == "true" ]]; then
  printf 'DRY RUN: would execute %s\n' "${SUPPORTED_RECOVERY_COMMAND}" >"${RECOVERY_OUTPUT_FILE}"
  printf 'DRY RUN: post-recovery capture skipped\n' >"${POST_STATUS_FILE}"
  printf 'DRY RUN: post-recovery capture skipped\n' >"${POST_DOCTOR_FILE}"
else
  RECOVERY_COMMAND_ARGS=()
  while IFS= read -r recovery_arg; do
    RECOVERY_COMMAND_ARGS+=("${recovery_arg}")
  done < <(build_actual_recovery_command "${SUPPORTED_RECOVERY_COMMAND}")
  AGENT_BADGE_CAPTURE_TIMEOUT_SECONDS=60 run_agent_badge_capture \
    "${RECOVERY_OUTPUT_FILE}" \
    "${RECOVERY_COMMAND_ARGS[@]}" || RECOVERY_EXIT_CODE=$?

  run_agent_badge_capture "${POST_STATUS_FILE}" status || true
  run_agent_badge_capture "${POST_DOCTOR_FILE}" doctor || true
  POST_STATUS_OUTPUT=$(read_file "${POST_STATUS_FILE}")
  POST_DOCTOR_OUTPUT=$(read_file "${POST_DOCTOR_FILE}")

  if [[ ${RECOVERY_EXIT_CODE} -eq 0 ]] &&
    grep -Fq -- "Shared mode: shared | health=healthy" <<<"${POST_STATUS_OUTPUT}"; then
    RECOVERY_STATUS="passed"
  else
    RECOVERY_STATUS="failed"
  fi
fi

HUMAN_STATUS="pending"
if [[ "${RECOVERY_STATUS}" == "passed" ]]; then
  HUMAN_STATUS="passed"
elif [[ "${RECOVERY_STATUS}" == "failed" ]]; then
  HUMAN_STATUS="failed"
elif [[ "${DRY_RUN}" == "true" ]]; then
  HUMAN_STATUS="dry-run"
fi

cat >"${HUMAN_UAT_FILE}" <<EOF
---
status: ${HUMAN_STATUS}
source: scripts/smoke/verify-recovery-flow.sh
captured_at: ${TIMESTAMP}
recovery_command: ${SUPPORTED_RECOVERY_COMMAND}
pre_recovery: captured
post_recovery: ${RECOVERY_STATUS}
---

# Phase 19 Human UAT

- status: ${HUMAN_STATUS}
- source: scripts/smoke/verify-recovery-flow.sh
- recovery_command: ${SUPPORTED_RECOVERY_COMMAND}
- pre_recovery: captured
- post_recovery: ${RECOVERY_STATUS}

## Pre-recovery status

\`\`\`text
${PRE_STATUS_OUTPUT}
\`\`\`

## Pre-recovery doctor

\`\`\`text
${PRE_DOCTOR_OUTPUT}
\`\`\`

## Recovery command output

\`\`\`text
$(read_file "${RECOVERY_OUTPUT_FILE}")
\`\`\`

## Post-recovery status

\`\`\`text
${POST_STATUS_OUTPUT}
\`\`\`

## Post-recovery doctor

\`\`\`text
${POST_DOCTOR_OUTPUT}
\`\`\`
EOF

cat >"${EVIDENCE_MD_FILE}" <<EOF
# Phase 19 Recovery Evidence

- Status: ${HUMAN_STATUS}
- Source: scripts/smoke/verify-recovery-flow.sh
- Captured at: ${TIMESTAMP}
- Recovery command: ${SUPPORTED_RECOVERY_COMMAND}

## Pre-recovery status

\`\`\`text
${PRE_STATUS_OUTPUT}
\`\`\`

## Pre-recovery doctor

\`\`\`text
${PRE_DOCTOR_OUTPUT}
\`\`\`

## Recovery command output

\`\`\`text
$(read_file "${RECOVERY_OUTPUT_FILE}")
\`\`\`

## Post-recovery status

\`\`\`text
${POST_STATUS_OUTPUT}
\`\`\`

## Post-recovery doctor

\`\`\`text
${POST_DOCTOR_OUTPUT}
\`\`\`
EOF

PRE_STATUS_JSON=$(printf '%s' "${PRE_STATUS_OUTPUT}" | to_json_string)
PRE_DOCTOR_JSON=$(printf '%s' "${PRE_DOCTOR_OUTPUT}" | to_json_string)
RECOVERY_OUTPUT_JSON=$(read_file "${RECOVERY_OUTPUT_FILE}" | to_json_string)
POST_STATUS_JSON=$(printf '%s' "${POST_STATUS_OUTPUT}" | to_json_string)
POST_DOCTOR_JSON=$(printf '%s' "${POST_DOCTOR_OUTPUT}" | to_json_string)

cat >"${EVIDENCE_JSON_FILE}" <<EOF
{
  "status": "${HUMAN_STATUS}",
  "source": "scripts/smoke/verify-recovery-flow.sh",
  "capturedAt": "${TIMESTAMP}",
  "dryRun": ${DRY_RUN},
  "recoveryCommand": "${SUPPORTED_RECOVERY_COMMAND}",
  "preRecovery": {
    "status": ${PRE_STATUS_JSON},
    "doctor": ${PRE_DOCTOR_JSON}
  },
  "recoveryOutput": ${RECOVERY_OUTPUT_JSON},
  "postRecovery": {
    "status": ${POST_STATUS_JSON},
    "doctor": ${POST_DOCTOR_JSON}
  }
}
EOF

rm -f \
  "${PRE_STATUS_FILE}" \
  "${PRE_DOCTOR_FILE}" \
  "${RECOVERY_OUTPUT_FILE}" \
  "${POST_STATUS_FILE}" \
  "${POST_DOCTOR_FILE}"

printf 'Wrote %s\n' "${HUMAN_UAT_FILE}"
printf 'Wrote %s\n' "${EVIDENCE_MD_FILE}"
printf 'Wrote %s\n' "${EVIDENCE_JSON_FILE}"

if [[ "${DRY_RUN}" == "true" ]]; then
  exit 0
fi

if [[ "${HUMAN_STATUS}" != "passed" ]]; then
  exit 1
fi
