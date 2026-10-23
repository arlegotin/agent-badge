#!/usr/bin/env bash
set -euo pipefail
# Controlled candidate registry only; never queries published project packages.
exec node scripts/smoke/verify-initializer-install.mjs "$@"
